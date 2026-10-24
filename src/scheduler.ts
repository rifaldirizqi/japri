import { loadConfig } from "./config.js";
import * as store from "./db.js";
import { runDigestIfDue } from "./digest.js";
import { flushHeldNotifications, ownerJid, sendToOwner } from "./notify.js";
import { formatHM, nowTs } from "./time.js";
import { notifyIfUpdateAvailable } from "./updater.js";
import { sendText } from "./wa/client.js";

const LATE_AFTER = 5 * 60; // detik

async function sendDueReminders() {
  const now = nowTs();
  const { timezone } = loadConfig();
  for (const r of store.dueReminders(now)) {
    const to = r.target_jid === "owner" ? ownerJid() : r.target_jid;
    if (!to) continue;
    try {
      // Bot sempat mati (mis. PC dimatiin): tetap kirim, tapi kasih tau telat
      const late = now - r.due_ts > LATE_AFTER ? ` _(telat, harusnya ${formatHM(r.due_ts, timezone)})_` : "";
      await sendText(to, `⏰ *Reminder:* ${r.text}${late}`);
      if (r.recurrence) {
        const step = r.recurrence === "daily" ? 86400 : 7 * 86400;
        let next = r.due_ts + step;
        while (next <= now) next += step;
        store.rescheduleReminder(r.id, next);
      } else {
        store.markReminderDone(r.id);
      }
    } catch (e) {
      console.error(`Gagal kirim reminder #${r.id}:`, e);
    }
  }
}

async function tick() {
  await sendDueReminders();
  await flushHeldNotifications().catch((e) => console.error("Gagal kirim notif yang ditahan:", e));
  await runDigestIfDue(nowTs());
}

let started = false;
export function startScheduler() {
  if (started) return;
  started = true;
  setInterval(tick, 20_000);
  setInterval(() => store.pruneMessages(nowTs() - loadConfig().retentionDays * 86400), 3600_000);
  void tick();

  // Cek update: 1 menit setelah nyala, terus tiap 24 jam
  // Kabar update ditahan kalau lagi jam tenang
  const checkUpdate = () => {
    if (ownerJid()) void notifyIfUpdateAvailable((text) => sendToOwner(text, "other")).catch((e) => console.error("Gagal cek update:", e));
  };
  setTimeout(checkUpdate, 60_000);
  setInterval(checkUpdate, 24 * 3600_000);
}
