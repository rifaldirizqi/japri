// Update sekali klik (v0.3.0 F2): owner bales "update" → download installer, cek checksum, pasang tanpa jendela.
// Installer-nya matiin Japri, nimpa file-nya, terus nyalain lagi (Japri.exe --tray). Khusus installer Windows.
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "./config.js";
import { canSelfUpdate, checkForUpdate, currentVersion, summarizeNotes, updateMessage, type Release } from "./updater.js";

const UPDATE_DIR = path.join(DATA_DIR, "update");
const MARKER = path.join(DATA_DIR, "update.json");
const FAIL_AFTER_MS = 5 * 60_000; // installer harusnya udah matiin Japri sebelum ini

type Marker = { from: string; to: string; url: string; notes: string; ts: number };

let busy = false;

/** File installer utuh: ukuran & SHA-256 sama kayak yang dibilang GitHub. */
export function verifyInstaller(data: Buffer, expected: { size: number; sha256: string }): string | null {
  if (expected.size && data.length !== expected.size) return `ukuran file beda (${data.length} vs ${expected.size} byte)`;
  const sha = crypto.createHash("sha256").update(data).digest("hex");
  if (sha !== expected.sha256) return "checksum gak cocok";
  return null;
}

const manual = (r: Release) => `Download manual: ${r.installer?.url ?? r.url}`;

/**
 * Jalanin update. `send` dipakai buat kabar progres ke owner; return pesan terakhir (atau null kalau
 * installer udah jalan dan kabar berikutnya dikirim setelah Japri nyala lagi).
 */
export async function installUpdate(send: (text: string) => Promise<void>): Promise<string | null> {
  const status = await checkForUpdate();
  if (status.kind === "error") return `Gagal cek update: ${status.message}`;
  if (status.kind === "up-to-date") return `Japri udah versi terbaru (v${currentVersion}).`;
  const release = status.release;
  if (!canSelfUpdate()) return updateMessage(release);
  const installer = release.installer;
  if (!installer?.sha256) return `Installer v${release.version} gak bisa dicek keasliannya, jadi gak gue pasang otomatis.\n${manual(release)}`;
  if (busy) return "Update lagi jalan, tunggu bentar ya.";

  busy = true;
  try {
    await send(`⏳ Lagi download Japri v${release.version}…`);
    const res = await fetch(installer.url, { signal: AbortSignal.timeout(10 * 60_000) });
    if (!res.ok) return `Gagal download installer (HTTP ${res.status}).\n${manual(release)}`;
    const data = Buffer.from(await res.arrayBuffer());
    const problem = verifyInstaller(data, { size: installer.size, sha256: installer.sha256 });
    if (problem) return `File installer-nya gak utuh (${problem}), jadi gak gue pasang.\n${manual(release)}`;

    fs.rmSync(UPDATE_DIR, { recursive: true, force: true });
    fs.mkdirSync(UPDATE_DIR, { recursive: true });
    const file = path.join(UPDATE_DIR, `JapriSetup-${release.version}.exe`);
    fs.writeFileSync(file, data);
    const marker: Marker = { from: currentVersion, to: release.version, url: installer.url, notes: summarizeNotes(release.notes), ts: Date.now() };
    fs.writeFileSync(MARKER, JSON.stringify(marker));

    await send(`🔄 Lagi masang v${release.version}. Japri offline bentar (±1 menit), nanti gue kabarin kalau udah nyala lagi.`);
    // Lewat "start" biar installer-nya gak ikut kematiin waktu Japri dimatiin installer
    const child = spawn("cmd", ["/c", "start", '""', `"${file}"`, "/VERYSILENT", "/SUPPRESSMSGBOXES", "/NORESTART", "/SP-"], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
      windowsVerbatimArguments: true,
    });
    child.unref();
    // Kalau Japri masih hidup lama setelah ini, berarti installer-nya gagal
    setTimeout(() => {
      busy = false;
      fs.rmSync(MARKER, { force: true });
      void send(`⚠️ Update ke v${release.version} kayaknya gagal, Japri masih v${currentVersion}.\n${manual(release)}`).catch(() => undefined);
    }, FAIL_AFTER_MS);
    return null;
  } catch (e) {
    fs.rmSync(MARKER, { force: true });
    return `Update gagal: ${e instanceof Error ? e.message : String(e)}\n${manual(release)}`;
  } finally {
    if (!fs.existsSync(MARKER)) busy = false;
  }
}

/** Abis nyala lagi: kabarin hasil update (sekali). */
export async function reportUpdateResult(send: (text: string) => Promise<void>) {
  let marker: Marker;
  try {
    marker = JSON.parse(fs.readFileSync(MARKER, "utf8"));
  } catch {
    return;
  }
  fs.rmSync(MARKER, { force: true });
  fs.rmSync(UPDATE_DIR, { recursive: true, force: true });
  if (Date.now() - marker.ts > 24 * 3600_000) return; // basi
  await send(
    currentVersion === marker.to
      ? `✅ Udah update ke v${marker.to}.${marker.notes ? `\n\n*Yang baru:*\n${marker.notes}` : ""}`
      : `⚠️ Update ke v${marker.to} gagal, Japri masih v${currentVersion}.\nDownload manual: ${marker.url}`,
  );
}
