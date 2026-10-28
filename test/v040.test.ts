// Tes v0.4.0: Japri jawab anggota grup pakai AI terpisah. WhatsApp di-mock; AI-nya server palsu lokal
// (OpenAI-compatible), jadi kelihatan persis apa yang dikirim ke penyedia AI. Jalankan: npm test
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "japri-test-"));
import { test, mock } from "node:test";
import assert from "node:assert";

const sent: { to: string; text: string; quoted: boolean }[] = [];
mock.module("../src/wa/client.js", { namedExports: {
  sendText: async (to: string, text: string, quoted?: unknown) => { sent.push({ to, text, quoted: !!quoted }); },
  showTyping: async () => {}, botNumber: () => "62899", isBotId: (j: string | null) => j === "62899@s.whatsapp.net",
  groupAdminIds: async () => new Set<string>(), leaveGroup: async () => {}, downloadImage: async () => null,
}});
const ownerAsks: string[] = [];
mock.module("../src/agent/agent.js", { namedExports: {
  ask: async (_c: string, t: string) => { ownerAsks.push(t); return `OWNER-AI:${t}`; },
  resetHistory: () => {}, lastOwnerReplyMs: () => 0, rememberForOwner: () => {}, summarize: async () => "",
}});

// Penyedia AI palsu: catat request, jawab "jawaban N" (atau error kalau `failing`)
type Req = { auth: string | undefined; body: any };
const requests: Req[] = [];
let failing = false;
const ai = http.createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    const body = JSON.parse(raw || "{}");
    requests.push({ auth: req.headers.authorization, body });
    res.setHeader("content-type", "application/json");
    if (failing) {
      res.statusCode = 401;
      return res.end(JSON.stringify({ error: { message: "kredit habis" } }));
    }
    res.end(JSON.stringify({ id: "x", object: "chat.completion", created: 0, model: body.model,
      choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: `jawaban ${requests.length}` } }] }));
  });
});
await new Promise<void>((r) => ai.listen(0, "127.0.0.1", r));
const AI_URL = `http://127.0.0.1:${(ai.address() as AddressInfo).port}/v1`;

const OWNER = "6280000000001@s.whatsapp.net";
const { saveConfig, newConfig, loadConfig } = await import("../src/config.js");
saveConfig(newConfig(
  { provider: "custom", model: "model-owner", apiKey: "sk-owner-palsu", baseUrl: AI_URL },
  { owner: { ids: [OWNER], name: "Andi" } },
));
const store = await import("../src/db.js");
const KANTOR = "120363000000000001@g.us";
const ALUMNI = "120363000000000002@g.us";
store.upsertGroup(KANTOR, "Grup Kantor");
store.upsertGroup(ALUMNI, "Grup Alumni");
const bot = await import("../src/bot.js");
const settings = await import("../src/settings.js");
const tools = await import("../src/agent/tools.js");
bot.memberReplyGap.ms = 0;

const BUDI = "6280000000002@s.whatsapp.net";
const CITRA = "6280000000003@s.whatsapp.net";
let n = 0;
const msg = (o: any) => ({
  raw: { key: { id: `m${n++}` } }, isGroup: true, chatJid: KANTOR, senderIds: [BUDI], senderName: "Budi", ts: Math.floor(Date.now() / 1000),
  mentionedIds: [], quotedSenderId: null, quotedText: null, mentionsBot: false, hasImage: false, ...o,
});
/** Kirim pesan, tunggu semua jawaban anggota selesai, return pesan yang dikirim bot. */
async function send(o: any) {
  const before = sent.length;
  await bot.handleMessage(msg(o));
  await bot.memberJobsIdle();
  await new Promise((r) => setImmediate(r));
  return sent.slice(before);
}
const tool = (name: string) => tools.buildTools().find((t) => t.name === name)!;

test("default mati: tag dari anggota dicuekin, gak ada yang dikirim ke AI", async () => {
  assert.deepEqual(await send({ text: "@62899 ibukota australia apa?", mentionsBot: true }), []);
  assert.equal(requests.length, 0);
});

test("gak bisa dinyalain sebelum AI anggota diatur", async () => {
  assert.match(settings.setMemberReplies(true)!, /belum diatur/);
  assert.equal(loadConfig().memberReplies.enabled, false);
  assert.match(await tool("set_member_ai").run({ enabled: true, group: "kantor" }), /belum diatur/);
});

