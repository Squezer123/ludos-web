import { defineConfig } from "drizzle-kit";

// Na później: `npx drizzle-kit generate` tworzy migracje SQL ze schema.ts.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
});
