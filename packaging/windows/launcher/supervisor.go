package main

// Ngejalanin bot (node) di belakang, nyatet output-nya ke log, dan nyalain ulang kalau crash.

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"
)

const (
	createNoWindow = 0x08000000
	statusPrefix   = "@@japri-status "
	infoPrefix     = "@@japri-info "
	maxLogSize     = 2 << 20 // 2 MB, sisanya pindah ke japri.log.1

	crashLimit  = 3               // gagal 3× ...
	crashWindow = 5 * time.Minute // ... dalam 5 menit: berhenti nyoba, minta perhatian
)

type supervisor struct {
	p    paths
	t    *tray
	cmds chan int

	mu  sync.Mutex
	pid int // proses yang lagi jalan: bot, atau jendela setup
}

// command dipanggil dari thread UI (menu tray): gak boleh nunggu.
func (s *supervisor) command(c int) {
	if c == menuSetup && s.t.state() == stSetup {
		return // jendela setup udah kebuka
	}
	if c == menuQuit {
		s.killNow()
	}
	select {
	case s.cmds <- c:
	default:
	}
}

func (s *supervisor) setPid(pid int) {
	s.mu.Lock()
	s.pid = pid
	s.mu.Unlock()
}

// killNow matiin proses yang lagi jalan berikut anak-anaknya.
func (s *supervisor) killNow() {
	s.mu.Lock()
	pid := s.pid
	s.mu.Unlock()
	if pid == 0 {
		return
	}
	cmd := exec.Command(filepath.Join(os.Getenv("SystemRoot"), "System32", "taskkill.exe"), "/F", "/T", "/PID", strconv.Itoa(pid))
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: createNoWindow}
	_ = cmd.Run()
}

// run: setup kalau perlu, terus jalanin bot dan jaga dia tetap nyala.
// showWindow = buka jendela Japri pas mulai (false kalau autostart waktu Windows nyala).
func (s *supervisor) run(setup string, showWindow bool) {
	if !showWindow {
		s.firstTrayHint()
	}
	var failures []time.Time
	for {
		if setup != "" {
			s.t.setState(stSetup, nil)
			s.runSetupWindow(setup)
			if setupNeeded(s.p) != "" {
				// Setup dibatalin atau jendelanya ditutup sebelum selesai. Buka Japri lagi buat lanjut.
				s.t.close()
				return
			}
			setup = ""
			showWindow = true
			select {
			case c := <-s.cmds:
				if c == menuQuit {
					s.t.close()
					return
				}
			default:
			}
		}

		s.t.setState(stConnecting, nil)
		if showWindow {
			showWindow = false
			s.t.showMain()
		}
		done, err := s.startBot()
		var c int
		if err != nil {
			s.t.setState(stFailed, &balloon{title: "Japri gagal jalan", text: "Gagal ngejalanin Japri: " + err.Error() + ". Coba install ulang Japri.", warning: true})
			c = <-s.cmds
		} else {
			select {
			case code := <-done:
				now := time.Now()
				recent := failures[:0]
				for _, f := range failures {
					if now.Sub(f) < crashWindow {
						recent = append(recent, f)
					}
				}
				failures = append(recent, now)
				s.logLine(fmt.Sprintf("⚠️  Japri berhenti tiba-tiba (kode %d)", code))
				if len(failures) >= crashLimit {
					s.t.setState(stFailed, &balloon{
						title:   "Japri berhenti",
						text:    "Japri error terus, udah dicoba nyala ulang 3×. Klik ikon Japri buat lihat log-nya.",
						warning: true,
					})
					c = <-s.cmds
				} else {
					s.t.setState(stRestarting, nil)
					select {
					case <-time.After(3 * time.Second):
						continue
					case c = <-s.cmds:
					}
				}
			case c = <-s.cmds:
				s.killNow()
				<-done
			}
		}

		switch c {
		case menuQuit:
			s.t.close()
			return
		case menuSetup:
			setup = "setup"
		case menuRetry:
			failures = nil
		}
	}
}

