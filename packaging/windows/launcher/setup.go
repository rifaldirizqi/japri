package main

// Jendela setup: wizard pengaturan AI, scan QR WhatsApp, dan klaim owner.
// Halamannya dari Japri sendiri (src/setup/wizard.html, disajiin node di 127.0.0.1) dan ditampilin di
// jendela WebView2 (bawaan Windows 11). Jalan sebagai proses terpisah (Japri.exe __setup <mode>), jadi
// kalau jendelanya ditutup, ikon tray-nya tetap aman. Kalau WebView2 gak ada, balik ke jendela console.

import (
	"bufio"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"syscall"

	"github.com/jchv/go-webview2"
)

const setupURLPrefix = "@@japri-setup-url "

const loadingPage = `<!doctype html><html><body style="margin:0;height:100vh;display:grid;place-items:center;` +
	`font:14px 'Segoe UI',sans-serif;color:#5d5d5d">Memuat setup Japri…</body></html>`

func screenDPI() int {
	hdc, _, _ := procGetDC.Call(0)
	defer procReleaseDC.Call(0, hdc)
	if d, _, _ := procGetDeviceCaps.Call(hdc, logPixelsY); d > 0 {
		return int(d)
	}
	return 96
}

func runSetup(p paths, mode string) int {
	dpi := screenDPI()
	px := func(v int) int { return v * dpi / 96 }
	w := webview2.NewWithOptions(webview2.WebViewOptions{
		AutoFocus: true,
		DataPath:  filepath.Join(filepath.Dir(p.data), "webview"), // cache WebView2, di luar folder data
		WindowOptions: webview2.WindowOptions{
			Title:  "Japri Setup",
			Width:  uint(px(720)),
			Height: uint(px(620)),
			Center: true,
		},
	})
	if w == nil {
		return runConsole(p, mode)
	}
	defer w.Destroy()
	hwnd := uintptr(w.Window())
	procSendMessageW.Call(hwnd, wmSetIcon, 1, loadIcon(icoReady, px(32)))
	procSendMessageW.Call(hwnd, wmSetIcon, 0, loadIcon(icoReady, px(16)))
	w.SetSize(px(700), px(580), webview2.HintFixed)
	w.SetHtml(loadingPage)

	r, pw, err := os.Pipe()
	if err != nil {
		messageBox("Japri", "Gagal buka setup: "+err.Error())
		return 1
	}
	cmd := exec.Command(p.node, nodeArgs(p, mode)...)
	cmd.Dir = p.app
	cmd.Stdout, cmd.Stderr = pw, pw
	cmd.Env = append(os.Environ(), "DATA_DIR="+p.data, "JAPRI_DESKTOP=1", "JAPRI_SETUP_UI=web", "NO_COLOR=1")
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: createNoWindow}
	if err := cmd.Start(); err != nil {
		pw.Close()
		r.Close()
		messageBox("Japri", "Gagal ngejalanin Japri: "+err.Error()+"\nCoba install ulang Japri.")
		return 1
	}
	pw.Close()

	// Output node: baris URL dibuka di jendela, sisanya masuk japri.log (beberapa baris terakhir disimpen buat pesan error)
	var mu sync.Mutex
	var tail []string
	go func() {
		logf, _ := os.OpenFile(p.log, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o600)
		sc := bufio.NewScanner(r)
		sc.Buffer(make([]byte, 64*1024), 1<<20)
		for sc.Scan() {
			line := sc.Text()
			if strings.HasPrefix(line, setupURLPrefix) {
				url := strings.TrimSpace(line[len(setupURLPrefix):])
				w.Dispatch(func() { w.Navigate(url) })
				continue
			}
			if logf != nil {
				writeLogLine(logf, line)
			}
			mu.Lock()
			tail = append(tail, line)
			if len(tail) > 12 {
				tail = tail[1:]
			}
			mu.Unlock()
		}
		_, _ = io.Copy(io.Discard, r)
		if logf != nil {
			logf.Close()
		}
	}()

	exited := make(chan int, 1)
	go func() {
		_ = cmd.Wait()
		r.Close()
		exited <- cmd.ProcessState.ExitCode()
		w.Dispatch(w.Terminate) // setup selesai / dibatalin dari halaman: tutup jendelanya
	}()

	w.Run()

	select {
	case code := <-exited:
		if code != 0 {
			mu.Lock()
			msg := strings.TrimSpace(strings.Join(tail, "\n"))
			mu.Unlock()
			if code == 2 {
				messageBox("Japri", msg) // Japri udah jalan; pesannya dari aplikasinya
			} else {
				messageBox("Japri", "Setup berhenti karena error (kode "+strconv.Itoa(code)+").\n\n"+msg)
			}
		}
		return code
	default:
		// Jendelanya ditutup user sebelum selesai
		killTree(cmd.Process.Pid)
		<-exited
		return 0
	}
}
