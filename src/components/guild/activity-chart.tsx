import { fmtAxis, niceStep } from "../../lib/guild-format";
import { fmtAxisDay, fmtTipDay } from "../../lib/range";
import { smoothPath } from "../../lib/smooth";

// Serwerowy wykres SVG z linią trendu oraz poziomą, przerywaną średnią.
export function ActivityChart({
  days,
  values,
  unit,
  integer,
  label,
}: {
  days: string[];
  values: number[];
  unit: string;
  integer: boolean;
  label: string;
}) {
  const W = 820, H = 330, L = 62, R = 14, T = 20, B = 34;
  const n = Math.min(days.length, values.length);
  if (n === 0) return <p className="gs-empty">Brak danych do wykresu.</p>;

  const chartDays = days.slice(-n);
  const chartValues = values.slice(-n).map((v) => (Number.isFinite(v) ? v : 0));
  const average = chartValues.reduce((total, value) => total + value, 0) / n;
  const maxValue = Math.max(...chartValues, average, 0);
  const step = niceStep(maxValue, 4, integer);
  const top = Math.max(step, Math.ceil(maxValue / step) * step);
  const ticks: number[] = [];
  for (let v = 0; v <= top + step / 1000; v += step) ticks.push(v);

  const x = (i: number) => n === 1 ? (L + W - R) / 2 : L + (i / (n - 1)) * (W - L - R);
  const y = (v: number) => T + (1 - v / top) * (H - T - B);
  const pts: [number, number][] = chartValues.map((v, i) => [x(i), y(v)]);
  const line = smoothPath(pts);
  const area = `${line}L${x(n - 1).toFixed(1)},${y(0).toFixed(1)}L${x(0).toFixed(1)},${y(0).toFixed(1)}Z`;
  const every = Math.max(1, Math.ceil(n / 11));
  const colW = n === 1 ? W - L - R : (W - L - R) / (n - 1);
  const averageY = y(average);
  const format = (value: number) => `${Math.round(value).toLocaleString("pl-PL")} ${unit}`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="gs-chart" role="img" aria-label={`Wykres dzienny: ${label}; średnia ${format(average)}`}>
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

      <line x1={L} x2={W - R} y1={averageY} y2={averageY} className="gs-average-line" />
      <rect x={W - R - 116} y={Math.max(2, averageY - 20)} width="112" height="17" rx="5" className="gs-average-label-bg" />
      <text x={W - R - 60} y={Math.max(14, averageY - 8)} textAnchor="middle" className="gs-average-label">Śr. {fmtAxis(average)}</text>

      {chartDays.map((d, i) =>
        (n - 1 - i) % every === 0 ? (
          <text key={d} x={x(i)} y={H - 10} textAnchor="middle" className="gs-tick">{fmtAxisDay(d)}</text>
        ) : null,
      )}
      {chartDays.map((d, i) => (
        <g key={d} className="gs-hit">
          <rect x={x(i) - colW / 2} y={T} width={colW} height={H - T - B} fill="transparent" />
          <line x1={x(i)} x2={x(i)} y1={T} y2={y(0)} className="gs-guide" />
          <circle cx={x(i)} cy={y(chartValues[i])} r={4.5} className="gs-dot" />
          <title>{`${fmtTipDay(d)}: ${format(chartValues[i])} · średnia: ${format(average)}`}</title>
        </g>
      ))}
    </svg>
  );
}
