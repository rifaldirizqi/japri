package main

// Ikon Japri di system tray: status, tooltip, menu klik kanan, dan notifikasi Windows (balon).

import (
	_ "embed"
	"sync"
	"syscall"
	"unsafe"
)

//go:embed icons/ready.ico
var icoReady []byte

//go:embed icons/connecting.ico
var icoConnecting []byte

//go:embed icons/attention.ico
var icoAttention []byte

const (
	windowClass = "JapriTrayWindow"

	wmTrayCallback = wmApp + 1 // event mouse dari ikon tray
	wmTrayRefresh  = wmApp + 2 // status berubah (dikirim dari goroutine lain)
	wmShowRunning  = wmApp + 3 // Japri.exe dibuka lagi padahal udah jalan
	wmRunSetup     = wmApp + 4 // shortcut "Ganti pengaturan AI" dibuka padahal udah jalan

	menuLog = iota + 1
	menuSetup
	menuDataDir
	menuQuit
	menuRetry
	menuQR
)

type state int

const (
	stSetup state = iota
	stConnecting
	stReady
	stQR
	stRestarting
	stFailed
)

var stateText = map[state]string{
	stSetup:      "Lagi setup (lihat jendela Japri)",
	stConnecting: "Lagi nyambung ke WhatsApp…",
	stReady:      "Jalan normal",
	stQR:         "Perlu scan QR ulang",
	stRestarting: "Nyalain ulang…",
	stFailed:     "Berhenti karena error",
}

type balloon struct {
	title, text string
	warning     bool
}

type tray struct {
	hwnd   uintptr
	icons  map[state]uintptr
	added  bool
	paths  paths
	onCmd  func(cmd int) // dipanggil dari thread UI; harus cepat (gak boleh nunggu)
	onExit func()        // Windows mau dimatiin

	mu      sync.Mutex
	st      state
	pending *balloon

	taskbarCreated uint32
}

var theTray *tray

func newTray(p paths, onCmd func(int), onExit func()) (*tray, error) {
	t := &tray{paths: p, onCmd: onCmd, onExit: onExit, st: stConnecting}
	theTray = t

	hInst, _, _ := procGetModuleHandleW.Call(0)
	wc := wndClassEx{
		lpfnWndProc:   syscall.NewCallback(wndProc),
		hInstance:     hInst,
		lpszClassName: utf16Ptr(windowClass),
	}
	wc.cbSize = uint32(unsafe.Sizeof(wc))
	if r, _, err := procRegisterClassExW.Call(uintptr(unsafe.Pointer(&wc))); r == 0 {
		return nil, err
	}
	hwnd, _, err := procCreateWindowExW.Call(0, uintptr(unsafe.Pointer(utf16Ptr(windowClass))),
		uintptr(unsafe.Pointer(utf16Ptr("Japri"))), 0, 0, 0, 0, 0, 0, 0, hInst, 0)
	if hwnd == 0 {
		return nil, err
	}
	t.hwnd = hwnd
	r, _, _ := procRegisterWindowMessageW.Call(uintptr(unsafe.Pointer(utf16Ptr("TaskbarCreated"))))
	t.taskbarCreated = uint32(r)

	size, _, _ := procGetSystemMetrics.Call(smCxSmIcon)
	if size == 0 {
		size = 16
	}
	t.icons = map[state]uintptr{
		stReady:      loadIcon(icoReady, int(size)),
		stConnecting: loadIcon(icoConnecting, int(size)),
		stAttention:  loadIcon(icoAttention, int(size)),
	}
	t.refresh()
	return t, nil
}

// stAttention cuma dipakai buat milih ikon
const stAttention state = -1

func iconFor(s state) state {
	switch s {
	case stReady:
		return stReady
	case stQR, stFailed:
		return stAttention
	default:
		return stConnecting
	}
}

// setState aman dipanggil dari goroutine mana aja.
func (t *tray) setState(s state, b *balloon) {
	t.mu.Lock()
	t.st = s
	if b != nil {
		t.pending = b
	}
	t.mu.Unlock()
	procPostMessageW.Call(t.hwnd, wmTrayRefresh, 0, 0)
}

func (t *tray) notify(b balloon) {
	t.mu.Lock()
	t.pending = &b
	t.mu.Unlock()
	procPostMessageW.Call(t.hwnd, wmTrayRefresh, 0, 0)
}

func (t *tray) state() state {
	t.mu.Lock()
	defer t.mu.Unlock()
	return t.st
}

