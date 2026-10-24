package main

// Jendela Japri: status, nomor bot, model AI, tombol, dan log.
// Ditutup (X) atau di-minimize = sembunyi ke tray; bot tetap jalan.

import (
	"os"
	"strings"
	"syscall"
	"unicode"
	"unsafe"
)

const (
	mainClass = "JapriMainWindow"

	idStatus = 101 + iota
	idBot
	idAI
	idLogLabel
	idLog
	idHint
	idBtnSetup
	idBtnData
	idBtnQR
	idBtnRetry
	idBtnQuit

	maxWindowLines = 500
)

type mainWindow struct {
	t        *tray
	hwnd     uintptr
	ctl      map[int]uintptr
	dpi      int
	fontUI   uintptr
	fontBold uintptr
	fontLog  uintptr
}

var theWindow *mainWindow

func (w *mainWindow) px(v int) int { return v * w.dpi / 96 }

func createFont(pt, weight int, face string, dpi int) uintptr {
	h, _, _ := procCreateFontW.Call(uintptr(-(pt*dpi+36)/72), 0, 0, 0, uintptr(weight), 0, 0, 0, 1, 0, 0, 5, 0,
		uintptr(unsafe.Pointer(utf16Ptr(face))))
	return h
}

func newMainWindow(t *tray) (*mainWindow, error) {
	w := &mainWindow{t: t, ctl: map[int]uintptr{}, dpi: 96}
	theWindow = w

	hdc, _, _ := procGetDC.Call(0)
	if d, _, _ := procGetDeviceCaps.Call(hdc, logPixelsY); d > 0 {
		w.dpi = int(d)
	}
	procReleaseDC.Call(0, hdc)
	w.fontUI = createFont(10, 400, "Segoe UI", w.dpi)
	w.fontBold = createFont(13, 600, "Segoe UI", w.dpi)
	w.fontLog = createFont(9, 400, "Consolas", w.dpi)

	hInst, _, _ := procGetModuleHandleW.Call(0)
	cursor, _, _ := procLoadCursorW.Call(0, idcArrow)
	brush, _, _ := procGetSysColorBrush.Call(colorWindow)
	bigSize, _, _ := procGetSystemMetrics.Call(11) // SM_CXICON
	wc := wndClassEx{
		lpfnWndProc:   syscall.NewCallback(mainProc),
		hInstance:     hInst,
		hIcon:         loadIcon(icoReady, int(bigSize)),
		hIconSm:       t.icons[stReady],
		hCursor:       cursor,
		hbrBackground: brush,
		lpszClassName: utf16Ptr(mainClass),
	}
	wc.cbSize = uint32(unsafe.Sizeof(wc))
	if r, _, err := procRegisterClassExW.Call(uintptr(unsafe.Pointer(&wc))); r == 0 {
		return nil, err
	}
	hwnd, _, err := procCreateWindowExW.Call(0, uintptr(unsafe.Pointer(utf16Ptr(mainClass))),
		uintptr(unsafe.Pointer(utf16Ptr("Japri"))), wsOverlappedWindow,
		cwUseDefault, cwUseDefault, uintptr(w.px(580)), uintptr(w.px(560)), 0, 0, hInst, 0)
	if hwnd == 0 {
		return nil, err
	}
	w.hwnd = hwnd

	static := func(id int, font uintptr) {
		w.child(id, "STATIC", "", wsChild|wsVisible|ssNoPrefix|ssEndEllipsis, 0, font)
	}
	button := func(id int, text string) {
		w.child(id, "BUTTON", text, wsChild|wsVisible|wsTabStop, 0, w.fontUI)
	}
	static(idStatus, w.fontBold)
	static(idBot, w.fontUI)
	static(idAI, w.fontUI)
	button(idBtnSetup, "Ganti pengaturan AI")
	button(idBtnData, "Buka folder data")
	button(idBtnQR, "Buka halaman QR")
	button(idBtnRetry, "Coba jalanin lagi")
	static(idLogLabel, w.fontUI)
	w.child(idLog, "EDIT", "", wsChild|wsVisible|wsVScroll|esMultiline|esAutoVScroll|esReadOnly, wsExClientEdge, w.fontLog)
	static(idHint, w.fontUI)
	button(idBtnQuit, "Keluar")
	procSendMessageW.Call(w.ctl[idLog], emSetLimitText, 0, 0)
	w.setText(idLogLabel, "Log")
	w.setText(idHint, "Tutup jendela ini, Japri tetap jalan di tray (pojok kanan bawah, deket jam).")

	w.refresh()
	w.reloadLog()
	return w, nil
}

