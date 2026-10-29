import Link from "next/link";
import { notFound } from "next/navigation";
import { BarList, LineChart, type Point } from "../../../../components/charts";
import { QUALITY_LABEL, SOURCE_LABEL, classInfo, fmtDateTime, fmtDuration, fmtInt, fmtMoney } from "../../../../lib/format";
import { getCharacterDetail } from "../../../../lib/queries";

export const dynamic = "force-dynamic";

export default async function MemberDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const numId = Number(id);
  if (!Number.isInteger(numId) || numId < 1) notFound();
  const data = await getCharacterDetail(numId);
  if (!data) notFound();

  const { character: c, sessions, exp, deaths, fights, gold, topMobs, loot, quests } = data;
  const ci = classInfo(c.class);
  const expTotal = exp.reduce((a, r) => a + r.amount, 0);
  const kills = fights.reduce((a, f) => a + f.kills, 0);
  const damageDone = fights.reduce((a, f) => a + f.dmgDone, 0);
  const damageTaken = fights.reduce((a, f) => a + f.dmgTaken, 0);
  const healingDone = fights.reduce((a, f) => a + f.healDone, 0);
  const healingTaken = fights.reduce((a, f) => a + f.healTaken, 0);
  const activeSec = sessions.reduce((a, s) => a + (s.startedAt && s.endedAt ? Math.max(0, (s.endedAt.getTime() - s.startedAt.getTime()) / 1000) : 0), 0);
  const expPerHour = activeSec > 60 ? Math.round(expTotal / (activeSec / 3600)) : null;
  const lastGold = gold.length ? gold[gold.length - 1].copper : null;
  let cumulative = 0;
  const allPoints: Point[] = exp.map((r) => {
    cumulative += r.amount;
    return { t: r.ts.getTime(), v: cumulative, label: `${fmtDateTime(r.ts)}: ${fmtInt(cumulative)} exp (+${fmtInt(r.amount)}, ${SOURCE_LABEL[r.source] ?? r.source})` };
  });
  const step = Math.ceil(allPoints.length / 300) || 1;
  const points = allPoints.filter((_, i) => i % step === 0 || i === allPoints.length - 1);
  const bySource = new Map<string, number>();
  for (const r of exp) bySource.set(r.source, (bySource.get(r.source) ?? 0) + r.amount);
  const sourceRows = ["mob", "quest", "inne"].filter((source) => bySource.has(source)).map((source) => ({ label: SOURCE_LABEL[source] ?? source, value: bySource.get(source)! }));
  const recentEvents = [...data.exp.map((r) => ({ ts: r.ts, type: "EXP", detail: `+${fmtInt(r.amount)} exp (${SOURCE_LABEL[r.source] ?? r.source})` })),
    ...data.deaths.map((r) => ({ ts: r.ts, type: "ŚMIERĆ", detail: `${r.zone ?? "Nieznane miejsce"}${r.killer ? ` — zabójca: ${r.killer}` : ""}` })),
    ...data.quests.map((r) => ({ ts: r.ts, type: "QUEST", detail: `${r.name}, +${fmtInt(r.exp)} exp${r.copper ? `, ${fmtMoney(r.copper)}` : ""}` }))]
    .sort((a, b) => b.ts.getTime() - a.ts.getTime()).slice(0, 20);

  return (
    <div className="gs-player-detail">
      <Link href="/members" className="gs-player-back">← Wróć do członków</Link>
      <header className="gs-player-header">
        <div className="gs-player-class-mark" style={{ background: ci.color }} aria-hidden="true" />
        <div><h1 className="gs-title">{c.name}</h1><p className="gs-player-sub">{[ci.label, c.race, c.faction, c.realm, c.guild].filter(Boolean).join(" · ")}</p></div>
        <span className="gs-player-level">Poz. {c.level ?? "—"}</span>
      </header>

      <div className="gs-player-tiles">
        <div className="gs-player-tile"><b>{c.level ?? "—"}</b><span>Poziom</span></div>
        <div className="gs-player-tile"><b>{c.playedSeconds ? fmtDuration(c.playedSeconds) : "—"}</b><span>Czas gry</span></div>
        <div className="gs-player-tile"><b>{fmtInt(expTotal)}</b><span>Zdobyte EXP</span></div>
        <div className="gs-player-tile"><b>{expPerHour !== null ? fmtInt(expPerHour) : "—"}</b><span>EXP / godzinę</span></div>
        <div className="gs-player-tile"><b>{fmtInt(kills)}</b><span>Zabójstwa</span></div>
        <div className="gs-player-tile"><b>{deaths.length}</b><span>Śmierci</span></div>
        <div className="gs-player-tile"><b>{fmtInt(damageDone)}</b><span>Obrażenia zadane</span></div>
        <div className="gs-player-tile"><b>{fmtInt(damageTaken)}</b><span>Obrażenia otrzymane</span></div>
        <div className="gs-player-tile"><b>{fmtInt(healingDone)}</b><span>Leczenie wykonane</span></div>
        <div className="gs-player-tile"><b>{fmtInt(healingTaken)}</b><span>Leczenie otrzymane</span></div>
        <div className="gs-player-tile"><b>{sessions.length}</b><span>Sesje</span></div>
        <div className="gs-player-tile"><b>{lastGold !== null ? fmtMoney(lastGold) : "—"}</b><span>Złoto przy ostatnim logowaniu</span></div>
      </div>

      <div className="gs-player-grid">
        <section className="gs-card gs-player-card"><h2 className="gs-card-title">Postęp doświadczenia</h2><LineChart points={points} unit="exp" /></section>
        <div className="gs-player-stack">
          <section className="gs-card gs-player-card"><h2 className="gs-card-title">Źródła EXP</h2><BarList rows={sourceRows} unit="exp" /></section>
          <section className="gs-card gs-player-card"><h2 className="gs-card-title">Najczęściej zabijani przeciwnicy</h2><BarList rows={topMobs.map(([label, value]) => ({ label, value }))} unit="razy" /></section>
        </div>
      </div>

      <section className="gs-card gs-player-card gs-player-table-card"><h2 className="gs-card-title">Ostatnia aktywność</h2>
        {recentEvents.length === 0 ? <p className="gs-members-empty">Brak zdarzeń w zaimportowanych danych.</p> : <div className="gs-members-table-wrap"><table className="gs-members-table"><thead><tr><th>Data</th><th>Zdarzenie</th><th>Szczegóły</th></tr></thead><tbody>{recentEvents.map((event, i) => <tr key={`${event.type}-${event.ts.getTime()}-${i}`}><td>{fmtDateTime(event.ts)}</td><td>{event.type}</td><td>{event.detail}</td></tr>)}</tbody></table></div>}
      </section>

      <section className="gs-card gs-player-card gs-player-table-card"><h2 className="gs-card-title">Historia śmierci ({deaths.length})</h2>
        {deaths.length === 0 ? <p className="gs-members-empty">Ta postać nie ma zarejestrowanych śmierci.</p> : <div className="gs-members-table-wrap"><table className="gs-members-table"><thead><tr><th>Kiedy</th><th>Poziom</th><th>Miejsce</th><th>Zabójca</th><th>Ostatnie trafienie</th><th>Wytrzymałość</th></tr></thead><tbody>{deaths.map((d) => <tr key={d.eventId}><td>{fmtDateTime(d.ts)}</td><td>{d.level ?? "—"}</td><td>{d.zone ?? "—"}{d.subzone ? ` — ${d.subzone}` : ""}{d.instance && d.instance !== "none" ? ` (${d.instance})` : ""}</td><td>{d.killer ?? "nieznany"}{d.pvp ? " · PvP" : ""}</td><td>{d.damage != null ? `${fmtInt(d.damage)}${d.spell ? ` (${d.spell})` : ""}` : "—"}</td><td>{d.durability != null ? `${d.durability}%` : "—"}</td></tr>)}</tbody></table></div>}
      </section>

      <div className="gs-player-grid gs-player-grid-even">
        <section className="gs-card gs-player-card gs-player-table-card"><h2 className="gs-card-title">Sesje ({sessions.length})</h2><div className="gs-members-table-wrap"><table className="gs-members-table"><thead><tr><th>Nr</th><th>Start</th><th>Czas</th><th>Stan</th><th>Reloady</th></tr></thead><tbody>{sessions.map((s) => <tr key={s.id}><td>{s.nr}</td><td>{fmtDateTime(s.startedAt)}</td><td>{s.startedAt && s.endedAt ? fmtDuration((s.endedAt.getTime() - s.startedAt.getTime()) / 1000) : "—"}</td><td>{s.state ?? "—"}</td><td>{s.reloads}</td></tr>)}</tbody></table></div></section>
        <section className="gs-card gs-player-card gs-player-table-card"><h2 className="gs-card-title">Ostatni loot</h2>{loot.length === 0 ? <p className="gs-members-empty">Brak lootu w dzienniku.</p> : <div className="gs-members-table-wrap"><table className="gs-members-table"><thead><tr><th>Przedmiot</th><th>Jakość</th><th>Kiedy</th></tr></thead><tbody>{loot.map((item, i) => <tr key={`${item.name}-${i}`}><td>{item.name}{item.qty > 1 ? ` ×${item.qty}` : ""}</td><td>{QUALITY_LABEL[item.quality] ?? ""}</td><td>{fmtDateTime(item.ts)}</td></tr>)}</tbody></table></div>}</section>
      </div>

      <section className="gs-card gs-player-card gs-player-table-card"><h2 className="gs-card-title">Oddane questy ({quests.length})</h2>{quests.length === 0 ? <p className="gs-members-empty">Brak oddanych questów.</p> : <div className="gs-members-table-wrap"><table className="gs-members-table"><thead><tr><th>Quest</th><th>EXP</th><th>Nagroda</th><th>Kiedy</th></tr></thead><tbody>{quests.map((q, i) => <tr key={`${q.name}-${i}`}><td>{q.name}</td><td>{fmtInt(q.exp)}</td><td>{q.copper ? fmtMoney(q.copper) : "—"}</td><td>{fmtDateTime(q.ts)}</td></tr>)}</tbody></table></div>}</section>
    </div>
  );
}