// refresh: update ikon + tooltip (+ balon kalau ada). Cuma dari thread UI.
func (t *tray) refresh() {
	t.mu.Lock()
	s, b := t.st, t.pending
	t.pending = nil
	t.mu.Unlock()

	nid := notifyIconData{hWnd: t.hwnd, uID: 1, uFlags: nifMessage | nifIcon | nifTip, uCallbackMessage: wmTrayCallback}
	nid.cbSize = uint32(unsafe.Sizeof(nid))
	nid.hIcon = t.icons[iconFor(s)]
	copyUTF16(nid.szTip[:], "Japri — "+stateText[s])
	if b != nil {
		nid.uFlags |= nifInfo
		copyUTF16(nid.szInfoTitle[:], b.title)
		copyUTF16(nid.szInfo[:], b.text)
		nid.dwInfoFlags = niifInfo
		if b.warning {
			nid.dwInfoFlags = niifWarning
		}
	}
	op := uintptr(nimModify)
	if !t.added {
		op = nimAdd
	}
	if r, _, _ := procShellNotifyIconW.Call(op, uintptr(unsafe.Pointer(&nid))); r != 0 {
		t.added = true
	} else if t.added {
		// Explorer sempat restart dan ikonnya ilang: tambahin lagi
		if r, _, _ := procShellNotifyIconW.Call(nimAdd, uintptr(unsafe.Pointer(&nid))); r != 0 {
			t.added = true
		}
	}
}

func (t *tray) remove() {
	if !t.added {
		return
	}
	nid := notifyIconData{hWnd: t.hwnd, uID: 1}
	nid.cbSize = uint32(unsafe.Sizeof(nid))
	procShellNotifyIconW.Call(nimDelete, uintptr(unsafe.Pointer(&nid)))
	t.added = false
}

func (t *tray) showMenu() {
	s := t.state()
	m, _, _ := procCreatePopupMenu.Call()
	add := func(flags uintptr, id int, text string) {
		var p *uint16
		if text != "" {
			p = utf16Ptr(text)
		}
		procAppendMenuW.Call(m, flags, uintptr(id), uintptr(unsafe.Pointer(p)))
	}
	add(mfString|mfGrayed, 0, "Japri: "+stateText[s])
	add(mfSeparator, 0, "")
	if s == stQR {
		add(mfString, menuQR, "Buka halaman QR")
	}
	if s == stFailed {
		add(mfString, menuRetry, "Coba jalanin lagi")
	}
	add(mfString, menuLog, "Lihat log")
	if s != stSetup {
		add(mfString, menuSetup, "Ganti pengaturan AI")
	}
	add(mfString, menuDataDir, "Buka folder data")
	add(mfSeparator, 0, "")
	add(mfString, menuQuit, "Keluar")

	var pt point
	procGetCursorPos.Call(uintptr(unsafe.Pointer(&pt)))
	procSetForegroundWindow.Call(t.hwnd)
	cmd, _, _ := procTrackPopupMenu.Call(m, tpmReturnCmd|tpmNoNotify|tpmRightButton|tpmBottomAlign,
		uintptr(pt.x), uintptr(pt.y), 0, t.hwnd, 0)
	procPostMessageW.Call(t.hwnd, wmNull, 0, 0)
	procDestroyMenu.Call(m)

	switch int(cmd) {
	case menuLog:
		shellOpen("notepad.exe", syscall.EscapeArg(t.paths.log))
	case menuDataDir:
		shellOpen(t.paths.data, "")
	case menuQR:
		shellOpen(t.paths.qr, "")
	case menuSetup, menuRetry, menuQuit:
		t.onCmd(int(cmd))
	}
}

func wndProc(hwnd, msg, wParam, lParam uintptr) uintptr {
	t := theTray
	switch {
	case msg == wmTrayCallback:
		switch lParam & 0xFFFF {
		case wmLButtonUp, wmRButtonUp:
			t.showMenu()
		case ninBalloonUserClick:
			if t.state() == stQR {
				shellOpen(t.paths.qr, "")
			}
		}
		return 0
	case msg == wmTrayRefresh:
		t.refresh()
		return 0
	case msg == wmShowRunning:
		t.notify(balloon{title: "Japri udah jalan", text: "Japri jalan di sini. Klik ikon ini buat lihat menunya."})
		return 0
	case msg == wmRunSetup:
		t.onCmd(menuSetup)
		return 0
	case msg == uintptr(t.taskbarCreated) && t.taskbarCreated != 0:
		t.added = false
		t.refresh()
		return 0
	case msg == wmQueryEndSession:
		return 1
	case msg == wmEndSession:
		if wParam != 0 {
			t.remove()
			t.onExit()
		}
		return 0
	case msg == wmClose:
		t.remove()
		procDestroyWindow.Call(hwnd)
		return 0
	case msg == wmDestroy:
		procPostQuitMessage.Call(0)
		return 0
	}
	r, _, _ := procDefWindowProcW.Call(hwnd, msg, wParam, lParam)
	return r
}

// close nutup ikon & message loop (aman dari goroutine mana aja).
func (t *tray) close() {
	procPostMessageW.Call(t.hwnd, wmClose, 0, 0)
}

func messageLoop() {
	var m winMsg
	for {
		r, _, _ := procGetMessageW.Call(uintptr(unsafe.Pointer(&m)), 0, 0, 0)
		if int32(r) <= 0 {
			return
		}
		procTranslateMessage.Call(uintptr(unsafe.Pointer(&m)))
		procDispatchMessageW.Call(uintptr(unsafe.Pointer(&m)))
	}
}

// findRunning: window tray Japri yang udah jalan (0 kalau gak ada).
func findRunning() uintptr {
	h, _, _ := procFindWindowW.Call(uintptr(unsafe.Pointer(utf16Ptr(windowClass))), 0)
	return h
}
