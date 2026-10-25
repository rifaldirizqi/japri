// Mode desktop: dipakai waktu Japri dijalanin dari installer Windows (Japri.exe set JAPRI_DESKTOP=1).
// Tujuannya biar ramah buat orang awam: QR dibuka di browser, dan Japri gak bisa jalan dobel.
// Kalau jalan di belakang Japri.exe (JAPRI_TRAY=1), status & info dilaporin ke jendela Japri lewat stdout.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import QRCode from "qrcode";
import { DATA_DIR } from "./config.js";

export const isDesktop = !!process.env.JAPRI_DESKTOP;
export const isTray = !!process.env.JAPRI_TRAY;

export type Status = "connecting" | "qr" | "ready";

type SetupWizardSink = { status(status: Status): void; qr(dataUrl: string): void };
let setupWizard: SetupWizardSink | null = null;

/** Wizard setup di jendela Japri lagi kebuka: status & QR WhatsApp dikirim ke situ, gak dibuka di browser. */
export function sendToSetupWizard(sink: SetupWizardSink) {
  setupWizard = sink;
}

export const setupWizardOpen = () => setupWizard !== null;

/** Kabarin jendela & ikon tray (dibaca Japri.exe; baris ini gak ikut ke log). */
export function reportStatus(status: Status) {
  setupWizard?.status(status);
  if (isTray) process.stdout.write(`@@japri-status ${status}\n`);
}

/** Nomor bot & model AI buat ditampilin di jendela Japri. */
export function reportInfo(info: { bot?: string; ai?: string }) {
  if (isTray) process.stdout.write(`@@japri-info ${JSON.stringify(info)}\n`);
}

const QR_PAGE = path.join(DATA_DIR, "qr.html");
const LOCK_FILE = path.join(DATA_DIR, "japri.lock");

/** Buka file atau link di browser default. */
export function openInBrowser(file: string) {
  const [cmd, args] =
    process.platform === "win32"
      ? ["cmd", ["/c", "start", '""', `"${file}"`]]
      : process.platform === "darwin"
        ? ["open", [file]]
        : ["xdg-open", [file]];
  const child = spawn(cmd, args, { detached: true, stdio: "ignore", windowsVerbatimArguments: true });
  child.on("error", () => console.log(`   Buka file ini manual di browser: ${file}`));
  child.unref();
}

const page = (body: string, refresh: boolean) => `<!doctype html>
<html lang="id"><head><meta charset="utf-8"><title>Japri — Sambungin WhatsApp</title>
${refresh ? '<meta http-equiv="refresh" content="5">' : ""}
<style>
  body { font-family: system-ui, sans-serif; background: #f4f6f5; color: #1c2b24; margin: 0;
         min-height: 100vh; display: grid; place-items: center; }
  main { background: #fff; padding: 32px 40px; border-radius: 16px; box-shadow: 0 4px 24px #0001;
         max-width: 420px; text-align: center; }
  h1 { font-size: 22px; margin: 0 0 8px; }
  ol { text-align: left; line-height: 1.6; padding-left: 20px; }
  img { width: 280px; height: 280px; image-rendering: pixelated; }
  .ok { font-size: 48px; }
  small { color: #5b6b63; }
</style></head><body><main>${body}</main></body></html>`;

let qrOpened = false;

/** Tulis QR ke halaman HTML (auto-refresh), dan buka di browser pas pertama kali. */
export async function showQrInBrowser(qr: string) {
  const dataUrl = await QRCode.toDataURL(qr, { margin: 1, width: 560 });
  if (setupWizard) {
    setupWizard.qr(dataUrl);
    return;
  }
  fs.writeFileSync(
    QR_PAGE,
    page(
      `<h1>Sambungin WhatsApp bot</h1>
       <ol>
         <li>Buka WhatsApp di HP <b>nomor bot</b> (bukan nomor pribadi lo)</li>
         <li>Ketuk ⋮ atau Pengaturan → <b>Perangkat tertaut</b></li>
         <li>Ketuk <b>Tautkan perangkat</b>, terus scan kode ini</li>
       </ol>
       <img src="${dataUrl}" alt="QR code">
       <p><small>Kode ini ganti tiap beberapa detik. Halaman ini otomatis ke-refresh.</small></p>`,
      true,
    ),
  );
  if (!qrOpened) {
    qrOpened = true;
    openInBrowser(QR_PAGE);
  }
}

/** Kalau halaman QR pernah dibuka, ganti isinya jadi "berhasil" (tetap auto-refresh sekali lagi lalu berhenti). */
export function markConnected() {
  if (!qrOpened) return;
  qrOpened = false; // kalau nanti perlu scan ulang, halamannya dibuka lagi
  fs.writeFileSync(
    QR_PAGE,
    page(`<div class="ok">✅</div><h1>WhatsApp udah nyambung</h1><p>Halaman ini boleh ditutup.</p>`, false),
  );
}

/**
 * Pastikan cuma satu Japri yang jalan (mis. autostart + user dobel-klik ikon).
 * Return false kalau udah ada Japri lain yang jalan.
 */
export function acquireSingleInstanceLock(): boolean {
  try {
    const pid = Number(fs.readFileSync(LOCK_FILE, "utf8"));
    if (pid && pid !== process.pid) {
      process.kill(pid, 0); // lempar error kalau prosesnya udah gak ada
      return false;
    }
  } catch {
    // lock gak ada atau prosesnya udah mati: aman
  }
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(LOCK_FILE, String(process.pid));
  const release = () => {
    try {
      if (fs.readFileSync(LOCK_FILE, "utf8") === String(process.pid)) fs.unlinkSync(LOCK_FILE);
    } catch {
      // udah kehapus
    }
  };
  process.on("exit", release);
  return true;
}
