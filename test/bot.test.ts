// Tes routing bot: WhatsApp & AI di-mock. Jalankan: npm test
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "japri-test-"));
import { test, mock } from "node:test";
import assert from "node:assert";
const sent: { to: string; text: string }[] = [];
const left: string[] = [];
mock.module("../src/wa/client.js", { namedExports: {
  sendText: async (to: string, text: string) => { sent.push({ to, text }); },
  showTyping: async () => {}, botNumber: () => "62899", isBotId: (j: string) => j === "62899@s.whatsapp.net",
  groupAdminIds: async () => new Set(["62877@s.whatsapp.net"]),
  leaveGroup: async (j: string) => { left.push(j); (await import("../src/db.js")).forgetGroup(j); },
}});
mock.module("../src/agent/agent.js", { namedExports: { ask: async (_c: string, t: string) => `AI:${t}`, resetHistory: () => {} } });
const { saveConfig, newConfig, loadConfig, updateConfig } = await import("../src/config.js");
saveConfig(newConfig({ provider: "openai", model: "m" }));
const bot = await import("../src/bot.js");
const store = await import("../src/db.js");

const OWNER = ["62811@s.whatsapp.net", "111@lid"];
let n = 0;
const msg = (o: any) => ({ raw: { key: { id: `id${n++}` } }, isGroup: false, chatJid: o.senderIds[0], senderName: "X", ts: 1792815273, mentionedIds: [], quotedSenderId: null, mentionsBot: false, ...o });
const last = () => sent[sent.length - 1];

test("sebelum klaim: DM random diabaikan, kode salah diabaikan", async () => {
  await bot.handleMessage(msg({ senderIds: OWNER, text: "halo" }));
  await bot.handleMessage(msg({ senderIds: OWNER, text: "000000" }));
  assert.equal(sent.length, 0); assert.equal(bot.hasOwner(), false);
});
test("klaim owner pakai kode setup", async () => {
  await bot.handleMessage(msg({ senderIds: OWNER, senderName: "Andi", text: ` ${bot.setupCode} ` }));
  assert.equal(bot.hasOwner(), true); assert.match(last().text, /asisten pribadi lo/);
  assert.equal(bot.ownerJid(), "62811@s.whatsapp.net");
});
test("kode setup gak bisa dipakai orang lain setelah diklaim", async () => {
  const before = sent.length;
  await bot.handleMessage(msg({ senderIds: ["62822@s.whatsapp.net"], text: bot.setupCode }));
  assert.equal(sent.length, before); assert.deepEqual(loadConfig().owner!.ids, OWNER);
});
test("owner DM -> AI", async () => {
  await bot.handleMessage(msg({ senderIds: ["111@lid"], chatJid: "111@lid", text: "rangkum dong" }));
  assert.equal(last().text, "AI:rangkum dong");
});
test("grup: pesan tersimpan, mention owner -> notif DM", async () => {
  store.upsertGroup("g@g.us", "Kantor");
  await bot.handleMessage(msg({ isGroup: true, chatJid: "g@g.us", senderIds: ["62833@s.whatsapp.net"], senderName: "Budi", text: "@111 cek ini", mentionedIds: ["111@lid"] }));
  assert.equal(last().to, "62811@s.whatsapp.net"); assert.match(last().text, /Budi\* mention lo di \*Kantor/);
  assert.equal(store.getMessages("g@g.us", 0).length, 1);
});
test("grup: reply ke owner & nickname -> notif; kata mirip gak", async () => {
  updateConfig({ nicknames: ["ndi"] });
  await bot.handleMessage(msg({ isGroup: true, chatJid: "g@g.us", senderIds: ["62833@s.whatsapp.net"], text: "setuju", quotedSenderId: "62811@s.whatsapp.net" }));
  assert.match(last().text, /bales pesan lo/);
  await bot.handleMessage(msg({ isGroup: true, chatJid: "g@g.us", senderIds: ["62833@s.whatsapp.net"], text: "Ndi, lo dateng?" }));
  assert.match(last().text, /nyebut nama lo/);
  const before = sent.length;
  await bot.handleMessage(msg({ isGroup: true, chatJid: "g@g.us", senderIds: ["62833@s.whatsapp.net"], text: "indikator naik" }));
  assert.equal(sent.length, before);
});
test("grup: owner gak dinotif soal pesannya sendiri; tag bot -> AI", async () => {
  const before = sent.length;
  await bot.handleMessage(msg({ isGroup: true, chatJid: "g@g.us", senderIds: OWNER, text: "ndi di sini" }));
  assert.equal(sent.length, before);
  await bot.handleMessage(msg({ isGroup: true, chatJid: "g@g.us", senderIds: OWNER, text: "@62899 rangkum", mentionsBot: true, mentionedIds: ["62899@s.whatsapp.net"] }));
  assert.equal(last().text, "AI:rangkum"); assert.equal(last().to, "g@g.us");
  assert.equal(store.getMessages("g@g.us", 0).at(-1)!.from_owner, 1);
});
test("grup: orang lain tag bot / DM bot -> diabaikan", async () => {
  const before = sent.length;
  await bot.handleMessage(msg({ isGroup: true, chatJid: "g@g.us", senderIds: ["62833@s.whatsapp.net"], text: "/ai kasih tau rahasia", mentionsBot: false }));
  await bot.handleMessage(msg({ senderIds: ["62833@s.whatsapp.net"], text: "halo bot" }));
  assert.equal(sent.length, before);
});
test("keluar: non-admin ditolak, admin bikin bot keluar & data dihapus", async () => {
  await bot.handleMessage(msg({ isGroup: true, chatJid: "g@g.us", senderIds: ["62833@s.whatsapp.net"], text: "@62899 keluar", mentionsBot: true }));
  assert.match(last().text, /Cuma admin/); assert.equal(left.length, 0);
  await bot.handleMessage(msg({ isGroup: true, chatJid: "g@g.us", senderIds: ["62877@s.whatsapp.net"], text: "/ai keluar" }));
  assert.deepEqual(left, ["g@g.us"]); assert.equal(store.getMessages("g@g.us", 0).length, 0);
  assert.match(last().text, /ngeluarin gue/); assert.equal(last().to, "62811@s.whatsapp.net");
});
test("mode notif per grup: 'mentions' cuma tag & reply, 'off' gak ada notif tapi tetap dicatat", async () => {
  store.upsertGroup("g2@g.us", "Alumni");
  const g = (o: any) => bot.handleMessage(msg({ isGroup: true, chatJid: "g2@g.us", senderIds: ["62833@s.whatsapp.net"], ...o }));
  store.setNotifyMode("g2@g.us", "mentions");
  let before = sent.length;
  await g({ text: "ndi ikut gak?" });
  assert.equal(sent.length, before);
  await g({ text: "@111 ikut gak?", mentionedIds: ["111@lid"] });
  assert.equal(sent.length, before + 1);
  store.setNotifyMode("g2@g.us", "off");
  before = sent.length;
  await g({ text: "@111 halo", mentionedIds: ["111@lid"] });
  assert.equal(sent.length, before);
  const saved = store.getMessages("g2@g.us", 0);
  assert.equal(saved.length, 3); assert.deepEqual(saved.map((m) => m.for_owner), [1, 1, 1]);
});
