import type { Boom } from "@hapi/boom";
import makeWASocket, {
  DisconnectReason,
  downloadMediaMessage,
  fetchLatestBaileysVersion,
  isJidGroup,
  isLidUser,
  jidNormalizedUser,
  normalizeMessageContent,
  useMultiFileAuthState,
  type GroupParticipant,
  type WAMessage,
  type WASocket,
  type proto,
} from "baileys";
import { HttpsProxyAgent } from "https-proxy-agent";
import pino from "pino";
import qrcode from "qrcode-terminal";
import fs from "node:fs";
import { AUTH_DIR } from "../config.js";
import * as store from "../db.js";
import { isDesktop, isTray, markConnected, reportStatus, setupWizardOpen, showQrInBrowser } from "../desktop.js";

export type IncomingMessage = {
  raw: WAMessage;
  chatJid: string;
  isGroup: boolean;
  /** Semua ID pengirim yang diketahui (nomor dan/atau LID) */
  senderIds: string[];
  senderName: string | null;
  text: string;
  ts: number;
  mentionedIds: string[];
  quotedSenderId: string | null;
  mentionsBot: boolean;
  /** Ada gambar yang bisa dibaca (bukan stiker / sekali lihat) */
  hasImage: boolean;
};

export type Handlers = {
  onMessage: (m: IncomingMessage) => Promise<void>;
  onJoinedGroup: (jid: string) => Promise<void>;
  onReady: () => void;
};

const logger = pino({ level: process.env.LOG_LEVEL ?? "silent" });

let sock: WASocket | null = null;
const botIds = new Set<string>();
let retryDelay = 3000;

// Opsional: lewat proxy (mis. jaringan kantor) kalau HTTPS_PROXY di-set
const proxyUrl = process.env.HTTPS_PROXY ?? process.env.https_proxy;
const proxyAgent = proxyUrl ? new HttpsProxyAgent(proxyUrl) : undefined;

export const isBotId = (jid?: string | null) => !!jid && botIds.has(jidNormalizedUser(jid));
export const botNumber = () => sock?.user?.id.split(/[:@]/)[0] ?? "";

export async function sendText(jid: string, text: string, quoted?: WAMessage) {
  if (!sock) throw new Error("WhatsApp belum terhubung");
  await sock.sendMessage(jid, { text }, quoted ? { quoted } : undefined);
}

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Download gambar dari pesan (buat dibaca AI). Null kalau gak ada / kegedean. */
export async function downloadImage(raw: WAMessage): Promise<{ data: Buffer; mediaType: string } | null> {
  const image = normalizeMessageContent(raw.message)?.imageMessage;
  if (!image || !sock) return null;
  if (Number(image.fileLength ?? 0) > MAX_IMAGE_BYTES) return null;
  const data = await downloadMediaMessage(raw, "buffer", {}, { logger, reuploadRequest: sock.updateMediaMessage });
  return { data, mediaType: image.mimetype?.split(";")[0] || "image/jpeg" };
}

export const showTyping = (jid: string) => sock?.sendPresenceUpdate("composing", jid).catch(() => undefined);

export async function leaveGroup(jid: string) {
  await sock?.groupLeave(jid);
  store.forgetGroup(jid);
}

const participantIds = (p: GroupParticipant) =>
  [p.id, p.lid, p.phoneNumber].filter((x): x is string => !!x).map(jidNormalizedUser);

/** ID semua admin grup (diambil fresh dari WhatsApp). */
export async function groupAdminIds(jid: string): Promise<Set<string>> {
  const meta = await sock!.groupMetadata(jid);
  return new Set(meta.participants.filter((p) => p.admin).flatMap(participantIds));
}

/** Lengkapi nomor ↔ LID pakai mapping Baileys (WhatsApp kadang cuma kirim salah satu). */
async function resolveIds(...jids: (string | null | undefined)[]): Promise<string[]> {
  const ids = new Set(jids.filter((x): x is string => !!x).map(jidNormalizedUser));
  const mapping = sock?.signalRepository.lidMapping;
  if (mapping) {
    for (const id of [...ids]) {
      const other = isLidUser(id)
        ? await mapping.getPNForLID(id).catch(() => null)
        : await mapping.getLIDForPN(id).catch(() => null);
      if (other) ids.add(jidNormalizedUser(other));
    }
  }
  return [...ids];
}

/** Ambil teks dari berbagai tipe pesan; media tanpa caption diberi placeholder. */
function extractText(content: proto.IMessage | undefined): string | null {
  if (!content) return null;
  const text =
    content.conversation ??
    content.extendedTextMessage?.text ??
    content.imageMessage?.caption ??
    content.videoMessage?.caption ??
    content.documentMessage?.caption;
  if (text) return text;
  if (content.imageMessage) return "[gambar]";
  if (content.videoMessage) return "[video]";
  if (content.audioMessage) return "[voice note]";
  if (content.stickerMessage) return "[stiker]";
  if (content.documentMessage) return `[dokumen: ${content.documentMessage.fileName ?? "file"}]`;
  if (content.locationMessage) return "[lokasi]";
  if (content.contactMessage) return `[kontak: ${content.contactMessage.displayName ?? ""}]`;
  const poll = content.pollCreationMessage ?? content.pollCreationMessageV3;
  if (poll) return `[polling: ${poll.name ?? ""}]`;
  return null; // reaction, pesan sistem, dll — diabaikan
}

function extractContextInfo(content: proto.IMessage | undefined): proto.IContextInfo | undefined {
  if (!content) return undefined;
  for (const value of Object.values(content)) {
    if (value && typeof value === "object" && "contextInfo" in value && value.contextInfo) {
      return value.contextInfo as proto.IContextInfo;
    }
  }
  return undefined;
}

