import fs from "node:fs";
import { createRequire } from "node:module";
import { DATA_DIR, DB_PATH } from "./config.js";

// Pakai SQLite bawaan Node (gak ada modul native yang perlu di-compile).
// Node masih nandain fitur ini "experimental"; peringatannya dibungkam biar gak bikin bingung user.
const emitWarning = process.emitWarning;
process.emitWarning = ((warning: string | Error, ...rest: unknown[]) => {
  if (String(warning).includes("SQLite is an experimental feature")) return;
  return (emitWarning as (...args: unknown[]) => void).call(process, warning, ...rest);
}) as typeof process.emitWarning;
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");

fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA journal_mode = WAL");

function transaction<A extends unknown[]>(fn: (...args: A) => void) {
  return (...args: A) => {
    db.exec("BEGIN");
    try {
      fn(...args);
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  };
}

db.exec(`
CREATE TABLE IF NOT EXISTS chats (
  jid  TEXT PRIMARY KEY,
  name TEXT
);

CREATE TABLE IF NOT EXISTS messages (
  id          TEXT NOT NULL,
  chat_jid    TEXT NOT NULL,
  sender_name TEXT,
  from_owner  INTEGER NOT NULL DEFAULT 0,
  text        TEXT NOT NULL,
  ts          INTEGER NOT NULL,
  PRIMARY KEY (chat_jid, id)
);
CREATE INDEX IF NOT EXISTS idx_messages_chat_ts ON messages (chat_jid, ts);

CREATE TABLE IF NOT EXISTS reminders (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  text       TEXT NOT NULL,
  due_ts     INTEGER NOT NULL,
  target_jid TEXT NOT NULL,   -- 'owner' atau JID grup
  recurrence TEXT,            -- null | 'daily' | 'weekly'
  done       INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_reminders_due ON reminders (done, due_ts);

-- Notif yang ditahan selama jam tenang, dikirim pas jam tenang selesai
CREATE TABLE IF NOT EXISTS held_notifications (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,         -- 'mention' (digabung jadi satu pesan) | 'other'
  text TEXT NOT NULL,
  ts   INTEGER NOT NULL
);

-- Penghitung harian (mis. jumlah gambar yang dibaca AI)
CREATE TABLE IF NOT EXISTS counters (
  key   TEXT PRIMARY KEY,
  value INTEGER NOT NULL
);

-- Tawaran reminder dari notif mention yang isinya tugas (v0.3.0)
CREATE TABLE IF NOT EXISTS offers (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  text       TEXT NOT NULL,      -- isi reminder kalau diterima
  due_ts     INTEGER NOT NULL,   -- waktu yang ditawarin
  created_ts INTEGER NOT NULL,
  open       INTEGER NOT NULL DEFAULT 1
);
`);

// ---------- Migrasi dari versi lama ----------

function addColumn(table: string, column: string, definition: string) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!cols.some((c) => c.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}
// v0.2.0
addColumn("chats", "notify_mode", "TEXT NOT NULL DEFAULT 'all'"); // 'all' | 'mentions' | 'off'
addColumn("chats", "caught_up_ts", "INTEGER"); // catch-up/digest terakhir yang nyakup grup ini
addColumn("messages", "for_owner", "INTEGER NOT NULL DEFAULT 0"); // pesan yang nge-tag/bales/nyebut owner
// v0.3.0
addColumn("chats", "read_images", "INTEGER"); // null = ikut pengaturan umum, 1/0 = khusus grup ini

export type NotifyMode = "all" | "mentions" | "off";
export type Chat = {
  jid: string;
  name: string | null;
  notify_mode: NotifyMode;
  caught_up_ts: number | null;
  read_images: number | null;
};
export type StoredMessage = {
  id: string;
  chat_jid: string;
  sender_name: string | null;
  from_owner: number;
  for_owner?: number;
  text: string;
  ts: number;
};
export type Reminder = {
  id: number;
  text: string;
  due_ts: number;
  target_jid: string;
  recurrence: "daily" | "weekly" | null;
  done: number;
};

// ---------- Grup ----------

export const upsertGroup = (jid: string, name: string | null) =>
  db
    .prepare(`INSERT INTO chats (jid, name) VALUES (?, ?) ON CONFLICT(jid) DO UPDATE SET name = COALESCE(excluded.name, chats.name)`)
    .run(jid, name);

export const getGroup = (jid: string) => db.prepare(`SELECT * FROM chats WHERE jid = ?`).get(jid) as Chat | undefined;
export const listGroups = () => db.prepare(`SELECT * FROM chats ORDER BY name`).all() as Chat[];

export const setReadImages = (jid: string, value: number | null) =>
  db.prepare(`UPDATE chats SET read_images = ? WHERE jid = ?`).run(value, jid);

export const setNotifyMode = (jid: string, mode: NotifyMode) =>
  db.prepare(`UPDATE chats SET notify_mode = ? WHERE jid = ?`).run(mode, jid);

/** Majuin titik mulai catch-up grup-grup ini ke `ts`. */
export const markCaughtUp = transaction((jids: string[], ts: number) => {
  const stmt = db.prepare(`UPDATE chats SET caught_up_ts = MAX(COALESCE(caught_up_ts, 0), ?) WHERE jid = ?`);
  for (const jid of jids) stmt.run(ts, jid);
});

/** Kapan terakhir owner nulis di grup ini (null kalau belum pernah, atau udah lewat masa simpan). */
export const lastOwnerMessageTs = (jid: string) =>
  (db.prepare(`SELECT MAX(ts) AS ts FROM messages WHERE chat_jid = ? AND from_owner = 1`).get(jid) as { ts: number | null }).ts;

/** Hapus grup yang udah gak diikuti bot (mis. di-kick waktu bot mati). */
export function retainGroups(jids: string[]) {
  for (const g of listGroups()) if (!jids.includes(g.jid)) forgetGroup(g.jid);
}

/** Bot keluar / dikeluarkan: hapus semua data grup itu. */
export const forgetGroup = transaction((jid: string) => {
  db.prepare(`DELETE FROM messages WHERE chat_jid = ?`).run(jid);
  db.prepare(`UPDATE reminders SET done = 1 WHERE target_jid = ? AND done = 0`).run(jid);
  db.prepare(`DELETE FROM chats WHERE jid = ?`).run(jid);
});

// ---------- Pesan ----------

export const saveMessage = (m: StoredMessage) =>
  db
    .prepare(
      `INSERT OR IGNORE INTO messages (id, chat_jid, sender_name, from_owner, for_owner, text, ts)
       VALUES (@id, @chat_jid, @sender_name, @from_owner, @for_owner, @text, @ts)`,
    )
    .run({ for_owner: 0, ...m });

export const updateMessageText = (chatJid: string, id: string, text: string) =>
  db.prepare(`UPDATE messages SET text = ? WHERE chat_jid = ? AND id = ?`).run(text, chatJid, id);

export function getMessages(chatJid: string, sinceTs: number, limit = 1500): StoredMessage[] {
  const rows = db
    .prepare(`SELECT * FROM messages WHERE chat_jid = ? AND ts >= ? ORDER BY ts DESC LIMIT ?`)
    .all(chatJid, sinceTs, limit) as StoredMessage[];
  return rows.reverse();
}

/** Pesan setelah `afterTs` (eksklusif): `limit` pesan terakhir + jumlah totalnya. */
export function messagesAfter(chatJid: string, afterTs: number, limit: number) {
  const { n } = db.prepare(`SELECT COUNT(*) AS n FROM messages WHERE chat_jid = ? AND ts > ?`).get(chatJid, afterTs) as { n: number };
  const rows = db
    .prepare(`SELECT * FROM messages WHERE chat_jid = ? AND ts > ? ORDER BY ts DESC LIMIT ?`)
    .all(chatJid, afterTs, limit) as StoredMessage[];
  return { total: n, messages: rows.reverse() };
}

/** Semua pesan setelah `afterTs` (dibatasi `max` terbaru), urut lama → baru. */
export function messagesSince(chatJid: string, afterTs: number, max = 5000): StoredMessage[] {
  const rows = db
    .prepare(`SELECT * FROM messages WHERE chat_jid = ? AND ts > ? ORDER BY ts DESC LIMIT ?`)
    .all(chatJid, afterTs, max) as StoredMessage[];
  return rows.reverse();
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/** Cari pesan yang mengandung salah satu kata kunci (gak peduli huruf besar/kecil). Terbaru duluan. */
export function searchMessages(keywords: string[], opts: { chatJid?: string; sinceTs: number; limit: number }) {
  const words = keywords.map((k) => k.trim()).filter(Boolean);
  if (words.length === 0) return [];
  const where = words.map(() => `(m.text LIKE ? ESCAPE '\\' OR m.sender_name LIKE ? ESCAPE '\\')`).join(" OR ");
  const params = words.flatMap((w) => [`%${escapeLike(w)}%`, `%${escapeLike(w)}%`]);
  return db
    .prepare(
      `SELECT m.*, c.name AS chat_name FROM messages m JOIN chats c ON c.jid = m.chat_jid
       WHERE (${where}) AND m.ts >= ? ${opts.chatJid ? "AND m.chat_jid = ?" : ""}
       ORDER BY m.ts DESC LIMIT ?`,
    )
    .all(...params, opts.sinceTs, ...(opts.chatJid ? [opts.chatJid] : []), opts.limit) as (StoredMessage & { chat_name: string | null })[];
}

export const pruneMessages = (olderThanTs: number) => db.prepare(`DELETE FROM messages WHERE ts < ?`).run(olderThanTs);

// ---------- Reminder ----------

export function addReminder(r: Omit<Reminder, "id" | "done">): number {
  const res = db
    .prepare(`INSERT INTO reminders (text, due_ts, target_jid, recurrence) VALUES (?, ?, ?, ?)`)
    .run(r.text, r.due_ts, r.target_jid, r.recurrence);
  return Number(res.lastInsertRowid);
}

export const pendingReminders = () =>
  db.prepare(`SELECT * FROM reminders WHERE done = 0 ORDER BY due_ts`).all() as Reminder[];

export const dueReminders = (now: number) =>
  db.prepare(`SELECT * FROM reminders WHERE done = 0 AND due_ts <= ?`).all(now) as Reminder[];

export const cancelReminder = (id: number) =>
  db.prepare(`UPDATE reminders SET done = 1 WHERE id = ? AND done = 0`).run(id).changes > 0;

export const markReminderDone = (id: number) => db.prepare(`UPDATE reminders SET done = 1 WHERE id = ?`).run(id);

export const rescheduleReminder = (id: number, dueTs: number) =>
  db.prepare(`UPDATE reminders SET due_ts = ? WHERE id = ?`).run(dueTs, id);

// ---------- Notif yang ditahan (jam tenang) ----------

export const holdNotification = (kind: "mention" | "other", text: string, ts: number) =>
  db.prepare(`INSERT INTO held_notifications (kind, text, ts) VALUES (?, ?, ?)`).run(kind, text, ts);

export const heldNotifications = () =>
  db.prepare(`SELECT * FROM held_notifications ORDER BY id`).all() as { id: number; kind: "mention" | "other"; text: string; ts: number }[];

export const deleteHeldNotifications = (maxId: number) => db.prepare(`DELETE FROM held_notifications WHERE id <= ?`).run(maxId);

// ---------- Tawaran reminder ----------

export type Offer = { id: number; text: string; due_ts: number; created_ts: number; open: number };

export function addOffer(text: string, dueTs: number, createdTs: number): number {
  return Number(db.prepare(`INSERT INTO offers (text, due_ts, created_ts) VALUES (?, ?, ?)`).run(text, dueTs, createdTs).lastInsertRowid);
}

export const getOffer = (id: number) => db.prepare(`SELECT * FROM offers WHERE id = ?`).get(id) as Offer | undefined;

/** Tawaran yang belum dijawab sejak `sinceTs`, terbaru duluan. */
export const openOffers = (sinceTs: number) =>
  db.prepare(`SELECT * FROM offers WHERE open = 1 AND created_ts >= ? ORDER BY id DESC`).all(sinceTs) as Offer[];

export const closeOffer = (id: number) => db.prepare(`UPDATE offers SET open = 0 WHERE id = ?`).run(id);

// ---------- Penghitung ----------

/** Naikin penghitung kalau masih di bawah `max`. Return false kalau udah mentok. */
export function incrementCounter(key: string, max: number): boolean {
  const row = db.prepare(`SELECT value FROM counters WHERE key = ?`).get(key) as { value: number } | undefined;
  if ((row?.value ?? 0) >= max) return false;
  db.prepare(`INSERT INTO counters (key, value) VALUES (?, 1) ON CONFLICT(key) DO UPDATE SET value = value + 1`).run(key);
  return true;
}

/** Hapus penghitung lama (key diawali `prefix`, selain `keep`). */
export const pruneCounters = (prefix: string, keep: string) =>
  db.prepare(`DELETE FROM counters WHERE key LIKE ? AND key != ?`).run(`${prefix}%`, keep);
