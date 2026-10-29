// Użycie: npm run import -- ścieżka/do/LUDOS-on.lua [etykieta]
import { readFileSync } from "node:fs";
import { importSavedVariables } from "../src/lib/import";

const [file, label] = process.argv.slice(2);
if (!file) {
  console.error("Podaj plik: npm run import -- LUDOS-on.lua [etykieta]");
  process.exit(1);
}
const res = await importSavedVariables(readFileSync(file, "utf8"), label);
console.log(res.duplicate ? "Ten plik był już zaimportowany." : res);
process.exit(0);
