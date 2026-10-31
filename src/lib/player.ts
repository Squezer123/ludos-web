import { and, asc, eq, sql, type SQL } from "drizzle-orm";
import { getDb } from "../db/client";
import { characters, deaths, events, expGains, fights, sessions } from "../db/schema";
import { asObj, int, str } from "./normalize";
import { addDays, diffDays, eachDay, MAX_SPAN_DAYS, todayWarsaw, type ResolvedRange } from "./range";

// Raport pojedynczego gracza: agregaty w wybranym zakresie dat (albo za cały okres),
// rozkład godzinowy oraz szczegóły pojedynczej sesji. Dni i godziny liczymy w Europe/Warsaw.
// Strefa jest literałem (nie parametrem), bo Postgres musi uznać wyrażenie z SELECT i GROUP BY za to samo.

export const PLAYER_METRICS = ["xp", "kills", "killsPve", "killsPvp", "dmg", "fights"] as const;
export type PlayerMetric = (typeof PLAYER_METRICS)[number];

export type DayRange = Pick<ResolvedRange, "from" | "to">;

const TZ = sql.raw("'Europe/Warsaw'");
const dayOf = (col: SQL) => sql`to_char(${col} AT TIME ZONE ${TZ}, 'YYYY-MM-DD')`;
const hourOf = (col: SQL) => sql`extract(hour from ${col} AT TIME ZONE ${TZ})::int`;
const lo = (d: string) => sql`(${d}::date)::timestamp AT TIME ZONE ${TZ}`;
const hi = (d: string) => sql`((${d}::date) + 1)::timestamp AT TIME ZONE ${TZ}`;

/** Warunek zakresu dat na kolumnie `col` (nazwa z aliasem tabeli); bez zakresu - bez filtra. */
const within = (col: string, r: DayRange | null): SQL =>
  r ? sql`${sql.raw(col)} >= ${lo(r.from)} and ${sql.raw(col)} < ${hi(r.to)}` : sql`true`;

async function rows<T>(q: SQL): Promise<T[]> {
  const db = await getDb();
  return ((await db.execute(q)) as unknown as { rows: T[] }).rows;
}

const n = (v: unknown) => Number(v ?? 0);
const dt = (v: unknown) => (v == null ? null : new Date(v as string | number | Date));
const warsawDay = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Warsaw" }).format(d);

const COPPER_EXPR = sql`sum(case ev.type when 'ZLOTO' then coalesce((ev.data->>'miedz')::bigint, 0)
                                          else coalesce((ev.data->>'zloto')::bigint, 0) end)`;

// ---------------------------------------------------------------------------------------------
// raport gracza

export interface SessionRow {
  id: number;
  nr: number;
  startedAt: Date | null;
  endedAt: Date | null;
  lastTs: Date | null;
  state: string | null;
  reloads: number;
  exp: number;
  kills: number;
  killsPve: number;
  killsPvp: number;
  fights: number;
  dmg: number;
  deaths: number;
}

export interface DeathRowOut {
  ts: Date;
  level: number | null;
  zone: string | null;
  subzone: string | null;
  instance: string | null;
  killer: string | null;
  spell: string | null;
  damage: number | null;
  pvp: boolean;
  durability: number | null;
}

export interface PlayerReport {
  character: typeof characters.$inferSelect;
  /** dni na osi wykresu dziennego (przy "całość" - od pierwszej aktywności, maks. MAX_SPAN_DAYS) */
  chartDays: string[];
  chartTruncated: boolean;
  daily: Record<PlayerMetric, number[]>;
  /** 24 wartości: godziny 0-23 */
  hourly: Record<PlayerMetric, number[]>;
  totals: {
    exp: number;
    fights: number;
    kills: number;
    killsPve: number;
    killsPvp: number;
    fightSeconds: number;
    dmgDone: number;
    dmgTaken: number;
    healDone: number;
    healTaken: number;
    deaths: number;
    /** suma czasu sesji rozpoczętych w zakresie */
    sessionSeconds: number;
    sessions: number;
    /** złoto zebrane + nagrody z questów, w miedzi */
    copperEarned: number;
    lastGold: number | null;
  };
  expBySource: { source: string; amount: number }[];
  topMobs: { name: string; count: number }[];
  zones: { area: string; seconds: number }[];
  expCurve: { ts: Date; amount: number; source: string }[];
  sessions: SessionRow[];
  deaths: DeathRowOut[];
  loot: { ts: Date; itemId: number | null; name: string; qty: number; quality: number }[];
  quests: { ts: Date; name: string; exp: number; copper: number }[];
  questTotal: number;
}

