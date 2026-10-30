import Link from "next/link";
import { notFound } from "next/navigation";
import { ActivityChart } from "../../../../components/guild/activity-chart";
import { ItemIcon } from "../../../../components/guild/item-icon";
import { MetricSelect } from "../../../../components/guild/metric-select";
import { BarsChart } from "../../../../components/player/bars-chart";
import { BarList, LineChart, type Point } from "../../../../components/charts";
import { QUALITY_LABEL, SOURCE_LABEL, classInfo, fmtDateTime, fmtDuration, fmtInt, fmtMoney } from "../../../../lib/format";
import { PLAYER_METRICS, getPlayerReport, sessionSeconds, type PlayerMetric } from "../../../../lib/player";
import { fmtRange, resolveRange } from "../../../../lib/range";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const METRIC_LABEL: Record<PlayerMetric, string> = {
  xp: "EXP", kills: "Zabójstwa (razem)", killsPve: "Zabójstwa PvE", killsPvp: "Zabójstwa PvP", dmg: "Obrażenia zadane", fights: "Walki",
};
const METRIC_UNIT: Record<PlayerMetric, string> = { xp: "exp", kills: "zabójstw", killsPve: "zabójstw PvE", killsPvp: "zabójstw PvP", dmg: "obrażeń", fights: "walk" };

const STATE_LABEL: Record<string, string> = { trwa: "trwa", zamknieta: "zamknięta", przerwana: "przerwana" };

