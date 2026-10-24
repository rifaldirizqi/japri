const cache = new Map<string, Intl.DateTimeFormat>();
function formatter(key: string, make: () => Intl.DateTimeFormat) {
  let f = cache.get(key);
  if (!f) cache.set(key, (f = make()));
  return f;
}

export const nowTs = () => Math.floor(Date.now() / 1000);

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** mis. "Sab, 24 Okt 2026, 21.05" */
export const formatTs = (ts: number, tz: string) =>
  formatter(`full:${tz}`, () =>
    new Intl.DateTimeFormat("id-ID", {
      timeZone: tz,
      weekday: "short",
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }),
  ).format(new Date(ts * 1000));

/** mis. "21:05" */
export const formatHM = (ts: number, tz: string) =>
  formatter(`hm:${tz}`, () =>
    new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }),
  ).format(new Date(ts * 1000));

/** Waktu sekarang dalam ISO 8601 + offset, mis. 2026-10-24T21:05:00+07:00 */
export function nowIsoLocal(tz: string): string {
  const parts = Object.fromEntries(
    formatter(`iso:${tz}`, () =>
      new Intl.DateTimeFormat("en-CA", {
        timeZone: tz,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
        timeZoneName: "longOffset",
      }),
    )
      .formatToParts(new Date())
      .map((p) => [p.type, p.value]),
  );
  const offset = (parts.timeZoneName as string).replace("GMT", "") || "+00:00";
  const hour = parts.hour === "24" ? "00" : parts.hour;
  return `${parts.year}-${parts.month}-${parts.day}T${hour}:${parts.minute}:${parts.second}${offset}`;
}

// ---------- Jam lokal ("HH:MM") ----------

/** "21:00" / "9.30" / "7" → menit sejak tengah malam, atau null kalau gak valid. */
export function parseHM(s: string): number | null {
  const m = s.trim().match(/^(\d{1,2})(?:[:.](\d{2}))?$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  return h < 24 && min < 60 ? h * 60 + min : null;
}

export const formatMinutes = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

/** Selisih zona waktu dari UTC (menit) pada saat `ts`. */
function offsetMinutes(ts: number, tz: string): number {
  const name = formatter(`off:${tz}`, () => new Intl.DateTimeFormat("en", { timeZone: tz, timeZoneName: "longOffset" }))
    .formatToParts(new Date(ts * 1000))
    .find((p) => p.type === "timeZoneName")!.value;
  const m = name.match(/GMT([+-])(\d{2}):?(\d{2})?/);
  return m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] ?? 0)) : 0;
}

/** Menit sejak tengah malam (jam lokal) pada saat `ts`. */
export const localMinutes = (ts: number, tz: string) => {
  const local = ts + offsetMinutes(ts, tz) * 60;
  return Math.floor((((local % 86400) + 86400) % 86400) / 60);
};

/** Apakah jam lokal `minutes` ada di rentang [start, end). Rentang boleh lewat tengah malam (mis. 22:00–06:00). */
export function inDailyWindow(minutes: number, start: number, end: number): boolean {
  if (start === end) return false;
  return start < end ? minutes >= start && minutes < end : minutes >= start || minutes < end;
}

/** Waktu (unix) terakhir jam lokal `minutes` terjadi, paling lambat `nowTs`. */
export function lastOccurrence(minutes: number, now: number, tz: string): number {
  const local = now + offsetMinutes(now, tz) * 60;
  let slotLocal = Math.floor(local / 86400) * 86400 + minutes * 60;
  if (slotLocal > local) slotLocal -= 86400;
  // Ubah balik ke UTC pakai offset di jam itu (beda kalau ada pergantian DST di antaranya)
  let slot = slotLocal - offsetMinutes(now, tz) * 60;
  slot = slotLocal - offsetMinutes(slot, tz) * 60;
  return slot > now ? slot - 86400 : slot;
}
