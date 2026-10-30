import Link from "next/link";
import { notFound } from "next/navigation";
import { getGuildProfessionRankings, getGuildRankings, hasCharacters, listMembers, resolveGuild } from "../../../lib/guild";
import ProfessionRanking from "../ProfessionRanking";
import { fmtDuration, fmtInt, fmtMoney } from "../../../lib/format";

const SECTIONS: Record<string, string> = {
  members: "Członkowie",
  rankings: "Rankingi",
  settings: "Ustawienia",
};

const CLASS_COLORS: Record<string, string> = {
  szaman: "#0875df", shaman: "#0875df",
  łotr: "#fff36b", lotr: "#fff36b", rogue: "#fff36b",
  łowca: "#b6db72", lowca: "#b6db72", hunter: "#b6db72",
  kapłan: "#f7f5f2", kaplan: "#f7f5f2", priest: "#f7f5f2",
  mag: "#66cde8", mage: "#66cde8",
  druid: "#ff7a00",
  wojownik: "#cba477", warrior: "#cba477",
  czarnoksiężnik: "#9b83c8", czarnoksieznik: "#9b83c8", warlock: "#9b83c8",
};
const classColor = (name: string | null | undefined) => CLASS_COLORS[(name ?? "").toLocaleLowerCase("pl-PL")] ?? "#a49888";

export const dynamic = "force-dynamic";

export default async function SectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  const title = SECTIONS[section];
  if (!title) notFound();

  if (section === "members") {
    const members = await listMembers();
    return (
      <>
        <h1 className="gs-title">Członkowie</h1>
        <p className="gs-sub">Wszystkie postacie z zaimportowanych danych, bez filtrowania po gildii.</p>
        <section className="gs-card gs-members-card">
          <div className="gs-members-head">
            <div>
              <h2 className="gs-card-title">Lista członków</h2>
              <p className="gs-members-sub">Postacie dostępne w zaimportowanych danych</p>
            </div>
            <span className="gs-members-count">{members.length}</span>
          </div>
          {members.length === 0 ? (
            <p className="gs-members-empty">Brak zaimportowanych postaci.</p>
          ) : (
            <div className="gs-members-table-wrap">
              <table className="gs-members-table">
                <thead><tr><th>Postać</th><th>Poziom</th><th>Klasa</th><th>Realm</th></tr></thead>
                <tbody>
                  {members.map((member) => (
                    <tr key={member.id}>
                      <td><Link className="gs-member-name gs-member-link" style={{ color: classColor(member.class) }} href={`/members/${member.id}`}>{member.name} <span aria-hidden="true">↗</span></Link></td>
                      <td>{member.level ?? "—"}</td>
                      <td>{member.class ?? "—"}</td>
                      <td>{member.realm}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </>
    );
  }

  if (section === "rankings") {
    const guild = await resolveGuild();
    const [rows, professionRows] = await Promise.all([
      getGuildRankings(guild.filter),
      getGuildProfessionRankings(guild.filter),
    ]);
    const professions = [...new Set(professionRows.map((row) => row.profession))].sort((a, b) => a.localeCompare(b, "pl"));
    const rankings = [
      { key: "level", title: "Poziom", value: (r: typeof rows[number]) => r.level ?? 0, format: (v: number) => fmtInt(v), empty: "Brak danych o poziomach." },
      { key: "xp", title: "Zdobyte doświadczenie", value: (r: typeof rows[number]) => r.xp, format: (v: number) => `${fmtInt(v)} XP`, empty: "Brak danych o doświadczeniu." },
      { key: "kills", title: "Zabójstwa", value: (r: typeof rows[number]) => r.kills, format: (v: number) => fmtInt(v), empty: "Brak zarejestrowanych zabójstw." },
      { key: "played", title: "Czas gry", value: (r: typeof rows[number]) => r.playedSeconds, format: (v: number) => fmtDuration(v), empty: "Brak danych o czasie gry." },
      { key: "gold", title: "Zebrane złoto", value: (r: typeof rows[number]) => r.copper, format: (v: number) => fmtMoney(v), empty: "Brak danych o zebranym złocie." },
    ];
    return (
      <>
        <h1 className="gs-title">Rankingi</h1>
        <p className="gs-sub">Zestawienia postaci gildii {guild.name}, na podstawie wszystkich zaimportowanych logów.</p>
        {rows.length === 0 ? <section className="gs-card gs-soon">Brak postaci do wyświetlenia w rankingach.</section> : (
          <div className="gs-rankings-grid">
            {rankings.map((ranking) => {
              const sorted = [...rows].sort((a, b) => ranking.value(b) - ranking.value(a) || a.name.localeCompare(b.name, "pl"));
              const ranked = sorted.filter((r) => ranking.value(r) > 0).slice(0, 10);
              return (
                <section className="gs-card gs-ranking-card" key={ranking.key}>
                  <div className="gs-ranking-head"><h2 className="gs-card-title">{ranking.title}</h2><span className="gs-members-count">TOP 10</span></div>
                  {ranked.length === 0 ? <p className="gs-members-empty">{ranking.empty}</p> : (
                    <div className="gs-members-table-wrap">
                      <table className="gs-members-table gs-ranking-table">
                        <thead><tr><th>#</th><th>Postać</th><th>Wynik</th></tr></thead>
                        <tbody>{ranked.map((r, i) => (
                          <tr key={r.id}>
                            <td className="gs-rank-position">{i + 1}</td>
                            <td><Link className="gs-member-name" style={{ color: classColor(r.class) }} href={`/members/${r.id}`}>{r.name}</Link><span className="gs-rank-class">{r.class ?? "Nieznana klasa"}</span></td>
                            <td className="gs-rank-value">{ranking.format(ranking.value(r))}</td>
                          </tr>
                        ))}</tbody>
                      </table>
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        )}
        <ProfessionRanking professions={professions} rows={professionRows} />
      </>
    );
  }

  return (
    <>
      <h1 className="gs-title">{title}</h1>
      <section className="gs-card gs-soon">Ta sekcja nie jest jeszcze gotowa.</section>
    </>
  );
}
