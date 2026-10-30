"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

type ProfessionRow = {
  id: number;
  name: string;
  class: string | null;
  profession: string;
  level: number;
  maxLevel: number | null;
};

const CLASS_COLORS: Record<string, string> = {
  szaman: "#0875df", shaman: "#0875df",
  łotr: "#fff36b", lotr: "#fff36b", rogue: "#fff36b",
  łowca: "#b6db72", lowca: "#b6db72", hunter: "#b6db72",
  kapłan: "#f7f5f2", kaplan: "#f7f5f2", priest: "#f7f5f2",
  mag: "#66cde8", mage: "#66cde8", druid: "#ff7a00",
  wojownik: "#cba477", warrior: "#cba477",
  czarnoksiężnik: "#9b83c8", czarnoksieznik: "#9b83c8", warlock: "#9b83c8",
};
const classColor = (name: string | null) => CLASS_COLORS[(name ?? "").toLocaleLowerCase("pl-PL")] ?? "#a49888";

export default function ProfessionRanking({ professions, rows }: { professions: string[]; rows: ProfessionRow[] }) {
  const [selected, setSelected] = useState(professions[0] ?? "");
  const ranked = useMemo(() => rows
    .filter((row) => row.profession === selected && row.level > 0)
    .sort((a, b) => b.level - a.level || a.name.localeCompare(b.name, "pl"))
    .slice(0, 10), [rows, selected]);

  return (
    <section className="gs-card gs-ranking-card gs-profession-ranking">
      <div className="gs-ranking-head">
        <div>
          <h2 className="gs-card-title">Profesje</h2>
          <p className="gs-profession-note">Ranking według ostatniego poziomu zapisanego w logach</p>
        </div>
        <span className="gs-members-count">TOP 10</span>
      </div>
      {professions.length === 0 ? (
        <p className="gs-members-empty">Brak zapisanych danych o profesjach. Ranking pojawi się po zaimportowaniu zdarzeń UMIEJETNOSC dotyczących profesji.</p>
      ) : (
        <>
          <label className="gs-profession-select-label" htmlFor="profession-ranking-select">Wybierz profesję</label>
          <select id="profession-ranking-select" className="gs-profession-select" value={selected} onChange={(event) => setSelected(event.target.value)}>
            {professions.map((profession) => <option key={profession} value={profession}>{profession}</option>)}
          </select>
          {ranked.length === 0 ? <p className="gs-members-empty">Brak danych dla wybranej profesji.</p> : (
            <div className="gs-members-table-wrap">
              <table className="gs-members-table gs-ranking-table">
                <thead><tr><th>#</th><th>Postać</th><th>Poziom</th></tr></thead>
                <tbody>{ranked.map((row, index) => (
                  <tr key={row.id}>
                    <td className="gs-rank-position">{index + 1}</td>
                    <td><Link className="gs-member-name" style={{ color: classColor(row.class) }} href={`/members/${row.id}`}>{row.name}</Link><span className="gs-rank-class">{row.class ?? "Nieznana klasa"}</span></td>
                    <td className="gs-rank-value">{row.level}{row.maxLevel ? ` / ${row.maxLevel}` : ""}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