func (w *mainWindow) child(id int, class, text string, style, exStyle uintptr, font uintptr) {
	hInst, _, _ := procGetModuleHandleW.Call(0)
	h, _, _ := procCreateWindowExW.Call(exStyle, uintptr(unsafe.Pointer(utf16Ptr(class))), uintptr(unsafe.Pointer(utf16Ptr(text))),
		style, 0, 0, 0, 0, w.hwnd, uintptr(id), hInst, 0)
	procSendMessageW.Call(h, wmSetFont, font, 1)
	w.ctl[id] = h
}

func (w *mainWindow) setText(id int, text string) {
	procSetWindowTextW.Call(w.ctl[id], uintptr(unsafe.Pointer(utf16Ptr(text))))
}

func (w *mainWindow) visible(id int, on bool) {
	cmd := uintptr(swHide)
	if on {
		cmd = swShow
	}
	procShowWindow.Call(w.ctl[id], cmd)
}

// refresh: status, info, dan tombol sesuai keadaan sekarang. Cuma dari thread UI.
func (w *mainWindow) refresh() {
	s, info := w.t.snapshot()
	w.setText(idStatus, "●  "+stateText[s])
	bot := "-"
	if info.bot != "" {
		bot = "wa.me/" + info.bot
	}
	ai := info.ai
	if ai == "" {
		ai = "-"
	}
	w.setText(idBot, "Nomor bot:  "+bot)
	w.setText(idAI, "AI:  "+ai)
	w.visible(idBtnQR, s == stQR)
	w.visible(idBtnRetry, s == stFailed)
	enabled := uintptr(1)
	if s == stSetup {
		enabled = 0
	}
	procEnableWindow.Call(w.ctl[idBtnSetup], enabled)
	w.layout()
	invalidate(w.ctl[idStatus]) // biar warna status ikut ke-update
}

func invalidate(h uintptr) {
	user32.NewProc("InvalidateRect").Call(h, 0, 1)
}

func (w *mainWindow) layout() {
	var rc struct{ left, top, right, bottom int32 }
	user32.NewProc("GetClientRect").Call(w.hwnd, uintptr(unsafe.Pointer(&rc)))
	width, height := int(rc.right), int(rc.bottom)
	m := w.px(16)
	move := func(id, x, y, cx, cy int) {
		procMoveWindow.Call(w.ctl[id], uintptr(x), uintptr(y), uintptr(max(cx, 0)), uintptr(max(cy, 0)), 1)
	}
	inner := width - 2*m
	move(idStatus, m, m, inner, w.px(30))
	move(idBot, m, m+w.px(36), inner, w.px(22))
	move(idAI, m, m+w.px(60), inner, w.px(22))

	// Baris tombol; yang disembunyiin gak makan tempat
	x, y, bh := m, m+w.px(96), w.px(32)
	s := w.t.state()
	for _, b := range []struct {
		id, width int
		show      bool
	}{
		{idBtnRetry, 150, s == stFailed},
		{idBtnQR, 150, s == stQR},
		{idBtnSetup, 170, true},
		{idBtnData, 150, true},
	} {
		if b.show {
			move(b.id, x, y, w.px(b.width), bh)
			x += w.px(b.width) + w.px(8)
		}
	}

	logTop := y + bh + w.px(18)
	move(idLogLabel, m, logTop, inner, w.px(20))
	bottomH := w.px(32)
	logBottom := height - m - bottomH - w.px(12)
	move(idLog, m, logTop+w.px(24), inner, logBottom-(logTop+w.px(24)))
	quitW := w.px(110)
	move(idHint, m, height-m-bottomH+w.px(6), inner-quitW-w.px(12), w.px(22))
	move(idBtnQuit, width-m-quitW, height-m-bottomH, quitW, bottomH)
}

// Font console di kotak log gak bisa nampilin emoji: dibuang dari tampilan (di file log tetap ada).
func cleanForWindow(line string) string {
	var b strings.Builder
	for _, r := range line {
		if r > 0xFFFF || (r >= 0x2600 && r <= 0x27BF) || r == 0xFE0F || r == 0x200D || (r >= 0x2190 && r <= 0x21FF && r != 0x2192) {
			continue
		}
		if r == '\t' || !unicode.IsControl(r) {
			b.WriteRune(r)
		}
	}
	return strings.TrimLeft(b.String(), " ")
}

