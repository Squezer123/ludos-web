import { fmtTime } from "./format";

// Czysta logika (bez bazy): dzieli czas sesji na równe przedziały i sumuje w nich wartości.

export interface TimedValue { t: number; v: number }

export interface Timeline<K extends string> {
  /** długość przedziału w minutach */
  bucketMin: number;
  /** podpis początku każdego przedziału (godzina:minuta, Europe/Warsaw) */
  labels: string[];
  values: Record<K, number[]>;
}

const STEPS_MIN = [1, 2, 5, 10, 15, 30, 60, 120];
const MAX_BUCKETS = 48;

/** Najmniejszy "okrągły" przedział, przy którym wychodzi nie więcej niż MAX_BUCKETS słupków. */
export function pickBucketMin(durationMs: number): number {
  const minutes = Math.max(durationMs, 0) / 60_000;
  return STEPS_MIN.find((s) => minutes / s <= MAX_BUCKETS) ?? STEPS_MIN[STEPS_MIN.length - 1];
}

export function buildTimeline<K extends string>(
  startMs: number,
  endMs: number,
  series: Record<K, TimedValue[]>,
): Timeline<K> {
  const bucketMin = pickBucketMin(endMs - startMs);
  const size = bucketMin * 60_000;
  const count = Math.max(1, Math.ceil((endMs - startMs) / size));
  const keys = Object.keys(series) as K[];
  const values = Object.fromEntries(keys.map((k) => [k, new Array<number>(count).fill(0)])) as Record<K, number[]>;
  for (const k of keys) {
    for (const p of series[k]) {
      const i = Math.floor((p.t - startMs) / size);
      if (i < 0) continue;
      values[k][Math.min(i, count - 1)] += p.v;
    }
  }
  const labels = Array.from({ length: count }, (_, i) => fmtTime(startMs + i * size));
  return { bucketMin, labels, values };
}