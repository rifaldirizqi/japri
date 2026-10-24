// Japri.exe — launcher buat Windows.
//
// Struktur folder hasil install:
//
//	Japri.exe        ← file ini
//	node\node.exe    ← Node.js portable
//	app\             ← kode Japri + node_modules
//
// Data (session WA, database, pengaturan, log) disimpan di %LOCALAPPDATA%\Japri\data,
// jadi tetap aman waktu Japri di-update atau di-install ulang.
//
// Cara kerjanya:
//   - Japri.exe punya jendela (status, tombol, log) dan ikon di system tray. Jendelanya ditutup =
//     sembunyi ke tray. Bot-nya (node) jalan di belakang tanpa jendela, output-nya ditulis ke
//     japri.log + ditampilin di jendela, dan dinyalain ulang sendiri kalau crash.
//   - Japri.exe --tray (autostart) langsung ke tray tanpa buka jendela.
//   - Setup (wizard, scan QR, klaim owner) butuh tempat ngetik, jadi dijalanin di jendela console
//     terpisah: Japri.exe manggil dirinya sendiri pakai argumen "__console".
//   - Cuma satu Japri yang boleh jalan. Kalau dibuka lagi, yang lama dikabarin lewat pesan window.
package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"syscall"
	"unsafe"
)

type paths struct {
	exe, node, app, data, log, qr, config, lock string
}

func resolvePaths() (paths, error) {
	exe, err := os.Executable()
	if err != nil {
		return paths{}, err
	}
	base := filepath.Dir(exe)
	data := filepath.Join(os.Getenv("LOCALAPPDATA"), "Japri", "data")
	return paths{
		exe:    exe,
		node:   filepath.Join(base, "node", "node.exe"),
		app:    filepath.Join(base, "app"),
		data:   data,
		log:    filepath.Join(data, "japri.log"),
		qr:     filepath.Join(data, "qr.html"),
		config: filepath.Join(data, "config.json"),
		lock:   filepath.Join(data, "japri.lock"),
	}, nil
}

// setupNeeded: "setup" kalau belum pernah setup, "pair" kalau pengaturan AI udah ada tapi owner belum
// klaim (mis. jendela setup ketutup pas scan QR), "" kalau udah lengkap.
func setupNeeded(p paths) string {
	raw, err := os.ReadFile(p.config)
	if err != nil {
		return "setup"
	}
	var cfg struct {
		Owner *struct {
			IDs []string `json:"ids"`
		} `json:"owner"`
	}
	if json.Unmarshal(raw, &cfg) != nil {
		return "setup"
	}
	if cfg.Owner == nil || len(cfg.Owner.IDs) == 0 {
		return "pair"
	}
	return ""
}

// nodeArgs: argumen node.exe buat ngejalanin Japri (mode = "", "setup", atau "pair").
func nodeArgs(p paths, mode string) []string {
	args := []string{
		filepath.Join(p.app, "node_modules", "tsx", "dist", "cli.mjs"),
		filepath.Join(p.app, "src", "main.ts"),
	}
	if mode != "" {
		args = append(args, mode)
	}
	return args
}

func main() {
	// Window & message loop Win32 harus tetap di thread yang sama
	runtime.LockOSThread()
	procSetProcessDPIAware.Call()

	p, err := resolvePaths()
	if err != nil {
		messageBox("Japri", "Gagal nemuin lokasi Japri: "+err.Error())
		os.Exit(1)
	}
	if err := os.MkdirAll(p.data, 0o700); err != nil {
		messageBox("Japri", "Gagal bikin folder data: "+err.Error())
		os.Exit(1)
	}

	arg := ""
	if len(os.Args) > 1 {
		arg = os.Args[1]
	}
	if arg == "__console" {
		mode := ""
		if len(os.Args) > 2 {
			mode = os.Args[2]
		}
		os.Exit(runConsole(p, mode))
	}

	// Satu Japri aja. Kalau udah ada, kabarin yang lama (dia yang nampilin notifikasi / buka setup).
	// Handle mutex sengaja gak ditutup: dipegang sampai Japri keluar.
	if _, _, e := procCreateMutexW.Call(0, 0, uintptr(unsafe.Pointer(utf16Ptr(`Local\JapriTray`)))); e == syscall.Errno(errorAlreadyExists) {
		if h := findRunning(); h != 0 && arg != "--tray" {
			msg := uintptr(wmShowRunning)
			if arg == "setup" {
				msg = wmRunSetup
			}
			procAllowSetForegroundWindow.Call(^uintptr(0)) // ASFW_ANY: biar jendela Japri yang lama boleh maju ke depan
			procPostMessageW.Call(h, msg, 0, 0)
		}
		return
	}

	// --tray: autostart waktu Windows nyala, langsung ke tray tanpa buka jendela
	showWindow := arg != "--tray"
	firstSetup := setupNeeded(p)
	if arg == "setup" && firstSetup == "" {
		firstSetup = "setup"
	}

	s := &supervisor{p: p, cmds: make(chan int, 4)}
	t, err := newTray(p, s.command, s.killNow)
	if err != nil {
		messageBox("Japri", "Gagal bikin ikon Japri di system tray: "+err.Error())
		os.Exit(1)
	}
	s.t = t
	go s.run(firstSetup, showWindow)
	messageLoop()
	s.killNow()
}
