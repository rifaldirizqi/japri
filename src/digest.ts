// Digest harian (F2): catch-up yang dikirim otomatis ke DM owner di jam yang dia pilih.
import { summarize } from "./agent/agent.js";
import { catchupPrompt, collectCatchup, commitCatchup } from "./catchup.js";
import { loadConfig, updateConfig } from "./config.js";
import { ownerJid } from "./notify.js";
import { lastOccurrence, parseHM } from "./time.js";
import { sendText } from "./wa/client.js";

const MAX_LATE = 12 * 3600; // PC sempat mati: lewat dari ini, digest-nya dilewati
const LATE_AFTER = 15 * 60;
const RETRY_AFTER = 10 * 60; // AI/WA gagal: coba lagi 10 menit kemudian

let running = false;
let retryAt = 0;

/** Dipanggil berkala. Kirim digest kalau jadwalnya udah lewat dan belum diurus. */
export async function runDigestIfDue(now: number) {
  const { digest, digestHandledTs, timezone } = loadConfig();
  const minutes = digest ? parseHM(digest.time) : null;
  if (!digest || minutes === null || running || now < retryAt) return;

  const slot = lastOccurrence(minutes, now, timezone);
  if (digestHandledTs !== undefined && slot <= digestHandledTs) return;
  if (digestHandledTs === undefined || now - slot > MAX_LATE) {
    // Baru dinyalain, atau udah kelewat jauh: isinya kebawa ke digest berikutnya
    updateConfig({ digestHandledTs: slot });
    return;
  }

  const to = ownerJid();
  if (!to) return;
  running = true;
  try {
    const batches = collectCatchup(now);
    if (batches.length > 0) {
      const text = await summarize(catchupPrompt(batches));
      const late = now - slot > LATE_AFTER ? ` _(telat, harusnya jam ${digest.time})_` : "";
      await sendText(to, `🗞️ *Rangkuman harian*${late}\n\n${text}`);
      commitCatchup(batches, now);
    }
    updateConfig({ digestHandledTs: slot });
  } catch (e) {
    console.error("Gagal kirim digest:", e);
    retryAt = now + RETRY_AFTER;
  } finally {
    running = false;
  }
}
