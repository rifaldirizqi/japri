package main

// Jendela WebView2 (bawaan Windows 11) buat halaman HTML dari Japri sendiri (disajiin node di 127.0.0.1):
//   - Setup (Japri.exe __setup <mode>): wizard pengaturan AI, scan QR WhatsApp, dan klaim owner
//     (src/setup/wizard.html). Kalau WebView2 gak ada, balik ke jendela console.
//   - Pengaturan (Japri.exe __settings <url>): src/setup/settings.html, disajiin bot yang lagi jalan.
// Masing-masing proses terpisah, jadi kalau jendelanya ditutup, ikon tray-nya tetap aman.

import (
	"bufio"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"
	"unsafe"

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

// newWebWindow bikin jendela WebView2 berukuran tetap (ukuran dalam piksel 96 DPI). nil kalau WebView2 gak ada.
func newWebWindow(p paths, title string, width, height int) webview2.WebView {
	dpi := screenDPI()
	px := func(v int) int { return v * dpi / 96 }
	w := webview2.NewWithOptions(webview2.WebViewOptions{
		AutoFocus: true,
		DataPath:  filepath.Join(filepath.Dir(p.data), "webview"), // cache WebView2, di luar folder data
		WindowOptions: webview2.WindowOptions{
			Title:  title,
			Width:  uint(px(width + 20)),
			Height: uint(px(height + 40)),
			Center: true,
		},
	})
	if w == nil {
		return nil
	}
	hwnd := uintptr(w.Window())
	procSendMessageW.Call(hwnd, wmSetIcon, 1, loadIcon(icoReady, px(32)))
	procSendMessageW.Call(hwnd, wmSetIcon, 0, loadIcon(icoReady, px(16)))
	w.SetSize(px(width), px(height), webview2.HintFixed)
	return w
}

const settingsTitle = "Pengaturan Japri"

// runSettings buka jendela Pengaturan (halamannya dari bot yang lagi jalan). Cuma boleh satu yang kebuka;
// jendelanya ketutup sendiri kalau bot-nya berhenti (mis. setup ulang atau Japri dimatiin).
func runSettings(p paths, url string) int {
	if _, _, e := procCreateMutexW.Call(0, 0, uintptr(unsafe.Pointer(utf16Ptr(`Local\JapriSettings`)))); e == syscall.Errno(errorAlreadyExists) {
		if h, _, _ := procFindWindowW.Call(uintptr(unsafe.Pointer(utf16Ptr("webview"))), uintptr(unsafe.Pointer(utf16Ptr(settingsTitle)))); h != 0 {
			procShowWindow.Call(h, swRestore)
			procSetForegroundWindow.Call(h)
		}
		return 0
	}
	w := newWebWindow(p, settingsTitle, 820, 620)
	if w == nil {
		shellOpen(url, "") // WebView2 gak ada: buka di browser
		return 0
	}
	defer w.Destroy()
	w.SetHtml(loadingPage)
	w.Navigate(url)

	go func() {
		client := &http.Client{Timeout: 3 * time.Second}
		for range time.Tick(3 * time.Second) {
			resp, err := client.Get(url)
			if err != nil {
				w.Dispatch(w.Terminate)
				return
			}
			resp.Body.Close()
		}
	}()
	w.Run()
	return 0
}

func runSetup(p paths, mode string) int {
	w := newWebWindow(p, "Japri Setup", 700, 580)
	if w == nil {
		return runConsole(p, mode)
	}
	defer w.Destroy()
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
