// Japri.exe — launcher buat Windows.
//
// Struktur folder hasil install:
//
//	Japri.exe        ← file ini
//	node\node.exe    ← Node.js portable
//	app\             ← kode Japri + node_modules
//
// Data (session WA, database, pengaturan) disimpan di %LOCALAPPDATA%\Japri\data,
// jadi tetap aman waktu Japri di-update atau di-install ulang.
package main

import (
	"bufio"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"syscall"
	"unsafe"
)

var kernel32 = syscall.NewLazyDLL("kernel32.dll")

// prepareConsole: judul jendela, UTF-8 (biar emoji & QR tampil), dan matiin QuickEdit.
// QuickEdit bikin program "nge-freeze" kalau user gak sengaja ngeklik jendela console.
func prepareConsole() {
	if title, err := syscall.UTF16PtrFromString("Japri"); err == nil {
		kernel32.NewProc("SetConsoleTitleW").Call(uintptr(unsafe.Pointer(title)))
	}
	kernel32.NewProc("SetConsoleOutputCP").Call(65001)
	kernel32.NewProc("SetConsoleCP").Call(65001)

	const enableQuickEditMode = 0x0040
	const enableExtendedFlags = 0x0080
	stdin, err := syscall.GetStdHandle(syscall.STD_INPUT_HANDLE)
	if err != nil {
		return
	}
	var mode uint32
	if r, _, _ := kernel32.NewProc("GetConsoleMode").Call(uintptr(stdin), uintptr(unsafe.Pointer(&mode))); r == 0 {
		return
	}
	mode = (mode &^ enableQuickEditMode) | enableExtendedFlags
	kernel32.NewProc("SetConsoleMode").Call(uintptr(stdin), uintptr(mode))
}

func waitForEnter(msg string) {
	fmt.Println()
	fmt.Println(msg)
	fmt.Println("Tekan Enter buat nutup jendela ini.")
	bufio.NewReader(os.Stdin).ReadString('\n')
}

func main() {
	prepareConsole()

	exe, err := os.Executable()
	if err != nil {
		waitForEnter("Gagal nemuin lokasi Japri: " + err.Error())
		os.Exit(1)
	}
	base := filepath.Dir(exe)
	node := filepath.Join(base, "node", "node.exe")
	app := filepath.Join(base, "app")

	dataDir := filepath.Join(os.Getenv("LOCALAPPDATA"), "Japri", "data")
	if err := os.MkdirAll(dataDir, 0o700); err != nil {
		waitForEnter("Gagal bikin folder data: " + err.Error())
		os.Exit(1)
	}

	args := append([]string{
		filepath.Join(app, "node_modules", "tsx", "dist", "cli.mjs"),
		filepath.Join(app, "src", "main.ts"),
	}, os.Args[1:]...)

	cmd := exec.Command(node, args...)
	cmd.Dir = app
	cmd.Stdin, cmd.Stdout, cmd.Stderr = os.Stdin, os.Stdout, os.Stderr
	cmd.Env = append(os.Environ(), "DATA_DIR="+dataDir, "JAPRI_DESKTOP=1", "FORCE_COLOR=1")

	err = cmd.Run()
	var exitErr *exec.ExitError
	switch {
	case err == nil:
		waitForEnter("Japri udah berhenti.")
	case errors.As(err, &exitErr) && exitErr.ExitCode() == 2:
		// Japri udah jalan di jendela lain; pesannya udah dicetak sama aplikasinya
		waitForEnter("")
	case errors.As(err, &exitErr):
		waitForEnter(fmt.Sprintf("❌ Japri berhenti karena error (kode %d). Cek pesan di atas.", exitErr.ExitCode()))
		os.Exit(exitErr.ExitCode())
	default:
		waitForEnter("❌ Gagal ngejalanin Japri: " + err.Error() + "\nCoba install ulang Japri.")
		os.Exit(1)
	}
}
