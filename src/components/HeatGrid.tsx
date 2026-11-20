import { fmtDateShort, fmtDayNum, fmtMonth, fmtWeekday, plural } from "../lib/format";
import { analyzeCached, type Zone } from "../lib/seats";
import { seats, showtimes, stKey } from "../lib/store";
import type { Site } from "../lib/types";

export type Cell =
  | { kind: "none" }
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "value"; value: number; fits: boolean; partial: boolean; count: number; fitCount: number };

export function cellFor(film: string, date: string, site: string, plays: boolean, zone: Zone, size: number): Cell {
  if (!plays) return { kind: "none" };
  const st = showtimes.get(stKey(film, date, site));
  if (!st || st.state === "loading") return { kind: "loading" };
  if (st.state === "error") return { kind: "error" };
  if (!st.data.length) return { kind: "none" };
  let value = 0;
  let loaded = 0;
  let fitCount = 0;
  let failed = 0;
  for (const s of st.data) {
    const ss = seats.get(s.id);
    if (ss?.state === "error") failed++;
    if (ss?.state !== "ready") continue;
    loaded++;
    const len = analyzeCached(ss.data, zone, size).best?.len ?? 0;
    value = Math.max(value, len);
    if (len >= size) fitCount++;
  }
  if (!loaded) return failed === st.data.length ? { kind: "error" } : { kind: "loading" };
  return { kind: "value", value, fits: value >= size, partial: loaded + failed < st.data.length, count: st.data.length, fitCount };
}

/** How comfortably the best block fits: 1 = just fits, 3 = plenty of room. */
function heatLevel(c: Cell, size: number): number {
  if (c.kind !== "value" || !c.fits) return 0;
  const extra = c.value - size;
  return extra <= 1 ? 1 : extra <= 4 ? 2 : 3;
}

function cellLabel(site: string, date: string, c: Cell, size: number): string {
  const d = fmtDateShort(date);
  if (c.kind === "none") return `${site}, ${d}: not showing`;
  if (c.kind === "loading") return `${site}, ${d}: loading`;
  if (c.kind === "error") return `${site}, ${d}: unable to load`;
  const n = plural(c.count, "showtime", "showtimes");
  return c.fits
    ? `${site}, ${d}: up to ${c.value} seats together, ${c.fitCount} of ${n} fit ${size}`
    : `${site}, ${d}: no ${size} seats together across ${n}`;
}

type Props = {
  film: string;
  dates: string[];
  malls: Site[];
  plays: (date: string, site: string) => boolean;
  zone: Zone;
  size: number;
  selDate: string | null;
  selMall: string | null;
  onSelect: (date: string, mall: string | null) => void;
};

export function HeatGrid({ film, dates, malls, plays, zone, size, selDate, selMall, onSelect }: Props) {
  return (
    <div className="heat-scroll" tabIndex={-1}>
      <table className="heat">
        <thead>
          <tr>
            <th scope="col" className="heat-corner">
              <span className="visually-hidden">Mall</span>
            </th>
            {dates.map((d, i) => {
              const newMonth = i === 0 || fmtMonth(dates[i - 1]) !== fmtMonth(d);
              const sel = selDate === d && !selMall;
              return (
                <th key={d} scope="col" className={`heat-date${newMonth ? " is-month" : ""}`}>
                  <button
                    type="button"
                    className={`heat-date-btn${sel ? " is-sel" : ""}${selDate === d ? " is-col" : ""}`}
                    aria-pressed={sel}
                    aria-label={`All malls, ${fmtDateShort(d)}`}
                    onClick={() => onSelect(d, null)}
                  >
                    <span className="heat-month">{newMonth ? fmtMonth(d) : " "}</span>
                    <span className="heat-wd">{fmtWeekday(d)}</span>
                    <span className="heat-dn">{fmtDayNum(d)}</span>
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {malls.map((m) => (
            <tr key={m.id}>
              <th scope="row" className="heat-mall">
                <span>{m.name}</span>
              </th>
              {dates.map((d) => {
                const c = cellFor(film, d, m.id, plays(d, m.id), zone, size);
                const sel = selDate === d && selMall === m.id;
                const cls = [
                  "cell",
                  `cell-${c.kind}`,
                  c.kind === "value" && (c.fits ? `is-fit heat-${heatLevel(c, size)}` : "is-nofit"),
                  c.kind === "value" && c.partial && "is-partial",
                  sel && "is-sel",
                ]
                  .filter(Boolean)
                  .join(" ");
                return (
                  <td key={d}>
                    {c.kind === "none" ? (
                      <span className={cls} role="img" aria-label={cellLabel(m.name, d, c, size)} />
                    ) : (
                      <button
                        type="button"
                        className={cls}
                        aria-pressed={sel}
                        aria-label={cellLabel(m.name, d, c, size)}
                        onClick={() => onSelect(d, m.id)}
                      >
                        {c.kind === "value" ? c.value : c.kind === "error" ? "!" : ""}
                      </button>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
