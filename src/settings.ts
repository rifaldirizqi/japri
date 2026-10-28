// Ubah pengaturan Japri. Dipakai bareng sama perintah chat (agent/tools.ts) dan jendela Pengaturan
// (setup/settings-web.ts), biar aturan & efek sampingnya sama persis.
import { loadConfig, updateConfig, type LLMConfig } from "./config.js";
import * as store from "./db.js";
import { reportInfo } from "./desktop.js";
import { digestHandledNow } from "./digest.js";
import { testToolCalling } from "./llm/index.js";
import { formatMinutes, isValidTimezone, nowTs, parseHM } from "./time.js";
import { readsImages, testVision } from "./vision.js";

/** null = berhasil, string = pesan kenapa ditolak (pengaturan gak diubah). */
export type Rejected = string | null;

export function setNicknames(names: string[]): Rejected {
  updateConfig({ nicknames: [...new Set(names.map((n) => n.trim().toLowerCase()).filter(Boolean))].slice(0, 10) });
  return null;
}

export function setTimezone(tz: string): Rejected {
  if (!isValidTimezone(tz)) return `Zona waktu "${tz}" gak dikenal.`;
  updateConfig({ timezone: tz });
  return null;
}

export function setBotName(name: string): Rejected {
  const n = name.trim();
  if (!n || n.length > 30) return "Nama bot harus 1–30 huruf.";
  updateConfig({ botName: n });
  return null;
}

export function setRetentionDays(days: number): Rejected {
  if (!Number.isInteger(days) || days < 1 || days > 365) return "Lama simpan pesan harus 1–365 hari.";
  updateConfig({ retentionDays: days });
  return null;
}

/** start & end null = matiin. */
export function setQuietHours(start: string | null, end: string | null): Rejected {
  if (start === null || end === null) {
    updateConfig({ quietHours: null });
    return null;
  }
  const s = parseHM(start);
  const e = parseHM(end);
  if (s === null || e === null || s === e) return "Jam mulai/selesai gak valid. Pakai format HH:MM dan jangan sama.";
  updateConfig({ quietHours: { start: formatMinutes(s), end: formatMinutes(e) } });
  return null;
}

/** time null = matiin. Jadwal yang udah lewat gak dikirim mendadak; mulai dari jadwal berikutnya. */
export function setDigest(time: string | null, weekdaysOnly: boolean): Rejected {
  if (time === null) {
    updateConfig({ digest: null });
    return null;
  }
  const minutes = parseHM(time);
  if (minutes === null) return `Jam "${time}" gak valid. Pakai format HH:MM.`;
  updateConfig({ digest: { time: formatMinutes(minutes), weekdaysOnly } });
  updateConfig({ digestHandledTs: digestHandledNow("daily", loadConfig(), nowTs()) });
  return null;
}

/** day: 0 = Minggu … 6 = Sabtu, null = matiin. */
export function setWeeklyDigest(day: number | null, time: string): Rejected {
  if (day === null) {
    updateConfig({ weeklyDigest: null });
    return null;
  }
  const minutes = parseHM(time);
  if (minutes === null) return `Jam "${time}" gak valid. Pakai format HH:MM.`;
  if (!Number.isInteger(day) || day < 0 || day > 6) return "Hari gak valid.";
  updateConfig({ weeklyDigest: { day, time: formatMinutes(minutes) } });
  updateConfig({ weeklyHandledTs: digestHandledNow("weekly", loadConfig(), nowTs()) });
  return null;
}

/** Baca gambar buat semua grup (jid kosong) atau satu grup. Pas pertama dinyalain, model AI-nya dites dulu. */
export async function setImageReading(enabled: boolean, jid?: string): Promise<Rejected> {
  const alreadyOn = store.listGroups().some((x) => readsImages(x)) || loadConfig().readImages;
  if (enabled && !alreadyOn) {
    const test = await testVision(loadConfig().llm);
    if (!test.ok) return `Model AI yang sekarang (${loadConfig().llm.model}) gak bisa baca gambar: ${test.detail}`;
  }
  if (jid) {
    store.setReadImages(jid, enabled ? 1 : 0);
    return null;
  }
  updateConfig({ readImages: enabled });
  for (const x of store.listGroups()) store.setReadImages(x.jid, null); // ikut pengaturan umum
  return null;
}

/** Ganti AI (provider, key, model). Dites dulu bisa tool calling, kecuali skipTest. */
export async function setLLM(llm: LLMConfig, skipTest = false): Promise<Rejected> {
  if (!llm.model) return "Model belum dipilih.";
  if (!skipTest) {
    const test = await testToolCalling(llm);
    if (!test.ok) return test.detail;
  }
  updateConfig({ llm });
  reportInfo({ ai: `${llm.provider} / ${llm.model}` });
  return null;
}