/** Zakres osi wykresu dziennego. Przy braku zakresu ("całość") - od pierwszej aktywności do dziś, maks. rok wstecz. */
function chartRange(range: DayRange | null, firstSeen: Date | null): { r: DayRange; truncated: boolean } {
  if (range) return { r: { from: range.from, to: range.to }, truncated: false };
  const to = todayWarsaw();
  const from = firstSeen ? warsawDay(firstSeen) : addDays(to, -29);
  if (diffDays(from, to) + 1 > MAX_SPAN_DAYS) return { r: { from: addDays(to, -(MAX_SPAN_DAYS - 1)), to }, truncated: true };
  return { r: { from: from > to ? to : from, to }, truncated: false };
}

/** Czas spędzony w strefach (od wejścia do następnej zmiany strefy / końca sesji). */
function zonesQuery(characterId: number, range: DayRange | null, sessionId: number | null): SQL {
  return sql`
    with z as (
      select ev.ts,
             ev.data->>'strefa' as area,
             lead(ev.ts) over (partition by ev.session_id order by ev.ts, ev.n) as next_ts,
             coalesce(s.ended_at, (select max(x.ts) from events x where x.session_id = s.id)) as s_end
      from events ev join sessions s on s.id = ev.session_id
      where ev.character_id = ${characterId}
        and ev.type in ('ZALOGOWANIE', 'STREFA', 'WYLOGOWANIE')
        ${sessionId === null ? sql`` : sql`and ev.session_id = ${sessionId}`}
    )
    select area, sum(greatest(0, extract(epoch from (coalesce(next_ts, s_end) - ts))))::float as sec
    from z
    where area is not null and area <> '' and ${within("z.ts", range)}
    group by area order by sec desc limit 10`;
}

