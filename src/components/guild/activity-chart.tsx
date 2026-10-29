import { fmtAxis, niceStep } from "../../lib/guild-format";
import { fmtAxisDay, fmtTipDay } from "../../lib/range";
import { smoothPath } from "../../lib/smooth";

// Wykres obszarowy renderowany na serwerze (czysty SVG). Podpowiedź po najechaniu:
// przezroczysty słupek na każdy dzień + <title>, bez JS.

export function ActivityChart({
  days, values, unit, integer, label,
}: { days: string[]; values: number[]; unit: string; integer: boolean; label: string }) {
  const W = 820, H = 330, L = 62, R = 14, T = 14, B = 34;
  const n = days.length;
  if (n === 0) return <p className="gs-empty">Brak danych do wykresu.</p>;

  const step = niceStep(Math.max(...values, 0), 4, integer);
  const top = Math.max(step, Math.ceil(Math.max(...values, 0) / step) * step);
  const ticks: number[] = [];
  for (let v = 0; v <= top + step / 1000; v += step) ticks.push(v);

  const x = (i: number) => (n === 1 ? (L + W - R) / 2 : L + (i / (n - 1)) * (W - L - R));
  const y = (v: number) => T + (1 - v / top) * (H - T - B);
  const pts: [number, number][] = values.map((v, i) => [x(i), y(v)]);
  const line = smoothPath(pts);
  const area = `${line}L${x(n - 1).toFixed(1)},${y(0).toFixed(1)}L${x(0).toFixed(1)},${y(0).toFixed(1)}Z`;

  // podpisy co `every` dni, licząc od ostatniego dnia
  const every = Math.max(1, Math.ceil(n / 11));
  const colW = n === 1 ? W - L - R : (W - L - R) / (n - 1);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="gs-chart" role="img" aria-label={`Wykres dzienny: ${label}`}>
      <defs>
        <linearGradient id="gs-area" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="var(--gs-gold)" stopOpacity="0.38" />
          <stop offset="1" stopColor="var(--gs-gold)" stopOpacity="0.02" />
        </linearGradient>
      </defs>

      {ticks.map((v) => (
        <g key={v}>
          <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="gs-grid" />
          <text x={L - 12} y={y(v) + 4} textAnchor="end" className="gs-tick">{fmtAxis(v)}</text>
        </g>
      ))}

      <path d={area} fill="url(#gs-area)" />
      <path d={line} className="gs-line" />

      {days.map((d, i) =>
        (n - 1 - i) % every === 0 ? (
          <text key={d} x={x(i)} y={H - 10} textAnchor="middle" className="gs-tick">{fmtAxisDay(d)}</text>
        ) : null,
      )}

      {days.map((d, i) => (
        <g key={d} className="gs-hit">
          <rect x={x(i) - colW / 2} y={T} width={colW} height={H - T - B} fill="transparent" />
          <line x1={x(i)} x2={x(i)} y1={T} y2={y(0)} className="gs-guide" />
          <circle cx={x(i)} cy={y(values[i])} r={4.5} className="gs-dot" />
          <title>{`${fmtTipDay(d)}: ${Math.round(values[i]).toLocaleString("pl-PL")} ${unit}`}</title>
        </g>
      ))}
    </svg>
  );
}
