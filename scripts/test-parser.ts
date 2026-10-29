// Uruchom: npm run test:parser   (Node >= 22.18 uruchamia .ts bez dodatkowych narzędzi)
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { parseSavedVariables } from "../src/lib/lua.ts";

// 1) drobne przypadki
{
  const v = parseSavedVariables(`X = { ["a"] = 1, [5] = "p", { "t1", "t2", }, -- komentarz\n n = -2.5e1, ok = true, nic = nil, }`);
  const x = v.X as Record<string, unknown>;
  assert.equal(x.a, 1);
  assert.equal(x["5"], "p");
  assert.deepEqual(x["1"], ["t1", "t2"]);
  assert.equal(x.n, -25);
  assert.equal(x.ok, true);
  assert.ok(!("nic" in x));
  assert.deepEqual((parseSavedVariables(`Y = { }`).Y), []);
  assert.deepEqual((parseSavedVariables(`Y = { [1] = "a", [2] = "b" }`).Y), ["a", "b"]);
  assert.equal((parseSavedVariables(`Y = "a\\"b\\\\c"`).Y), 'a"b\\c');
}

// 2) prawdziwy zapis z gry
const text = readFileSync(new URL("../fixtures/foresto_test1.lua", import.meta.url), "utf8");
const db = parseSavedVariables(text).LUDOSon_DB as any;
assert.equal(db.meta.schemat, 2);
const chars = Object.keys(db.postacie);
assert.deepEqual(chars.sort(), ["Forestomag-Mirage Raceway", "Forestorm-Mirage Raceway"]);

let events = 0;
const types = new Map<string, number>();
let lastN = 0;
for (const [key, ch] of Object.entries<any>(db.postacie)) {
  assert.ok(Array.isArray(ch.sesje), `${key}: sesje to tablica`);
  for (const s of ch.sesje) {
    assert.ok(Array.isArray(s.dziennik));
    lastN = 0;
    for (const row of s.dziennik) {
      assert.equal(row.n, lastN + 1, `${key} sesja ${s.nr}: ciągłość n`);
      lastN = row.n;
      events++;
      types.set(row.e, (types.get(row.e) ?? 0) + 1);
    }
  }
}
console.log("postacie:", chars.join(", "));
console.log("zdarzenia:", events);
console.log([...types.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join("  "));
console.log("OK");

// 3) logika pochodna na prawdziwych danych
import { derive, maxLevel, maxPlayed } from "../src/lib/derive.ts";
import { readEvents } from "../src/lib/normalize.ts";
{
  const mag = readEvents(db.postacie["Forestomag-Mirage Raceway"].sesje[0].dziennik);
  const d = derive(mag);
  const expTotal = d.exp.reduce((a, r) => a + r.amount, 0);
  console.log("Forestomag: exp wpisów", d.exp.length, "suma", expTotal, "walk", d.fights.length,
    "zgony", d.deaths.length, "złoto(start)", d.gold.map((g) => g.copper), "lvl", maxLevel(mag), "played", maxPlayed(mag));
  assert.equal(d.deaths.length, 1);
  assert.equal(d.deaths[0].killer, "Young Scavenger");
  assert.equal(d.deaths[0].x, 28.4);
  assert.equal(d.fights.filter((f) => f.died).length, 1);
  assert.equal(maxLevel(mag), 2); // WYLOGOWANIE ma lvl 1, ale poziom to 2
  assert.equal(d.gold.length, 1); // wpis "koniec" pominięty
  const war = readEvents(db.postacie["Forestorm-Mirage Raceway"].sesje[0].dziennik);
  assert.deepEqual(derive(war).gold.map((g) => g.copper), [58577]);
  assert.equal(maxLevel(war), 33);
}
console.log("OK derive");
