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
