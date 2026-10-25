// Tes cek update: GitHub Releases di-mock. Jalankan: npm test
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "japri-test-"));
import { beforeEach, describe, test } from "node:test";
import assert from "node:assert";

const { saveConfig, newConfig, loadConfig, updateConfig } = await import("../src/config.js");
const updater = await import("../src/updater.js");
saveConfig(newConfig({ provider: "openai", model: "m" }));

const release = (tag: string, extra: Record<string, unknown> = {}) => ({
  tag_name: tag,
  html_url: `https://github.com/rifaldirizqi/japri/releases/tag/${tag}`,
  body: "## Yang baru\n- Fitur **digest** harian\n- Benerin [bug reminder](https://x.y)\n\n**Full Changelog**: ...",
  draft: false,
  assets: [{ name: `JapriSetup-${tag.slice(1)}.exe`, browser_download_url: `https://dl/JapriSetup-${tag.slice(1)}.exe` }],
  ...extra,
});

let releases: unknown[] = [];
let requestedUrl = "";
globalThis.fetch = (async (url: string | URL) => {
  requestedUrl = String(url);
  return new Response(JSON.stringify(releases), { status: 200 });
}) as typeof fetch;

describe("compareVersions", () => {
  test("urutan versi", () => {
    assert.ok(updater.compareVersions("0.2.0", "0.1.9") > 0);
    assert.ok(updater.compareVersions("v1.0.0", "0.9.9") > 0);
    assert.ok(updater.compareVersions("0.10.0", "0.9.0") > 0);
    assert.equal(updater.compareVersions("v0.1.0", "0.1.0"), 0);
    assert.ok(updater.compareVersions("1.0.0", "1.0.0-beta.2") > 0);
    assert.ok(updater.compareVersions("1.0.0-beta.10", "1.0.0-beta.2") > 0);
  });
});

describe("checkForUpdate", () => {
  beforeEach(() => updateConfig({ notifiedVersion: undefined, checkUpdates: true }));

  test("ngecek repo dari package.json", async () => {
    releases = [];
    await updater.checkForUpdate();
    assert.match(requestedUrl, /api\.github\.com\/repos\/rifaldirizqi\/japri\/releases/);
  });

  test("gak ada rilis / rilis lebih lama → up-to-date", async () => {
    releases = [];
    assert.equal((await updater.checkForUpdate()).kind, "up-to-date");
    releases = [release(`v${updater.currentVersion}`), release("v0.0.9")];
    assert.equal((await updater.checkForUpdate()).kind, "up-to-date");
  });

  test("milih versi tertinggi, draft diabaikan", async () => {
    releases = [release("v9.0.0", { draft: true }), release("v0.3.0"), release("v0.12.0"), release("v0.4.0")];
    const s = await updater.checkForUpdate();
    assert.equal(s.kind, "available");
    assert.equal(s.kind === "available" && s.release.version, "0.12.0");
    assert.equal(s.kind === "available" && s.release.installerUrl, "https://dl/JapriSetup-0.12.0.exe");
  });

  test("GitHub error → status error, gak crash", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () => new Response("rate limited", { status: 403 })) as typeof fetch;
    const s = await updater.checkForUpdate();
    globalThis.fetch = original;
    assert.equal(s.kind, "error");
  });

  test("owner dikabarin sekali per versi", async () => {
    releases = [release("v5.0.0")];
    const sent: string[] = [];
    const send = async (t: string) => void sent.push(t);
    await updater.notifyIfUpdateAvailable(send);
    await updater.notifyIfUpdateAvailable(send);
    assert.equal(sent.length, 1);
    assert.match(sent[0], /Japri v5\.0\.0 udah rilis/);
    assert.equal(loadConfig().notifiedVersion, "5.0.0");
    releases = [release("v5.1.0")];
    await updater.notifyIfUpdateAvailable(send);
    assert.equal(sent.length, 2);
  });

  test("gak ngabarin kalau cek update dimatiin", async () => {
    updateConfig({ checkUpdates: false });
    releases = [release("v5.0.0")];
    const sent: string[] = [];
    await updater.notifyIfUpdateAvailable(async (t) => void sent.push(t));
    assert.equal(sent.length, 0);
  });
});

test("catatan rilis diubah jadi poin WhatsApp", () => {
  const out = updater.summarizeNotes(release("v1.0.0").body);
  assert.equal(out, "• Fitur *digest* harian\n• Benerin bug reminder");
  const many = Array.from({ length: 12 }, (_, i) => `- item ${i}`).join("\n");
  assert.match(updater.summarizeNotes(many), /…dan 4 perubahan lain$/);
});

describe("update sekali klik", async () => {
  const crypto = await import("node:crypto");
  const selfupdate = await import("../src/selfupdate.js");
  const { DATA_DIR } = await import("../src/config.js");
  const data = Buffer.from("isi installer palsu");
  const sha = crypto.createHash("sha256").update(data).digest("hex");

  test("ukuran & checksum installer dibaca dari GitHub", async () => {
    releases = [release("v7.0.0", { assets: [{ name: "JapriSetup-7.0.0.exe", browser_download_url: "https://dl/a.exe", size: data.length, digest: `sha256:${sha}` }] })];
    const s = await updater.checkForUpdate();
    assert.deepEqual(s.kind === "available" && s.release.installer, { url: "https://dl/a.exe", size: data.length, sha256: sha });
    releases = [release("v7.0.0")]; // rilis lama tanpa digest
    const old = await updater.checkForUpdate();
    assert.equal(old.kind === "available" && old.release.installer?.sha256, null);
  });

  test("verifikasi installer: ukuran & SHA-256", () => {
    assert.equal(selfupdate.verifyInstaller(data, { size: data.length, sha256: sha }), null);
    assert.match(selfupdate.verifyInstaller(data, { size: data.length + 1, sha256: sha })!, /ukuran/);
    assert.match(selfupdate.verifyInstaller(Buffer.from("isi installer palsX"), { size: data.length, sha256: sha })!, /checksum/);
  });

  test("bukan installer Windows (Docker/Node): 'update' dibales instruksi manual", async () => {
    releases = [release("v7.0.0")];
    const progress: string[] = [];
    const out = await selfupdate.installUpdate(async (t) => void progress.push(t));
    assert.match(out!, /Japri v7\.0\.0 udah rilis/); assert.match(out!, /git pull/); assert.equal(progress.length, 0);
    releases = [];
    assert.match((await selfupdate.installUpdate(async () => {}))!, /udah versi terbaru/);
  });

  test("abis nyala lagi: kabarin hasil update sekali", async () => {
    const marker = path.join(DATA_DIR, "update.json");
    const sent: string[] = [];
    const send = async (t: string) => void sent.push(t);
    fs.writeFileSync(marker, JSON.stringify({ from: "0.0.1", to: updater.currentVersion, url: "https://dl/a.exe", notes: "• Fitur baru", ts: Date.now() }));
    await selfupdate.reportUpdateResult(send);
    await selfupdate.reportUpdateResult(send);
    assert.equal(sent.length, 1); assert.match(sent[0], new RegExp(`✅ Udah update ke v${updater.currentVersion.replace(/\./g, "\\.")}\\.\\n\\n\\*Yang baru:\\*\\n• Fitur baru`));
    fs.writeFileSync(marker, JSON.stringify({ from: updater.currentVersion, to: "9.9.9", url: "https://dl/a.exe", notes: "", ts: Date.now() }));
    await selfupdate.reportUpdateResult(send);
    assert.match(sent[1], /⚠️ Update ke v9\.9\.9 gagal/);
  });
});