// runSetupWindow buka jendela console buat wizard / scan QR, dan nunggu sampai ketutup.
func (s *supervisor) runSetupWindow(mode string) {
	cmd := exec.Command(s.p.exe, "__console", mode)
	if err := cmd.Start(); err != nil {
		messageBox("Japri", "Gagal buka jendela setup: "+err.Error())
		return
	}
	s.setPid(cmd.Process.Pid)
	_ = cmd.Wait()
	s.setPid(0)
}

func (s *supervisor) openLog() (*os.File, error) {
	if st, err := os.Stat(s.p.log); err == nil && st.Size() > maxLogSize {
		_ = os.Remove(s.p.log + ".1")
		_ = os.Rename(s.p.log, s.p.log+".1")
	}
	return os.OpenFile(s.p.log, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o600)
}

func writeLogLine(w io.Writer, line string) {
	fmt.Fprintf(w, "%s  %s\r\n", time.Now().Format("2006-01-02 15:04:05"), line)
}

// firstTrayHint: pertama kali Japri langsung ke tray (autostart), kasih tau dia ada di mana.
func (s *supervisor) firstTrayHint() {
	mark := filepath.Join(s.p.data, "tray-hint")
	if _, err := os.Stat(mark); err == nil {
		return
	}
	_ = os.WriteFile(mark, nil, 0o600)
	s.t.notify(balloon{title: "Japri jalan di sini", text: "Japri jalan di system tray. Klik ikonnya buat buka jendela Japri."})
}

func (s *supervisor) logLine(line string) {
	s.t.appendLog(line)
	if f, err := s.openLog(); err == nil {
		writeLogLine(f, line)
		f.Close()
	}
}

// startBot jalanin node tanpa jendela. Channel done ngasih exit code pas prosesnya berhenti.
func (s *supervisor) startBot() (<-chan int, error) {
	_ = os.Remove(s.p.lock) // sisa kalau sebelumnya dimatiin paksa; Japri.exe udah jamin cuma satu yang jalan
	logf, err := s.openLog()
	if err != nil {
		return nil, err
	}
	r, w, err := os.Pipe()
	if err != nil {
		logf.Close()
		return nil, err
	}
	cmd := exec.Command(s.p.node, nodeArgs(s.p, "")...)
	cmd.Dir = s.p.app
	cmd.Stdout, cmd.Stderr = w, w
	cmd.Env = append(os.Environ(), "DATA_DIR="+s.p.data, "JAPRI_DESKTOP=1", "JAPRI_TRAY=1", "NO_COLOR=1")
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: createNoWindow}
	writeLogLine(logf, "──────── Japri dinyalain ────────")
	s.t.appendLog("──────── Japri dinyalain ────────")
	if err := cmd.Start(); err != nil {
		r.Close()
		w.Close()
		logf.Close()
		return nil, err
	}
	w.Close()
	s.setPid(cmd.Process.Pid)

	done := make(chan int, 1)
	go func() {
		sc := bufio.NewScanner(r)
		sc.Buffer(make([]byte, 64*1024), 1<<20)
		for sc.Scan() {
			line := sc.Text()
			if strings.HasPrefix(line, statusPrefix) {
				s.onStatus(strings.TrimSpace(line[len(statusPrefix):]))
				continue
			}
			if strings.HasPrefix(line, infoPrefix) {
				var i struct{ Bot, AI string }
				if json.Unmarshal([]byte(line[len(infoPrefix):]), &i) == nil {
					s.t.setInfo(botInfo{bot: i.Bot, ai: i.AI})
				}
				continue
			}
			writeLogLine(logf, line)
			s.t.appendLog(line)
		}
		_, _ = io.Copy(io.Discard, r) // baris kepanjangan: buang sisanya biar node gak macet
		_ = cmd.Wait()
		r.Close()
		logf.Close()
		s.setPid(0)
		done <- cmd.ProcessState.ExitCode()
	}()
	return done, nil
}

func (s *supervisor) onStatus(status string) {
	switch status {
	case "connecting":
		s.t.setState(stConnecting, nil)
	case "ready":
		s.t.setState(stReady, nil)
	case "qr":
		if s.t.state() != stQR {
			s.t.setState(stQR, &balloon{
				title:   "Japri perlu scan QR ulang",
				text:    "WhatsApp nomor bot ke-logout. Halaman QR-nya udah kebuka di browser: scan pakai HP nomor bot.",
				warning: true,
			})
		}
	}
}
