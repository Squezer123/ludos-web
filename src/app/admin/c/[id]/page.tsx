import Link from "next/link";
import { notFound } from "next/navigation";
import { BarList, LineChart, type Point } from "../../../../components/charts";
import {
  QUALITY_LABEL, SOURCE_LABEL, classInfo, fmtDateTime, fmtDuration, fmtInt, fmtMoney,
} from "../../../../lib/format";
import { getCharacterDetail } from "../../../../lib/queries";

export const dynamic = "force-dynamic";

const SOURCE_COLOR: Record<string, string> = {
  mob: "var(--series-1)", quest: "var(--series-2)", inne: "var(--series-3)",
};

export default async function CharacterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const numId = Number(id);
  if (!Number.isInteger(numId)) notFound();
  const data = await getCharacterDetail(numId);
  if (!data) notFound();

  const { character: c, sessions, exp, deaths, fights, gold, topMobs, loot, quests } = data;
  const ci = classInfo(c.class);

  const expTotal = exp.reduce((a, r) => a + r.amount, 0);
  const kills = fights.reduce((a, f) => a + f.kills, 0);
  const activeSec = sessions.reduce(
    (a, s) => a + (s.startedAt && s.endedAt ? Math.max(0, (s.endedAt.getTime() - s.startedAt.getTime()) / 1000) : 0), 0,
  );
  const expPerHour = activeSec > 60 ? Math.round(expTotal / (activeSec / 3600)) : null;

  // exp narastająco; przy dużej liczbie punktów rzedniemy, zachowując ostatni
  let cum = 0;
  const all: Point[] = exp.map((r) => {
    cum += r.amount;
    return {
      t: r.ts.getTime(), v: cum,
      label: `${fmtDateTime(r.ts)}: ${fmtInt(cum)} exp (+${r.amount}, ${SOURCE_LABEL[r.source] ?? r.source})`,
    };
  });
  const step = Math.ceil(all.length / 300) || 1;
  const points = all.filter((_, i) => i % step === 0 || i === all.length - 1);

  const bySource = new Map<string, number>();
  for (const r of exp) bySource.set(r.source, (bySource.get(r.source) ?? 0) + r.amount);
  const sourceRows = ["mob", "quest", "inne"]
    .filter((s) => bySource.has(s))
    .map((s) => ({ label: SOURCE_LABEL[s], value: bySource.get(s)!, color: SOURCE_COLOR[s] }));

  const lastGold = gold.length ? gold[gold.length - 1].copper : null;

  return (
    <>
      <Link href="/admin" className="back">← Panel admina</Link>
      <h1 style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span className="swatch" style={{ background: ci.color, width: 14, height: 14 }} aria-hidden />
        {c.name}
      </h1>
      <p className="sub">
        {[ci.label, c.race, c.faction, c.realm, c.guild].filter(Boolean).join(" · ")}
      </p>

      <div className="tiles">
        <div className="tile"><b>{c.level ?? "—"}</b><span>poziom</span></div>
        <div className="tile"><b>{c.playedSeconds ? fmtDuration(c.playedSeconds) : "—"}</b><span>czas gry (łącznie)</span></div>
        <div className="tile"><b>{fmtInt(expTotal)}</b><span>exp w dzienniku</span></div>
        <div className="tile"><b>{expPerHour !== null ? fmtInt(expPerHour) : "—"}</b><span>exp na godzinę</span></div>
        <div className="tile"><b>{fmtInt(kills)}</b><span>ubitych potworów</span></div>
        <div className="tile"><b>{deaths.length}</b><span>śmierci</span></div>
      </div>

      <div className="grid2">
        <section className="panel">
          <h2>Exp narastająco</h2>
          <LineChart points={points} unit="exp" />
        </section>
        <div className="stack">
          <section className="panel">
            <h2>Skąd exp</h2>
            <BarList rows={sourceRows} unit="exp" />
          </section>
          <section className="panel">
            <h2>Najczęściej zabijani</h2>
            <BarList rows={topMobs.map(([label, value]) => ({ label, value }))} unit="razy" />
          </section>
        </div>
      </div>

      <section className="panel scroll">
        <h2>Śmierci</h2>
        {deaths.length === 0 ? (
          <p className="empty">Ta postać jeszcze nie zginęła.</p>
        ) : (
          <table>
            <thead>
              <tr><th>Kiedy</th><th className="r">Poz.</th><th>Miejsce</th><th>Zabójca</th><th className="r">Ostatnie trafienie</th><th className="r">Wytrzymałość</th></tr>
            </thead>
            <tbody>
              {deaths.map((d) => (
                <tr key={d.eventId}>
                  <td>{fmtDateTime(d.ts)}</td>
                  <td className="r">{d.level ?? "—"}</td>
                  <td>
                    {d.zone}{d.subzone ? ` — ${d.subzone}` : ""}
                    {d.x != null && d.y != null ? <span className="muted"> ({d.x}, {d.y})</span> : null}
                    {d.instance && d.instance !== "none" ? <> <span className="pill">{d.instance}</span></> : null}
                  </td>
                  <td>{d.killer ?? "nieznany"}{d.pvp ? <> <span className="pill bad">PvP</span></> : null}</td>
                  <td className="r">{d.damage != null ? `${d.damage}${d.spell ? ` (${d.spell})` : ""}` : "—"}</td>
                  <td className="r">{d.durability != null ? `${d.durability}%` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <div className="grid2 even">
        <section className="panel scroll">
          <h2>Sesje</h2>
          <table>
            <thead><tr><th className="r">Nr</th><th>Start</th><th className="r">Czas</th><th>Stan</th><th className="r">Reloady</th></tr></thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id}>
                  <td className="r">{s.nr}</td>
                  <td>{fmtDateTime(s.startedAt)}</td>
                  <td className="r">{s.startedAt && s.endedAt ? fmtDuration((s.endedAt.getTime() - s.startedAt.getTime()) / 1000) : "—"}</td>
                  <td>{s.state === "przerwana" ? <span className="pill bad">przerwana</span> : s.state === "trwa" ? "trwa" : "zakończona"}</td>
                  <td className="r">{s.reloads}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="panel scroll">
          <h2>Ostatni loot</h2>
          {loot.length === 0 ? <p className="empty">Brak lootu w dzienniku.</p> : (
            <table>
              <tbody>
                {loot.map((l, i) => (
                  <tr key={i}>
                    <td>{l.name}{l.qty > 1 ? ` ×${l.qty}` : ""}</td>
                    <td className="muted">{QUALITY_LABEL[l.quality] ?? ""}</td>
                    <td className="r muted">{fmtDateTime(l.ts)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      <section className="panel scroll">
        <h2>Oddane questy ({quests.length})</h2>
        {quests.length === 0 ? <p className="empty">Brak oddanych questów.</p> : (
          <table>
            <thead><tr><th>Quest</th><th className="r">Exp</th><th className="r">Nagroda</th><th className="r">Kiedy</th></tr></thead>
            <tbody>
              {quests.map((q, i) => (
                <tr key={i}>
                  <td>{q.name}</td>
                  <td className="r">{fmtInt(q.exp)}</td>
                  <td className="r">{q.copper ? fmtMoney(q.copper) : "—"}</td>
                  <td className="r">{fmtDateTime(q.ts)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {lastGold !== null && <p className="muted" style={{ marginBottom: 0 }}>Złoto przy ostatnim logowaniu: {fmtMoney(lastGold)}</p>}
      </section>
    </>
  );
}
