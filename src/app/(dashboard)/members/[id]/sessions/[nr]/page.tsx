import Link from "next/link";
import { notFound } from "next/navigation";
import { MetricSelect } from "../../../../../../components/guild/metric-select";
import { BarsChart } from "../../../../../../components/player/bars-chart";
import { BarList } from "../../../../../../components/charts";
import {
  QUALITY_LABEL,
  SOURCE_LABEL,
  classInfo,
  fmtDateTime,
  fmtDuration,
  fmtInt,
  fmtMoney,
  fmtTime,
} from "../../../../../../lib/format";
import { getSessionDetail } from "../../../../../../lib/player";
import { buildTimeline } from "../../../../../../lib/timeline";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;

const one = (v: string | string[] | undefined) =>
  Array.isArray(v) ? v[0] : v;

const METRICS = ["xp", "kills", "killsPve", "killsPvp", "dmg", "taken", "heal", "fights"] as const;

type Metric = (typeof METRICS)[number];

const METRIC_LABEL: Record<Metric, string> = {
  xp: "EXP",
  kills: "Zabójstwa (razem)",
  killsPve: "Zabójstwa PvE",
  killsPvp: "Zabójstwa PvP",
  dmg: "Obrażenia zadane",
  taken: "Obrażenia otrzymane",
  heal: "Leczenie wykonane",
  fights: "Walki",
};

const METRIC_UNIT: Record<Metric, string> = {
  xp: "exp",
  kills: "zabójstw",
  killsPve: "zabójstw PvE",
  killsPvp: "zabójstw PvP",
  dmg: "obrażeń",
  taken: "obrażeń",
  heal: "leczenia",
  fights: "walk",
};

const STATE_LABEL: Record<string, string> = {
  trwa: "trwa",
  zamknieta: "zamknięta",
  przerwana: "przerwana",
};