async function parse(msg: WAMessage): Promise<IncomingMessage | null> {
  const chatJid = msg.key.remoteJid;
  if (!chatJid || chatJid === "status@broadcast" || msg.key.fromMe) return null;

  const content = normalizeMessageContent(msg.message);
  const text = extractText(content);
  if (!text) return null;

  const isGroup = !!isJidGroup(chatJid);
  const senderIds = isGroup
    ? await resolveIds(msg.key.participant, msg.key.participantAlt)
    : await resolveIds(chatJid, msg.key.remoteJidAlt);
  if (senderIds.length === 0) return null;

  const viewOnce = !!(msg.message?.viewOnceMessage || msg.message?.viewOnceMessageV2 || msg.message?.viewOnceMessageV2Extension || content?.imageMessage?.viewOnce);
  const ctx = extractContextInfo(content);
  const mentionedIds = (ctx?.mentionedJid ?? []).map(jidNormalizedUser);
  const quotedSenderId = ctx?.participant ? jidNormalizedUser(ctx.participant) : null;

  return {
    raw: msg,
    chatJid,
    isGroup,
    senderIds,
    senderName: msg.pushName ?? null,
    text,
    ts: Number(msg.messageTimestamp ?? Math.floor(Date.now() / 1000)),
    mentionedIds,
    quotedSenderId,
    mentionsBot: mentionedIds.some(isBotId) || isBotId(quotedSenderId),
    hasImage: !!content?.imageMessage && !viewOnce,
  };
}

export async function connect(handlers: Handlers) {
  console.log("📡 Nyambung ke WhatsApp...");
  reportStatus("connecting");
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    auth: state,
    logger,
    markOnlineOnConnect: false,
    ...(proxyAgent ? { agent: proxyAgent, fetchAgent: proxyAgent } : {}),
  });
  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      reportStatus("qr");
      if (isDesktop) {
        await showQrInBrowser(qr).catch((e) => console.error("Gagal buka QR di browser:", e));
        if (!setupWizardOpen()) {
          console.log("\n📱 QR buat nyambungin WhatsApp udah kebuka di browser. Scan pakai HP nomor BOT.");
          console.log("   (Kalau browsernya gak kebuka, scan QR di bawah ini.)\n");
        }
      } else {
        console.log("\n📱 Scan QR ini pakai HP nomor BOT:");
        console.log("   WhatsApp → ⋮ / Pengaturan → Perangkat tertaut → Tautkan perangkat\n");
      }
      // Jendela setup udah nampilin QR-nya sendiri
      if (!isTray && !setupWizardOpen()) qrcode.generate(qr, { small: true });
    }
    if (connection === "open") {
      retryDelay = 3000;
      if (isDesktop) markConnected();
      botIds.clear();
      if (sock?.user?.id) botIds.add(jidNormalizedUser(sock.user.id));
      if (sock?.user?.lid) botIds.add(jidNormalizedUser(sock.user.lid));
      try {
        const groups = await sock!.groupFetchAllParticipating();
        for (const g of Object.values(groups)) store.upsertGroup(g.id, g.subject);
        store.retainGroups(Object.keys(groups)); // grup yang nge-kick bot waktu bot mati
      } catch (e) {
        console.error("Gagal sinkron daftar grup:", e);
      }
      reportStatus("ready");
      handlers.onReady();
    }
    if (connection === "close") {
      const code = (lastDisconnect?.error as Boom | undefined)?.output?.statusCode;
      if (code === DisconnectReason.loggedOut) {
        if (!isDesktop) {
          console.error("\n❌ Bot di-logout dari WhatsApp. Hapus folder data/auth lalu jalankan ulang buat scan QR baru.");
          process.exit(1);
        }
        // Desktop: langsung minta scan QR baru (halamannya kebuka di browser)
        console.log("\n⚠️  Nomor bot ke-logout dari WhatsApp. Scan QR baru buat nyambungin lagi.");
        fs.rmSync(AUTH_DIR, { recursive: true, force: true });
        retryDelay = 3000;
        setTimeout(() => connect(handlers), 1000);
        return;
      }
      reportStatus("connecting");
      const reason = lastDisconnect?.error?.message ?? "tanpa keterangan";
      console.log(`🔄 Koneksi WhatsApp putus (${code ?? "-"}: ${reason}). Nyambung ulang dalam ${retryDelay / 1000} detik...`);
      setTimeout(() => connect(handlers), retryDelay);
      retryDelay = Math.min(retryDelay * 2, 60_000);
    }
  });

  sock.ev.on("groups.upsert", async (groups) => {
    for (const g of groups) {
      const isNew = !store.getGroup(g.id);
      store.upsertGroup(g.id, g.subject);
      // Cuma grup yang benar-benar baru yang dapat intro (event ini bisa muncul lagi pas sinkron)
      if (isNew) await handlers.onJoinedGroup(g.id).catch((e) => console.error("Gagal kirim intro grup:", e));
    }
  });

  sock.ev.on("groups.update", (updates) => {
    for (const g of updates) if (g.id && g.subject) store.upsertGroup(g.id, g.subject);
  });

  sock.ev.on("group-participants.update", ({ id, participants, action }) => {
    if (action === "remove" && participants.some((p) => participantIds(p).some(isBotId))) {
      store.forgetGroup(id);
      console.log("👋 Bot dikeluarkan dari grup, catatan grup itu dihapus");
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    // "append" = sinkronisasi riwayat; cuma pesan baru yang diproses
    if (type !== "notify") return;
    for (const raw of messages) {
      try {
        const m = await parse(raw);
        if (m) await handlers.onMessage(m);
      } catch (e) {
        console.error("Gagal memproses pesan:", e);
      }
    }
  });
}
