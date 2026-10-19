export const TZ = 'Europe/Bucharest';

const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });

/** Local Romanian calendar date (YYYY-MM-DD) of an instant. */
export function localDate(at: Date = new Date()): string {
  return dayFmt.format(at);
}

/** Adds whole calendar days to a YYYY-MM-DD date string. */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days, 12)).toISOString().slice(0, 10);
}

/** Monday (YYYY-MM-DD) of the ISO week containing the local date of `at`. */
export function isoWeekStart(at: Date = new Date()): string {
  const local = localDate(at);
  const [y, m, d] = local.split('-').map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay(); // 0=Sun
  const offset = weekday === 0 ? -6 : 1 - weekday;
  return addDays(local, offset);
}

/** UTC instant of local midnight at the start of a YYYY-MM-DD date in Europe/Bucharest. */
export function localMidnightUtc(date: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d, 0, 0);
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(guess));
  const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
  const asLocal = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute));
  let result = guess - (asLocal - guess);
  // Re-check once to handle the DST boundary days.
  if (localDate(new Date(result)) !== date) result += 3600_000;
  return new Date(result);
}

/** Inclusive list of local dates starting at `start`. */
export function dateRange(start: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => addDays(start, i));
}

export function formatLocal(iso: string | Date, opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) {
  return new Intl.DateTimeFormat('ro-RO', { timeZone: TZ, ...opts }).format(new Date(iso));
}

export function yyyymmdd(date: string) {
  return date.replaceAll('-', '');
}
