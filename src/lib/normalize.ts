import type { LuaValue } from "./lua.ts";

export type Obj = { [k: string]: LuaValue };

/** Pusta tabela Lua parsuje się do [], a w polu `d` oznacza po prostu brak danych. */
export function asObj(v: unknown): Obj {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {};
}

export const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
export const int = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? Math.round(v) : null;
export const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
export const date = (sec: unknown): Date | null => {
  const n = int(sec);
  return n && n > 0 ? new Date(n * 1000) : null;
};

export interface RawEvent {
  n: number;
  ts: Date;
  type: string;
  data: Obj;
}

/** Wyciąga poprawne wiersze dziennika; pomija uszkodzone (bez n / e / t). */
export function readEvents(dziennik: unknown): RawEvent[] {
  if (!Array.isArray(dziennik)) return [];
  const out: RawEvent[] = [];
  for (const row of dziennik) {
    const r = asObj(row);
    const n = int(r.n);
    const ts = date(r.t);
    const type = str(r.e);
    if (n === null || !ts || !type) continue;
    out.push({ n, ts, type, data: asObj(r.d) });
  }
  return out;
}
