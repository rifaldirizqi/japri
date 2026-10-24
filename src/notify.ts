// Kirim kabar ke DM owner, dengan jam tenang (F4): notif yang muncul di jam tenang ditahan dulu.
import { loadConfig } from "./config.js";
import * as store from "./db.js";
import { inDailyWindow, localMinutes, nowTs, parseHM } from "./time.js";
import { sendText } from "./wa/client.js";

/** JID buat DM owner (nomor lebih disukai daripada LID). */
export function ownerJid(): string | null {
  const ids = loadConfig().owner?.ids ?? [];
  return ids.find((id) => id.endsWith("@s.whatsapp.net")) ?? ids[0] ?? null;
}

export function isQuietTime(now = nowTs()): boolean {
  const { quietHours, timezone } = loadConfig();
  if (!quietHours) return false;
  const start = parseHM(quietHours.start);
  const end = parseHM(quietHours.end);
  if (start === null || end === null) return false;
  return inDailyWindow(localMinutes(now, timezone), start, end);
}

/**
 * Kirim ke owner, atau tahan kalau lagi jam tenang.
 * kind 'mention' = notif tag/reply/nama (nanti digabung jadi satu pesan); 'other' = mis. kabar update.
 */
export async function sendToOwner(text: string, kind: "mention" | "other") {
  if (isQuietTime()) {
    store.holdNotification(kind, text, nowTs());
    return;
  }
  const to = ownerJid();
  if (to) await sendText(to, text);
}

const MAX_COMBINED = 30;

/** Jam tenang udah selesai: kirim semua yang ditahan. */
export async function flushHeldNotifications() {
  if (isQuietTime()) return;
  const held = store.heldNotifications();
  const to = ownerJid();
  if (held.length === 0 || !to) return;

  const mentions = held.filter((h) => h.kind === "mention");
  if (mentions.length) {
    const shown = mentions.slice(-MAX_COMBINED);
    const more = mentions.length - shown.length;
    await sendText(
      to,
      `📬 Selama jam tenang, ada ${mentions.length} yang nyariin lo:\n\n${shown.map((h) => h.text).join("\n\n")}` +
        (more > 0 ? `\n\n_…dan ${more} lainnya yang lebih lama. Tanya "gue ketinggalan apa?" buat rangkumannya._` : ""),
    );
  }
  for (const h of held.filter((h) => h.kind === "other")) await sendText(to, h.text);
  store.deleteHeldNotifications(held[held.length - 1].id);
}
