// Tes fitur v0.2.0: catch-up, digest harian, jam tenang, pencarian. WhatsApp & AI di-mock. Jalankan: npm test
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "japri-test-"));
import { test, mock } from "node:test";
import assert from "node:assert";
const sent: { to: string; text: string }[] = [];
const prompts: string[] = [];
mock.module("../src/wa/client.js", { namedExports: { sendText: async (to: string, text: string) => { sent.push({ to, text }); } } });
mock.module("../src/agent/agent.js", { namedExports: { summarize: async (p: string) => { prompts.push(p); return "RANGKUMAN"; }, rememberForOwner: () => {} } });
const { saveConfig, newConfig, loadConfig, updateConfig } = await import("../src/config.js");
saveConfig(newConfig({ provider: "openai", model: "m" }, { owner: { ids: ["6280000000001@s.whatsapp.net"], name: "Andi" } }));
const store = await import("../src/db.js");
const time = await import("../src/time.js");
const catchup = await import("../src/catchup.js");
const notify = await import("../src/notify.js");
const { runDigestIfDue } = await import("../src/digest.js");

// Sabtu, 24 Okt 2026 12:00 WIB
const NOON = Date.parse("2026-10-24T12:00:00+07:00") / 1000;
const H = 3600;
let n = 0;
const save = (chat: string, ts: number, o: Partial<{ from_owner: number; for_owner: number; text: string; sender_name: string }> = {}) =>
  store.saveMessage({ id: `m${n++}`, chat_jid: chat, sender_name: "Budi", from_owner: 0, text: "halo", ts, ...o });
const K = "120363000000000001@g.us", R = "120363000000000002@g.us", A = "120363000000000003@g.us";
store.upsertGroup(K, "Grup Kantor"); store.upsertGroup(R, "Grup Keluarga"); store.upsertGroup(A, "Grup Alumni");

test("jam lokal: parse, rentang lewat tengah malam, jadwal terakhir", () => {
  assert.equal(time.parseHM("21:00"), 1260); assert.equal(time.parseHM("9.30"), 570); assert.equal(time.parseHM("7"), 420);
  assert.equal(time.parseHM("24:00"), null); assert.equal(time.parseHM("jam 9"), null);
  const [s, e] = [22 * 60, 6 * 60];
  assert.ok(time.inDailyWindow(23 * 60, s, e)); assert.ok(time.inDailyWindow(2 * 60, s, e));
  assert.ok(!time.inDailyWindow(6 * 60, s, e)); assert.ok(!time.inDailyWindow(12 * 60, s, e));
  assert.ok(time.inDailyWindow(13 * 60, 12 * 60, 14 * 60)); assert.ok(!time.inDailyWindow(14 * 60, 12 * 60, 14 * 60));
  assert.equal(time.localMinutes(NOON, "Asia/Jakarta"), 720); assert.equal(time.localMinutes(NOON, "Asia/Jayapura"), 840);
  assert.equal(time.lastOccurrence(21 * 60, NOON, "Asia/Jakarta"), NOON - 15 * H); // kemarin 21:00
  assert.equal(time.lastOccurrence(9 * 60, NOON, "Asia/Jakarta"), NOON - 3 * H);
  assert.equal(time.lastOccurrence(12 * 60, NOON, "Asia/Jakarta"), NOON);
});

test("catch-up: titik mulai per grup", () => {
  // Kantor: owner terakhir nulis 2 jam lalu → mulai dari situ
  save(K, NOON - 5 * H); save(K, NOON - 2 * H, { from_owner: 1 }); save(K, NOON - 1 * H, { for_owner: 1, text: "Andi cek proposal ya" });
  // Keluarga: owner terakhir nulis 5 hari lalu → dibatasi 3 hari
  save(R, NOON - 5 * 24 * H, { from_owner: 1 }); save(R, NOON - 4 * 24 * H); save(R, NOON - 2 * 24 * H);
  // Alumni: owner belum pernah nulis → 24 jam terakhir
  save(A, NOON - 30 * H); save(A, NOON - 10 * H);
  const batches = catchup.collectCatchup(NOON);
  const by = Object.fromEntries(batches.map((b) => [b.chat.name, b]));
  assert.equal(by["Grup Kantor"].since, NOON - 2 * H); assert.equal(by["Grup Kantor"].total, 1);
  assert.equal(by["Grup Keluarga"].since, NOON - 3 * 24 * H); assert.equal(by["Grup Keluarga"].total, 1);
  assert.equal(by["Grup Alumni"].since, NOON - 24 * H); assert.equal(by["Grup Alumni"].total, 1);
  const text = catchup.catchupTranscript(batches, "Asia/Jakarta");
  assert.match(text, /Budi \[→ OWNER\]: Andi cek proposal ya/);
  assert.doesNotMatch(text, /OWNER: /); // pesan owner sendiri gak masuk (udah sebelum titik mulai)
});

