import Link from "next/link";
import { ActivityChart } from "../../components/guild/activity-chart";
import { IconCoins, IconSwords, IconTrendUp, IconUsers } from "../../components/guild/icons";
import { MetricSelect } from "../../components/guild/metric-select";
import { StatCard } from "../../components/guild/stat-card";
import { fmtInt } from "../../lib/format";
import { getGuildOverview, getClassCounts, hasCharacters, listRecentEvents, METRICS, resolveGuild, type Metric, type RecentGuildEvent } from "../../lib/guild";
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
const classColor = (name: string | null | undefined) => CLASS_COLORS[(name ?? "").toLocaleLowerCase("pl-PL")] ?? "#a49888";

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
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("pl-PL", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(date);
}

const METRIC_LABEL: Record<Metric, string> = { xp: "XP", gold: "Złoto", kills: "Zabójstwa", active: "Aktywni gracze" };
const CHART_UNIT: Record<Metric, string> = { xp: "XP", gold: "g", kills: "zabójstw", active: "graczy" };

function Empty() {
  return (
    <>
      <h1 className="gs-title">Przegląd</h1>
      <section className="gs-card gs-soon">
        Nie ma jeszcze danych gildii. Wgraj plik <code>LUDOS-on.lua</code> w <Link href="/admin" style={{ color: "var(--gs-gold)" }}>panelu admina</Link>.
      </section>

    </>
  );
}

export default async function GuildOverviewPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  if (!(await hasCharacters())) return <Empty />;
  const guild = await resolveGuild();

  const range = resolveRange({ range: one(sp.range), from: one(sp.from), to: one(sp.to) });
  const m = one(sp.metric);
  const metric: Metric = (METRICS as readonly string[]).includes(m ?? "") ? (m as Metric) : "xp";

  const [data, recentEvents, classCounts] = await Promise.all([getGuildOverview(guild.filter, range), listRecentEvents(12), getClassCounts()]);
  if (!data) return <Empty />;
  const { stats, series, days } = data;

  const chartValues = metric === "gold" ? series.gold.map((c) => c / COPPER_PER_GOLD) : series[metric];

  return (
    <>
      <h1 className="gs-title">Przegląd</h1>
      <p className="gs-sub">{fmtRange(range.from, range.to)}</p>

      <div className="gs-stats">
        <StatCard
          label="Aktywni gracze (7d)" icon={<IconUsers size={16} />}
          value={fmtInt(stats.active.value)} delta={stats.active.delta} spark={stats.active.spark}
        />
        <StatCard
          label="Łączne XP" icon={<IconTrendUp size={16} />}
          value={fmtCompact(stats.xp.value)} delta={stats.xp.delta} spark={stats.xp.spark}
        />
        <StatCard
          label="Zarobione złoto" icon={<IconCoins size={16} />}
          value={`${fmtInt(Math.floor(stats.gold.value / COPPER_PER_GOLD))} g`} delta={stats.gold.delta} spark={stats.gold.spark}
        />
        <StatCard
          label="Zabójstwa" icon={<IconSwords size={16} />}
          value={fmtCompact(stats.kills.value)} delta={stats.kills.delta} spark={stats.kills.spark}
        />
      </div>

      <section className="gs-card gs-chart-card">
        <div className="gs-chart-head">
          <h2 className="gs-card-title">Aktywność gildii</h2>
          <MetricSelect value={metric} options={METRICS.map((k) => ({ value: k, label: METRIC_LABEL[k] }))} />
        </div>
        <ActivityChart
          days={days} values={chartValues} unit={CHART_UNIT[metric]}
          integer={metric === "kills" || metric === "active"} label={METRIC_LABEL[metric]}
        />
      </section>

      <div className="gs-overview-grid">
        <section className="gs-card gs-classes-card">
          <h2 className="gs-card-title">Klasy w gildii</h2>
          {classCounts.length === 0 ? <p className="gs-members-empty">Brak danych o klasach.</p> : (() => {
            const total = classCounts.reduce((sum, item) => sum + item.count, 0);
            let offset = 0;
            const gradient = classCounts.map((item) => {
              const start = offset / Math.max(total, 1) * 100;
              offset += item.count;
              const end = offset / Math.max(total, 1) * 100;
              return `${classColor(item.name)} ${start}% ${end}%`;
            }).join(", ");
            return <>
              <div className="gs-class-chart-wrap">
                <div className="gs-class-donut" style={{ background: `conic-gradient(${gradient})` }}>
                  <div className="gs-class-donut-center"><strong>{total}</strong><span>członków</span></div>
                </div>
              </div>
              <div className="gs-class-legend">
                {classCounts.map((item) => <div className="gs-class-legend-item" key={item.name}>
                  <span className="gs-class-label"><i style={{ backgroundColor: classColor(item.name) }} />{item.name}</span>
                  <span className="gs-class-count">{item.count}</span>
                </div>)}
              </div>
            </>;
          })()}
        </section>

        <section className="gs-card gs-events-card">
          <div className="gs-members-head">
            <div><h2 className="gs-card-title">Ostatnie eventy</h2><p className="gs-members-sub">Najnowsze zdarzenia z zaimportowanych danych</p></div>
            <span className="gs-members-count">{recentEvents.length}</span>
          </div>
          {recentEvents.length === 0 ? <p className="gs-members-empty">Brak zapisanych eventów.</p> : <div className="gs-events-list">
            {recentEvents.map((event) => <div className="gs-event-row" key={event.id}>
              <span className="gs-event-dot" style={{ backgroundColor: classColor(event.class) }} />
              <div className="gs-event-content">
                <div className="gs-event-main"><strong style={{ color: classColor(event.class) }}>{event.character}</strong><span>{eventDescription(event)}</span></div>
                <time>{formatEventDate(event.ts)}</time>
              </div>
            </div>)}
          </div>}
        </section>
      </div>


    </>
  );
}