export default async function MemberDetailPage({
  params, searchParams,
}: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const { id } = await params;
  const sp = await searchParams;
  const numId = Number(id);
  if (!Number.isInteger(numId) || numId < 1) notFound();

  // bez parametrów zakresu pokazujemy cały okres; z nimi - wybrany zakres dat
  const hasRange = Boolean((one(sp.range) && one(sp.range) !== "all") || one(sp.from) || one(sp.to));
  const range = hasRange ? resolveRange({ range: one(sp.range), from: one(sp.from), to: one(sp.to) }) : null;
  const m = one(sp.metric);
  const metric: PlayerMetric = (PLAYER_METRICS as readonly string[]).includes(m ?? "") ? (m as PlayerMetric) : "xp";

  const data = await getPlayerReport(numId, range);
  if (!data) notFound();

  const { character: c, totals: t } = data;
  const ci = classInfo(c.class);
  const expPerHour = t.sessionSeconds > 60 ? Math.round(t.exp / (t.sessionSeconds / 3600)) : null;
  const dps = t.fightSeconds > 0 ? Math.round(t.dmgDone / t.fightSeconds) : null;
  const intMetric = metric !== "dmg" && metric !== "xp";

  let cumulative = 0;
  const allPoints: Point[] = data.expCurve.map((r) => {
    cumulative += r.amount;
    return { t: r.ts.getTime(), v: cumulative, label: `${fmtDateTime(r.ts)}: ${fmtInt(cumulative)} exp (+${fmtInt(r.amount)}, ${SOURCE_LABEL[r.source] ?? r.source})` };
  });
  const step = Math.ceil(allPoints.length / 300) || 1;
  const points = allPoints.filter((_, i) => i % step === 0 || i === allPoints.length - 1);

  const sourceRows = data.expBySource.map((s) => ({ label: SOURCE_LABEL[s.source] ?? s.source, value: s.amount }));
  const zoneRows = data.zones
    .filter((z) => z.seconds >= 30)
    .map((z) => ({ label: z.area, value: Math.round(z.seconds / 60) }));

  const recent = [
    ...data.expCurve.slice(-20).map((r) => ({ ts: r.ts, type: "EXP", detail: `+${fmtInt(r.amount)} exp (${SOURCE_LABEL[r.source] ?? r.source})` })),
    ...data.deaths.slice(0, 20).map((r) => ({ ts: r.ts, type: "ŚMIERĆ", detail: `${r.zone ?? "Nieznane miejsce"}${r.killer ? ` — zabójca: ${r.killer}` : ""}` })),
    ...data.quests.slice(0, 20).map((r) => ({ ts: r.ts, type: "QUEST", detail: `${r.name}, +${fmtInt(r.exp)} exp${r.copper ? `, ${fmtMoney(r.copper)}` : ""}` })),
  ].sort((a, b) => b.ts.getTime() - a.ts.getTime()).slice(0, 20);

  const hourLabels = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, "0")}:00`);
  const hourTips = hourLabels.map((l, h) => `${l}–${String(h).padStart(2, "0")}:59 · ${Math.round(data.hourly[metric][h]).toLocaleString("pl-PL")} ${METRIC_UNIT[metric]}`);
  const hasHourly = data.hourly[metric].some((v) => v > 0);

  const tiles: [string, string][] = [
    ["Poziom", String(c.level ?? "—")],
    ["Czas gry (łącznie)", c.playedSeconds ? fmtDuration(c.playedSeconds) : "—"],
    ["Zdobyte EXP", fmtInt(t.exp)],
    ["EXP / godzinę", expPerHour !== null ? fmtInt(expPerHour) : "—"],
    ["Zabójstwa PvE", fmtInt(t.killsPve)],
    ["Zabójstwa PvP", fmtInt(t.killsPvp)],
    ["Śmierci", fmtInt(t.deaths)],
    ["Walki", fmtInt(t.fights)],
    ["Obrażenia / sek. walki", dps !== null ? fmtInt(dps) : "—"],
    ["Obrażenia zadane", fmtInt(t.dmgDone)],
    ["Obrażenia otrzymane", fmtInt(t.dmgTaken)],
    ["Leczenie wykonane", fmtInt(t.healDone)],
    ["Leczenie otrzymane", fmtInt(t.healTaken)],
    ["Sesje", fmtInt(t.sessions)],
    ["Czas w sesjach", t.sessionSeconds > 0 ? fmtDuration(t.sessionSeconds) : "—"],
    ["Złoto zdobyte", t.copperEarned > 0 ? fmtMoney(t.copperEarned) : "—"],
    ["Złoto przy ostatnim logowaniu", t.lastGold !== null ? fmtMoney(t.lastGold) : "—"],
  ];

  return (
    <div className="gs-player-detail">
      <Link href="/members" className="gs-player-back">← Wróć do członków</Link>
      <header className="gs-player-header">
        <div className="gs-player-class-mark" style={{ background: ci.color }} aria-hidden="true" />
        <div><h1 className="gs-title">{c.name}</h1><p className="gs-player-sub">{[ci.label, c.race, c.faction, c.realm, c.guild].filter(Boolean).join(" · ")}</p></div>
        <span className="gs-player-level">Poz. {c.level ?? "—"}</span>
      </header>

      <div className="gs-player-toolbar">
        <p className="gs-player-sub-range">{range ? fmtRange(range.from, range.to) : "Cały okres"}</p>
      </div>

      <div className="gs-player-tiles">
        {tiles.map(([label, value]) => <div className="gs-player-tile" key={label}><b>{value}</b><span>{label}</span></div>)}
      </div>

      <section className="gs-card gs-player-card" style={{ marginTop: 16 }}>
        <div className="gs-chart-head">
          <h2 className="gs-card-title">Aktywność dzienna</h2>
          <MetricSelect value={metric} options={PLAYER_METRICS.map((k) => ({ value: k, label: METRIC_LABEL[k] }))} />
        </div>
        <ActivityChart days={data.chartDays} values={data.daily[metric]} unit={METRIC_UNIT[metric]} integer={intMetric} label={METRIC_LABEL[metric]} />
        {data.chartTruncated && <p className="gs-note">Wykres pokazuje ostatnie 366 dni. Statystyki powyżej obejmują cały okres.</p>}
      </section>

      <div className="gs-player-grid">
        <section className="gs-card gs-player-card">
          <div className="gs-chart-head"><h2 className="gs-card-title">Aktywność wg godziny — {METRIC_LABEL[metric]}</h2></div>
          {hasHourly
            ? <BarsChart labels={hourLabels.map((l) => l.slice(0, 2))} values={data.hourly[metric]} unit={METRIC_UNIT[metric]} integer={intMetric} tips={hourTips} label={`Aktywność wg godziny doby: ${METRIC_LABEL[metric]}`} />
            : <p className="gs-members-empty">Brak danych w wybranym zakresie.</p>}
          <p className="gs-note">Godziny w czasie lokalnym (Europe/Warsaw). Wskaźnik zmienisz listą nad wykresem dziennym.</p>
        </section>
        <section className="gs-card gs-player-card">
          <h2 className="gs-card-title">Czas w strefach</h2>
          <BarList rows={zoneRows} unit="min" />
        </section>
      </div>

      <div className="gs-player-grid">
        <section className="gs-card gs-player-card"><h2 className="gs-card-title">Postęp doświadczenia</h2><LineChart points={points} unit="exp" /></section>
        <div className="gs-player-stack">
          <section className="gs-card gs-player-card"><h2 className="gs-card-title">Źródła EXP</h2><BarList rows={sourceRows} unit="exp" /></section>
          <section className="gs-card gs-player-card"><h2 className="gs-card-title">Najczęściej zabijani przeciwnicy</h2><BarList rows={data.topMobs.map((x) => ({ label: x.name, value: x.count }))} unit="razy" /></section>
        </div>
      </div>

      <section className="gs-card gs-player-card gs-player-table-card"><h2 className="gs-card-title">Sesje ({data.sessions.length})</h2>
        {data.sessions.length === 0 ? <p className="gs-members-empty">Brak sesji w wybranym zakresie.</p> : <div className="gs-members-table-wrap"><table className="gs-members-table"><thead><tr><th>Nr</th><th>Start</th><th>Czas</th><th>EXP</th><th>EXP / h</th><th>Zab. PvE</th><th>Zab. PvP</th><th>Walki</th><th>Śmierci</th><th>Stan</th></tr></thead><tbody>
          {data.sessions.map((s) => {
            const sec = sessionSeconds(s);
            return <tr key={s.id}>
              <td><Link className="gs-session-link" href={`/members/${c.id}/sessions/${s.nr}`}>#{s.nr}</Link></td>
              <td>{fmtDateTime(s.startedAt)}</td>
              <td>{sec > 0 ? fmtDuration(sec) : "—"}</td>
              <td>{fmtInt(s.exp)}</td>
              <td>{sec > 60 ? fmtInt(Math.round(s.exp / (sec / 3600))) : "—"}</td>
              <td>{fmtInt(s.killsPve)}</td>
              <td>{fmtInt(s.killsPvp)}</td>
              <td>{fmtInt(s.fights)}</td>
              <td>{s.deaths}</td>
              <td><span className="gs-session-state" data-state={s.state ?? ""}>{s.state ? STATE_LABEL[s.state] ?? s.state : "—"}</span></td>
            </tr>;
          })}
        </tbody></table></div>}
        <p className="gs-note">Kliknij numer sesji, aby zobaczyć jej przebieg: oś czasu, strefy, walki, loot i questy.</p>
      </section>

      <section className="gs-card gs-player-card gs-player-table-card"><h2 className="gs-card-title">Ostatnia aktywność</h2>
        {recent.length === 0 ? <p className="gs-members-empty">Brak zdarzeń w wybranym zakresie.</p> : <div className="gs-members-table-wrap"><table className="gs-members-table"><thead><tr><th>Data</th><th>Zdarzenie</th><th>Szczegóły</th></tr></thead><tbody>{recent.map((event, i) => <tr key={`${event.type}-${event.ts.getTime()}-${i}`}><td>{fmtDateTime(event.ts)}</td><td>{event.type}</td><td>{event.detail}</td></tr>)}</tbody></table></div>}
      </section>

      <section className="gs-card gs-player-card gs-player-table-card"><h2 className="gs-card-title">Historia śmierci ({t.deaths})</h2>
        {data.deaths.length === 0 ? <p className="gs-members-empty">Brak zarejestrowanych śmierci w wybranym zakresie.</p> : <div className="gs-members-table-wrap"><table className="gs-members-table"><thead><tr><th>Kiedy</th><th>Poziom</th><th>Miejsce</th><th>Zabójca</th><th>Ostatnie trafienie</th><th>Wytrzymałość</th></tr></thead><tbody>{data.deaths.map((d, i) => <tr key={`${d.ts.getTime()}-${i}`}><td>{fmtDateTime(d.ts)}</td><td>{d.level ?? "—"}</td><td>{d.zone ?? "—"}{d.subzone ? ` — ${d.subzone}` : ""}{d.instance && d.instance !== "none" ? ` (${d.instance})` : ""}</td><td>{d.killer ?? "nieznany"}{d.pvp ? " · PvP" : ""}</td><td>{d.damage != null ? `${fmtInt(d.damage)}${d.spell ? ` (${d.spell})` : ""}` : "—"}</td><td>{d.durability != null ? `${d.durability}%` : "—"}</td></tr>)}</tbody></table></div>}
      </section>

      <div className="gs-player-grid gs-player-grid-even">
        <section className="gs-card gs-player-card gs-player-table-card"><h2 className="gs-card-title">Ostatni loot</h2>{data.loot.length === 0 ? <p className="gs-members-empty">Brak lootu w wybranym zakresie.</p> : <div className="gs-members-table-wrap gs-player-loot-scroll"><table className="gs-members-table"><thead><tr><th>Przedmiot</th><th>Jakość</th><th>Kiedy</th></tr></thead><tbody>{data.loot.map((item, i) => <tr key={`${item.itemId ?? item.name}-${item.ts.getTime()}-${i}`}><td>
  {item.itemId !== null && item.itemId > 0 ? (
    <a
      className="gs-player-loot-item gs-player-loot-link"
      href={`https://www.wowhead.com/item=${item.itemId}`}
      target="_blank"
      rel="noopener noreferrer"
      title={`Zobacz ${item.name} w bazie Wowhead (otworzy się w nowej karcie)`}
    >
      <ItemIcon itemId={item.itemId} name={item.name} quality={item.quality} />
      <span className={`gs-player-loot-name gs-quality-${item.quality}`}>
        {item.name}{item.qty > 1 ? ` ×${item.qty}` : ""}
      </span>
    </a>
  ) : (
    <span className="gs-player-loot-item">
      <ItemIcon itemId={item.itemId} name={item.name} quality={item.quality} />
      <span className={`gs-player-loot-name gs-quality-${item.quality}`}>
        {item.name}{item.qty > 1 ? ` ×${item.qty}` : ""}
      </span>
    </span>
  )}
</td><td><span className={`gs-item-quality gs-quality-${item.quality}`}>{QUALITY_LABEL[item.quality] ?? ""}</span></td><td>{fmtDateTime(item.ts)}</td></tr>)}</tbody></table></div>}</section>
        <section className="gs-card gs-player-card gs-player-table-card"><h2 className="gs-card-title">Oddane questy ({data.questTotal})</h2>{data.quests.length === 0 ? <p className="gs-members-empty">Brak oddanych questów w wybranym zakresie.</p> : <div className="gs-members-table-wrap"><table className="gs-members-table"><thead><tr><th>Quest</th><th>EXP</th><th>Nagroda</th><th>Kiedy</th></tr></thead><tbody>{data.quests.map((q, i) => <tr key={`${q.name}-${i}`}><td>{q.name}</td><td>{fmtInt(q.exp)}</td><td>{q.copper ? fmtMoney(q.copper) : "—"}</td><td>{fmtDateTime(q.ts)}</td></tr>)}</tbody></table></div>}</section>
      </div>
    </div>
  );
}
