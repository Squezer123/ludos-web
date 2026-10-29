import type { NextConfig } from "next";

const config: NextConfig = {
  // sterowniki bazy zostają poza bundlem (PGlite ładuje pliki WASM, pg ma natywne opcjonalne części)
  serverExternalPackages: ["@electric-sql/pglite", "pg"],
};

export default config;
