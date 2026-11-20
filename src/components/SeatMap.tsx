import type { Analysis } from "../lib/seats";
import type { Seats } from "../lib/types";

type Props = { seats: Seats; analysis: Analysis; variant: "mini" | "full"; label: string };

export function SeatMap({ seats, analysis, variant, label }: Props) {
  const full = variant === "full";
  const u = 10; // one seat cell
  const gapRow = 5; // blank cross-aisle row height
  const lab = full ? 14 : 9; // row-label gutter
  const top = full ? 18 : 9; // room for the screen

  let maxC = 0;
  for (const [, ss] of seats.rows) for (const [c] of ss) maxC = Math.max(maxC, c);
  const W = (maxC + 1) * u;

  const ys: number[] = [];
  let y = top;
  for (const [, ss] of seats.rows) {
    ys.push(y);
    y += ss.length ? u : gapRow;
  }
  const H = y + 2;
  const vbW = W + lab * 2;

  const zone = [...analysis.zoneRows].sort((a, b) => a - b);
  const band = zone.length ? { y: ys[zone[0]] - 1, h: ys[zone[zone.length - 1]] + u + 1 - ys[zone[0]] } : null;
  const best = analysis.best;

  return (
    <svg
      className={`seatmap seatmap-${variant}`}
      viewBox={`0 0 ${vbW} ${H}`}
      role="img"
      aria-label={label}
      preserveAspectRatio="xMidYMin meet"
    >
      <path
        className="seatmap-screen"
        d={`M ${lab + W * 0.12} ${full ? 9 : 5} Q ${lab + W / 2} ${full ? 3 : 1.5} ${lab + W * 0.88} ${full ? 9 : 5}`}
      />
      {full && (
        <text className="seatmap-screen-label" x={lab + W / 2} y={16} textAnchor="middle">
          Screen
        </text>
      )}
      {band && <rect className="seatmap-band" x={0} y={band.y} width={vbW} height={band.h} rx={3} />}
      {seats.rows.map(([rl, ss], ri) => {
        if (!ss.length) return null;
        const ty = ys[ri] + u / 2 + (full ? 2.4 : 2);
        return (
          <g key={ri}>
            <text className="seatmap-row" x={lab / 2} y={ty} textAnchor="middle">
              {rl}
            </text>
            {full && (
              <text className="seatmap-row" x={vbW - lab / 2} y={ty} textAnchor="middle">
                {rl}
              </text>
            )}
            {ss.map(([c, n, f], si) => {
              const cls = f ? (analysis.inZone[ri][si] ? "seat seat-fit" : "seat seat-free") : "seat seat-taken";
              return (
                <rect key={si} className={cls} x={lab + c * u + 1} y={ys[ri] + 1} width={u - 2} height={u - 2} rx={2}>
                  {full && <title>{`${rl}${n} ${f ? "free" : "taken"}`}</title>}
                </rect>
              );
            })}
          </g>
        );
      })}
      {best && (() => {
        const ss = seats.rows[best.ri][1];
        const x0 = lab + ss[best.si0][0] * u - 0.5;
        const x1 = lab + (ss[best.si1][0] + 1) * u + 0.5;
        return <rect className="seatmap-best" x={x0} y={ys[best.ri] - 0.5} width={x1 - x0} height={u + 1} rx={3} />;
      })()}
    </svg>
  );
}
