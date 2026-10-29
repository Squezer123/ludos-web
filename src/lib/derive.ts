import { date, int, num, str, type RawEvent } from "./normalize.ts";

// Czysta logika (bez bazy): z surowych zdarzeń robi wiersze tabel pochodnych.
// Klucz `n` wiąże wiersz pochodny ze zdarzeniem; importer podmienia go na event_id.

export interface ExpRow { n: number; ts: Date; amount: number; source: string; level: number | null }
export interface DeathRow {
  n: number; ts: Date; level: number | null; zone: string | null; subzone: string | null;
  killer: string | null; spell: string | null; damage: number | null; overkill: number | null;
  pvp: boolean; instance: string | null; x: number | null; y: number | null;
  durability: number | null; hits: unknown;
}
export interface FightRow {
  n: number; startedAt: Date; endedAt: Date | null; seconds: number; dmgDone: number; dmgTaken: number;
  healDone: number; healTaken: number; kills: number; targets: string | null; died: boolean; pvp: boolean;
}
export interface GoldRow { n: number; ts: Date; copper: number }

export interface Derived {
  exp: ExpRow[];
  deaths: DeathRow[];
  fights: FightRow[];
  gold: GoldRow[];
}

export function derive(events: RawEvent[]): Derived {
  const out: Derived = { exp: [], deaths: [], fights: [], gold: [] };
  for (const e of events) {
    const d = e.data;
    switch (e.type) {
      case "EXP": {
        const amount = int(d.ile);
        if (amount === null || amount <= 0) break;
        out.exp.push({ n: e.n, ts: e.ts, amount, source: str(d.zrodlo) ?? "inne", level: int(d.lvl) });
        break;
      }
      case "SMIERC":
        out.deaths.push({
          n: e.n, ts: e.ts, level: int(d.lvl), zone: str(d.strefa), subzone: str(d.pod),
          killer: str(d.zabojca), spell: str(d.czar), damage: int(d.obrazenia), overkill: int(d.overkill),
          pvp: d.pvp === true, instance: str(d.instancja), x: num(d.x), y: num(d.y),
          durability: int(d.wytrzymalosc), hits: Array.isArray(d.trafienia) ? d.trafienia : null,
        });
        break;
      case "WALKA":
        out.fights.push({
          n: e.n,
          startedAt: date(d.start) ?? e.ts,
          endedAt: date(d.koniec),
          seconds: int(d.sek) ?? 0,
          dmgDone: int(d.zadane) ?? 0,
          dmgTaken: int(d.otrzymane) ?? 0,
          healDone: int(d.lecz_z) ?? 0,
          healTaken: int(d.lecz_o) ?? 0,
          kills: int(d.zabici_ile) ?? 0,
          targets: str(d.cele),
          died: d.smierc === true,
          pvp: d.pvp === true,
        });
        break;
      case "ZLOTO_STAN": {
        // Wpisy "koniec" są zawsze 0: addon czyta GetMoney() w PLAYER_LOGOUT, gdy gra już zwraca 0.
        const copper = int(d.miedz);
        if (d.kiedy === "start" && copper !== null) out.gold.push({ n: e.n, ts: e.ts, copper });
        break;
      }
    }
  }
  return out;
}

/** Najwyższy poziom widziany w wiarygodnych zdarzeniach (WYLOGOWANIE.lvl bywa błędne). */
export function maxLevel(events: RawEvent[]): number | null {
  let best: number | null = null;
  for (const e of events) {
    if (e.type !== "ZALOGOWANIE" && e.type !== "AWANS" && e.type !== "EXP" && e.type !== "SMIERC") continue;
    const l = int(e.data.lvl);
    if (l !== null && (best === null || l > best)) best = l;
  }
  return best;
}

export function maxPlayed(events: RawEvent[]): number | null {
  let best: number | null = null;
  for (const e of events) {
    if (e.type !== "PLAYED") continue;
    const p = int(e.data.lacznie);
    if (p !== null && (best === null || p > best)) best = p;
  }
  return best;
}
