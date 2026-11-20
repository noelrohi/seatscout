import { useEffect, useState } from "react";
import { fmtAgo, fmtDateLong, fmtTime, plural } from "../lib/format";
import { analyzeCached as analyze, type Analysis, type Zone } from "../lib/seats";
import { refreshSeats, seats as seatStore, type Status } from "../lib/store";
import type { Seats, Showtime } from "../lib/types";
import { SeatMap } from "./SeatMap";
import { Skeleton } from "./ui";

export function zonePhrase(z: Zone): string {
  if (z.kind === "middle") return "in the middle";
  if (z.kind === "anywhere") return "anywhere";
  const rows = z.from === z.to ? `row ${z.from}` : `rows ${z.from}–${z.to}`;
  return z.centerOnly ? `in the center of ${rows}` : `in ${rows}`;
}

export const bookingUrl = (id: string) => `https://www.ayalaallaccess.com/order/showtimes/${id}/seats`;

export function bestText(a: Analysis | null, size: number): string {
  if (!a?.best) return "No free seats in your zone";
  if (a.best.len >= size) return `${a.best.label} · ${a.best.len} together`;
  return a.best.len === 1 ? "Only single seats left" : `Only ${a.best.len} together`;
}

export function mapLabel(s: Seats, a: Analysis, size: number) {
  return `Seat map. ${s.free} of ${s.total} seats free. ${bestText(a, size)}.`;
}

export function ShowtimeCard({
  st,
  status,
  zone,
  size,
  onOpen,
}: {
  st: Showtime;
  status: Status<Seats> | undefined;
  zone: Zone;
  size: number;
  onOpen: () => void;
}) {
  const s = status?.state === "ready" ? status.data : null;
  const a = s ? analyze(s, zone, size) : null;
  const fits = !!a?.best && a.best.len >= size;
  return (
    <button type="button" className={`st-card${fits ? " is-fit" : ""}`} onClick={onOpen}>
      <span className="st-top">
        <span className="st-time">{fmtTime(st.startsAt)}</span>
        {s ? (
          <span className={`st-badge${fits ? " is-fit" : ""}`}>{bestText(a, size)}</span>
        ) : status?.state === "error" ? (
          <span className="st-badge">Seats unavailable</span>
        ) : (
          <Skeleton className="sk-badge" />
        )}
      </span>
      <span className="st-meta">
        <span>{st.screen}</span>
        {st.formats.map((f) => (
          <span key={f} className="tag">{f}</span>
        ))}
        {s && <span className="st-free">{s.free} of {s.total} free</span>}
      </span>
      {s && a ? <SeatMap seats={s} analysis={a} variant="mini" label={mapLabel(s, a, size)} /> : <Skeleton className="sk-map" />}
    </button>
  );
}

function useNow(ms: number) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

export function ShowtimeDetail({
  st,
  siteName,
  filmTitle,
  zone,
  size,
}: {
  st: Showtime;
  siteName: string;
  filmTitle?: string;
  zone: Zone;
  size: number;
}) {
  const status = seatStore.get(st.id);
  const s = status?.state === "ready" ? status.data : null;
  const a = s ? analyze(s, zone, size) : null;
  const fits = !!a?.best && a.best.len >= size;
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(0);
  const now = useNow(15_000);

  return (
    <article className="detail">
      <header className="detail-head">
        {filmTitle && <p className="detail-film">{filmTitle}</p>}
        <h2 className="detail-time">{fmtTime(st.startsAt)}</h2>
        <p className="detail-where">
          {fmtDateLong(st.date)}
          <br />
          {siteName}, {st.screen}
        </p>
        {st.formats.length > 0 && (
          <p className="st-meta">
            {st.formats.map((f) => (
              <span key={f} className="tag">{f}</span>
            ))}
          </p>
        )}
      </header>

      <section className={`detail-best${fits ? " is-fit" : ""}`} aria-live="polite">
        {s && a ? (
          fits ? (
            <>
              <strong>{a.best!.label}</strong>
              <span>
                {a.best!.len} seats together {zonePhrase(zone)}
                {a.spots > 1 ? `, plus ${plural(a.spots - 1, "more spot", "more spots")} that fit ${size}` : ""}
              </span>
            </>
          ) : (
            <>
              <strong>No {size} seats together {zonePhrase(zone)}</strong>
              <span>{bestText(a, size)}. Widen the seat zone or pick another showtime.</span>
            </>
          )
        ) : status?.state === "error" ? (
          <strong>Unable to load seats. Refresh to try again.</strong>
        ) : (
          <Skeleton className="sk-line" />
        )}
      </section>

      <div className="detail-map">
        {s && a ? <SeatMap seats={s} analysis={a} variant="full" label={mapLabel(s, a, size)} /> : <Skeleton className="sk-map-full" />}
        <Legend />
      </div>

      <div className="detail-status">
        <span className="muted">
          {wait
            ? `The cinema site is busy. Try again in ${plural(wait, "second", "seconds")}.`
            : s
              ? `${s.free} of ${s.total} free. Updated ${fmtAgo(s.fetchedAt, now)}.`
              : "Loading seats…"}
        </span>
        <button
          type="button"
          className="btn btn-quiet"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setWait(0);
            const w = await refreshSeats(st);
            setBusy(false);
            if (w) {
              setWait(w);
              setTimeout(() => setWait(0), w * 1000);
            }
          }}
        >
          {busy ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      <a className="btn btn-primary btn-block" href={bookingUrl(st.id)} target="_blank" rel="noopener noreferrer">
        Book on Ayala All Access
      </a>
    </article>
  );
}

export function Legend() {
  return (
    <ul className="legend">
      <li><i className="sw sw-fit" />Free in your zone</li>
      <li><i className="sw sw-free" />Free elsewhere</li>
      <li><i className="sw sw-taken" />Taken</li>
      <li><i className="sw sw-best" />Best block</li>
    </ul>
  );
}
