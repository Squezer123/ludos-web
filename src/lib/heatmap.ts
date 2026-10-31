import { sql } from "drizzle-orm";
import { getDb } from "../db/client";

export type HeatmapEvent = {
  session_id: number;
  character_id: number;
  character_name: string;
  n: number;
  ts: Date | string;
  type: string;
  data: Record<string, unknown> | null;
};

export type HeatmapZone = {
  zone: string;
  continent: "Eastern Kingdoms" | "Kalimdor" | "Other";
  activity: number;
  deaths: number;
  players: number;
  lastSeen: string;
};

const EASTERN_KINGDOMS = new Set([
  "Alterac Mountains", "Arathi Highlands", "Badlands", "Blasted Lands", "Burning Steppes",
  "Deadwind Pass", "Dun Morogh", "Duskwood", "Eastern Plaguelands", "Elwynn Forest",
  "Eversong Woods", "Ghostlands", "Hillsbrad Foothills", "Loch Modan", "Redridge Mountains",
  "Searing Gorge", "Silverpine Forest", "Stranglethorn Vale", "Swamp of Sorrows",
  "The Hinterlands", "Tirisfal Glades", "Western Plaguelands", "Westfall", "Wetlands",
  "Isle of Quel'Danas", "Northern Stranglethorn", "The Cape of Stranglethorn",
]);
const KALIMDOR = new Set([
  "Ashenvale", "Azshara", "Azuremyst Isle", "Bloodmyst Isle", "Darkshore", "Desolace",
  "Durotar", "Dustwallow Marsh", "Felwood", "Feralas", "Moonglade", "Mulgore",
  "Northern Barrens", "Southern Barrens", "Silithus", "Stonetalon Mountains",
  "Tanaris", "Teldrassil", "The Barrens", "Thousand Needles", "Un'Goro Crater",
  "Winterspring", "Mount Hyjal", "Uldum", "Ahn'Qiraj",
]);

function continentFor(zone: string): HeatmapZone["continent"] {
  if (EASTERN_KINGDOMS.has(zone)) return "Eastern Kingdoms";
  if (KALIMDOR.has(zone)) return "Kalimdor";
  return "Other";
}

const meaningfulTypes = new Set([
  "EXP", "WALKA", "LOOT", "QUEST_ODDANY", "QUEST_PRZYJETY", "ZLOTO", "ZLOTO_STAN",
  "SMIERC", "AWANS", "REPUTACJA", "UMIEJETNOSC",
]);

function localHour(value: Date | string): number {
  const date = value instanceof Date ? value : new Date(value);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Warsaw", hour: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  return Number(parts.find((p) => p.type === "hour")?.value ?? 0);
}

function localDay(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Warsaw", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const part = (name: string) => parts.find((p) => p.type === name)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function dateLabel(value: Date | string): string {
  return new Intl.DateTimeFormat("pl-PL", {
    timeZone: "Europe/Warsaw", dateStyle: "short", timeStyle: "short",
  }).format(value instanceof Date ? value : new Date(value));
}

export async function getHeatmapData(options: {
  from: string;
  to: string;
  hourFrom: number;
  hourTo: number;
  characterId: number | null;
}) {
  const db = await getDb();
  const charFilter = options.characterId === null ? sql`true` : sql`e.character_id = ${options.characterId}`;
  const start = sql`(${options.from}::date)::timestamp AT TIME ZONE 'Europe/Warsaw'`;
  const end = sql`((${options.to}::date + 1)::timestamp AT TIME ZONE 'Europe/Warsaw')`;

  const result = await db.execute(sql`
    WITH selected AS (
      SELECT e.session_id, e.character_id, c.name AS character_name, e.n, e.ts, e.type, e.data
      FROM events e
      JOIN characters c ON c.id = e.character_id
      WHERE ${charFilter}
    ),
    prior_zone AS (
      SELECT DISTINCT ON (session_id) session_id, character_id, character_name, n, ts, type, data
      FROM selected
      WHERE ts < ${start} AND type IN ('STREFA', 'PODSTREFA')
      ORDER BY session_id, ts DESC, n DESC
    ),
    ranged AS (
      SELECT session_id, character_id, character_name, n, ts, type, data
      FROM selected
      WHERE ts >= ${start} AND ts < ${end}
    )
    SELECT * FROM prior_zone
    UNION ALL
    SELECT * FROM ranged
    ORDER BY session_id, ts, n
  `);
  const rows = (result as unknown as { rows: HeatmapEvent[] }).rows ?? [];
  const zoneBySession = new Map<number, string>();
  const subzoneBySession = new Map<number, string>();
  const grouped = new Map<string, { activity: number; deaths: number; players: Set<number>; lastSeen: string; continent: HeatmapZone["continent"] }>();

  for (const row of rows) {
    const d = (row.data ?? {}) as Record<string, unknown>;
    const isZoneMarker = row.type === "STREFA" || row.type === "PODSTREFA";
    const eventDate = row.ts instanceof Date ? row.ts : new Date(row.ts);
    const day = localDay(eventDate);
    const inRange = day >= options.from && day <= options.to;
    if (isZoneMarker) {
      const zone = typeof d.strefa === "string" ? d.strefa : "";
      const sub = typeof d.pod === "string" ? d.pod : "";
      if (zone) zoneBySession.set(row.session_id, zone);
      if (sub) subzoneBySession.set(row.session_id, sub);
      continue;
    }
    if (!inRange || !meaningfulTypes.has(row.type)) continue;
    const hour = localHour(eventDate);
    const withinHours = options.hourFrom <= options.hourTo
      ? hour >= options.hourFrom && hour <= options.hourTo
      : hour >= options.hourFrom || hour <= options.hourTo;
    if (!withinHours) continue;

    const eventZone = typeof d.strefa === "string" && d.strefa ? d.strefa : zoneBySession.get(row.session_id);
    if (!eventZone) continue;
    const zone = eventZone;
    const continent = continentFor(zone);
    const current = grouped.get(zone) ?? { activity: 0, deaths: 0, players: new Set<number>(), lastSeen: "", continent };
    current.activity++;
    if (row.type === "SMIERC") current.deaths++;
    current.players.add(row.character_id);
    const stamp = eventDate.toISOString();
    if (!current.lastSeen || stamp > current.lastSeen) current.lastSeen = stamp;
    grouped.set(zone, current);
  }

  const zones: HeatmapZone[] = [...grouped.entries()]
    .map(([zone, v]) => ({
      zone, continent: v.continent, activity: v.activity, deaths: v.deaths,
      players: v.players.size, lastSeen: v.lastSeen ? dateLabel(v.lastSeen) : "—",
    }))
    .sort((a, b) => b.activity - a.activity);

  const charsResult = await db.execute(sql`
    SELECT id, name, realm FROM characters ORDER BY name
  `);
  const characters = ((charsResult as unknown as { rows: { id: number; name: string; realm: string }[] }).rows ?? []);
  return { zones, characters };
}
