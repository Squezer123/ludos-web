import { fmtDay, fmtInt, fmtTime } from "../lib/format";

// Wykresy jako czysty SVG/HTML renderowany na serwerze (zero JS po stronie klienta).
// Kolory z tokenów CSS (globals.css): --series-1..3, --grid, --axis, --muted.

export interface Point { t: number; v: number; label: string }

function niceCeil(x: number): number {
  if (x <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(x)));
  const f = x / p;
  const nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  return nf * p;
}

/** Linia: wartość narastająco w czasie. Najechanie na punkt pokazuje opis (<title>). */
export function LineChart({ points, unit }: { points: Point[]; unit: string }) {
  const W = 720, H = 240, L = 56, R = 16, T = 12, B = 28;
  if (points.length === 0) return <p className="empty">Brak danych do wykresu.</p>;

  const t0 = points[0].t;
  let t1 = points[points.length - 1].t;
  if (t1 === t0) t1 = t0 + 60_000;
  const yMax = niceCeil(Math.max(...points.map((p) => p.v)));
  const x = (t: number) => L + ((t - t0) / (t1 - t0)) * (W - L - R);
  const y = (v: number) => T + (1 - v / yMax) * (H - T - B);

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * yMax);
  const xTicks = [0, 1 / 3, 2 / 3, 1].map((f) => t0 + f * (t1 - t0));
  const multiDay = t1 - t0 > 24 * 3600_000;
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
  const showDots = points.length <= 80;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label={`Wykres: ${unit} w czasie`}>
      {yTicks.map((v) => (
        <g key={v}>
          <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="grid" />
          <text x={L - 8} y={y(v) + 4} textAnchor="end" className="tick">{fmtInt(Math.round(v))}</text>
        </g>
      ))}
      <line x1={L} x2={W - R} y1={y(0)} y2={y(0)} className="axis" />
      {xTicks.map((t, i) => (
        <text key={i} x={x(t)} y={H - 8} textAnchor={i === 0 ? "start" : i === xTicks.length - 1 ? "end" : "middle"} className="tick">
          {multiDay ? fmtDay(t) : fmtTime(t)}
        </text>
      ))}
      <path d={path} className="line" />
      {showDots && points.map((p, i) => <circle key={i} cx={x(p.t)} cy={y(p.v)} r={3} className="dot" />)}
      {/* większe, niewidoczne pola trafienia + opis po najechaniu */}
      {points.map((p, i) => (
        <circle key={`h${i}`} cx={x(p.t)} cy={y(p.v)} r={10} fill="transparent">
          <title>{p.label}</title>
        </circle>
      ))}
    </svg>
  );
}

export interface BarRow { label: string; value: number; color?: string; note?: string }

/** Poziome słupki z podpisem po lewej i wartością po prawej. */
export function BarList({ rows, unit }: { rows: BarRow[]; unit?: string }) {
  if (rows.length === 0) return <p className="empty">Brak danych.</p>;
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <ul className="bars">
      {rows.map((r) => (
        <li key={r.label} title={`${r.label}: ${fmtInt(r.value)}${unit ? " " + unit : ""}`}>
          <span className="bar-label">{r.label}</span>
          <span className="bar-track">
            <span className="bar-fill" style={{ width: `${(r.value / max) * 100}%`, background: r.color ?? "var(--series-1)" }} />
          </span>
          <span className="bar-value">{fmtInt(r.value)}{r.note ? <small> {r.note}</small> : null}</span>
        </li>
      ))}
    </ul>
  );
}