export async function getPlayerReport(id: number, range: DayRange | null): Promise<PlayerReport | null> {
  const db = await getDb();
  const [character] = await db.select().from(characters).where(eq(characters.id, id)).limit(1);
  if (!character) return null;

  const { r: cr, truncated } = chartRange(range, character.firstSeen);
  const chartDays = eachDay(cr.from, cr.to);
  const cid = sql`${id}`;

  type D = { d: string; v: string | number | null };
  type H = { h: number; v: string | number | null };
  type Day = Map<string, number>;
  const toDay = (r: D[]): Day => new Map(r.map((x) => [x.d, n(x.v)]));
  const fillDays = (m: Day) => chartDays.map((d) => m.get(d) ?? 0);
  const toHours = (r: H[]) => {
    const out = new Array<number>(24).fill(0);
    for (const x of r) if (x.h >= 0 && x.h < 24) out[x.h] = n(x.v);
    return out;
  };

  const [
    xpDay, killsDay, dmgDay, fightsDay,
    xpHour, killsHour, dmgHour, fightsHour,
    killsPveDay, killsPvpDay, killsPveHour, killsPvpHour,
    expAgg, fightAgg, deathCount, gold, lastGold,
    expBySource, topMobs, zones, expCurve, sessionRows, deathRows, lootRows, questRows,
  ] = await Promise.all([
    rows<D>(sql`select ${dayOf(sql`e.ts`)} as d, sum(e.amount) as v from exp_gains e
                where e.character_id = ${cid} and ${within("e.ts", cr)} group by 1`),
    rows<D>(sql`select ${dayOf(sql`f.started_at`)} as d, sum(f.kills) as v from fights f
                where f.character_id = ${cid} and ${within("f.started_at", cr)} group by 1`),
    rows<D>(sql`select ${dayOf(sql`f.started_at`)} as d, sum(f.dmg_done) as v from fights f
                where f.character_id = ${cid} and ${within("f.started_at", cr)} group by 1`),
    rows<D>(sql`select ${dayOf(sql`f.started_at`)} as d, count(*) as v from fights f
                where f.character_id = ${cid} and ${within("f.started_at", cr)} group by 1`),

    rows<H>(sql`select ${hourOf(sql`e.ts`)} as h, sum(e.amount) as v from exp_gains e
                where e.character_id = ${cid} and ${within("e.ts", range)} group by 1`),
    rows<H>(sql`select ${hourOf(sql`f.started_at`)} as h, sum(f.kills) as v from fights f
                where f.character_id = ${cid} and ${within("f.started_at", range)} group by 1`),
    rows<H>(sql`select ${hourOf(sql`f.started_at`)} as h, sum(f.dmg_done) as v from fights f
                where f.character_id = ${cid} and ${within("f.started_at", range)} group by 1`),
    rows<H>(sql`select ${hourOf(sql`f.started_at`)} as h, count(*) as v from fights f
                where f.character_id = ${cid} and ${within("f.started_at", range)} group by 1`),

    rows<D>(sql`select ${dayOf(sql`f.started_at`)} as d, sum(f.kills) as v from fights f
                where f.character_id = ${cid} and not f.pvp and ${within("f.started_at", cr)} group by 1`),
    rows<D>(sql`select ${dayOf(sql`f.started_at`)} as d, sum(f.kills) as v from fights f
                where f.character_id = ${cid} and f.pvp and ${within("f.started_at", cr)} group by 1`),
    rows<H>(sql`select ${hourOf(sql`f.started_at`)} as h, sum(f.kills) as v from fights f
                where f.character_id = ${cid} and not f.pvp and ${within("f.started_at", range)} group by 1`),
    rows<H>(sql`select ${hourOf(sql`f.started_at`)} as h, sum(f.kills) as v from fights f
                where f.character_id = ${cid} and f.pvp and ${within("f.started_at", range)} group by 1`),

    rows<{ total: string | number }>(sql`select coalesce(sum(e.amount), 0) as total from exp_gains e
                where e.character_id = ${cid} and ${within("e.ts", range)}`),
    rows<Record<string, string | number>>(sql`
      select count(*) as fights, coalesce(sum(f.kills), 0) as kills,
             coalesce(sum(f.kills) filter (where not f.pvp), 0) as kills_pve,
             coalesce(sum(f.kills) filter (where f.pvp), 0) as kills_pvp,
             coalesce(sum(f.seconds), 0) as seconds,
             coalesce(sum(f.dmg_done), 0) as dmg_done, coalesce(sum(f.dmg_taken), 0) as dmg_taken,
             coalesce(sum(f.heal_done), 0) as heal_done, coalesce(sum(f.heal_taken), 0) as heal_taken
      from fights f where f.character_id = ${cid} and ${within("f.started_at", range)}`),
    rows<{ c: string | number }>(sql`select count(*) as c from deaths d
                where d.character_id = ${cid} and ${within("d.ts", range)}`),
    rows<{ v: string | number | null }>(sql`select ${COPPER_EXPR} as v from events ev
                where ev.character_id = ${cid} and ev.type in ('ZLOTO', 'QUEST_ODDANY') and ${within("ev.ts", range)}`),
    rows<{ copper: string | number }>(sql`select g.copper from gold_points g
                where g.character_id = ${cid} and ${within("g.ts", range)} order by g.ts desc limit 1`),

    rows<{ source: string; v: string | number }>(sql`select e.source, sum(e.amount) as v from exp_gains e
                where e.character_id = ${cid} and ${within("e.ts", range)} group by 1 order by 2 desc`),
    rows<{ name: string; c: string | number }>(sql`
      select m.name, count(*) as c
      from events ev,
           jsonb_array_elements_text(case when jsonb_typeof(ev.data->'zabici') = 'array' then ev.data->'zabici' else '[]'::jsonb end) as m(name)
      where ev.character_id = ${cid} and ev.type = 'WALKA' and ${within("ev.ts", range)}
      group by 1 order by 2 desc, 1 limit 8`),
    rows<{ area: string; sec: number }>(zonesQuery(id, range, null)),
    rows<{ ts: Date | string; amount: number; source: string }>(sql`select e.ts, e.amount, e.source from exp_gains e
                where e.character_id = ${cid} and ${within("e.ts", range)} order by e.ts asc limit 20000`),

    rows<Record<string, unknown>>(sql`
      select s.id, s.nr, s.started_at, s.ended_at, s.state, s.reloads,
             (select max(x.ts) from events x where x.session_id = s.id) as last_ts,
             coalesce(xp.v, 0) as exp, coalesce(fi.kills, 0) as kills,
             coalesce(fi.kills_pve, 0) as kills_pve, coalesce(fi.kills_pvp, 0) as kills_pvp, coalesce(fi.n, 0) as fights,
             coalesce(fi.dmg, 0) as dmg, coalesce(de.c, 0) as deaths
      from sessions s
      left join (select ev.session_id, sum(e.amount) as v from exp_gains e join events ev on ev.id = e.event_id
                 where e.character_id = ${cid} group by 1) xp on xp.session_id = s.id
      left join (select ev.session_id, sum(f.kills) as kills,
                        sum(f.kills) filter (where not f.pvp) as kills_pve, sum(f.kills) filter (where f.pvp) as kills_pvp,
                        count(*) as n, sum(f.dmg_done) as dmg
                 from fights f join events ev on ev.id = f.event_id
                 where f.character_id = ${cid} group by 1) fi on fi.session_id = s.id
      left join (select ev.session_id, count(*) as c from deaths d join events ev on ev.id = d.event_id
                 where d.character_id = ${cid} group by 1) de on de.session_id = s.id
      where s.character_id = ${cid} and ${within("s.started_at", range)}
      order by s.started_at desc nulls last limit 200`),
    rows<Record<string, unknown>>(sql`
      select d.ts, d.level, d.zone, d.subzone, d.instance, d.killer, d.spell, d.damage, d.pvp, d.durability
      from deaths d where d.character_id = ${cid} and ${within("d.ts", range)} order by d.ts desc limit 100`),
    rows<{ ts: Date | string; data: unknown }>(sql`
      select ev.ts, ev.data from events ev
      where ev.character_id = ${cid} and ev.type = 'LOOT' and ev.data->>'ja' = 'true' and ${within("ev.ts", range)}
      order by ev.ts desc`),
    rows<{ ts: Date | string; data: unknown; total: string | number }>(sql`
      select ev.ts, ev.data, count(*) over () as total from events ev
      where ev.character_id = ${cid} and ev.type = 'QUEST_ODDANY' and ${within("ev.ts", range)}
      order by ev.ts desc limit 100`),
  ]);

  const f = fightAgg[0] ?? {};
  const sessionList: SessionRow[] = sessionRows.map((s) => ({
    id: n(s.id), nr: n(s.nr), startedAt: dt(s.started_at), endedAt: dt(s.ended_at), lastTs: dt(s.last_ts),
    state: (s.state as string | null) ?? null, reloads: n(s.reloads),
    exp: n(s.exp), kills: n(s.kills), killsPve: n(s.kills_pve), killsPvp: n(s.kills_pvp), fights: n(s.fights), dmg: n(s.dmg), deaths: n(s.deaths),
  }));

  return {
    character,
    chartDays,
    chartTruncated: truncated,
    daily: { xp: fillDays(toDay(xpDay)), kills: fillDays(toDay(killsDay)), killsPve: fillDays(toDay(killsPveDay)), killsPvp: fillDays(toDay(killsPvpDay)), dmg: fillDays(toDay(dmgDay)), fights: fillDays(toDay(fightsDay)) },
    hourly: { xp: toHours(xpHour), kills: toHours(killsHour), killsPve: toHours(killsPveHour), killsPvp: toHours(killsPvpHour), dmg: toHours(dmgHour), fights: toHours(fightsHour) },
    totals: {
      exp: n(expAgg[0]?.total),
      fights: n(f.fights), kills: n(f.kills), killsPve: n(f.kills_pve), killsPvp: n(f.kills_pvp), fightSeconds: n(f.seconds),
      dmgDone: n(f.dmg_done), dmgTaken: n(f.dmg_taken), healDone: n(f.heal_done), healTaken: n(f.heal_taken),
      deaths: n(deathCount[0]?.c),
      sessionSeconds: sessionList.reduce((a, s) => a + sessionSeconds(s), 0),
      sessions: sessionList.length,
      copperEarned: n(gold[0]?.v),
      lastGold: lastGold[0] ? n(lastGold[0].copper) : null,
    },
    expBySource: expBySource.map((x) => ({ source: x.source, amount: n(x.v) })),
    topMobs: topMobs.map((x) => ({ name: x.name, count: n(x.c) })),
    zones: zones.map((x) => ({ area: x.area, seconds: n(x.sec) })),
    expCurve: expCurve.map((x) => ({ ts: new Date(x.ts), amount: n(x.amount), source: x.source })),
    sessions: sessionList,
    deaths: deathRows.map((d) => ({
      ts: new Date(d.ts as string | Date), level: d.level == null ? null : n(d.level),
      zone: (d.zone as string | null) ?? null, subzone: (d.subzone as string | null) ?? null,
      instance: (d.instance as string | null) ?? null, killer: (d.killer as string | null) ?? null,
      spell: (d.spell as string | null) ?? null, damage: d.damage == null ? null : n(d.damage),
      pvp: d.pvp === true, durability: d.durability == null ? null : n(d.durability),
    })),
    loot: lootRows.map((r) => {
      const d = asObj(r.data);
      return { ts: new Date(r.ts), itemId: int(d.id), name: str(d.nazwa) ?? "?", qty: int(d.ile) ?? 1, quality: int(d.jakosc) ?? 1 };
    }),
    quests: questRows.map((r) => {
      const d = asObj(r.data);
      return { ts: new Date(r.ts), name: str(d.nazwa) ?? `#${int(d.id) ?? "?"}`, exp: int(d.exp) ?? 0, copper: int(d.zloto) ?? 0 };
    }),
    questTotal: n(questRows[0]?.total),
  };
}

