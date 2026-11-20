const TZ = "Asia/Manila";
export const locale = typeof navigator !== "undefined" ? navigator.language || "en-PH" : "en-PH";

const cache = new Map<string, Intl.DateTimeFormat>();
function dtf(opts: Intl.DateTimeFormatOptions) {
  const k = JSON.stringify(opts);
  let f = cache.get(k);
  if (!f) cache.set(k, (f = new Intl.DateTimeFormat(locale, opts)));
  return f;
}

/** A business date like 2026-12-18 is a calendar day; format it without shifting zones. */
function day(d: string) {
  return new Date(`${d}T12:00:00Z`);
}
export const fmtWeekday = (d: string) => dtf({ weekday: "short", timeZone: "UTC" }).format(day(d));
export const fmtDayNum = (d: string) => dtf({ day: "numeric", timeZone: "UTC" }).format(day(d));
export const fmtMonth = (d: string) => dtf({ month: "short", timeZone: "UTC" }).format(day(d));
export const fmtDateLong = (d: string) => dtf({ weekday: "long", month: "long", day: "numeric", timeZone: "UTC" }).format(day(d));
export const fmtDateShort = (d: string) => dtf({ weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(day(d));
export const fmtTime = (iso: string) => dtf({ hour: "numeric", minute: "2-digit", timeZone: TZ }).format(new Date(iso));

export function fmtRuntime(min: number | null): string | null {
  if (!min) return null;
  const h = Math.floor(min / 60);
  const m = min % 60;
  try {
    // @ts-ignore DurationFormat is newer than our lib typings
    if (Intl.DurationFormat) return new Intl.DurationFormat(locale, { style: "narrow" }).format({ hours: h, minutes: m });
  } catch {}
  return h ? `${h}h ${m}m` : `${m}m`;
}

const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
export function fmtAgo(ts: number, now = Date.now()): string {
  const s = Math.round((ts - now) / 1000);
  if (s > -45) return "just now";
  const m = Math.round(s / 60);
  if (m > -60) return rtf.format(m, "minute");
  return rtf.format(Math.round(m / 60), "hour");
}

const pr = new Intl.PluralRules("en");
/** English copy with correct plural forms: plural(3, "mall", "malls") → "3 malls". */
export function plural(n: number, one: string, other: string): string {
  return `${new Intl.NumberFormat(locale).format(n)} ${pr.select(n) === "one" ? one : other}`;
}

export function todayManila(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
}
