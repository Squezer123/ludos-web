import { sql, type SQL } from "drizzle-orm";
import { getDb } from "../db/client";
import { addDays, eachDay, type ResolvedRange } from "./range";

// Widok gildii: agregaty dzienne po postaciach, których `characters.guild` = nazwa gildii.
// Dni liczymy w Europe/Warsaw. Strefa jest literałem (nie parametrem), bo Postgres musi
// rozpoznać wyrażenie z SELECT i GROUP BY jako to samo.

export const METRICS = ["xp", "gold", "kills", "killsPve", "killsPvp", "active"] as const;
export type Metric = (typeof METRICS)[number];

const TZ = sql.raw("'Europe/Warsaw'");
const day = (col: SQL) => sql`to_char(${col} AT TIME ZONE ${TZ}, 'YYYY-MM-DD')`;
const lo = (d: string) => sql`(${d}::date)::timestamp AT TIME ZONE ${TZ}`;
const hi = (d: string) => sql`((${d}::date) + 1)::timestamp AT TIME ZONE ${TZ}`;

async function rows<T>(q: SQL): Promise<T[]> {
  const db = await getDb();
  return ((await db.execute(q)) as unknown as { rows: T[] }).rows;
}

type DayRow = { d: string; v: string | number | null };
type KillDayRow = { d: string; pve: string | number | null; pvp: string | number | null };
const toMap = (r: DayRow[]) => new Map(r.map((x) => [x.d, Number(x.v ?? 0)]));

/** Filtr postaci: po gildii, a gdy dane nie mają gildii (addon jej jeszcze nie zapisuje) - wszystkie postacie. */
const inGuild = (guild: string | null) => (guild ? sql`c.guild = ${guild}` : sql`true`);

const ACTIVITY = sql`(select character_id, ts from exp_gains union all select character_id, started_at from fights)`;

async function activeIn(guild: string | null, from: string, to: string): Promise<number> {
  const r = await rows<{ v: string | number }>(sql`
    select count(distinct a.character_id) as v
    from ${ACTIVITY} a join characters c on c.id = a.character_id
    where ${inGuild(guild)} and a.ts >= ${lo(from)} and a.ts < ${hi(to)}`);
  return Number(r[0]?.v ?? 0);
}

export interface Stat {
  value: number;
  prev: number;
  /** (value - prev) / prev; null, gdy poprzedni okres jest pusty */
  delta: number | null;
  spark: number[];
}

export interface GuildOverview {
  days: string[];
  /** wartości dzienne w zakresie; złoto w miedzi */
  series: Record<Metric, number[]>;
  stats: Record<Metric, Stat>;
}

const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
const delta = (v: number, p: number) => (p > 0 ? (v - p) / p : null);

export async function getGuildOverview(guild: string | null, range: ResolvedRange): Promise<GuildOverview | null> {
  const [exists] = await rows<{ c: string | number }>(sql`select count(*) as c from characters c where ${inGuild(guild)}`);
  if (!exists || Number(exists.c) === 0) return null;

  const { from, to, days: n, prevFrom } = range;
  const span = (alias: string) => sql`${sql.raw(alias)} >= ${lo(prevFrom)} and ${sql.raw(alias)} < ${hi(to)}`;

  const [xp, killRows, gold, active, active7, active7Prev] = await Promise.all([
    rows<DayRow>(sql`
      select ${day(sql`e.ts`)} as d, sum(e.amount) as v
      from exp_gains e join characters c on c.id = e.character_id
      where ${inGuild(guild)} and ${span("e.ts")} group by 1`),
    // PvE / PvP wg flagi `pvp` walki (addon nie zapisuje typu pojedynczego zabójstwa)
    rows<KillDayRow>(sql`
      select ${day(sql`f.started_at`)} as d,
             coalesce(sum(f.kills) filter (where not f.pvp), 0) as pve,
             coalesce(sum(f.kills) filter (where f.pvp), 0) as pvp
      from fights f join characters c on c.id = f.character_id
      where ${inGuild(guild)} and ${span("f.started_at")} group by 1`),
    // złoto = zebrane z ziemi/potworów (ZLOTO.miedz) + nagrody z questów (QUEST_ODDANY.zloto), w miedzi
    rows<DayRow>(sql`
      select ${day(sql`ev.ts`)} as d,
             sum(case ev.type when 'ZLOTO' then coalesce((ev.data->>'miedz')::bigint, 0)
                              else coalesce((ev.data->>'zloto')::bigint, 0) end) as v
      from events ev join characters c on c.id = ev.character_id
      where ${inGuild(guild)} and ev.type in ('ZLOTO', 'QUEST_ODDANY') and ${span("ev.ts")} group by 1`),
    rows<DayRow>(sql`
      select ${day(sql`a.ts`)} as d, count(distinct a.character_id) as v
      from ${ACTIVITY} a join characters c on c.id = a.character_id
      where ${inGuild(guild)} and ${span("a.ts")} group by 1`),
    activeIn(guild, addDays(to, -6), to),
    activeIn(guild, addDays(to, -13), addDays(to, -7)),
  ]);

  const all = eachDay(prevFrom, to); // 2n dni: poprzedni okres, potem bieżący
  const fill = (m: Map<string, number>) => all.map((d) => m.get(d) ?? 0);
  const killsPve = fill(toMap(killRows.map((r) => ({ d: r.d, v: r.pve }))));
  const killsPvp = fill(toMap(killRows.map((r) => ({ d: r.d, v: r.pvp }))));
  const full: Record<Metric, number[]> = {
    xp: fill(toMap(xp)), gold: fill(toMap(gold)),
    kills: killsPve.map((v, i) => v + killsPvp[i]), killsPve, killsPvp,
    active: fill(toMap(active)),
  };

  const cur = (a: number[]) => a.slice(-n);
  const prv = (a: number[]) => a.slice(0, a.length - n);
  const total = (m: Metric): Stat => {
    const v = sum(cur(full[m])), p = sum(prv(full[m]));
    return { value: v, prev: p, delta: delta(v, p), spark: cur(full[m]) };
  };

  return {
    days: all.slice(-n),
    series: {
      xp: cur(full.xp), gold: cur(full.gold), kills: cur(full.kills),
      killsPve: cur(full.killsPve), killsPvp: cur(full.killsPvp), active: cur(full.active),
    },
    stats: {
      xp: total("xp"),
      gold: total("gold"),
      kills: total("kills"),
      killsPve: total("killsPve"),
      killsPvp: total("killsPvp"),
      // "aktywni (7d)": unikalni gracze z ostatnich 7 dni zakresu, a nie suma dziennych
      active: { value: active7, prev: active7Prev, delta: delta(active7, active7Prev), spark: cur(full.active) },
    },
  };
}

