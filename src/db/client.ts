import { mkdirSync } from "node:fs";
import { sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";
import { DDL } from "./ddl";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

// jedno połączenie na proces (także przy HMR w `next dev`)
const g = globalThis as unknown as { __ludosDb?: Promise<Db> };

async function create(): Promise<Db> {
  let db: Db;
  if (process.env.DATABASE_URL) {
    const { Pool } = await import("pg");
    const { drizzle } = await import("drizzle-orm/node-postgres");
    db = drizzle(new Pool({ connectionString: process.env.DATABASE_URL, max: 5 }), { schema }) as unknown as Db;
  } else {
    // zero-konfiguracji: prawdziwy Postgres (WASM) w procesie, dane w ./.data/pglite
    const { PGlite } = await import("@electric-sql/pglite");
    const { drizzle } = await import("drizzle-orm/pglite");
    const dir = process.env.PGLITE_DIR ?? "./.data/pglite";
    mkdirSync(dir, { recursive: true });
    db = drizzle(new PGlite(dir), { schema }) as unknown as Db;
  }
  for (const stmt of DDL) await db.execute(sql.raw(stmt)); // po jednej instrukcji (wymóg PGlite)
  return db;
}

export function getDb(): Promise<Db> {
  return (g.__ludosDb ??= create());
}
