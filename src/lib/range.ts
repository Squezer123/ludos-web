// Zakres dat widoku gildii. Dni to napisy "YYYY-MM-DD" w strefie Europe/Warsaw
// (bez Date w logice, żeby nie mieszać stref).

export const PRESETS = ["7d", "30d", "90d"] as const;
export type Preset = (typeof PRESETS)[number];
export const MAX_SPAN_DAYS = 366;

export interface ResolvedRange {
  from: string;
  to: string;
  days: number;
  preset: Preset | "custom";
  /** początek poprzedniego okresu o tej samej długości (kończy się dzień przed `from`) */
  prevFrom: string;
}

const DAY = 86_400_000;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

const toMs = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};
const fromMs = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export const isDay = (s: unknown): s is string =>
  typeof s === "string" && ISO.test(s) && fromMs(toMs(s)) === s;

export const addDays = (s: string, n: number) => fromMs(toMs(s) + n * DAY);
export const diffDays = (a: string, b: string) => Math.round((toMs(b) - toMs(a)) / DAY);

export function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export const todayWarsaw = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Warsaw" }).format(new Date());

export function resolveRange(
  q: { range?: string; from?: string; to?: string },
  today = todayWarsaw(),
): ResolvedRange {
  if (isDay(q.from) && isDay(q.to) && q.from <= q.to) {
    const to = q.to > today ? today : q.to;
    const days = diffDays(q.from, to) + 1;
    if (days >= 1 && days <= MAX_SPAN_DAYS) {
      return { from: q.from, to, days, preset: "custom", prevFrom: addDays(q.from, -days) };
    }
  }
  const preset: Preset = (PRESETS as readonly string[]).includes(q.range ?? "") ? (q.range as Preset) : "30d";
  const days = Number.parseInt(preset, 10);
  const from = addDays(today, -(days - 1));
  return { from, to: today, days, preset, prevFrom: addDays(from, -days) };
}

const fmt = (s: string, year: boolean) =>
  new Date(toMs(s)).toLocaleDateString("pl-PL", {
    day: "numeric", month: "long", ...(year ? { year: "numeric" } : {}), timeZone: "UTC",
  });

/** "29 września – 28 października 2026" */
export function fmtRange(from: string, to: string): string {
  const sameYear = from.slice(0, 4) === to.slice(0, 4);
  return `${fmt(from, !sameYear)} – ${fmt(to, true)}`;
}

/** "28.10" (jak na osi wykresu) */
export const fmtAxisDay = (s: string) => `${Number(s.slice(8))}.${s.slice(5, 7)}`;
export const fmtTipDay = (s: string) =>
  new Date(toMs(s)).toLocaleDateString("pl-PL", { day: "numeric", month: "short", timeZone: "UTC" });