test("atur model lewat chat: pakai penyedia & key owner, dites tanpa tool", async () => {
  const r = await tool("set_member_ai").run({ model: "model-murah" });
  assert.match(r, /Disimpan/);
  assert.deepEqual(loadConfig().memberReplies.llm, { provider: "custom", baseUrl: AI_URL, model: "model-murah" });
  const t = requests.at(-1)!;
  assert.equal(t.body.model, "model-murah");
  assert.equal(t.body.tools, undefined);
  assert.equal(t.auth, "Bearer sk-owner-palsu"); // key owner dipakai, tapi gak disimpan dobel
});

test("nyalain buat satu grup: diumumin sekali di grup itu", async () => {
  const before = sent.length;
  assert.match(await tool("set_member_ai").run({ enabled: true, group: "kantor" }), /nyala di "Grup Kantor"/);
  await new Promise((r) => setImmediate(r));
  const announced = sent.slice(before);
  assert.equal(announced.length, 1);
  assert.equal(announced[0].to, KANTOR);
  assert.match(announced[0].text, /nanya apa aja ke gue/);
  // Nyalain lagi: gak diumumin dobel
  settings.setMemberReplies(true, KANTOR);
  await new Promise((r) => setImmediate(r));
  assert.equal(sent.length, before + 1);
});

test("anggota nge-tag: dijawab AI anggota (tanpa tool, tanpa catatan grup), dibales ke pesannya", async () => {
  await send({ text: "rahasia kantor: password wifi 1234" }); // pesan biasa: dicatat, gak dijawab
  const out = await send({ text: "@62899 ibukota australia apa?", mentionsBot: true });
  assert.equal(out.length, 1);
  assert.equal(out[0].to, KANTOR);
  assert.ok(out[0].quoted);
  assert.match(out[0].text, /^jawaban \d+$/);

  const req = requests.at(-1)!;
  assert.equal(req.body.model, "model-murah");
  assert.equal(req.body.tools, undefined);
  const all = JSON.stringify(req.body.messages);
  assert.match(all, /yang nanya Budi.*?\\nibukota australia apa\?/);
  assert.doesNotMatch(all, /@62899/);
  assert.doesNotMatch(all, /password wifi/); // isi grup gak pernah dikirim
  assert.doesNotMatch(all, /search_messages|catch_up|accept_reminder_offer/); // bukan prompt owner
  assert.equal(ownerAsks.length, 0);
});

test("pemicu: /ai dan bales pesan Japri; pesan yang dibales ikut jadi konteks", async () => {
  let out = await send({ text: "/ai terjemahin 'selamat pagi' ke inggris" });
  assert.equal(out.length, 1);
  out = await send({ text: "kalau ke jepang?", mentionsBot: true, quotedSenderId: "62899@s.whatsapp.net", quotedText: "Good morning" });
  assert.equal(out.length, 1);
  assert.match(JSON.stringify(requests.at(-1)!.body.messages), /bales jawaban kamu sebelumnya: \\"Good morning\\"/);

  out = await send({ senderIds: [CITRA], senderName: "Citra", text: "@62899 maksudnya apa?", mentionsBot: true, quotedSenderId: BUDI, quotedText: "rapat diundur ke kamis" });
  const msgs = JSON.stringify(requests.at(-1)!.body.messages);
  assert.match(msgs, /yang nanya Citra.*?\\nmaksudnya apa\?/);
  assert.match(msgs, /bales pesan ini: \\"rapat diundur ke kamis\\"/);
  // Tag doang tanpa pertanyaan & tanpa reply: dikasih petunjuk, gak ke AI
  const count = requests.length;
  out = await send({ text: "@62899", mentionsBot: true });
  assert.match(out[0].text, /Mau nanya apa/);
  assert.equal(requests.length, count);
});

test("riwayat per grup: nyambung di grup yang sama, gak bocor ke grup lain", async () => {
  const msgs = requests.at(-1)!.body.messages as { role: string; content: string }[];
  assert.ok(msgs.some((m) => m.content.includes("ibukota australia")), "pertanyaan sebelumnya di grup ini ikut");
  settings.setMemberReplies(true, ALUMNI);
  await send({ chatJid: ALUMNI, text: "@62899 resep nasi goreng?", mentionsBot: true });
  const alumni = JSON.stringify(requests.at(-1)!.body.messages);
  assert.match(alumni, /nasi goreng/);
  assert.doesNotMatch(alumni, /ibukota australia/);
});

test("owner tetap ke AI owner; DM anggota & grup yang mati tetap dicuekin", async () => {
  let out = await send({ senderIds: [OWNER], senderName: "Andi", text: "@62899 rangkum 2 jam terakhir", mentionsBot: true });
  assert.equal(out.at(-1)!.text, "OWNER-AI:rangkum 2 jam terakhir");
  const count = requests.length;
  assert.deepEqual(await send({ isGroup: false, chatJid: BUDI, text: "halo japri" }), []);
  settings.setMemberReplies(false, ALUMNI);
  assert.deepEqual(await send({ chatJid: ALUMNI, text: "@62899 halo", mentionsBot: true }), []);
  assert.equal(requests.length, count);
});

