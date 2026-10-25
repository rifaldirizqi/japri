import crypto from "node:crypto";
import { jidNormalizedUser } from "baileys";
import { loadConfig, updateConfig } from "./config.js";
import * as store from "./db.js";
import { ask, lastOwnerReplyMs, resetHistory } from "./agent/agent.js";
import { isQuietTime, ownerJid, sendToOwner } from "./notify.js";
import { acceptOffer, detectTask, latestOfferAfter, makeOffer } from "./tasks.js";
import { formatHM, nowTs } from "./time.js";
import { installUpdate } from "./selfupdate.js";
import { describeImage, readsImages, takeImageQuota, withDescription } from "./vision.js";
import { botNumber, downloadImage, groupAdminIds, leaveGroup, sendText, showTyping, type IncomingMessage } from "./wa/client.js";

// ---------- Owner ----------

/** Kode sekali pakai yang harus di-DM owner ke bot buat klaim kepemilikan. */
export const setupCode = crypto.randomInt(100000, 999999).toString();

const ownerIds = () => new Set(loadConfig().owner?.ids ?? []);
export const hasOwner = () => ownerIds().size > 0;
const isOwner = (ids: string[]) => ids.some((id) => ownerIds().has(id));

export { ownerJid };

/** Kalau owner muncul dengan ID baru (mis. LID), ingat supaya mention via ID itu juga ketangkep. */
function rememberOwnerIds(ids: string[]) {
  const known = ownerIds();
  if (ids.every((id) => known.has(id))) return;
  const owner = loadConfig().owner!;
  updateConfig({ owner: { ...owner, ids: [...new Set([...owner.ids, ...ids])] } });
}

let onClaimed: (() => void) | null = null;
export const whenOwnerClaimed = (cb: () => void) => (onClaimed = cb);

async function claimOwner(m: IncomingMessage) {
  updateConfig({ owner: { ids: m.senderIds, name: m.senderName } });
  console.log(`\n✅ Owner terdaftar: ${m.senderName ?? m.senderIds[0]}`);
  await sendText(
    m.chatJid,
    `Halo ${m.senderName ?? ""}! 👋 Mulai sekarang gue asisten pribadi lo.\n\n` +
      `Satu hal dulu: biar gue bisa ngabarin kalau nama lo disebut di grup (walau gak di-tag), ` +
      `kasih tau nama panggilan lo. Contoh: _"panggil gue andi atau ndi"_.\n\n` +
      `Mau gue kirimin rangkuman semua grup tiap hari? Bilang aja jamnya, mis. _"kirim rangkuman tiap jam 9 malam"_.\n\n${help()}`,
  );
  onClaimed?.();
}

// ---------- Teks ----------

const help = () => {
  const { botName } = loadConfig();
  return `*${botName}* 🤖 — cara pakai
Ngobrol biasa aja, contoh:
• gue ketinggalan apa?
• rangkum grup kantor 3 jam terakhir
• siapa yang ngirim nomor rekening kemarin?
• ingetin gue besok jam 9 kirim laporan
• tiap senin jam 8 ingetin grup tim soal standup
• kirim rangkuman tiap hari kerja jam 9 malam
• rangkuman mingguan tiap minggu jam 7 malam
• baca gambar di semua grup
• matiin notif grup alumni
• jangan ganggu jam 10 malam sampai 6 pagi
• ada update Japri gak? (bales *update* buat langsung update)

Gue otomatis DM lo kalau ada yang tag lo, bales pesan lo, atau nyebut nama panggilan lo di grup. Tanya _"notif gue gimana?"_ buat lihat pengaturannya.

*Di grup:* tag gue atau awali dengan /ai, mis. "@${botName} rangkum 2 jam terakhir".
*Perintah:* /help · /reset (lupain obrolan sebelumnya)`;
};

const groupIntro = () => {
  const { botName, retentionDays, owner } = loadConfig();
  return `Halo semua 👋 Gue *${botName}*, asisten pribadi${owner?.name ? ` punya *${owner.name}*` : ""}.

Gue *mencatat pesan di grup ini* buat bikin rangkuman dan ngabarin dia kalau dia di-mention. Kalau dia nyalain fitur baca gambar, gambar di grup ini juga dibaca AI dan dicatat sebagai teks. Catatan disimpan di perangkat dia sendiri dan otomatis terhapus setelah ${retentionDays} hari.

Admin grup bisa ngeluarin gue kapan aja, atau ketik *@${botName} keluar*. Semua catatan grup ini bakal ikut dihapus.`;
};