test("catch-up: abis dikirim, titik mulai maju; yang sepi dilewati", () => {
  catchup.commitCatchup(catchup.collectCatchup(NOON), NOON);
  assert.deepEqual(catchup.collectCatchup(NOON + 60), []);
  save(A, NOON + 30);
  const again = catchup.collectCatchup(NOON + 60);
  assert.deepEqual(again.map((b) => b.chat.name), ["Grup Alumni"]); assert.equal(again[0].since, NOON);
});

test("catch-up: grup rame dipotong ke 300 pesan terakhir", () => {
  for (let i = 0; i < 320; i++) save(K, NOON + 100 + i);
  const b = catchup.collectCatchup(NOON + 1000).find((x) => x.chat.jid === K)!;
  assert.equal(b.total, 320); assert.equal(b.messages.length, 300); assert.equal(b.messages[0].ts, NOON + 120);
  assert.match(catchup.catchupTranscript([b], "Asia/Jakarta"), /dipotong ke 300 pesan terakhir/);
  catchup.commitCatchup(catchup.collectCatchup(NOON + 1000), NOON + 1000);
});

test("cari pesan: kata kunci, filter grup, karakter khusus", () => {
  save(R, NOON + 2000, { text: "norek BCA 1234 a.n. Sari", sender_name: "Sari" });
  save(K, NOON + 2001, { text: "diskon 50% buat tim" });
  save(K, NOON + 2002, { text: "diskon 50 ribu" });
  assert.equal(store.searchMessages(["rekening", "norek"], { sinceTs: 0, limit: 10 })[0].chat_name, "Grup Keluarga");
  assert.equal(store.searchMessages(["NOREK"], { chatJid: K, sinceTs: 0, limit: 10 }).length, 0);
  assert.equal(store.searchMessages(["50%"], { sinceTs: 0, limit: 10 }).length, 1);
  assert.equal(store.searchMessages(["sari"], { sinceTs: 0, limit: 10 }).length, 1); // nama pengirim juga dicari
  assert.equal(store.searchMessages(["diskon"], { sinceTs: NOON + 2002, limit: 10 }).length, 1);
});

test("jam tenang: notif ditahan, terus dikirim jadi satu pesan", async () => {
  updateConfig({ quietHours: { start: "22:00", end: "06:00" } });
  const at = (iso: string) => mock.timers.enable({ apis: ["Date"], now: Date.parse(iso) });
  try {
    at("2026-10-24T23:30:00+07:00");
    assert.ok(notify.isQuietTime());
    await notify.sendToOwner("🔔 Budi mention lo", "mention");
    mock.timers.reset(); at("2026-10-25T02:00:00+07:00"); // lewat tengah malam, masih jam tenang
    await notify.sendToOwner("🔔 Sari bales pesan lo", "mention");
    await notify.sendToOwner("🆕 Japri v9 udah ada", "other");
    await notify.flushHeldNotifications();
    assert.equal(sent.length, 0);
    mock.timers.reset(); at("2026-10-25T06:00:00+07:00");
    assert.ok(!notify.isQuietTime());
    await notify.flushHeldNotifications();
    assert.equal(sent.length, 2);
    assert.match(sent[0].text, /Selama jam tenang, ada 2 yang nyariin lo:\n\n🔔 Budi mention lo\n\n🔔 Sari bales pesan lo/);
    assert.equal(sent[1].text, "🆕 Japri v9 udah ada"); assert.equal(sent[0].to, "6280000000001@s.whatsapp.net");
    await notify.flushHeldNotifications(); assert.equal(sent.length, 2); // gak dikirim dobel
    await notify.sendToOwner("🔔 langsung", "mention"); assert.equal(sent.at(-1)!.text, "🔔 langsung");
  } finally {
    mock.timers.reset(); updateConfig({ quietHours: null }); sent.length = 0;
  }
});

