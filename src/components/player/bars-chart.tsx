import { fmtAxis, niceStep } from "../../lib/guild-format";

export function BarsChart({
  labels, values, unit, integer = true, label, tips,
}: {
  labels: string[];
  values: number[];
  unit: string;
  integer?: boolean;
  /** opis dla czytników ekranu */
  label: string;
  /** własne podpowiedzi (domyślnie "etykieta: wartość jednostka") */
  tips?: string[];
}) {
  const W = 820, H = 280, L = 62, R = 14, T = 14, B = 34;
  const n = labels.length;
  if (n === 0) return <p className="gs-empty">Brak danych do wykresu.</p>;

  const max = Math.max(...values, 0);
  const step = niceStep(max, 4, integer);
  const top = Math.max(step, Math.ceil(max / step) * step);
  const ticks: number[] = [];
  for (let v = 0; v <= top + step / 1000; v += step) ticks.push(v);

  const slot = (W - L - R) / n;
  const barW = Math.max(2, slot * 0.72);
  const y = (v: number) => T + (1 - v / top) * (H - T - B);
  const every = Math.max(1, Math.ceil(n / 12));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="gs-chart" role="img" aria-label={label}>
      {ticks.map((v) => (
        <g key={v}>
          <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="gs-grid" />
          <text x={L - 12} y={y(v) + 4} textAnchor="end" className="gs-tick">{fmtAxis(v)}</text>
        </g>
      ))}

      {values.map((v, i) => {
        const cx = L + slot * i + slot / 2;
        const h = Math.max(0, y(0) - y(v));
        return (
          <g key={i} className="gs-bar-hit">
            <rect x={L + slot * i} y={T} width={slot} height={H - T - B} fill="transparent" />
            {v > 0 && <rect x={cx - barW / 2} y={y(v)} width={barW} height={h} rx={Math.min(3, barW / 2)} className="gs-bar" />}
            <title>{tips?.[i] ?? `${labels[i]}: ${Math.round(v).toLocaleString("pl-PL")} ${unit}`}</title>
          </g>
        );
      })}

      {labels.map((l, i) =>
        i % every === 0 ? (
          <text key={i} x={L + slot * i + slot / 2} y={H - 10} textAnchor="middle" className="gs-tick">{l}</text>
        ) : null,
      )}
    </svg>
  );
}