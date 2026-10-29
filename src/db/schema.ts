import {
  bigint,
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  serial,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

const tstz = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export const characters = pgTable(
  "characters",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    realm: text("realm").notNull(),
    class: text("class"),
    race: text("race"),
    faction: text("faction"),
    guild: text("guild"),
    level: integer("level"),
    playedSeconds: integer("played_seconds"),
    firstSeen: tstz("first_seen"),
    lastSeen: tstz("last_seen"),
  },
  (t) => [unique("characters_name_realm").on(t.name, t.realm)],
);

export const sessions = pgTable(
  "sessions",
  {
    id: serial("id").primaryKey(),
    characterId: integer("character_id").notNull().references(() => characters.id, { onDelete: "cascade" }),
    nr: integer("nr").notNull(),
    startedAt: tstz("started_at"),
    endedAt: tstz("ended_at"),
    state: text("state"), // trwa | zamknieta | przerwana
    reloads: integer("reloads").notNull().default(0),
    addonVersion: text("addon_version"),
  },
  (t) => [unique("sessions_character_nr").on(t.characterId, t.nr)],
);

/** Surowy dziennik z addona - źródło prawdy. Klucz naturalny: (sesja, n). */
export const events = pgTable(
  "events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    sessionId: integer("session_id").notNull().references(() => sessions.id, { onDelete: "cascade" }),
    characterId: integer("character_id").notNull().references(() => characters.id, { onDelete: "cascade" }),
    n: integer("n").notNull(),
    ts: tstz("ts").notNull(),
    type: text("type").notNull(),
    data: jsonb("data").notNull().default({}),
  },
  (t) => [
    unique("events_session_n").on(t.sessionId, t.n),
    index("events_char_type_ts").on(t.characterId, t.type, t.ts),
  ],
);

const eventRef = () =>
  bigint("event_id", { mode: "number" }).primaryKey().references(() => events.id, { onDelete: "cascade" });

// ---- tabele pochodne (przebudowywane przy każdym imporcie sesji) ----

export const expGains = pgTable(
  "exp_gains",
  {
    eventId: eventRef(),
    characterId: integer("character_id").notNull(),
    ts: tstz("ts").notNull(),
    amount: integer("amount").notNull(),
    source: text("source").notNull(), // mob | quest | inne
    level: integer("level"),
  },
  (t) => [index("exp_gains_char_ts").on(t.characterId, t.ts)],
);

export const deaths = pgTable(
  "deaths",
  {
    eventId: eventRef(),
    characterId: integer("character_id").notNull(),
    ts: tstz("ts").notNull(),
    level: integer("level"),
    zone: text("zone"),
    subzone: text("subzone"),
    killer: text("killer"),
    spell: text("spell"),
    damage: integer("damage"),
    overkill: integer("overkill"),
    pvp: boolean("pvp").notNull().default(false),
    instance: text("instance"),
    x: real("x"),
    y: real("y"),
    durability: integer("durability"),
    hits: jsonb("hits"),
  },
  (t) => [index("deaths_char_ts").on(t.characterId, t.ts)],
);

export const fights = pgTable(
  "fights",
  {
    eventId: eventRef(),
    characterId: integer("character_id").notNull(),
    startedAt: tstz("started_at").notNull(),
    endedAt: tstz("ended_at"),
    seconds: integer("seconds").notNull().default(0),
    dmgDone: integer("dmg_done").notNull().default(0),
    dmgTaken: integer("dmg_taken").notNull().default(0),
    healDone: integer("heal_done").notNull().default(0),
    healTaken: integer("heal_taken").notNull().default(0),
    kills: integer("kills").notNull().default(0),
    targets: text("targets"),
    died: boolean("died").notNull().default(false),
    pvp: boolean("pvp").notNull().default(false),
  },
  (t) => [index("fights_char_started").on(t.characterId, t.startedAt)],
);

/** Stan złota z logowania (kiedy = start). Wpisy "koniec" są pomijane - patrz README. */
export const goldPoints = pgTable(
  "gold_points",
  {
    eventId: eventRef(),
    characterId: integer("character_id").notNull(),
    ts: tstz("ts").notNull(),
    copper: bigint("copper", { mode: "number" }).notNull(),
  },
  (t) => [index("gold_points_char_ts").on(t.characterId, t.ts)],
);

export const imports = pgTable("imports", {
  id: serial("id").primaryKey(),
  label: text("label"),
  fileHash: text("file_hash").notNull().unique(),
  uploadedAt: tstz("uploaded_at").notNull().defaultNow(),
  characters: integer("characters").notNull().default(0),
  sessions: integer("sessions").notNull().default(0),
  eventsTotal: integer("events_total").notNull().default(0),
  eventsNew: integer("events_new").notNull().default(0),
});
