import Link from "next/link";
import { ActivityChart } from "../../components/guild/activity-chart";
import { IconCoins, IconSwords, IconTrendUp, IconUsers } from "../../components/guild/icons";
import { MetricSelect } from "../../components/guild/metric-select";
import { StatCard } from "../../components/guild/stat-card";
import { fmtInt } from "../../lib/format";
import {
  getGuildOverview,
  getClassCounts,
  getGuildRankings,
  hasCharacters,
  listRecentEvents,
  METRICS,
  resolveGuild,
  type Metric,
  type RecentGuildEvent,
} from "../../lib/guild";
import { fmtCompact } from "../../lib/guild-format";
import { fmtRange, resolveRange } from "../../lib/range";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const COPPER_PER_GOLD = 10_000;
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
const classColor = (name: string | null | undefined) =>
  CLASS_COLORS[(name ?? "").toLocaleLowerCase("pl-PL")] ?? "#a49888";

function eventDescription(event: RecentGuildEvent): string {
  const d = event.data ?? {};
  const first = (...keys: string[]) => {
    for (const key of keys) {
      const value = d[key];
      if (value !== undefined && value !== null && String(value).trim()) return String(value);
    }
    return "";
  };
  switch (event.type) {
    case "AWANS": return `Awans na poziom ${first("level", "poziom") || "wyższy poziom"}`;
    case "SMIERC": return `Śmierć${first("killer", "zabojca", "killerName") ? ` — ${first("killer", "zabojca", "killerName")}` : ""}`;
    case "ZALOGOWANIE": return "Zalogowanie do gry";
    case "QUEST_ODDANY": return `Oddano zadanie${first("nazwa", "quest", "name") ? `: ${first("nazwa", "quest", "name")}` : ""}`;
    case "ZLOTO_STAN": return "Zapisano stan złota";
    case "EXP": return `Zdobyto ${first("amount", "xp", "ilosc") || ""} XP`.trim();
    case "LOOT": return `Zdobyto łup${first("item", "nazwa", "name") ? `: ${first("item", "nazwa", "name")}` : ""}`;
    case "WALKA": return "Zakończono walkę";
    default: return event.type.replaceAll("_", " ").toLocaleLowerCase("pl-PL").replace(/^./, (c) => c.toLocaleUpperCase("pl-PL"));
  }
}
function formatEventDate(value: string | Date) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat("pl-PL", {
        day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
      }).format(date);
}

const METRIC_LABEL: Record<Metric, string> = {
  xp: "XP", gold: "Złoto", kills: "Zabójstwa (razem)", killsPve: "Zabójstwa PvE", killsPvp: "Zabójstwa PvP", active: "Aktywni gracze",
};
const CHART_UNIT: Record<Metric, string> = {
  xp: "XP", gold: "g", kills: "zabójstw", killsPve: "zabójstw PvE", killsPvp: "zabójstw PvP", active: "graczy",
};

function Empty() {
  return (
    <>
      <h1 className="gs-title">Przegląd gildii</h1>
      <section className="gs-card gs-soon">
        Nie ma jeszcze danych gildii. Wgraj plik <code>LUDOS-on.lua</code> w{" "}
        <Link href="/admin" style={{ color: "var(--gs-gold)" }}>panelu admina</Link>.
      </section>
    </>
  );
}

