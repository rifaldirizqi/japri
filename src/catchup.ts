// "Gue ketinggalan apa?" (F1) dan digest harian (F2): rangkuman semua grup sejak terakhir kali owner ngikutin.
import { loadConfig } from "./config.js";
import * as store from "./db.js";
import { formatHM, formatTs, nowIsoLocal, nowTs } from "./time.js";

const MAX_BACK = 3 * 86400; // paling jauh 3 hari ke belakang
const DEFAULT_BACK = 86400; // grup yang belum pernah owner ikutin: 24 jam terakhir
const MAX_PER_GROUP = 300;

export type GroupBatch = { chat: store.Chat; since: number; total: number; messages: store.StoredMessage[] };

/**
 * Titik mulai per grup = yang paling baru dari pesan terakhir owner di grup itu dan catch-up terakhir
 * yang nyakup grup itu, dibatasi paling jauh 3 hari.
 */
export function catchupStart(chat: store.Chat, now: number): number {
  const marks = [store.lastOwnerMessageTs(chat.jid), chat.caught_up_ts].filter((n): n is number => n != null);
  return marks.length ? Math.max(now - MAX_BACK, ...marks) : now - DEFAULT_BACK;
}

/** Grup yang ada obrolan baru, paling rame duluan. */
export function collectCatchup(now = nowTs()): GroupBatch[] {
  const batches: GroupBatch[] = [];
  for (const chat of store.listGroups()) {
    const since = catchupStart(chat, now);
    const { total, messages } = store.messagesAfter(chat.jid, since, MAX_PER_GROUP);
    if (total > 0) batches.push({ chat, since, total, messages });
  }
  return batches.sort((a, b) => b.total - a.total);
}

/** Abis rangkuman dikirim: catch-up berikutnya mulai dari sini. */
export const commitCatchup = (batches: GroupBatch[], now: number) =>
  store.markCaughtUp(
    batches.map((b) => b.chat.jid),
    now,
  );

/** @param withDate tulis tanggal juga (buat transkrip lebih dari sehari) */
export const transcript = (messages: store.StoredMessage[], tz: string, withDate = false) =>
  messages
    .map((m) => {
      const who = m.from_owner ? "OWNER" : (m.sender_name ?? "?");
      return `[${withDate ? formatTs(m.ts, tz) : formatHM(m.ts, tz)}] ${who}${m.for_owner ? " [→ OWNER]" : ""}: ${m.text}`;
    })
    .join("\n");

export function catchupTranscript(batches: GroupBatch[], tz: string): string {
  return batches
    .map((b) => {
      const cut = b.total > b.messages.length ? `, dipotong ke ${b.messages.length} pesan terakhir` : "";
      return `=== Grup: ${b.chat.name ?? "(tanpa nama)"} — ${b.total} pesan baru sejak ${formatTs(b.since, tz)}${cut} ===\n${transcript(b.messages, tz)}`;
    })
    .join("\n\n");
}

export const CATCHUP_FORMAT = `Format rangkuman catch-up:
- Satu bagian per grup, judulnya *nama grup*. Grup paling rame atau paling penting duluan.
- Tiap grup 2–5 poin singkat: topik, keputusan, info penting. Sebut nama orang kalau relevan.
- Kalau ada grup yang dipotong, bilang singkat di bagian grup itu.
- Tutup dengan bagian *Perlu perhatian lo*: pertanyaan atau tugas yang ditujukan ke owner (pesan bertanda [→ OWNER] atau yang nyebut owner), plus deadline kalau ada. Kalau gak ada, lewati bagian ini.
- Jangan bahas grup yang gak ada di transkrip.`;

// ---------- Mingguan ----------

const WEEK = 7 * 86400;
const WEEKLY_PER_GROUP = 400;

/**
 * Kalau kebanyakan, ambil merata sepanjang minggu (biar awal minggu gak ilang),
 * tapi pesan yang ditujuin ke owner selalu ikut.
 */
export function sampleMessages(messages: store.StoredMessage[], cap: number): store.StoredMessage[] {
  if (messages.length <= cap) return messages;
  const keep = new Set(messages.filter((m) => m.for_owner || m.from_owner));
  const rest = messages.filter((m) => !keep.has(m));
  const slots = Math.max(cap - keep.size, 0);
  for (let i = 0; i < slots; i++) keep.add(rest[Math.floor((i * rest.length) / slots)]);
  return messages.filter((m) => keep.has(m)).slice(-cap);
}

export function weeklyBatches(now = nowTs()): GroupBatch[] {
  const since = now - WEEK;
  const batches: GroupBatch[] = [];
  for (const chat of store.listGroups()) {
    const all = store.messagesSince(chat.jid, since);
    if (all.length > 0) batches.push({ chat, since, total: all.length, messages: sampleMessages(all, WEEKLY_PER_GROUP) });
  }
  return batches.sort((a, b) => b.total - a.total);
}

export const WEEKLY_FORMAT = `Format rangkuman mingguan (gambaran besar 7 hari terakhir, bukan detail harian):
- Satu bagian per grup, judulnya *nama grup*. Grup paling rame atau paling penting duluan.
- Tiap grup 2–4 poin: topik besar, keputusan, dan rencana/acara ke depan (sebut tanggalnya).
- Kalau transkrip grup diambil sebagian (disebut di judul grup), bilang singkat.
- Tutup dengan bagian *Masih nunggu lo*: pertanyaan atau tugas buat owner (bertanda [→ OWNER]) yang kelihatannya belum dijawab owner. Kalau gak ada, lewati.`;

export function weeklyPrompt(batches: GroupBatch[]): string {
  const { timezone } = loadConfig();
  const body = batches
    .map((b) => {
      const cut = b.total > b.messages.length ? `, diambil ${b.messages.length} pesan merata sepanjang minggu` : "";
      return `=== Grup: ${b.chat.name ?? "(tanpa nama)"} — ${b.total} pesan dalam 7 hari${cut} ===\n${transcript(b.messages, timezone, true)}`;
    })
    .join("\n\n");
  return `[Sekarang ${nowIsoLocal(timezone)} (${timezone})]\nBikin rangkuman mingguan semua grup.\n\n${WEEKLY_FORMAT}\n\n${body}`;
}

/** Isi pesan buat AI: instruksi format + transkrip semua grup. */
export function catchupPrompt(batches: GroupBatch[]): string {
  const { timezone } = loadConfig();
  return `[Sekarang ${nowIsoLocal(timezone)} (${timezone})]\nRangkum obrolan grup yang owner lewatkan.\n\n${CATCHUP_FORMAT}\n\n${catchupTranscript(batches, timezone)}`;
}
