// Tes server jendela Pengaturan (Windows): tanpa WhatsApp, browser, atau AI beneran. Jalankan: npm test
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "japri-test-"));
import { test, mock } from "node:test";
import assert from "node:assert";
const infos: unknown[] = [];
mock.module("../src/desktop.js", { namedExports: {
  isDesktop: false, isTray: false,
  reportInfo: (i: unknown) => { infos.push(i); },
  reportStatus: () => {}, markConnected: () => {}, showQrInBrowser: async () => {}, setupWizardOpen: () => false,
  openInBrowser: () => {},
  sendToSetupWizard: () => {},
}});
const { saveConfig, newConfig, loadConfig } = await import("../src/config.js");
// AI yang "mati": alamat lokal yang pasti nolak koneksi, jadi tes model & tes gambar gagal cepat tanpa internet
const DEAD = "http://127.0.0.1:1/v1";
saveConfig(newConfig({ provider: "openrouter", model: "lama", apiKey: "sk-or-palsu-0000000000", baseUrl: "https://openrouter.ai/api/v1" }));
const store = await import("../src/db.js");
store.upsertGroup("120363000000000001@g.us", "Grup Kantor");
store.upsertGroup("120363000000000002@g.us", "Grup Alumni");
const { startSettingsServer } = await import("../src/setup/settings-web.js");