function RankingTable({
  title,
  rows,
  value,
  format,
}: {
  title: string;
  rows: Awaited<ReturnType<typeof getGuildRankings>>;
  value: "xp" | "kills" | "killsPve" | "killsPvp" | "copper";
  format: (n: number) => string;
}) {
  const top = [...rows].sort((a, b) => b[value] - a[value]).slice(0, 5);
  return (
    <section className="gs-card gs-ranking-card">
      <div className="gs-ranking-head">
        <h2 className="gs-card-title">{title}</h2>
        <span className="gs-members-count">TOP 5</span>
      </div>
      {top.length === 0 ? (
        <p className="gs-members-empty">Brak danych do rankingu.</p>
      ) : (
        <div className="gs-members-table-wrap">
          <table className="gs-members-table gs-ranking-table">
            <thead><tr><th>#</th><th>Postać</th><th>Poziom</th><th className="gs-rank-value">Wynik</th></tr></thead>
            <tbody>
              {top.map((member, index) => (
                <tr key={member.id}>
                  <td className="gs-rank-position">{index + 1}</td>
                  <td>
                    <Link className="gs-member-name" href={`/members/${member.id}`}>{member.name}</Link>
                    {member.class ? <span className="gs-rank-class">{member.class}</span> : null}
                  </td>
                  <td>{member.level ?? "—"}</td>
                  <td className="gs-rank-value">{format(member[value])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default async function GuildOverviewPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  if (!(await hasCharacters())) return <Empty />;
  const guild = await resolveGuild();

  const range = resolveRange({ range: one(sp.range), from: one(sp.from), to: one(sp.to) });
  const m = one(sp.metric);
  const metric: Metric = (METRICS as readonly string[]).includes(m ?? "") ? (m as Metric) : "xp";

  const [data, recentEvents, classCounts, rankings] = await Promise.all([
    getGuildOverview(guild.filter, range),
    listRecentEvents(12),
    getClassCounts(),
    getGuildRankings(guild.filter),
  ]);
  if (!data) return <Empty />;

  const { stats, series, days } = data;
  const chartValues = metric === "gold"
    ? series.gold.map((c) => c / COPPER_PER_GOLD)
    : series[metric];

  const avg = chartValues.length
    ? chartValues.reduce((total, value) => total + value, 0) / chartValues.length
    : 0;
  const maxValue = chartValues.length ? Math.max(...chartValues) : 0;
  const maxIndex = chartValues.indexOf(maxValue);
  const bestDay = maxIndex >= 0 ? days[maxIndex] : null;
  const fmtMetric = (value: number) =>
    `${fmtInt(Math.round(value))}${metric === "gold" ? " g" : metric === "xp" ? " XP" : metric === "kills" ? " zabójstw" : metric === "killsPve" ? " zabójstw PvE" : metric === "killsPvp" ? " zabójstw PvP" : " graczy"}`;
  const dateLabel = (day: string) =>
    new Intl.DateTimeFormat("pl-PL", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
      .format(new Date(`${day}T00:00:00Z`));

  const totalClassCount = classCounts.reduce((sum, item) => sum + item.count, 0);
  let offset = 0;
  const gradient = classCounts.map((item) => {
    const start = offset / Math.max(totalClassCount, 1) * 100;
    offset += item.count;
    const end = offset / Math.max(totalClassCount, 1) * 100;
    return `${classColor(item.name)} ${start}% ${end}%`;
  }).join(", ");

  return (
    <>
      <div className="gs-overview-heading">
        <div>
          <p className="gs-eyebrow">CENTRUM DOWODZENIA</p>
          <h1 className="gs-title">Przegląd gildii</h1>
          <p className="gs-sub">{guild.name} · {fmtRange(range.from, range.to)}</p>
        </div>
        <div className="gs-overview-badge"><span /> Analiza danych gildii</div>
      </div>

      <div className="gs-stats gs-overview-stats">
        <StatCard label="Aktywni gracze (7d)" icon={<IconUsers size={16} />} value={fmtInt(stats.active.value)} delta={stats.active.delta} spark={stats.active.spark} />
        <StatCard label="Łączne XP" icon={<IconTrendUp size={16} />} value={fmtCompact(stats.xp.value)} delta={stats.xp.delta} spark={stats.xp.spark} />
        <StatCard label="Zarobione złoto" icon={<IconCoins size={16} />} value={`${fmtInt(Math.floor(stats.gold.value / COPPER_PER_GOLD))} g`} delta={stats.gold.delta} spark={stats.gold.spark} />
        <StatCard label="Zabójstwa" icon={<IconSwords size={16} />} value={fmtCompact(stats.kills.value)} delta={stats.kills.delta} spark={stats.kills.spark} sub={`PvE ${fmtInt(stats.killsPve.value)} · PvP ${fmtInt(stats.killsPvp.value)}`} />
      </div>

      <section className="gs-card gs-chart-card gs-overview-chart">
        <div className="gs-chart-head">
          <div>
            <p className="gs-eyebrow">TREND W CZASIE</p>
            <h2 className="gs-card-title">Aktywność gildii</h2>
            <p className="gs-members-sub">Linia przerywana oznacza średnią dzienną dla wybranego zakresu.</p>
          </div>
          <MetricSelect value={metric} options={METRICS.map((k) => ({ value: k, label: METRIC_LABEL[k] }))} />
        </div>
        <div className="gs-chart-summary">
          <div><span>Średnia dzienna</span><strong>{fmtMetric(avg)}</strong></div>
          <div><span>Najlepszy dzień</span><strong>{fmtMetric(maxValue)}</strong><small>{bestDay ? dateLabel(bestDay) : "Brak danych"}</small></div>
          <div><span>Dni w zakresie</span><strong>{days.length}</strong><small>{range.preset === "custom" ? "Zakres własny" : `Zakres ${range.preset}`}</small></div>
        </div>
        <ActivityChart days={days} values={chartValues} unit={CHART_UNIT[metric]} integer={metric === "kills" || metric === "killsPve" || metric === "killsPvp" || metric === "active"} label={METRIC_LABEL[metric]} />
        <div className="gs-chart-legend">
          <span><i className="gs-legend-series" /> Dzienna wartość</span>
          <span><i className="gs-legend-average" /> Średnia: {fmtMetric(avg)}</span>
        </div>
        <p className="gs-note">Wartości dzienne w strefie Europe/Warsaw. Porównanie zmian na kartach statystyk odnosi się do poprzedniego okresu o tej samej długości.</p>
      </section>

      <div className="gs-overview-insights">
        <section className="gs-card gs-insight-card">
          <span className="gs-insight-kicker">ŚREDNIA NA DZIEŃ</span>
          <strong>{fmtMetric(avg)}</strong>
          <p>Średnia wartość metryki „{METRIC_LABEL[metric]}” w wybranym okresie.</p>
        </section>
        <section className="gs-card gs-insight-card">
          <span className="gs-insight-kicker">REKORD OKRESU</span>
          <strong>{fmtMetric(maxValue)}</strong>
          <p>{bestDay ? `Najwyższy wynik odnotowano ${dateLabel(bestDay)}.` : "Brak danych w wybranym zakresie."}</p>
        </section>
        <section className="gs-card gs-insight-card">
          <span className="gs-insight-kicker">ŁĄCZNIE POSTACI</span>
          <strong>{fmtInt(rankings.length)}</strong>
          <p>Postacie uwzględnione w zestawieniu gildii.</p>
        </section>
      </div>

      <div className="gs-overview-grid gs-overview-grid-wide">
        <section className="gs-card gs-classes-card">
          <div className="gs-section-heading">
            <div><p className="gs-eyebrow">STRUKTURA SKŁADU</p><h2 className="gs-card-title">Klasy w gildii</h2></div>
            <span className="gs-members-count">{totalClassCount}</span>
          </div>
          {classCounts.length === 0 ? <p className="gs-members-empty">Brak danych o klasach.</p> : (
            <>
              <div className="gs-class-chart-wrap">
                <div className="gs-class-donut" style={{ background: `conic-gradient(${gradient})` }}>
                  <div className="gs-class-donut-center"><strong>{totalClassCount}</strong><span>postaci</span></div>
                </div>
              </div>
              <div className="gs-class-legend">
                {classCounts.map((item) => (
                  <div className="gs-class-legend-item" key={item.name}>
                    <span className="gs-class-label"><i style={{ backgroundColor: classColor(item.name) }} />{item.name}</span>
                    <span className="gs-class-count">{item.count} · {totalClassCount ? Math.round(item.count / totalClassCount * 100) : 0}%</span>
                  </div>
                ))}
              </div>
              <p className="gs-note">Rozkład klas według postaci dostępnych w zaimportowanych danych.</p>
            </>
          )}
        </section>

        <section className="gs-card gs-events-card">
          <div className="gs-members-head">
            <div><p className="gs-eyebrow">NA ŻYWO Z DZIENNIKA</p><h2 className="gs-card-title">Ostatnia aktywność</h2><p className="gs-members-sub">Najnowsze zdarzenia z zaimportowanych danych.</p></div>
            <span className="gs-members-count">{recentEvents.length}</span>
          </div>
          {recentEvents.length === 0 ? <p className="gs-members-empty">Brak zapisanych eventów.</p> : (
            <div className="gs-events-list">
              {recentEvents.map((event) => (
                <div className="gs-event-row" key={event.id}>
                  <span className="gs-event-dot" style={{ backgroundColor: classColor(event.class) }} />
                  <div className="gs-event-content">
                    <div className="gs-event-main"><strong style={{ color: classColor(event.class) }}>{event.character}</strong><span>{eventDescription(event)}</span></div>
                    <time>{formatEventDate(event.ts)}</time>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <div className="gs-overview-section-head">
        <div><p className="gs-eyebrow">WYNIKI POSTACI</p><h2 className="gs-card-title">Najlepsi członkowie</h2></div>
        <p className="gs-members-sub">Rankingi sumaryczne z całej historii zaimportowanych danych.</p>
      </div>
      <div className="gs-rankings-grid gs-overview-rankings">
        <RankingTable title="Najwięcej zdobytego XP" rows={rankings} value="xp" format={fmtCompact} />
        <RankingTable title="Najwięcej zabójstw PvE" rows={rankings} value="killsPve" format={fmtInt} />
        <RankingTable title="Najwięcej zabójstw PvP" rows={rankings} value="killsPvp" format={fmtInt} />
        <RankingTable title="Najwięcej zebranego złota" rows={rankings} value="copper" format={(n) => `${fmtInt(Math.floor(n / COPPER_PER_GOLD))} g`} />
      </div>
      <p className="gs-note gs-overview-footnote">Rankingi pokazują wartości łączne z całej historii danych, natomiast wykres i karty statystyk korzystają z wybranego zakresu dat.</p>
    </>
  );
}