export async function listGuilds() {
  return rows<{ guild: string; members: string | number }>(sql`
    select guild, count(*) as members from characters
    where guild is not null and guild <> '' group by guild order by 2 desc, 1`).then((r) =>
    r.map((x) => ({ name: x.guild, members: Number(x.members) })),
  );
}

/** Kiedy ostatnio wgrano dane (ostatni import) - do "Ostatnia synchronizacja". */
export async function lastSync(): Promise<Date | null> {
  const [r] = await rows<{ t: string | Date | null }>(sql`select max(uploaded_at) as t from imports`);
  return r?.t ? new Date(r.t) : null;
}

/**
 * Aplikacja obsługuje jedną gildię.
 * - `name`: nazwa do wyświetlenia (`GUILD_NAME`, inaczej gildia z największą liczbą postaci, inaczej napis zastępczy),
 * - `filter`: nazwa do filtrowania `characters.guild`, albo null, gdy w danych nie ma takiej gildii
 *   (wtedy widok liczy po wszystkich postaciach w bazie).
 */
export async function resolveGuild(): Promise<{ name: string; filter: string | null }> {
  const guilds = await listGuilds();
  const fixed = process.env.GUILD_NAME?.trim();
  if (fixed) return { name: fixed, filter: guilds.some((g) => g.name === fixed) ? fixed : null };
  if (guilds[0]) return { name: guilds[0].name, filter: guilds[0].name };
  return { name: "Twoja gildia", filter: null };
}

/** Czy w bazie są jakiekolwiek postacie (do pustego stanu). */
export async function hasCharacters(): Promise<boolean> {
  const [r] = await rows<{ c: string | number }>(sql`select count(*) as c from characters`);
  return Number(r?.c ?? 0) > 0;
}

export interface GuildMember {
  id: number;
  name: string;
  realm: string;
  class: string | null;
  level: number | null;
  lastSeen: string | Date | null;
}

/** Lista wszystkich postaci zaimportowanych do bazy — bez filtrowania po gildii. */
export async function listMembers(): Promise<GuildMember[]> {
  return rows<GuildMember>(sql`
    select id, name, realm, class, level, last_seen as "lastSeen"
    from characters
    order by name asc
  `);
}


export interface RecentGuildEvent {
  id: number;
  character: string;
  class: string | null;
  type: string;
  data: Record<string, unknown> | null;
  ts: string | Date;
}

/** Ważne zdarzenia: awanse, śmierci, PvP (jeśli log zawiera jawny znacznik) i łupy Rare+. */
export async function listRecentEvents(limit = 12): Promise<RecentGuildEvent[]> {
  return rows<RecentGuildEvent>(sql`
    select ev.id, c.name as character, c.class, ev.type, ev.data, ev.ts
    from events ev
    join characters c on c.id = ev.character_id
    where
      ev.type in ('AWANS', 'SMIERC')
      or (
        ev.type = 'LOOT'
        and coalesce(ev.data->>'ja', 'true') <> 'false'
        and coalesce(ev.data->>'jakosc', '0') ~ '^[0-9]+$'
        and (ev.data->>'jakosc')::integer >= 3
      )
      or (
        ev.type = 'WALKA'
        and lower(coalesce(ev.data->>'pvp', ev.data->>'PvP', 'false')) = 'true'
      )
    order by ev.ts desc, ev.id desc
    limit ${limit}
  `);
}