// ---------- Notifikasi mention (tanpa AI) ----------

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const mentionsNickname = (text: string, nicknames: string[]) =>
  nicknames.some((n) => new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRe(n)}($|[^\\p{L}\\p{N}])`, "iu").test(text));

function notifyReason(m: IncomingMessage): string | null {
  const owner = ownerIds();
  if (m.mentionedIds.some((id) => owner.has(id))) return "mention lo";
  if (m.quotedSenderId && owner.has(m.quotedSenderId)) return "bales pesan lo";
  if (mentionsNickname(m.text, loadConfig().nicknames)) return "nyebut nama lo";
  return null;
}

/** Mode notif grup: 'off' = gak ada notif, 'mentions' = cuma tag & reply (tanpa nama panggilan). */
function shouldNotify(chat: store.Chat | undefined, reason: string) {
  const mode = chat?.notify_mode ?? "all";
  return mode === "all" || (mode === "mentions" && reason !== "nyebut nama lo");
}

async function notifyOwner(m: IncomingMessage, reason: string, group: string) {
  const { timezone, taskOffers } = loadConfig();
  const sender = m.senderName ?? m.senderIds[0].split("@")[0];
  const text = m.text.length > 700 ? `${m.text.slice(0, 700)}…` : m.text;
  let notif = `🔔 *${sender}* ${reason} di *${group}* (${formatHM(m.ts, timezone)}):\n> ${text.replace(/\n/g, "\n> ")}`;

  // Isinya tugas? Tawarin reminder. Gagal/lama = notif tetap dikirim tanpa tawaran.
  if (taskOffers) {
    const now = nowTs();
    const offer = await detectTask({ text: m.text, sender, group }, now).catch((e) => {
      console.error("Gagal cek tugas:", e instanceof Error ? e.message : e);
      return null;
    });
    if (offer) notif += `\n\n${makeOffer(offer, { sender, group }, now, isQuietTime(now))}`;
  }
  await sendToOwner(notif, "mention");
}

// ---------- Routing ----------

const COMMAND_PREFIX = /^\/ai\b\s*/i;

export async function handleMessage(m: IncomingMessage) {
  if (!hasOwner()) {
    // Sebelum ada owner, satu-satunya yang ditanggapi adalah kode setup lewat DM
    if (!m.isGroup && m.text.trim() === setupCode) await claimOwner(m);
    if (!m.isGroup) return;
  }

  const fromOwner = isOwner(m.senderIds);
  if (fromOwner) rememberOwnerIds(m.senderIds);

  if (m.isGroup) return handleGroup(m, fromOwner);
  if (fromOwner) return handleCommand(m, m.text.trim());
  // DM dari orang lain diabaikan (cuma owner yang bisa merintah)
}

async function handleGroup(m: IncomingMessage, fromOwner: boolean) {
  store.upsertGroup(m.chatJid, null);
  const reason = !fromOwner && hasOwner() ? notifyReason(m) : null;
  const id = m.raw.key.id ?? `${m.ts}-${crypto.randomUUID()}`;
  store.saveMessage({
    id,
    chat_jid: m.chatJid,
    sender_name: m.senderName,
    from_owner: fromOwner ? 1 : 0,
    for_owner: reason ? 1 : 0,
    text: m.text,
    ts: m.ts,
  });

  const chat = store.getGroup(m.chatJid);
  if (m.hasImage && hasOwner() && readsImages(chat) && takeImageQuota()) {
    // Jalan di belakang: pesan lain gak perlu nunggu AI selesai baca gambar
    trackImageJob(readGroupImage(m, id));
  }
  if (reason && shouldNotify(chat, reason)) {
    await notifyOwner(m, reason, chat?.name ?? "grup").catch((e) => console.error("Gagal kirim notif:", e));
  }

  if (!m.mentionsBot && !COMMAND_PREFIX.test(m.text)) return;
  // Buang prefix /ai dan tag @nomor dari teks perintah
  const text = m.text.replace(COMMAND_PREFIX, "").replace(/@\d+/g, "").trim();

  if (/^(keluar|\/keluar|leave)$/i.test(text)) return handleLeave(m);
  if (fromOwner) return handleCommand(m, text);
  // Orang lain nge-tag bot: diabaikan
}

// ---------- Gambar ----------

const imageJobs = new Set<Promise<void>>();
function trackImageJob(job: Promise<void>) {
  imageJobs.add(job);
  void job.finally(() => imageJobs.delete(job));
}
/** Tunggu semua gambar yang lagi dibaca selesai (dipakai tes). */
export const imageJobsIdle = () => Promise.all([...imageJobs]);

async function readGroupImage(m: IncomingMessage, id: string) {
  try {
    const image = await downloadImage(m.raw);
    if (!image) return;
    const caption = m.text === "[gambar]" ? null : m.text;
    const description = await describeImage({ mediaType: image.mediaType, data: image.data.toString("base64") }, caption);
    if (description) store.updateMessageText(m.chatJid, id, withDescription(m.text, description));
  } catch (e) {
    console.error("Gagal baca gambar:", e instanceof Error ? e.message : e);
  }
}

async function handleLeave(m: IncomingMessage) {
  const admins = await groupAdminIds(m.chatJid).catch(() => new Set<string>());
  const isAdmin = m.senderIds.some((id) => admins.has(jidNormalizedUser(id)));
  if (!isAdmin && !isOwner(m.senderIds)) {
    return sendText(m.chatJid, "Cuma admin grup yang bisa ngeluarin gue.", m.raw);
  }
  const groupName = store.getGroup(m.chatJid)?.name ?? "grup";
  await sendText(m.chatJid, "Oke, gue pamit 👋 Semua catatan grup ini udah dihapus.");
  await leaveGroup(m.chatJid);
  const to = ownerJid();
  if (to && !isOwner(m.senderIds)) {
    await sendText(to, `ℹ️ Admin *${groupName}* ngeluarin gue dari grup itu. Catatannya udah dihapus.`).catch(() => undefined);
  }
}

const YES = /^(ya|iya+|y|yes|yup|ok|oke+|okay|boleh|gas|sip|siap)\s*#?\s*(\d+)?\s*[.!]*$/i;

/** Owner bales "ya" (atau "ya 12") ke tawaran reminder: langsung dibikin tanpa AI. */
function answerOffer(text: string): string | null {
  const match = text.match(YES);
  if (!match) return null;
  if (match[2]) {
    const offer = store.getOffer(Number(match[2]));
    return offer?.open ? acceptOffer(offer) : null;
  }
  // "ya" doang: cuma buat tawaran terbaru, dan kalau gak ada obrolan sama AI setelahnya
  // (biar "ya" yang ngejawab pertanyaan AI gak salah dianggap nerima tawaran). Selain itu diterusin ke AI.
  const latest = latestOfferAfter(lastOwnerReplyMs());
  return latest ? acceptOffer(latest) : null;
}

async function handleCommand(m: IncomingMessage, text: string) {
  if (text === "" || /^\/(help|start|menu)$/i.test(text)) return sendText(m.chatJid, help(), m.raw);
  if (!m.isGroup) {
    const accepted = answerOffer(text);
    if (accepted) return sendText(m.chatJid, accepted, m.raw);
    if (/^update( japri)?[.!]*$/i.test(text)) {
      const result = await installUpdate((t) => sendText(m.chatJid, t));
      return result ? sendText(m.chatJid, result, m.raw) : undefined;
    }
  }
  if (/^\/reset$/i.test(text)) {
    resetHistory();
    return sendText(m.chatJid, "Oke, obrolan sebelumnya udah gue lupain ✅", m.raw);
  }

  try {
    await showTyping(m.chatJid);
    // Gambar yang owner kirim sendiri ke bot selalu dibaca
    let images;
    if (m.hasImage && !m.isGroup) {
      const image = await downloadImage(m.raw).catch(() => null);
      if (image) images = [{ mediaType: image.mediaType, data: image.data.toString("base64") }];
      if (text === "[gambar]") text = image ? "(owner ngirim gambar ini tanpa teks)" : "(owner ngirim gambar, tapi gambarnya gagal di-download)";
    }
    await sendText(m.chatJid, await ask(m.chatJid, text, images), m.raw);
  } catch (e) {
    console.error("Error dari AI:", e);
    const detail = e instanceof Error ? e.message.slice(0, 200) : "";
    await sendText(m.chatJid, `⚠️ Gagal nyambung ke AI. Coba lagi bentar ya.\n_${detail}_`, m.raw);
  }
}

export async function introduceToGroup(jid: string) {
  await sendText(jid, groupIntro());
}

export const pairingInfo = () =>
  `\n🔑 Kode setup: *${setupCode}*\n\n` +
  `Dari WhatsApp PRIBADI lo, kirim kode itu ke nomor bot:\n` +
  `👉 https://wa.me/${botNumber()}?text=${setupCode}\n`;
