import Link from "next/link";
import { notFound } from "next/navigation";
import { hasCharacters, listMembers } from "../../../lib/guild";

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

  return (
    <>
      <h1 className="gs-title">{title}</h1>
      <section className="gs-card gs-soon">Ta sekcja nie jest jeszcze gotowa.</section>
    </>
  );
}
