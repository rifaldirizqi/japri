package main

// Jendela console buat setup (wizard API key, scan QR, klaim owner).
// Jalan sebagai proses terpisah (Japri.exe __console <mode>), jadi kalau jendelanya ditutup,
// ikon tray-nya tetap aman.

import (
	"bufio"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"os/signal"
	"unsafe"
)

// prepareConsole: judul jendela, UTF-8 (biar emoji & QR tampil), dan matiin QuickEdit.
// QuickEdit bikin program "nge-freeze" kalau user gak sengaja ngeklik jendela console.
func prepareConsole(conin *os.File) {
	procSetConsoleTitleW.Call(uintptr(unsafe.Pointer(utf16Ptr("Japri — Setup"))))
	procSetConsoleOutputCP.Call(65001)
	procSetConsoleCP.Call(65001)

	const enableQuickEditMode = 0x0040
	const enableExtendedFlags = 0x0080
	var mode uint32
	if r, _, _ := procGetConsoleMode.Call(conin.Fd(), uintptr(unsafe.Pointer(&mode))); r == 0 {
		return
	}
	mode = (mode &^ enableQuickEditMode) | enableExtendedFlags
	procSetConsoleMode.Call(conin.Fd(), uintptr(mode))
}

func runConsole(p paths, mode string) int {
	procAllocConsole.Call()
	conin, err1 := os.OpenFile("CONIN$", os.O_RDWR, 0)
	conout, err2 := os.OpenFile("CONOUT$", os.O_RDWR, 0)
	if err := errors.Join(err1, err2); err != nil {
		messageBox("Japri", "Gagal buka jendela setup: "+err.Error())
		return 1
	}
	prepareConsole(conin)
	// Ctrl+C cukup buat node (wizard nanganin sendiri), jendela ini jangan ikut mati duluan
	signal.Notify(make(chan os.Signal, 1), os.Interrupt)

	waitForEnter := func(msg string) {
		fmt.Fprintln(conout)
		fmt.Fprintln(conout, msg)
		fmt.Fprintln(conout, "Tekan Enter buat nutup jendela ini.")
		_, _ = bufio.NewReader(conin).ReadString('\n')
	}

	cmd := exec.Command(p.node, nodeArgs(p, mode)...)
	cmd.Dir = p.app
	cmd.Stdin, cmd.Stdout, cmd.Stderr = conin, conout, conout
	cmd.Env = append(os.Environ(), "DATA_DIR="+p.data, "JAPRI_DESKTOP=1", "FORCE_COLOR=1")

	err := cmd.Run()
	var exitErr *exec.ExitError
	switch {
	case err == nil:
		return 0
	case errors.As(err, &exitErr) && exitErr.ExitCode() == 2:
		// Japri udah jalan; pesannya udah dicetak sama aplikasinya
		waitForEnter("")
		return 2
	case errors.As(err, &exitErr):
		waitForEnter(fmt.Sprintf("❌ Setup berhenti karena error (kode %d). Cek pesan di atas.", exitErr.ExitCode()))
		return exitErr.ExitCode()
	default:
		waitForEnter("❌ Gagal ngejalanin Japri: " + err.Error() + "\nCoba install ulang Japri.")
		return 1
	}
}