export interface ClassCount { name: string; count: number }

/** Rozkład klas wszystkich zaimportowanych postaci, niezależnie od gildii. */
export async function getClassCounts(): Promise<ClassCount[]> {
  const result = await rows<{ name: string; count: string | number }>(sql`
    select coalesce(nullif(trim(class), ''), 'Nieznana') as name, count(*) as count
    from characters
    group by 1
    order by count(*) desc, name asc
  `);
  return result.map((r) => ({ name: r.name, count: Number(r.count) }));
}


export interface GuildRankingRow {
  id: number;
  name: string;
  class: string | null;
  level: number | null;
  xp: number;
  kills: number;
  killsPve: number;
  killsPvp: number;
  playedSeconds: number;
  copper: number;
}

/** Agregaty do rankingów postaci w wybranej gildii. */
export async function getGuildRankings(guild: string | null): Promise<GuildRankingRow[]> {
  return rows<GuildRankingRow>(sql`
    select
      c.id, c.name, c.class, c.level,
      coalesce(x.total, 0)::bigint as xp,
      coalesce(k.pve, 0)::bigint + coalesce(k.pvp, 0)::bigint as kills,
      coalesce(k.pve, 0)::bigint as "killsPve",
      coalesce(k.pvp, 0)::bigint as "killsPvp",
      coalesce(c.played_seconds, 0)::bigint as "playedSeconds",
      coalesce(g.total, 0)::bigint as copper
    from characters c
    left join (
      select character_id, sum(amount) as total
      from exp_gains group by character_id
    ) x on x.character_id = c.id
    left join (
      select character_id,
             sum(kills) filter (where not pvp) as pve,
             sum(kills) filter (where pvp) as pvp
      from fights group by character_id
    ) k on k.character_id = c.id
    left join (
      select character_id,
        sum(case type when 'ZLOTO' then coalesce((data->>'miedz')::bigint, 0)
                      else coalesce((data->>'zloto')::bigint, 0) end) as total
      from events where type in ('ZLOTO', 'QUEST_ODDANY')
      group by character_id
    ) g on g.character_id = c.id
    where ${inGuild(guild)}
    order by c.name asc
  `).then((result) => result.map((r) => ({
    ...r,
    id: Number(r.id), level: r.level == null ? null : Number(r.level),
    xp: Number(r.xp), kills: Number(r.kills), killsPve: Number(r.killsPve), killsPvp: Number(r.killsPvp), playedSeconds: Number(r.playedSeconds), copper: Number(r.copper),
  })));
}

export interface GuildProfessionRankingRow {
  id: number;
  name: string;
  class: string | null;
  profession: string;
  level: number;
  maxLevel: number | null;
}

// Nazwy profesji obsługiwanych w klasycznym WoW; pomijamy umiejętności broni,
// obronę, zaklęcia i inne wpisy UMIEJETNOSC, które nie są profesjami.
const PROFESSION_NAMES = [
  "Alchemy", "Blacksmithing", "Enchanting", "Engineering", "Herbalism",
  "Leatherworking", "Mining", "Skinning", "Tailoring", "Cooking",
  "First Aid", "Fishing",
  "Alchemia", "Kowalstwo", "Zaklinanie", "Inżynieria", "Zielarstwo",
  "Kaletnictwo", "Górnictwo", "Garbarstwo", "Krawiectwo", "Gotowanie",
  "Pierwsza pomoc", "Wędkarstwo",
];

/** Ostatni zarejestrowany poziom profesji każdej postaci w wybranej gildii. */
export async function getGuildProfessionRankings(guild: string | null): Promise<GuildProfessionRankingRow[]> {
  const names = sql.join(PROFESSION_NAMES.map((name) => sql`${name}`), sql`, `);
  return rows<GuildProfessionRankingRow>(sql`
    select distinct on (e.character_id, e.data->>'nazwa')
      c.id, c.name, c.class,
      e.data->>'nazwa' as profession,
      coalesce(nullif(e.data->>'na', '')::integer, 0) as level,
      nullif(e.data->>'max', '')::integer as "maxLevel"
    from events e
    join characters c on c.id = e.character_id
    where ${inGuild(guild)}
      and e.type = 'UMIEJETNOSC'
      and e.data->>'nazwa' in (${names})
    order by e.character_id, e.data->>'nazwa', e.ts desc, e.id desc
  `).then((result) => result.map((r) => ({
    ...r,
    id: Number(r.id),
    level: Number(r.level ?? 0),
    maxLevel: r.maxLevel == null ? null : Number(r.maxLevel),
  })));
}
