// Tes server wizard setup (jendela Windows): tanpa WhatsApp, AI, atau browser. Jalankan: npm test
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "japri-test-"));
import { test, mock } from "node:test";
import assert from "node:assert";
type Sink = { status(s: string): void; qr(dataUrl: string): void };
let sink: Sink | undefined;
const opened: string[] = [];
mock.module("../src/desktop.js", { namedExports: {
  sendToSetupWizard: (s: Sink) => { sink = s; },
  openInBrowser: (u: string) => { opened.push(u); },
}});
const { configExists, loadConfig, saveConfig, newConfig } = await import("../src/config.js");
const { startSetupServer } = await import("../src/setup/web.js");

let finished = 0;
let owner = false;
const wizard = await startSetupServer({
  pairOnly: false,
  pairing: () => ({ bot: owner ? "6280000000000" : undefined, ownerClaimed: owner, setupCode: "123456" }),
  onFinish: () => finished++,
  onCancel: () => {},
});
const { origin, searchParams } = new URL(wizard.url);
const token = searchParams.get("t")!;
const api = async (p: string, body?: unknown, t = token) => {
  const res = await fetch(origin + p, {
    method: body === undefined ? "GET" : "POST",
    headers: { "x-japri-token": t, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, data: (await res.json()) as any };
};

test("setup web: halaman & API wajib pakai token", async () => {
  assert.equal((await fetch(origin + "/")).status, 403);
  const page = await fetch(wizard.url);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Japri Setup/);
  assert.equal((await api("/api/init", undefined, "salah")).status, 403);
});

test("setup web: belum ada config → simpan → API key gak pernah dikirim balik", async () => {
  const init = await api("/api/init");
  assert.equal(init.data.current, null);
  assert.ok(init.data.providers.some((p: any) => p.id === "openrouter" && p.needsKey && !p.needsBaseUrl));
  assert.ok(init.data.providers.some((p: any) => p.id === "ollama" && p.needsBaseUrl && !p.asksApiKey));

  assert.equal((await api("/api/save", { provider: "openrouter", apiKey: "sk-or-palsu-0000000000", model: "" , botName: "Japri", timezone: "Asia/Jakarta" })).status, 400);
  assert.equal((await api("/api/save", { provider: "openrouter", apiKey: "sk-or-palsu-0000000000", model: "m", botName: "Japri", timezone: "Planet/Mars" })).status, 400);
  assert.equal((await api("/api/save", { provider: "ngasal", model: "m", botName: "Japri", timezone: "Asia/Jakarta" })).status, 400);
  assert.ok(!configExists());

  const r = await api("/api/save", { provider: "openrouter", apiKey: " sk-or-palsu-0000000000 ", model: "anthropic/claude-haiku", botName: "Andi Bot", timezone: "Asia/Makassar" });
  assert.equal(r.status, 200);
  await wizard.saved;
  const cfg = loadConfig();
  assert.equal(cfg.llm.apiKey, "sk-or-palsu-0000000000");
  assert.equal(cfg.llm.baseUrl, "https://openrouter.ai/api/v1");
  assert.equal(cfg.botName, "Andi Bot");

  const again = await api("/api/init");
  assert.deepEqual(again.data.current, { provider: "openrouter", model: "anthropic/claude-haiku", baseUrl: "https://openrouter.ai/api/v1", hasKey: true, botName: "Andi Bot", timezone: "Asia/Makassar" });
  assert.ok(!JSON.stringify(again.data).includes("sk-or-palsu"));
});

test("setup web: API key kosong = pakai yang lama, tapi cuma kalau provider-nya sama", async () => {
  await api("/api/save", { provider: "openrouter", apiKey: "", model: "lain", botName: "Japri", timezone: "Asia/Jakarta" });
  assert.equal(loadConfig().llm.apiKey, "sk-or-palsu-0000000000");
  await api("/api/save", { provider: "ollama", apiKey: "sk-gak-kepake", baseUrl: "http://localhost:11434/v1", model: "qwen", botName: "Japri", timezone: "Asia/Jakarta" });
  assert.equal(loadConfig().llm.apiKey, undefined);
  await api("/api/save", { provider: "openrouter", apiKey: "", model: "m", botName: "Japri", timezone: "Asia/Jakarta" });
  assert.equal(loadConfig().llm.apiKey, undefined); // key lama punya openrouter udah ketimpa pas ganti ke ollama
});

test("setup web: config lama gak ilang (owner, nama panggilan) waktu disimpan ulang", async () => {
  saveConfig({ ...loadConfig(), owner: { ids: ["6280000000000@s.whatsapp.net"], name: "Andi" }, nicknames: ["ndi"] });
  await api("/api/save", { provider: "anthropic", apiKey: "sk-ant-palsu-00000000", model: "claude-haiku-5-5", botName: "Japri", timezone: "Asia/Jakarta" });
  const cfg = loadConfig();
  assert.equal(cfg.owner?.name, "Andi");
  assert.deepEqual(cfg.nicknames, ["ndi"]);
  assert.equal(cfg.llm.provider, "anthropic");
});

test("setup web: daftar model Claude, tes tanpa model ditolak", async () => {
  const r = await api("/api/models", { provider: "anthropic" });
  assert.ok(r.data.models.includes("claude-haiku-5-5"));
  assert.equal((await api("/api/test", { provider: "anthropic", model: "" })).status, 400);
});

test("setup web: status & QR WhatsApp, kode setup, link wa.me", async () => {
  assert.equal((await api("/api/wa")).data.status, "connecting");
  sink!.qr("data:image/png;base64,QR1");
  let wa = (await api("/api/wa")).data;
  assert.equal(wa.status, "qr");
  assert.equal(wa.qr, "data:image/png;base64,QR1");
  sink!.status("ready");
  owner = true;
  wa = (await api("/api/wa")).data;
  assert.equal(wa.qr, null);
  assert.equal(wa.ownerClaimed, true);
  assert.equal(wa.waLink, "https://wa.me/6280000000000?text=123456");
});

test("setup web: cuma link https yang boleh dibuka; Selesai manggil onFinish", async () => {
  assert.equal((await api("/api/open", { url: "file:///C:/Windows/System32/calc.exe" })).status, 400);
  assert.equal((await api("/api/open", { url: "https://evil.example.com\" & calc" })).status, 400);
  assert.equal((await api("/api/open", { url: "https://openrouter.ai/keys" })).status, 200);
  assert.deepEqual(opened, ["https://openrouter.ai/keys"]);
  await api("/api/finish", {});
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(finished, 1);
  wizard.close();
});
