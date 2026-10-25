// Digest otomatis ke DM owner:
// - harian (v0.2.0): catch-up di jam yang owner pilih, tiap hari atau hari kerja aja
// - mingguan (v0.3.0): gambaran besar 7 hari terakhir, gak ngubah titik mulai catch-up
import { rememberForOwner, summarize } from "./agent/agent.js";
import { catchupPrompt, collectCatchup, commitCatchup, weeklyBatches, weeklyPrompt } from "./catchup.js";
import { loadConfig, updateConfig, type Config } from "./config.js";
import { ownerJid } from "./notify.js";
import { lastSlot, parseHM } from "./time.js";
import { sendText } from "./wa/client.js";

const MAX_LATE = 12 * 3600; // PC sempat mati: lewat dari ini, digest-nya dilewati
const LATE_AFTER = 15 * 60;
const RETRY_AFTER = 10 * 60; // AI/WA gagal: coba lagi 10 menit kemudian

export const WEEKDAYS = [1, 2, 3, 4, 5];
export const DAY_NAMES = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

type Schedule = {
  /** Jam ("HH:MM") & hari yang dibolehin (0 = Minggu), atau null kalau mati */
  when: (c: Config) => { time: string; days?: number[] } | null;
  handledKey: "digestHandledTs" | "weeklyHandledTs";
  /** Bikin isi digest; null = gak ada obrolan, gak usah dikirim */
  build: (now: number) => Promise<{ title: string; text: string; commit?: () => void } | null>;
};

/** Jadwal terakhir yang udah lewat, sesuai jam & hari yang dipilih. */
export function scheduleSlot(when: { time: string; days?: number[] } | null, now: number, tz: string): number | null {
  const minutes = when ? parseHM(when.time) : null;
  return when && minutes !== null ? lastSlot(minutes, now, tz, when.days) : null;
}

const daily: Schedule = {
  when: (c) => (c.digest ? { time: c.digest.time, days: c.digest.weekdaysOnly ? WEEKDAYS : undefined } : null),
  handledKey: "digestHandledTs",
  build: async (now) => {
    const batches = collectCatchup(now);
    if (batches.length === 0) return null;
    return { title: "🗞️ *Rangkuman harian*", text: await summarize(catchupPrompt(batches)), commit: () => commitCatchup(batches, now) };
  },
};

const weekly: Schedule = {
  when: (c) => (c.weeklyDigest ? { time: c.weeklyDigest.time, days: [c.weeklyDigest.day] } : null),
  handledKey: "weeklyHandledTs",
  build: async (now) => {
    const batches = weeklyBatches(now);
    if (batches.length === 0) return null;
    return { title: "🗓️ *Rangkuman mingguan*", text: await summarize(weeklyPrompt(batches)) };
  },
};

const running = new Set<Schedule>();
const retryAt = new Map<Schedule, number>();

async function runIfDue(s: Schedule, now: number) {
  const config = loadConfig();
  const when = s.when(config);
  const slot = scheduleSlot(when, now, config.timezone);
  if (!when || slot === null || running.has(s) || now < (retryAt.get(s) ?? 0)) return;

  const handled = config[s.handledKey];
  if (handled !== undefined && slot <= handled) return;
  if (handled === undefined || now - slot > MAX_LATE) {
    // Baru dinyalain, atau udah kelewat jauh: isinya kebawa ke digest berikutnya
    updateConfig({ [s.handledKey]: slot });
    return;
  }

  const to = ownerJid();
  if (!to) return;
  running.add(s);
  try {
    const digest = await s.build(now);
    if (digest) {
      const late = now - slot > LATE_AFTER ? ` _(telat, harusnya jam ${when.time})_` : "";
      const message = `${digest.title}${late}\n\n${digest.text}`;
      await sendText(to, message);
      rememberForOwner(message); // biar owner bisa bales "ingetin poin pertama besok pagi"
      digest.commit?.();
    }
    updateConfig({ [s.handledKey]: slot });
  } catch (e) {
    console.error("Gagal kirim digest:", e);
    retryAt.set(s, now + RETRY_AFTER);
  } finally {
    running.delete(s);
  }
}

/** Dipanggil berkala. Kirim digest kalau jadwalnya udah lewat dan belum diurus. */
export async function runDigestIfDue(now: number) {
  await runIfDue(daily, now);
  await runIfDue(weekly, now);
}

/** Jadwal yang lagi lewat dianggap udah diurus (dipakai pas digest baru dinyalain/diubah). */
export function digestHandledNow(kind: "daily" | "weekly", config: Config, now: number): number | undefined {
  const s = kind === "daily" ? daily : weekly;
  return scheduleSlot(s.when(config), now, config.timezone) ?? undefined;
}