/** Czas trwania sesji: koniec zapisany w sesji, a dla trwającej - ostatnie zdarzenie. */
export function sessionSeconds(s: Pick<SessionRow, "startedAt" | "endedAt" | "lastTs">): number {
  const end = s.endedAt ?? s.lastTs;
  return s.startedAt && end ? Math.max(0, (end.getTime() - s.startedAt.getTime()) / 1000) : 0;
}

// ---------------------------------------------------------------------------------------------
// szczegóły jednej sesji

export interface SessionDetail {
  character: typeof characters.$inferSelect;
  session: typeof sessions.$inferSelect;
  /** początek i koniec sesji (ms): zapisane w sesji, a w razie braku - pierwsze i ostatnie zdarzenie */
  startMs: number;
  endMs: number;
  prevNr: number | null;
  nextNr: number | null;
  exp: { ts: Date; amount: number; source: string; level: number | null }[];
  fights: (typeof fights.$inferSelect)[];
  deaths: (typeof deaths.$inferSelect)[];
  zones: { area: string; sub: string | null; ts: Date; seconds: number }[];
  /** czas w strefach, zsumowany */
  zoneTotals: { area: string; seconds: number }[];
  levelUps: { ts: Date; level: number }[];
  loot: { ts: Date; itemId: number | null; name: string; qty: number; quality: number }[];
  quests: { ts: Date; name: string; exp: number; copper: number }[];
  copperEarned: number;
  goldStart: number | null;
}

