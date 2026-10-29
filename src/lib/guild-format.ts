import { fmtInt } from "./format";

const one = (x: number) => x.toLocaleString("pl-PL", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const trim = (x: number) => String(+x.toFixed(1)).replace(".", ",");

/** 14 400 000 -> "14,4 mln", 137 300 -> "137,3 tys.", 5 400 -> "5 400" */
export function fmtCompact(n: number): string {
  if (n >= 1e6) return `${one(n / 1e6)} mln`;
  if (n >= 1e4) return `${one(n / 1e3)} tys.`;
  return fmtInt(Math.round(n));
}

/** Podpisy osi Y: "1,2 mln", "900 tys.", "0" */
export function fmtAxis(v: number): string {
  if (v >= 1e6) return `${trim(v / 1e6)} mln`;
  if (v >= 1e3) return `${trim(v / 1e3)} tys.`;
  return fmtInt(Math.round(v));
}

/** Zmiana względem poprzedniego okresu, np. "-9,4%" / "+3,0%". */
export function fmtDelta(d: number): string {
  const pct = Math.abs(d * 100);
  const s = pct.toLocaleString("pl-PL", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return `${d < 0 ? "-" : d > 0 ? "+" : ""}${s}%`;
}

/** "5 min temu" */
export function fmtAgo(then: number, now: number): string {
  const sec = Math.max(0, Math.round((now - then) / 1000));
  if (sec < 45) return "przed chwilą";
  const rtf = new Intl.RelativeTimeFormat("pl", { numeric: "always" });
  const min = Math.round(sec / 60);
  if (min < 60) return rtf.format(-min, "minute");
  const h = Math.round(min / 60);
  if (h < 24) return rtf.format(-h, "hour");
  return rtf.format(-Math.round(h / 24), "day");
}

/** Skok osi: 1, 2, 3, 5 × 10^k, tak żeby było ok. `target` przedziałów. */
export function niceStep(max: number, target = 4, integer = false): number {
  const raw = Math.max(max, 1e-9) / target;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / p;
  const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 3 ? 3 : f <= 5 ? 5 : 10) * p;
  return integer ? Math.max(1, step) : step;
}