test("digest: baru dinyalain gak langsung kirim; jadwal lewat → kirim; gak dobel", async () => {
  const day = NOON + 3 * 24 * H; // Selasa 12:00
  updateConfig({ digest: { time: "21:00" }, digestHandledTs: undefined });
  await runDigestIfDue(day); assert.equal(sent.length, 0);
  assert.equal(loadConfig().digestHandledTs, day - 15 * H);
  save(K, day + 1 * H, { text: "rapat jumat" });
  const due = day + 9 * H + 60; // 21:01
  await runDigestIfDue(due);
  assert.equal(sent.length, 1); assert.match(sent[0].text, /^🗞️ \*Rangkuman harian\*\n\nRANGKUMAN$/);
  assert.match(prompts.at(-1)!, /rapat jumat/); assert.match(prompts.at(-1)!, /Perlu perhatian lo/);
  await runDigestIfDue(due + 120); assert.equal(sent.length, 1);
});

test("digest: gak ada obrolan baru → gak kirim apa-apa", async () => {
  const due = NOON + 4 * 24 * H + 9 * H + 60;
  await runDigestIfDue(due); assert.equal(sent.length, 1);
  assert.equal(loadConfig().digestHandledTs, due - 60);
});

test("digest: telat < 12 jam dikirim + ditandai; > 12 jam dilewati", async () => {
  const slot = NOON + 5 * 24 * H + 9 * H; // 21:00
  save(K, slot - H, { text: "deadline senin" });
  await runDigestIfDue(slot + 13 * H); // PC baru nyala jam 10 pagi besoknya: telat 13 jam, dilewati
  assert.equal(sent.length, 1); assert.equal(loadConfig().digestHandledTs, slot);
  const slot2 = slot + 24 * H;
  await runDigestIfDue(slot2 + 3 * H); // 00:00, telat 3 jam
  assert.equal(sent.length, 2); assert.match(sent[1].text, /telat, harusnya jam 21:00/); assert.match(prompts.at(-1)!, /deadline senin/);
  updateConfig({ digest: null });
});

test("digest hari kerja: Sabtu & Minggu dilewati", async () => {
  // NOON = Sabtu 24 Okt. Senin 26 Okt 21:00 = jadwal hari kerja pertama setelahnya.
  const sat = NOON + 9 * H; // Sabtu 21:00
  assert.equal(time.lastSlot(21 * 60, sat + 60, "Asia/Jakarta", [1, 2, 3, 4, 5]), sat - 24 * H); // Jumat 21:00
  assert.equal(time.lastSlot(21 * 60, sat + 2 * 24 * H + 60, "Asia/Jakarta", [1, 2, 3, 4, 5]), sat + 2 * 24 * H); // Senin
  assert.equal(time.localWeekday(NOON, "Asia/Jakarta"), 6);
});

test("digest mingguan: dikirim di harinya, gak ngubah titik mulai catch-up", async () => {
  sent.length = 0;
  const sun = NOON + 8 * 24 * H + 7 * H; // Minggu 1 Nov 19:00
  updateConfig({ digest: null, weeklyDigest: { day: 0, time: "19:00" }, weeklyHandledTs: sun - 7 * 24 * H });
  save(R, sun - 2 * 24 * H, { text: "arisan bulan depan di rumah Sari" });
  const before = store.getGroup(R)!.caught_up_ts;
  await runDigestIfDue(sun - 60); assert.equal(sent.length, 0); // belum waktunya
  await runDigestIfDue(sun + 60);
  assert.equal(sent.length, 1); assert.match(sent[0].text, /^🗓️ \*Rangkuman mingguan\*\n\nRANGKUMAN$/);
  assert.match(prompts.at(-1)!, /arisan bulan depan/); assert.match(prompts.at(-1)!, /Masih nunggu lo/);
  assert.equal(store.getGroup(R)!.caught_up_ts, before);
  await runDigestIfDue(sun + 3600); assert.equal(sent.length, 1);
  updateConfig({ weeklyDigest: null });
});

test("mingguan: grup rame diambil merata, pesan buat owner selalu ikut", () => {
  const msgs = Array.from({ length: 1000 }, (_, i) => ({ id: `s${i}`, chat_jid: K, sender_name: "A", from_owner: 0, for_owner: i === 3 ? 1 : 0, text: "x", ts: i }));
  const out = catchup.sampleMessages(msgs, 100);
  assert.equal(out.length, 100); assert.ok(out.some((m) => m.ts === 3)); assert.ok(out[0].ts < 20); assert.ok(out.at(-1)!.ts > 980);
  assert.equal(catchup.sampleMessages(msgs.slice(0, 50), 100).length, 50);
});