export default async function SessionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; nr: string }>;
  searchParams: Promise<SP>;
}) {
  const { id, nr } = await params;
  const sp = await searchParams;

  const cid = Number(id);
  const snr = Number(nr);

  if (
    !Number.isInteger(cid) ||
    cid < 1 ||
    !Number.isInteger(snr) ||
    snr < 0
  ) {
    notFound();
  }

  const m = one(sp.metric);

  const metric: Metric = (METRICS as readonly string[]).includes(m ?? "")
    ? (m as Metric)
    : "xp";

  const data = await getSessionDetail(cid, snr);

  if (!data) {
    notFound();
  }

  const { character: c, session: s } = data;
  const ci = classInfo(c.class);

  const durationSec = Math.max(0, (data.endMs - data.startMs) / 1000);
  const expTotal = data.exp.reduce((a, r) => a + r.amount, 0);

      const fights = data.fights;

  const sum = (pick: (f: (typeof fights)[number]) => number) =>
    fights.reduce((a, f) => a + pick(f), 0);

  const killsPve = sum((f) => (f.pvp ? 0 : f.kills));
  const killsPvp = sum((f) => (f.pvp ? f.kills : 0));
  const dmgDone = sum((f) => f.dmgDone);
  const dmgTaken = sum((f) => f.dmgTaken);
  const healDone = sum((f) => f.healDone);
  const healTaken = sum((f) => f.healTaken);
  const fightSec = sum((f) => f.seconds);

  const expPerHour =
    durationSec > 60 ? Math.round(expTotal / (durationSec / 3600)) : null;

  const dps = fightSec > 0 ? Math.round(dmgDone / fightSec) : null;

  const levels = data.exp
    .map((r) => r.level)
    .filter((l): l is number => l !== null);

  const lvlFrom = levels.length ? Math.min(...levels) : null;

  const lvlTo =
    levels.length > 0
      ? Math.max(...levels, ...data.levelUps.map((u) => u.level))
      : null;

  const levelText =
    lvlFrom === null
      ? "—"
      : lvlTo !== null && lvlTo !== lvlFrom
        ? `${lvlFrom} → ${lvlTo}`
        : String(lvlFrom);

  const timeline = buildTimeline(data.startMs, data.endMs, {
    xp: data.exp.map((r) => ({
      t: r.ts.getTime(),
      v: r.amount,
    })),
    kills: fights.map((f) => ({
      t: f.startedAt.getTime(),
      v: f.kills,
    })),
    killsPve: fights.map((f) => ({
      t: f.startedAt.getTime(),
      v: f.pvp ? 0 : f.kills,
    })),
    killsPvp: fights.map((f) => ({
      t: f.startedAt.getTime(),
      v: f.pvp ? f.kills : 0,
    })),
    dmg: fights.map((f) => ({
      t: f.startedAt.getTime(),
      v: f.dmgDone,
    })),
    taken: fights.map((f) => ({
      t: f.startedAt.getTime(),
      v: f.dmgTaken,
    })),
    heal: fights.map((f) => ({
      t: f.startedAt.getTime(),
      v: f.healDone,
    })),
    fights: fights.map((f) => ({
      t: f.startedAt.getTime(),
      v: 1,
    })),
  });

  const values = timeline.values[metric];

  const intMetric = metric === "kills" || metric === "killsPve" || metric === "killsPvp" || metric === "fights";

  const tips = timeline.labels.map(
    (l, i) =>
      `${l} (+${timeline.bucketMin} min): ${Math.round(
        values[i],
      ).toLocaleString("pl-PL")} ${METRIC_UNIT[metric]}`,
  );

  const zoneRows = data.zoneTotals
    .filter((z) => z.seconds >= 30)
    .map((z) => ({
      label: z.area,
      value: Math.round(z.seconds / 60),
    }));

  const sourceMap = new Map<string, number>();

  for (const r of data.exp) {
    sourceMap.set(
      r.source,
      (sourceMap.get(r.source) ?? 0) + r.amount,
    );
  }

  const sourceRows = [...sourceMap.entries()].map(([source, value]) => ({
    label: SOURCE_LABEL[source] ?? source,
    value,
  }));

  const tiles: [string, string][] = [
    [
      "Czas trwania",
      durationSec > 0 ? fmtDuration(durationSec) : "—",
    ],
    ["Zdobyte EXP", fmtInt(expTotal)],
    [
      "EXP / godzinę",
      expPerHour !== null ? fmtInt(expPerHour) : "—",
    ],
    ["Poziom", levelText],
    ["Zabójstwa PvE", fmtInt(killsPve)],
    ["Zabójstwa PvP", fmtInt(killsPvp)],
    ["Walki", fmtInt(fights.length)],
    ["Śmierci", fmtInt(data.deaths.length)],
    [
      "Obrażenia / sek. walki",
      dps !== null ? fmtInt(dps) : "—",
    ],
    ["Obrażenia zadane", fmtInt(dmgDone)],
    ["Obrażenia otrzymane", fmtInt(dmgTaken)],
    ["Leczenie wykonane", fmtInt(healDone)],
    ["Leczenie otrzymane", fmtInt(healTaken)],
    [
      "Złoto zdobyte",
      data.copperEarned > 0 ? fmtMoney(data.copperEarned) : "—",
    ],
    [
      "Złoto na starcie",
      data.goldStart !== null ? fmtMoney(data.goldStart) : "—",
    ],
    ["Reloady", String(s.reloads)],
    ["Awanse", String(data.levelUps.length)],
  ];

  const base = `/members/${c.id}`;

  return (
    <div className="gs-player-detail">
      <Link href={base} className="gs-player-back">
        ← Wróć do profilu: {c.name}
      </Link>

      <header className="gs-player-header">
        <div
          className="gs-player-class-mark"
          style={{ background: ci.color }}
          aria-hidden="true"
        />

        <div>
          <h1 className="gs-title">Sesja #{s.nr}</h1>

          <p className="gs-player-sub">
            {c.name} · {fmtDateTime(new Date(data.startMs))} –{" "}
            {fmtTime(data.endMs)}{" "}
            <span
              className="gs-session-state"
              data-state={s.state ?? ""}
            >
              {s.state ? STATE_LABEL[s.state] ?? s.state : "—"}
            </span>
          </p>
        </div>

        <div className="gs-session-nav">
          {data.prevNr !== null && (
            <Link
              className="gs-chip"
              href={`${base}/sessions/${data.prevNr}`}
            >
              ← #{data.prevNr}
            </Link>
          )}

          {data.nextNr !== null && (
            <Link
              className="gs-chip"
              href={`${base}/sessions/${data.nextNr}`}
            >
              #{data.nextNr} →
            </Link>
          )}
        </div>
      </header>

      <div className="gs-player-tiles">
        {tiles.map(([label, value]) => (
          <div className="gs-player-tile" key={label}>
            <b>{value}</b>
            <span>{label}</span>
          </div>
        ))}
      </div>

      <section
        className="gs-card gs-player-card"
        style={{ marginTop: 16 }}
      >
        <div className="gs-chart-head">
          <h2 className="gs-card-title">Przebieg sesji</h2>

          <MetricSelect
            value={metric}
            options={METRICS.map((k) => ({
              value: k,
              label: METRIC_LABEL[k],
            }))}
          />
        </div>

        <BarsChart
          labels={timeline.labels}
          values={values}
          unit={METRIC_UNIT[metric]}
          integer={intMetric}
          tips={tips}
          label={`Przebieg sesji: ${METRIC_LABEL[metric]}`}
        />

        <p className="gs-note">
          Każdy słupek to {timeline.bucketMin} min sesji, podpis oznacza
          godzinę początku (Europe/Warsaw).
        </p>
      </section>

      <div className="gs-player-grid">
        <section className="gs-card gs-player-card">
          <h2 className="gs-card-title">Ścieżka po strefach</h2>

          {data.zones.length === 0 ? (
            <p className="gs-members-empty">
              Brak zapisanych stref w tej sesji.
            </p>
          ) : (
            <ol className="gs-path">
              {data.zones.map((z, i) => (
                <li key={`${z.area}-${i}`}>
                  <time>{fmtTime(z.ts)}</time>

                  <span>
                    {z.area}
                    {z.sub ? <small>{z.sub}</small> : null}
                  </span>

                  <span>{fmtDuration(z.seconds)}</span>
                </li>
              ))}
            </ol>
          )}
        </section>

        <div className="gs-player-stack">
          <section className="gs-card gs-player-card">
            <h2 className="gs-card-title">Czas w strefach</h2>
            <BarList rows={zoneRows} unit="min" />
          </section>

          <section className="gs-card gs-player-card">
            <h2 className="gs-card-title">Źródła EXP</h2>
            <BarList rows={sourceRows} unit="exp" />
          </section>
        </div>
      </div>

      <section className="gs-card gs-player-card gs-player-table-card">
        <h2 className="gs-card-title">Walki ({fights.length})</h2>

        {fights.length === 0 ? (
          <p className="gs-members-empty">Brak walk w tej sesji.</p>
        ) : (
          <div className="gs-members-table-wrap">
            <table className="gs-members-table">
              <thead>
                <tr>
                  <th>Start</th>
                  <th>Czas</th>
                  <th>Cele</th>
                  <th>Zadane</th>
                  <th>DPS</th>
                  <th>Otrzymane</th>
                  <th>Leczenie</th>
                  <th>Zabici</th>
                  <th>Wynik</th>
                </tr>
              </thead>

              <tbody>
                {fights.slice(0, 100).map((f) => (
                  <tr key={f.eventId}>
                    <td>{fmtTime(f.startedAt)}</td>

                    <td>
                      {f.seconds > 0 ? fmtDuration(f.seconds) : "—"}
                    </td>

                    <td>
                      {f.targets ?? "—"}
                      {f.pvp ? " · PvP" : ""}
                    </td>

                    <td>{fmtInt(f.dmgDone)}</td>

                    <td>
                      {f.seconds > 0
                        ? fmtInt(Math.round(f.dmgDone / f.seconds))
                        : "—"}
                    </td>

                    <td>{fmtInt(f.dmgTaken)}</td>
                    <td>{fmtInt(f.healDone)}</td>
                    <td>{f.kills}</td>
                    <td>{f.died ? "śmierć" : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {fights.length > 100 && (
          <p className="gs-note">
            Pokazano pierwsze 100 walk z {fights.length}.
          </p>
        )}
      </section>

      {data.deaths.length > 0 && (
        <section className="gs-card gs-player-card gs-player-table-card">
          <h2 className="gs-card-title">
            Śmierci ({data.deaths.length})
          </h2>

          <div className="gs-members-table-wrap">
            <table className="gs-members-table">
              <thead>
                <tr>
                  <th>Kiedy</th>
                  <th>Miejsce</th>
                  <th>Zabójca</th>
                  <th>Ostatnie trafienie</th>
                  <th>Wytrzymałość</th>
                </tr>
              </thead>

              <tbody>
                {data.deaths.map((d) => (
                  <tr key={d.eventId}>
                    <td>{fmtTime(d.ts)}</td>

                    <td>
                      {d.zone ?? "—"}
                      {d.subzone ? ` — ${d.subzone}` : ""}
                      {d.instance && d.instance !== "none"
                        ? ` (${d.instance})`
                        : ""}
                    </td>

                    <td>
                      {d.killer ?? "nieznany"}
                      {d.pvp ? " · PvP" : ""}
                    </td>

                    <td>
                      {d.damage != null
                        ? `${fmtInt(d.damage)}${
                            d.spell ? ` (${d.spell})` : ""
                          }`
                        : "—"}
                    </td>

                    <td>
                      {d.durability != null
                        ? `${d.durability}%`
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <div className="gs-player-grid gs-player-grid-even">
        <section className="gs-card gs-player-card gs-player-table-card">
          <h2 className="gs-card-title">Loot ({data.loot.length})</h2>

          {data.loot.length === 0 ? (
            <p className="gs-members-empty">
              Brak lootu w tej sesji.
            </p>
          ) : (
            <div className="gs-members-table-wrap">
              <table className="gs-members-table">
                <thead>
                  <tr>
                    <th>Przedmiot</th>
                    <th>Jakość</th>
                    <th>Kiedy</th>
                  </tr>
                </thead>

                <tbody>
                  {data.loot.slice(0, 60).map((item, i) => (
                    <tr key={`${item.name}-${i}`}>
                      <td>
                        {item.name}
                        {item.qty > 1 ? ` ×${item.qty}` : ""}
                      </td>

                      <td>{QUALITY_LABEL[item.quality] ?? ""}</td>
                      <td>{fmtTime(item.ts)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {data.loot.length > 60 && (
            <p className="gs-note">
              Pokazano pierwsze 60 z {data.loot.length}.
            </p>
          )}
        </section>

        <section className="gs-card gs-player-card gs-player-table-card">
          <h2 className="gs-card-title">
            Oddane questy ({data.quests.length})
          </h2>

          {data.quests.length === 0 ? (
            <p className="gs-members-empty">
              Brak oddanych questów w tej sesji.
            </p>
          ) : (
            <div className="gs-members-table-wrap">
              <table className="gs-members-table">
                <thead>
                  <tr>
                    <th>Quest</th>
                    <th>EXP</th>
                    <th>Nagroda</th>
                    <th>Kiedy</th>
                  </tr>
                </thead>

                <tbody>
                  {data.quests.map((q, i) => (
                    <tr key={`${q.name}-${i}`}>
                      <td>{q.name}</td>
                      <td>{fmtInt(q.exp)}</td>
                      <td>{q.copper ? fmtMoney(q.copper) : "—"}</td>
                      <td>{fmtTime(q.ts)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}