export async function getSessionDetail(characterId: number, nr: number): Promise<SessionDetail | null> {
  const db = await getDb();
  const [character] = await db.select().from(characters).where(eq(characters.id, characterId)).limit(1);
  if (!character) return null;
  const [session] = await db.select().from(sessions)
    .where(and(eq(sessions.characterId, characterId), eq(sessions.nr, nr))).limit(1);
  if (!session) return null;
  const sid = session.id;

  const [expRows, fightRows, deathRows, evRows, zoneTotals, prev, next] = await Promise.all([
    db.select({ ts: expGains.ts, amount: expGains.amount, source: expGains.source, level: expGains.level })
      .from(expGains).innerJoin(events, eq(events.id, expGains.eventId))
      .where(eq(events.sessionId, sid)).orderBy(asc(expGains.ts)),
    db.select({ f: fights }).from(fights).innerJoin(events, eq(events.id, fights.eventId))
      .where(eq(events.sessionId, sid)).orderBy(asc(fights.startedAt)),
    db.select({ d: deaths }).from(deaths).innerJoin(events, eq(events.id, deaths.eventId))
      .where(eq(events.sessionId, sid)).orderBy(asc(deaths.ts)),
    db.select({ n: events.n, ts: events.ts, type: events.type, data: events.data }).from(events)
      .where(eq(events.sessionId, sid)).orderBy(asc(events.ts), asc(events.n)),
    rows<{ area: string; sec: number }>(zonesQuery(characterId, null, sid)),
    rows<{ nr: number }>(sql`select nr from sessions where character_id = ${characterId} and nr < ${nr} order by nr desc limit 1`),
    rows<{ nr: number }>(sql`select nr from sessions where character_id = ${characterId} and nr > ${nr} order by nr asc limit 1`),
  ]);

  const firstEv = evRows[0]?.ts ?? null;
  const lastEv = evRows[evRows.length - 1]?.ts ?? null;
  const startMs = (session.startedAt ?? firstEv)?.getTime() ?? Date.now();
  const endMs = Math.max((session.endedAt ?? lastEv)?.getTime() ?? startMs, startMs);

  // ścieżka po strefach: kolejne wejścia (ZALOGOWANIE / STREFA), czas do następnej zmiany lub końca sesji
  const zoneEvents = evRows
    .filter((e) => e.type === "ZALOGOWANIE" || e.type === "STREFA")
    .map((e) => { const d = asObj(e.data); return { ts: e.ts, area: str(d.strefa), sub: str(d.pod) }; })
    .filter((e): e is { ts: Date; area: string; sub: string | null } => e.area !== null);
  const path: SessionDetail["zones"] = [];
  zoneEvents.forEach((z, i) => {
    const nextTs = zoneEvents[i + 1]?.ts.getTime() ?? endMs;
    const seconds = Math.max(0, (nextTs - z.ts.getTime()) / 1000);
    const last = path[path.length - 1];
    if (last && last.area === z.area) last.seconds += seconds; // ta sama strefa po reloadzie / przejściu podstrefy
    else path.push({ area: z.area, sub: z.sub, ts: z.ts, seconds });
  });

  const levelUps: SessionDetail["levelUps"] = [];
  const loot: SessionDetail["loot"] = [];
  const quests: SessionDetail["quests"] = [];
  let copper = 0;
  for (const e of evRows) {
    const d = asObj(e.data);
    if (e.type === "AWANS") { const l = int(d.lvl); if (l !== null) levelUps.push({ ts: e.ts, level: l }); }
    else if (e.type === "LOOT" && d.ja === true) loot.push({ ts: e.ts, itemId: int(d.id), name: str(d.nazwa) ?? "?", qty: int(d.ile) ?? 1, quality: int(d.jakosc) ?? 1 });
    else if (e.type === "QUEST_ODDANY") {
      const c = int(d.zloto) ?? 0;
      copper += c;
      quests.push({ ts: e.ts, name: str(d.nazwa) ?? `#${int(d.id) ?? "?"}`, exp: int(d.exp) ?? 0, copper: c });
    } else if (e.type === "ZLOTO") copper += int(d.miedz) ?? 0;
  }

  const goldStartEv = evRows.find((e) => e.type === "ZLOTO_STAN" && asObj(e.data).kiedy === "start");
  const gs = goldStartEv ? int(asObj(goldStartEv.data).miedz) : null;

  return {
    character, session, startMs, endMs,
    prevNr: prev[0] ? n(prev[0].nr) : null,
    nextNr: next[0] ? n(next[0].nr) : null,
    exp: expRows,
    fights: fightRows.map((r) => r.f),
    deaths: deathRows.map((r) => r.d),
    zones: path,
    zoneTotals: zoneTotals.map((z) => ({ area: z.area, seconds: n(z.sec) })),
    levelUps, loot, quests, copperEarned: copper, goldStart: gs,
  };
}