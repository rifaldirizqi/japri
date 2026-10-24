package main

// Deklarasi Win32 API yang dipakai launcher (tanpa library pihak ketiga).

import (
	"syscall"
	"unsafe"
)

var (
	user32   = syscall.NewLazyDLL("user32.dll")
	kernel32 = syscall.NewLazyDLL("kernel32.dll")
	shell32  = syscall.NewLazyDLL("shell32.dll")

	procRegisterClassExW         = user32.NewProc("RegisterClassExW")
	procCreateWindowExW          = user32.NewProc("CreateWindowExW")
	procDefWindowProcW           = user32.NewProc("DefWindowProcW")
	procDestroyWindow            = user32.NewProc("DestroyWindow")
	procGetMessageW              = user32.NewProc("GetMessageW")
	procTranslateMessage         = user32.NewProc("TranslateMessage")
	procDispatchMessageW         = user32.NewProc("DispatchMessageW")
	procPostMessageW             = user32.NewProc("PostMessageW")
	procPostQuitMessage          = user32.NewProc("PostQuitMessage")
	procFindWindowW              = user32.NewProc("FindWindowW")
	procRegisterWindowMessageW   = user32.NewProc("RegisterWindowMessageW")
	procCreatePopupMenu          = user32.NewProc("CreatePopupMenu")
	procAppendMenuW              = user32.NewProc("AppendMenuW")
	procTrackPopupMenu           = user32.NewProc("TrackPopupMenu")
	procDestroyMenu              = user32.NewProc("DestroyMenu")
	procGetCursorPos             = user32.NewProc("GetCursorPos")
	procSetForegroundWindow      = user32.NewProc("SetForegroundWindow")
	procCreateIconFromResourceEx = user32.NewProc("CreateIconFromResourceEx")
	procGetSystemMetrics         = user32.NewProc("GetSystemMetrics")
	procSetProcessDPIAware       = user32.NewProc("SetProcessDPIAware")
	procMessageBoxW              = user32.NewProc("MessageBoxW")

	procCreateMutexW       = kernel32.NewProc("CreateMutexW")
	procGetModuleHandleW   = kernel32.NewProc("GetModuleHandleW")
	procAllocConsole       = kernel32.NewProc("AllocConsole")
	procSetConsoleTitleW   = kernel32.NewProc("SetConsoleTitleW")
	procSetConsoleOutputCP = kernel32.NewProc("SetConsoleOutputCP")
	procSetConsoleCP       = kernel32.NewProc("SetConsoleCP")
	procGetConsoleMode     = kernel32.NewProc("GetConsoleMode")
	procSetConsoleMode     = kernel32.NewProc("SetConsoleMode")

	procShellNotifyIconW = shell32.NewProc("Shell_NotifyIconW")
	procShellExecuteW    = shell32.NewProc("ShellExecuteW")
)

const (
	wmNull              = 0x0000
	wmDestroy           = 0x0002
	wmClose             = 0x0010
	wmQueryEndSession   = 0x0011
	wmEndSession        = 0x0016
	wmLButtonUp         = 0x0202
	wmRButtonUp         = 0x0205
	wmApp               = 0x8000
	ninBalloonUserClick = 0x0405

	nimAdd    = 0
	nimModify = 1
	nimDelete = 2

	nifMessage = 0x01
	nifIcon    = 0x02
	nifTip     = 0x04
	nifInfo    = 0x10

	niifInfo    = 0x1
	niifWarning = 0x2

	mfString    = 0x0000
	mfGrayed    = 0x0001
	mfSeparator = 0x0800

	tpmRightButton = 0x0002
	tpmBottomAlign = 0x0020
	tpmNoNotify    = 0x0080
	tpmReturnCmd   = 0x0100

	smCxSmIcon = 49

	errorAlreadyExists = 183

	mbOK          = 0x00000000
	mbIconWarning = 0x00000030
)

type wndClassEx struct {
	cbSize        uint32
	style         uint32
	lpfnWndProc   uintptr
	cbClsExtra    int32
	cbWndExtra    int32
	hInstance     uintptr
	hIcon         uintptr
	hCursor       uintptr
	hbrBackground uintptr
	lpszMenuName  *uint16
	lpszClassName *uint16
	hIconSm       uintptr
}

type point struct{ x, y int32 }

type winMsg struct {
	hwnd     uintptr
	message  uint32
	wParam   uintptr
	lParam   uintptr
	time     uint32
	pt       point
	lPrivate uint32
}

// NOTIFYICONDATAW (layout x64, 976 byte)
type notifyIconData struct {
	cbSize           uint32
	hWnd             uintptr
	uID              uint32
	uFlags           uint32
	uCallbackMessage uint32
	hIcon            uintptr
	szTip            [128]uint16
	dwState          uint32
	dwStateMask      uint32
	szInfo           [256]uint16
	uVersion         uint32
	szInfoTitle      [64]uint16
	dwInfoFlags      uint32
	guidItem         [16]byte
	hBalloonIcon     uintptr
}

func utf16Ptr(s string) *uint16 {
	p, _ := syscall.UTF16PtrFromString(s)
	return p
}

// copyUTF16 ngisi buffer teks fixed-size (dipotong kalau kepanjangan, selalu diakhiri NUL).
func copyUTF16(dst []uint16, s string) {
	u, _ := syscall.UTF16FromString(s)
	if len(u) > len(dst) {
		u = u[:len(dst)]
		u[len(u)-1] = 0
	}
	copy(dst, u)
}

func shellOpen(file string, args string) {
	var params *uint16
	if args != "" {
		params = utf16Ptr(args)
	}
	procShellExecuteW.Call(0, uintptr(unsafe.Pointer(utf16Ptr("open"))), uintptr(unsafe.Pointer(utf16Ptr(file))),
		uintptr(unsafe.Pointer(params)), 0, 1)
}

func messageBox(title, text string) {
	procMessageBoxW.Call(0, uintptr(unsafe.Pointer(utf16Ptr(text))), uintptr(unsafe.Pointer(utf16Ptr(title))), mbOK|mbIconWarning)
}

// loadIcon bikin HICON dari file .ico yang di-embed, pilih ukuran yang paling pas buat tray.
func loadIcon(ico []byte, size int) uintptr {
	if len(ico) < 6 {
		return 0
	}
	count := int(ico[4]) | int(ico[5])<<8
	bestOff, bestLen, bestW := 0, 0, 0
	for i := 0; i < count; i++ {
		e := ico[6+16*i:]
		w := int(e[0])
		if w == 0 {
			w = 256
		}
		n := int(e[8]) | int(e[9])<<8 | int(e[10])<<16 | int(e[11])<<24
		off := int(e[12]) | int(e[13])<<8 | int(e[14])<<16 | int(e[15])<<24
		// Paling kecil yang >= size; kalau gak ada, yang paling gede
		better := bestW == 0 || (w >= size && (bestW < size || w < bestW)) || (w < size && bestW < size && w > bestW)
		if better && off+n <= len(ico) {
			bestOff, bestLen, bestW = off, n, w
		}
	}
	if bestLen == 0 {
		return 0
	}
	h, _, _ := procCreateIconFromResourceEx.Call(uintptr(unsafe.Pointer(&ico[bestOff])), uintptr(bestLen), 1, 0x00030000,
		uintptr(size), uintptr(size), 0)
	return h
}