// reloadLog: isi ulang kotak log dari buffer.
func (w *mainWindow) reloadLog() {
	lines := w.t.logLines()
	for i := range lines {
		lines[i] = cleanForWindow(lines[i])
	}
	text := strings.Join(lines, "\r\n")
	if text != "" {
		text += "\r\n"
	}
	procSetWindowTextW.Call(w.ctl[idLog], uintptr(unsafe.Pointer(utf16Ptr(text))))
	w.scrollLogToEnd()
}

func (w *mainWindow) appendLog(lines []string) {
	h := w.ctl[idLog]
	n, _, _ := procSendMessageW.Call(h, wmGetTextLength, 0, 0)
	if n > 200_000 {
		w.reloadLog() // jangan sampai kotak log kegedean
		return
	}
	var b strings.Builder
	for _, l := range lines {
		b.WriteString(cleanForWindow(l))
		b.WriteString("\r\n")
	}
	procSendMessageW.Call(h, emSetSel, n, n)
	procSendMessageW.Call(h, emReplaceSel, 0, uintptr(unsafe.Pointer(utf16Ptr(b.String()))))
	w.scrollLogToEnd()
}

func (w *mainWindow) scrollLogToEnd() {
	h := w.ctl[idLog]
	n, _, _ := procSendMessageW.Call(h, wmGetTextLength, 0, 0)
	procSendMessageW.Call(h, emSetSel, n, n)
	procSendMessageW.Call(h, emScrollCaret, 0, 0)
}

func (w *mainWindow) show() {
	procShowWindow.Call(w.hwnd, swRestore)
	procShowWindow.Call(w.hwnd, swShow)
	procSetForegroundWindow.Call(w.hwnd)
	w.scrollLogToEnd()
}

func (w *mainWindow) hide() {
	procShowWindow.Call(w.hwnd, swHide)
	// Pertama kali: kasih tau Japri gak mati, cuma pindah ke tray
	mark := w.t.paths.data + `\tray-hint`
	if _, err := os.Stat(mark); err != nil {
		_ = os.WriteFile(mark, nil, 0o600)
		w.t.notify(balloon{title: "Japri masih jalan", text: "Japri tetap jalan di sini, di system tray. Klik ikonnya buat buka lagi."})
	}
}

func statusColor(s state) uintptr {
	switch s {
	case stReady:
		return 0x00508A1E // hijau (BGR)
	case stQR, stFailed:
		return 0x002828D6 // merah
	default:
		return 0x00707070 // abu-abu
	}
}

func mainProc(hwnd, msg, wParam, lParam uintptr) uintptr {
	w := theWindow
	switch msg {
	case wmSize:
		if w != nil && w.hwnd != 0 {
			w.layout()
		}
		return 0
	case wmGetMinMaxInfo:
		if w != nil {
			mmi := (*[10]int32)(unsafe.Pointer(lParam)) // ptMinTrackSize = index 6,7
			mmi[6], mmi[7] = int32(w.px(520)), int32(w.px(400))
		}
		return 0
	case wmCtlColorStatic:
		bg, _, _ := procGetSysColor.Call(colorWindow)
		procSetBkColor.Call(wParam, bg)
		if w != nil && lParam == w.ctl[idStatus] {
			procSetTextColor.Call(wParam, statusColor(w.t.state()))
		} else {
			fg, _, _ := procGetSysColor.Call(colorWindowText)
			procSetTextColor.Call(wParam, fg)
		}
		brush, _, _ := procGetSysColorBrush.Call(colorWindow)
		return brush
	case wmCommand:
		switch int(wParam & 0xFFFF) {
		case idBtnSetup:
			w.t.onCmd(menuSetup)
		case idBtnData:
			shellOpen(w.t.paths.data, "")
		case idBtnQR:
			shellOpen(w.t.paths.qr, "")
		case idBtnRetry:
			w.t.onCmd(menuRetry)
		case idBtnQuit:
			w.t.onCmd(menuQuit)
		}
		return 0
	case wmSysCommand:
		if wParam&0xFFF0 == scMinimize {
			w.hide()
			return 0
		}
	case wmClose:
		w.hide()
		return 0
	}
	r, _, _ := procDefWindowProcW.Call(hwnd, msg, wParam, lParam)
	return r
}
