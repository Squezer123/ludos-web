import { and, asc, desc, eq, sql } from "drizzle-orm";
import { getDb } from "../db/client";
import { characters, deaths, events, expGains, fights, goldPoints, sessions } from "../db/schema";
import { asObj, int, str } from "./normalize";

export async function listCharacters() {
  const db = await getDb();
  const [chars, exp, dth, ftr, ses] = await Promise.all([
    db.select().from(characters).orderBy(desc(characters.lastSeen)),
    db.select({ id: expGains.characterId, total: sql<string>`coalesce(sum(${expGains.amount}), 0)` })
      .from(expGains).groupBy(expGains.characterId),
    db.select({ id: deaths.characterId, c: sql<string>`count(*)` }).from(deaths).groupBy(deaths.characterId),
    db.select({ id: fights.characterId, kills: sql<string>`coalesce(sum(${fights.kills}), 0)` })
      .from(fights).groupBy(fights.characterId),
    db.select({ id: sessions.characterId, c: sql<string>`count(*)` }).from(sessions).groupBy(sessions.characterId),
  ]);
  const by = (rows: { id: number }[], f: (r: any) => string) => new Map(rows.map((r) => [r.id, Number(f(r))]));
  const expBy = by(exp, (r) => r.total), dthBy = by(dth, (r) => r.c), kBy = by(ftr, (r) => r.kills), sBy = by(ses, (r) => r.c);
  return chars.map((c) => ({
    ...c,
    exp: expBy.get(c.id) ?? 0,
    deaths: dthBy.get(c.id) ?? 0,
    kills: kBy.get(c.id) ?? 0,
    sessions: sBy.get(c.id) ?? 0,
  }));
}

export async function getCharacterDetail(id: number) {
  const db = await getDb();
  const [character] = await db.select().from(characters).where(eq(characters.id, id)).limit(1);
  if (!character) return null;

  const [ses, expRows, deathRows, fightRows, goldRows, lootRows, questRows, walkaRows] = await Promise.all([
    db.select().from(sessions).where(eq(sessions.characterId, id)).orderBy(asc(sessions.nr)),
    db.select().from(expGains).where(eq(expGains.characterId, id)).orderBy(asc(expGains.ts)),
    db.select().from(deaths).where(eq(deaths.characterId, id)).orderBy(desc(deaths.ts)),
    db.select().from(fights).where(eq(fights.characterId, id)).orderBy(asc(fights.startedAt)),
    db.select().from(goldPoints).where(eq(goldPoints.characterId, id)).orderBy(asc(goldPoints.ts)),
    db.select({ ts: events.ts, data: events.data }).from(events)
      .where(and(eq(events.characterId, id), eq(events.type, "LOOT"))).orderBy(desc(events.ts)).limit(200),
    db.select({ ts: events.ts, data: events.data }).from(events)
      .where(and(eq(events.characterId, id), eq(events.type, "QUEST_ODDANY"))).orderBy(desc(events.ts)),
    db.select({ data: events.data }).from(events)
      .where(and(eq(events.characterId, id), eq(events.type, "WALKA"))),
  ]);

  // ranking ubitych mobów z podsumowań walk (addon zapisuje do 10 nazw na walkę)
  const killCount = new Map<string, number>();
  for (const w of walkaRows) {
    const z = asObj(w.data).zabici;
    if (Array.isArray(z)) for (const name of z) if (typeof name === "string") killCount.set(name, (killCount.get(name) ?? 0) + 1);
  }
  const topMobs = [...killCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);

  const loot = lootRows
    .map((r) => ({ ts: r.ts, d: asObj(r.data) }))
    .filter((r) => r.d.ja === true)
    .slice(0, 12)
    .map((r) => ({ ts: r.ts, name: str(r.d.nazwa) ?? "?", qty: int(r.d.ile) ?? 1, quality: int(r.d.jakosc) ?? 1 }));

  const quests = questRows.map((r) => {
    const d = asObj(r.data);
    return { ts: r.ts, name: str(d.nazwa) ?? `#${int(d.id) ?? "?"}`, exp: int(d.exp) ?? 0, copper: int(d.zloto) ?? 0 };
  });

  return { character, sessions: ses, exp: expRows, deaths: deathRows, fights: fightRows, gold: goldRows, topMobs, loot, quests };
}
