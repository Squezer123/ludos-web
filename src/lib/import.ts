import { createHash } from "node:crypto";
import { eq, inArray, sql } from "drizzle-orm";
import { getDb } from "../db/client";
import { characters, deaths, events, expGains, fights, goldPoints, imports, sessions } from "../db/schema";
import { derive, maxLevel, maxPlayed } from "./derive";
import { parseSavedVariables } from "./lua";
import { asObj, date, int, readEvents, str } from "./normalize";

export interface ImportSummary {
  duplicate: boolean;
  characters: number;
  sessions: number;
  eventsTotal: number;
  eventsNew: number;
  names: string[];
}

const CHUNK = 400;

/**
 * Importuje zawartość pliku LUDOS-on.lua (SavedVariables).
 * Idempotentny: ten sam plik drugi raz -> duplicate; nowszy plik tej samej postaci -> upsert po (sesja, n).
 * Upsert (a nie "ignoruj duplikaty"), bo addon poprawia stare wiersze: WYLOGOWANIE -> RELOAD,
 * stan sesji trwa -> zamknieta/przerwana.
 */
export async function importSavedVariables(text: string, label?: string | null): Promise<ImportSummary> {
  const fileHash = createHash("sha256").update(text).digest("hex");
  const root = parseSavedVariables(text);
  const dbVar = asObj(root.LUDOSon_DB);
  const chars = asObj(dbVar.postacie);
  if (Object.keys(chars).length === 0) {
    throw new Error("To nie wygląda na plik LUDOS-on.lua: brak zmiennej LUDOSon_DB.postacie.");
  }

  const db = await getDb();
  const already = await db.select({ id: imports.id }).from(imports).where(eq(imports.fileHash, fileHash)).limit(1);
  if (already.length > 0) {
    return { duplicate: true, characters: 0, sessions: 0, eventsTotal: 0, eventsNew: 0, names: [] };
  }

  const summary: ImportSummary = { duplicate: false, characters: 0, sessions: 0, eventsTotal: 0, eventsNew: 0, names: [] };

  await db.transaction(async (tx) => {
    for (const [key, raw] of Object.entries(chars)) {
      const ch = asObj(raw);
      const dash = key.indexOf("-");
      const name = str(ch.imie) ?? (dash > 0 ? key.slice(0, dash) : key);
      const realm = str(ch.realm) ?? (dash > 0 ? key.slice(dash + 1) : "?");
      const sesje = Array.isArray(ch.sesje) ? ch.sesje : [];

      // zdarzenia całej postaci z pliku (do poziomu, czasu gry, first/last seen)
      const perSession = sesje.map((s) => {
        const so = asObj(s);
        return { so, evs: readEvents(so.dziennik) };
      });
      const all = perSession.flatMap((p) => p.evs);
      const level = maxLevel(all);
      const played = maxPlayed(all);
      // Nie używaj Math.min(...dużaTablica) / Math.max(...dużaTablica):
      // przy setkach tysięcy zdarzeń przekracza to limit argumentów/stosu V8.
      let minTimestamp = Infinity;
      let maxTimestamp = -Infinity;
      for (const event of all) {
        const timestamp = event.ts.getTime();
        if (timestamp < minTimestamp) minTimestamp = timestamp;
        if (timestamp > maxTimestamp) maxTimestamp = timestamp;
      }
      const firstSeen = all.length ? new Date(minTimestamp) : null;
      const lastSeen = all.length ? new Date(maxTimestamp) : null;

      const [row] = await tx
        .insert(characters)
        .values({
          name, realm, class: str(ch.klasa), race: str(ch.rasa), faction: str(ch.frakcja), guild: str(ch.gildia),
          level, playedSeconds: played, firstSeen, lastSeen,
        })
        .onConflictDoUpdate({
          target: [characters.name, characters.realm],
          set: {
            class: sql`coalesce(excluded.class, ${characters.class})`,
            race: sql`coalesce(excluded.race, ${characters.race})`,
            faction: sql`coalesce(excluded.faction, ${characters.faction})`,
            guild: sql`coalesce(excluded.guild, ${characters.guild})`,
            level: sql`greatest(coalesce(excluded.level, 0), coalesce(${characters.level}, 0))`,
            playedSeconds: sql`greatest(coalesce(excluded.played_seconds, 0), coalesce(${characters.playedSeconds}, 0))`,
            firstSeen: sql`least(excluded.first_seen, ${characters.firstSeen})`,
            lastSeen: sql`greatest(excluded.last_seen, ${characters.lastSeen})`,
          },
        })
        .returning({ id: characters.id });
      const characterId = row.id;
      summary.characters++;
      summary.names.push(name);

      for (const { so, evs } of perSession) {
        const nr = int(so.nr);
        if (nr === null) continue;

        const [srow] = await tx
          .insert(sessions)
          .values({
            characterId, nr,
            startedAt: date(so.start), endedAt: date(so.koniec),
            state: str(so.stan), reloads: int(so.reloady) ?? 0, addonVersion: str(so.wersja),
          })
          .onConflictDoUpdate({
            target: [sessions.characterId, sessions.nr],
            set: {
              startedAt: sql`excluded.started_at`,
              endedAt: sql`excluded.ended_at`,
              state: sql`excluded.state`,
              reloads: sql`excluded.reloads`,
              addonVersion: sql`excluded.addon_version`,
            },
          })
          .returning({ id: sessions.id });
        const sessionId = srow.id;
        summary.sessions++;

        // 1) surowe zdarzenia: upsert po (session_id, n)
        const idByN = new Map<number, number>();
        for (let i = 0; i < evs.length; i += CHUNK) {
          const chunk = evs.slice(i, i + CHUNK);
          const res = await tx
            .insert(events)
            .values(chunk.map((e) => ({ sessionId, characterId, n: e.n, ts: e.ts, type: e.type, data: e.data })))
            .onConflictDoUpdate({
              target: [events.sessionId, events.n],
              set: { ts: sql`excluded.ts`, type: sql`excluded.type`, data: sql`excluded.data` },
            })
            .returning({ id: events.id, n: events.n, inserted: sql<boolean>`(xmax = 0)` });
          for (const r of res) {
            idByN.set(r.n, r.id);
            if (r.inserted) summary.eventsNew++;
          }
        }
        summary.eventsTotal += evs.length;

        // 2) tabele pochodne tej sesji: kasujemy i budujemy od nowa
        const ids = [...idByN.values()];
        if (ids.length === 0) continue;
        for (const t of [expGains, deaths, fights, goldPoints]) {
          for (let i = 0; i < ids.length; i += 1000) {
            await tx.delete(t).where(inArray(t.eventId, ids.slice(i, i + 1000)));
          }
        }
        const d = derive(evs);
        const id = (n: number) => idByN.get(n)!;
        if (d.exp.length)
          await tx.insert(expGains).values(d.exp.map((r) => ({ eventId: id(r.n), characterId, ts: r.ts, amount: r.amount, source: r.source, level: r.level })));
        if (d.deaths.length)
          await tx.insert(deaths).values(d.deaths.map(({ n, ...r }) => ({ eventId: id(n), characterId, ...r })));
        if (d.fights.length)
          await tx.insert(fights).values(d.fights.map(({ n, ...r }) => ({ eventId: id(n), characterId, ...r })));
        if (d.gold.length)
          await tx.insert(goldPoints).values(d.gold.map((r) => ({ eventId: id(r.n), characterId, ts: r.ts, copper: r.copper })));
      }
    }

    await tx.insert(imports).values({
      label: label ?? null, fileHash,
      characters: summary.characters, sessions: summary.sessions,
      eventsTotal: summary.eventsTotal, eventsNew: summary.eventsNew,
    });
  });

  return summary;
}