test("semua grup: per grup bisa ikut umum; matiin semua gak ngumumin apa-apa", async () => {
  const before = sent.length;
  assert.equal(settings.setMemberReplies(true), null);
  await new Promise((r) => setImmediate(r));
  // Kantor udah nyala (gak diumumin lagi); Alumni tadinya mati, sekarang ikut umum → diumumin
  assert.deepEqual(sent.slice(before).map((s) => s.to), [ALUMNI]);
  assert.equal(store.getGroup(ALUMNI)!.member_replies, null);
  settings.setMemberReplies(false);
  await new Promise((r) => setImmediate(r));
  assert.equal(sent.length, before + 1);
  assert.deepEqual(await send({ text: "@62899 halo", mentionsBot: true }), []);
  settings.setMemberReplies(true, KANTOR);
});

test("jatah: default tanpa batas; kalau diisi, lewat jatah dikasih tau sekali terus dicuekin", async () => {
  assert.match(await tool("set_member_ai").run({ per_person_daily: 1 }), /1\/orang\/hari/);
  // Citra udah nanya sekali hari ini (tes sebelumnya)
  let out = await send({ senderIds: [CITRA], senderName: "Citra", text: "/ai satu lagi" });
  assert.match(out[0].text, /Jatah tanya lo hari ini udah habis/);
  out = await send({ senderIds: [CITRA], senderName: "Citra", text: "/ai please" });
  assert.deepEqual(out, []);
  await tool("set_member_ai").run({ per_person_daily: null });
  out = await send({ senderIds: [CITRA], senderName: "Citra", text: "/ai sekarang boleh?" });
  assert.match(out[0].text, /^jawaban/);
  assert.match(await tool("get_member_ai_usage").run({}), /Grup Kantor: \d+/);
});

test("AI anggota error: anggota dapet balasan singkat, owner dikabarin sekali sampai pulih", async () => {
  failing = true;
  let out = await send({ text: "/ai halo?" });
  assert.equal(out.find((s) => s.to === KANTOR)!.text, "Lagi gak bisa jawab, coba lagi nanti ya.");
  const toOwner = out.filter((s) => s.to === OWNER);
  assert.equal(toOwner.length, 1);
  assert.match(toOwner[0].text, /AI buat anggota grup .* error/);
  out = await send({ text: "/ai halo lagi?" });
  assert.equal(out.filter((s) => s.to === OWNER).length, 0);
  failing = false;
  out = await send({ text: "/ai udah bisa?" });
  assert.match(out[0].text, /^jawaban/);
  failing = true;
  out = await send({ text: "/ai error lagi?" });
  assert.equal(out.filter((s) => s.to === OWNER).length, 1); // pulih dulu, jadi dikabarin lagi
  failing = false;
});

test("jeda pengaman: balasan di grup yang sama dikirim berurutan dengan jeda", async () => {
  bot.memberReplyGap.ms = 300;
  const before = sent.length;
  const start = Date.now();
  await bot.handleMessage(msg({ text: "/ai satu" }));
  await bot.handleMessage(msg({ text: "/ai dua" }));
  await bot.memberJobsIdle();
  assert.equal(sent.length - before, 2);
  assert.ok(Date.now() - start >= 300, "balasan kedua nunggu jeda");
  bot.memberReplyGap.ms = 0;
});

test("jawaban dirapiin buat WhatsApp: label nama dibuang, Markdown jadi format WA", async () => {
  const { toWhatsApp } = await import("../src/agent/member.js");
  assert.equal(toWhatsApp("[Budi] Ini jawabannya"), "Ini jawabannya");
  assert.equal(toWhatsApp("[Andi Setiawan]: oke"), "oke");
  assert.equal(toWhatsApp("## Makan siang\n- **Salmon** roll\n- __tamago__"), "*Makan siang*\n- *Salmon* roll\n- _tamago_");
  assert.equal(toWhatsApp("Rumus: [a] + [b]"), "Rumus: [a] + [b]"); // kurung siku di tengah gak diubah
});

test("intro grup nyebut fitur ini kalau nyala", async () => {
  const before = sent.length;
  await bot.introduceToGroup(KANTOR);
  assert.match(sent[before].text, /nanya apa aja ke gue/);
  settings.setMemberReplies(false, KANTOR);
  await bot.introduceToGroup(KANTOR);
  assert.doesNotMatch(sent[before + 1].text, /nanya apa aja ke gue/);
  ai.close();
});
