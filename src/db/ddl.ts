/**
 * Idempotentny DDL wykonywany przy starcie (CREATE ... IF NOT EXISTS).
 * Musi odpowiadać schema.ts. Gdy schemat się ustabilizuje, przejdź na `drizzle-kit generate`
 * i migracje (drizzle.config.ts jest przygotowany).
 */
export const DDL: string[] = [
  `CREATE TABLE IF NOT EXISTS characters (
    id serial PRIMARY KEY,
    name text NOT NULL,
    realm text NOT NULL,
    class text, race text, faction text, guild text,
    level integer,
    played_seconds integer,
    first_seen timestamptz,
    last_seen timestamptz,
    CONSTRAINT characters_name_realm UNIQUE (name, realm)
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    id serial PRIMARY KEY,
    character_id integer NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    nr integer NOT NULL,
    started_at timestamptz,
    ended_at timestamptz,
    state text,
    reloads integer NOT NULL DEFAULT 0,
    addon_version text,
    CONSTRAINT sessions_character_nr UNIQUE (character_id, nr)
  )`,
  `CREATE TABLE IF NOT EXISTS events (
    id bigserial PRIMARY KEY,
    session_id integer NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    character_id integer NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    n integer NOT NULL,
    ts timestamptz NOT NULL,
    type text NOT NULL,
    data jsonb NOT NULL DEFAULT '{}'::jsonb,
    CONSTRAINT events_session_n UNIQUE (session_id, n)
  )`,
  `CREATE INDEX IF NOT EXISTS events_char_type_ts ON events (character_id, type, ts)`,
  `CREATE TABLE IF NOT EXISTS exp_gains (
    event_id bigint PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
    character_id integer NOT NULL,
    ts timestamptz NOT NULL,
    amount integer NOT NULL,
    source text NOT NULL,
    level integer
  )`,
  `CREATE INDEX IF NOT EXISTS exp_gains_char_ts ON exp_gains (character_id, ts)`,
  `CREATE TABLE IF NOT EXISTS deaths (
    event_id bigint PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
    character_id integer NOT NULL,
    ts timestamptz NOT NULL,
    level integer, zone text, subzone text, killer text, spell text,
    damage integer, overkill integer,
    pvp boolean NOT NULL DEFAULT false,
    instance text,
    x real, y real,
    durability integer,
    hits jsonb
  )`,
  `CREATE INDEX IF NOT EXISTS deaths_char_ts ON deaths (character_id, ts)`,
  `CREATE TABLE IF NOT EXISTS fights (
    event_id bigint PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
    character_id integer NOT NULL,
    started_at timestamptz NOT NULL,
    ended_at timestamptz,
    seconds integer NOT NULL DEFAULT 0,
    dmg_done integer NOT NULL DEFAULT 0,
    dmg_taken integer NOT NULL DEFAULT 0,
    heal_done integer NOT NULL DEFAULT 0,
    heal_taken integer NOT NULL DEFAULT 0,
    kills integer NOT NULL DEFAULT 0,
    targets text,
    died boolean NOT NULL DEFAULT false,
    pvp boolean NOT NULL DEFAULT false
  )`,
  `CREATE INDEX IF NOT EXISTS fights_char_started ON fights (character_id, started_at)`,
  `CREATE TABLE IF NOT EXISTS gold_points (
    event_id bigint PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
    character_id integer NOT NULL,
    ts timestamptz NOT NULL,
    copper bigint NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS gold_points_char_ts ON gold_points (character_id, ts)`,
  `CREATE TABLE IF NOT EXISTS imports (
    id serial PRIMARY KEY,
    label text,
    file_hash text NOT NULL UNIQUE,
    uploaded_at timestamptz NOT NULL DEFAULT now(),
    characters integer NOT NULL DEFAULT 0,
    sessions integer NOT NULL DEFAULT 0,
    events_total integer NOT NULL DEFAULT 0,
    events_new integer NOT NULL DEFAULT 0
  )`,
];
