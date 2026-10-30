import { smoothPath } from "../../lib/smooth";
import { fmtDelta } from "../../lib/guild-format";
import type { ReactNode } from "react";
import { IconArrowDownRight, IconArrowUpRight } from "./icons";

function Sparkline({ values }: { values: number[] }) {
  const W = 88, H = 30, P = 2;
  if (values.length < 2) return null;
  const min = Math.min(...values), max = Math.max(...values);
  const span = max - min || 1;
  const pts: [number, number][] = values.map((v, i) => [
    P + (i / (values.length - 1)) * (W - 2 * P),
    H - P - ((v - min) / span) * (H - 2 * P),
  ]);
  return (
    <svg className="gs-spark" width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden>
      <path d={smoothPath(pts)} />
    </svg>
  );
}

export function StatCard({
  label, icon, value, delta, spark, sub,
}: { label: string; icon: ReactNode; value: string; delta: number | null; spark: number[]; sub?: string }) {
  const dir = delta === null || delta === 0 ? "flat" : delta < 0 ? "down" : "up";
  return (
    <section className="gs-card gs-stat">
      <div className="gs-stat-label">{label}</div>
      <span className="gs-stat-icon">{icon}</span>
      <div className="gs-stat-value">{value}</div>
      {sub ? <div className="gs-stat-sub">{sub}</div> : null}
      <div className={`gs-delta gs-delta-${dir}`}>
        {delta === null ? (
          <span>brak danych z poprz. okresu</span>
        ) : (
          <>
            {dir === "down" && <IconArrowDownRight size={12} />}
            {dir === "up" && <IconArrowUpRight size={12} />}
            <b>{fmtDelta(delta)}</b>
            <span className="gs-vs"> vs poprz. okres</span>
          </>
        )}
      </div>
      <Sparkline values={spark} />
    </section>
  );
}
