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

export const transcript = (messages: store.StoredMessage[], tz: string) =>
  messages
    .map((m) => {
      const who = m.from_owner ? "OWNER" : (m.sender_name ?? "?");
      return `[${formatHM(m.ts, tz)}] ${who}${m.for_owner ? " [→ OWNER]" : ""}: ${m.text}`;
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

/** Isi pesan buat AI: instruksi format + transkrip semua grup. */
export function catchupPrompt(batches: GroupBatch[]): string {
  const { timezone } = loadConfig();
  return `[Sekarang ${nowIsoLocal(timezone)} (${timezone})]\nRangkum obrolan grup yang owner lewatkan.\n\n${CATCHUP_FORMAT}\n\n${catchupTranscript(batches, timezone)}`;
}