let resetups = 0;
const server = await startSettingsServer({ botNumber: () => "6280000000000", onResetup: () => resetups++ });
const { origin, searchParams } = new URL(server.url);
const token = searchParams.get("t")!;
const api = async (p: string, body?: unknown, t = token) => {
  const res = await fetch(origin + p, {
    method: body === undefined ? "GET" : "POST",
    headers: { "x-japri-token": t, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, data: (await res.json()) as any };
};

test("pengaturan: wajib token, API key gak pernah dikirim ke halaman", async () => {
  assert.equal((await fetch(origin + "/")).status, 403);
  assert.match(await (await fetch(server.url)).text(), /Pengaturan Japri/);
  assert.equal((await api("/api/state", undefined, "salah")).status, 403);
  const s = (await api("/api/state")).data;
  assert.equal(s.bot, "6280000000000");
  assert.deepEqual(s.config.llm, { provider: "openrouter", model: "lama", baseUrl: "https://openrouter.ai/api/v1", hasKey: true });
  assert.deepEqual(s.groups.map((g: any) => g.name), ["Grup Alumni", "Grup Kantor"]);
  assert.ok(!JSON.stringify(s).includes("sk-or-palsu"));
});

test("pengaturan: umum langsung kesimpen, nilai salah ditolak", async () => {
  let r = await api("/api/settings", { botName: " Asisten Andi ", nicknames: "Andi, NDI, ,andi" });
  assert.equal(r.status, 200);
  assert.equal(loadConfig().botName, "Asisten Andi");
  assert.deepEqual(loadConfig().nicknames, ["andi", "ndi"]);
  assert.deepEqual(r.data.config.nicknames, ["andi", "ndi"]);

  r = await api("/api/settings", { timezone: "Planet/Mars" });
  assert.equal(r.status, 400);
  assert.equal(loadConfig().timezone, "Asia/Jakarta");
  assert.equal((await api("/api/settings", { timezone: "Asia/Makassar" })).status, 200);
  assert.equal(loadConfig().timezone, "Asia/Makassar");

  assert.equal((await api("/api/settings", { retentionDays: 0 })).status, 400);
  assert.equal((await api("/api/settings", { retentionDays: 60 })).status, 200);
  assert.equal(loadConfig().retentionDays, 60);
  assert.equal((await api("/api/settings", { botName: "" })).status, 400);
  assert.equal((await api("/api/settings", { taskOffers: "iya" })).status, 400);
  assert.equal((await api("/api/settings", { taskOffers: false, checkUpdates: false })).status, 200);
  assert.equal(loadConfig().taskOffers, false);
  assert.equal(loadConfig().checkUpdates, false);
});

test("pengaturan: jam tenang & rangkuman otomatis", async () => {
  assert.equal((await api("/api/settings", { quietHours: { start: "22:00", end: "22:00" } })).status, 400);
  assert.equal((await api("/api/settings", { quietHours: { start: "22:00", end: "6:00" } })).status, 200);
  assert.deepEqual(loadConfig().quietHours, { start: "22:00", end: "06:00" });
  await api("/api/settings", { quietHours: null });
  assert.equal(loadConfig().quietHours, null);

  assert.equal((await api("/api/settings", { digest: { time: "25:00" } })).status, 400);
  assert.equal((await api("/api/settings", { digest: { time: "21:00", weekdaysOnly: true } })).status, 200);
  assert.deepEqual(loadConfig().digest, { time: "21:00", weekdaysOnly: true });
  assert.equal(typeof loadConfig().digestHandledTs, "number"); // jadwal yang udah lewat gak dikirim mendadak
  assert.equal((await api("/api/settings", { weeklyDigest: { day: 7, time: "19:00" } })).status, 400);
  assert.equal((await api("/api/settings", { weeklyDigest: { day: 0, time: "19:00" } })).status, 200);
  assert.deepEqual(loadConfig().weeklyDigest, { day: 0, time: "19:00" });
  await api("/api/settings", { digest: null, weeklyDigest: null });
  assert.equal(loadConfig().digest, null);
  assert.equal(loadConfig().weeklyDigest, null);
});

test("pengaturan: ganti AI dites dulu; gagal = gak berubah; API key lama dipakai lagi", async () => {
  // Tes model gagal (server AI-nya mati) → pengaturan gak berubah
  let r = await api("/api/ai", { provider: "custom", baseUrl: DEAD, model: "m", apiKey: "" });
  assert.equal(r.status, 400);
  assert.equal(loadConfig().llm.provider, "openrouter");

  r = await api("/api/ai", { provider: "openrouter", model: "anthropic/claude-haiku", apiKey: "", skipTest: true });
  assert.equal(r.status, 200);
  assert.equal(loadConfig().llm.model, "anthropic/claude-haiku");
  assert.equal(loadConfig().llm.apiKey, "sk-or-palsu-0000000000");
  assert.deepEqual(infos.at(-1), { ai: "openrouter / anthropic/claude-haiku" });

  r = await api("/api/ai", { provider: "ollama", baseUrl: DEAD, model: "qwen3", apiKey: "sk-gak-kepake", skipTest: true });
  assert.equal(r.status, 200);
  assert.deepEqual(loadConfig().llm, { provider: "ollama", model: "qwen3", apiKey: undefined, baseUrl: DEAD });
});

test("pengaturan: notif & baca gambar per grup", async () => {
  const kantor = "120363000000000001@g.us";
  assert.equal((await api("/api/group", { jid: kantor, notify: "berisik" })).status, 400);
  assert.equal((await api("/api/group", { jid: "120363000000000009@g.us", notify: "off" })).status, 400);
  const r = await api("/api/group", { jid: kantor, notify: "mentions" });
  assert.equal(r.status, 200);
  assert.equal(store.listGroups().find((g) => g.jid === kantor)!.notify_mode, "mentions");

  // Nyalain baca gambar pertama kali: model dites dulu (di sini AI-nya mati, jadi ditolak)
  assert.equal((await api("/api/group", { jid: kantor, readImages: true })).status, 400);
  assert.equal((await api("/api/images", { enabled: true })).status, 400);
  assert.equal(loadConfig().readImages, false);
  // Matiin gak perlu tes
  assert.equal((await api("/api/group", { jid: kantor, readImages: false })).status, 200);
  assert.equal(store.listGroups().find((g) => g.jid === kantor)!.read_images, 0);
  assert.equal((await api("/api/group", { jid: kantor, readImages: null })).status, 200);
  assert.equal(store.listGroups().find((g) => g.jid === kantor)!.read_images, null);
});

test("pengaturan: AI buat anggota terpisah, key-nya gak bocor, wajib diatur sebelum dinyalain", async () => {
  const kantor = "120363000000000001@g.us";
  let s = (await api("/api/state")).data;
  assert.equal(s.config.members.llm, null);
  assert.equal((await api("/api/members", { enabled: true })).status, 400);
  assert.equal((await api("/api/group", { jid: kantor, members: true })).status, 400);

  // Tes gagal (server AI mati) → gak disimpan
  assert.equal((await api("/api/member-ai", { provider: "custom", baseUrl: DEAD, model: "m" })).status, 400);
  assert.equal(loadConfig().memberReplies.llm, null);

  // Provider beda dari owner, pakai key sendiri
  let r = await api("/api/member-ai", { provider: "openrouter", model: "x/gratis:free", apiKey: "sk-or-anggota-000000", skipTest: true });
  assert.equal(r.status, 200);
  assert.deepEqual(r.data.config.members.llm, { provider: "openrouter", model: "x/gratis:free", baseUrl: "https://openrouter.ai/api/v1", hasKey: true });
  assert.ok(!JSON.stringify(r.data).includes("sk-or-anggota"));
  assert.equal(loadConfig().llm.provider, "ollama"); // AI owner gak ikut berubah
  // Ganti model, key kosong = key AI anggota yang lama (bukan key owner)
  await api("/api/member-ai", { provider: "openrouter", model: "x/lain", apiKey: "", skipTest: true });
  assert.equal(loadConfig().memberReplies.llm!.apiKey, "sk-or-anggota-000000");

  r = await api("/api/members", { perPersonDaily: 20, perGroupDaily: "" });
  assert.deepEqual([r.data.config.members.perPersonDaily, r.data.config.members.perGroupDaily], [20, null]);
  assert.equal((await api("/api/members", { perPersonDaily: 0 })).status, 400);

  assert.equal((await api("/api/group", { jid: kantor, members: true })).status, 200);
  s = (await api("/api/state")).data;
  const g = s.groups.find((x: any) => x.jid === kantor);
  assert.deepEqual([g.members, g.membersOn, g.memberUsage], [1, true, 0]);
  assert.equal(s.groups.find((x: any) => x.jid !== kantor).membersOn, false);
  assert.equal((await api("/api/members", { enabled: true })).status, 200);
  assert.equal(store.listGroups().find((x) => x.jid === kantor)!.member_replies, null); // ikut umum lagi
  assert.equal((await api("/api/state")).data.groups.every((x: any) => x.membersOn), true);
});

test("pengaturan: setup ulang dikabarin ke Japri.exe", async () => {
  await api("/api/resetup", {});
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(resetups, 1);
  server.close();
});
