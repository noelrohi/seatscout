import { useEffect, useMemo, useRef, useState } from "react";
import { HeatGrid, cellFor } from "../components/HeatGrid";
import { MallPicker } from "../components/MallPicker";
import { ShowtimeCard, ShowtimeDetail, zonePhrase } from "../components/Showtime";
import { Segmented, Sheet, Skeleton, Stepper } from "../components/ui";
import { api } from "../lib/api";
import { fmtDateLong, fmtDateShort, fmtRuntime, plural } from "../lib/format";
import { Link, setParams, useLocation } from "../lib/router";
import { MAX_MALLS, loadMalls, saveMalls } from "../lib/prefs";
import { analyzeCached, zoneFromParams, zoneToParams, type Zone } from "../lib/seats";
import { ensureSeats, pace, filmDetails, loadDay, loadFilm, seats, showtimes, stKey, useStore } from "../lib/store";
import type { Showtime, Site } from "../lib/types";
import { FilmHeader } from "./parts";

const ROW_LETTERS = "ABCDEFGHIJKLMNOPQRS".split("");
const MAX_SIZE = 10;

export function MoviePage({ filmId }: { filmId: string }) {
  useStore();
  const { params } = useLocation();
  useEffect(() => loadFilm(filmId), [filmId]);
  const fd = filmDetails.get(filmId);

  const size = Math.min(MAX_SIZE, Math.max(1, parseInt(params.get("size") ?? "", 10) || 2));
  const zone = zoneFromParams(params);
  const mallsParam = params.get("malls");
  const malls = useMemo(
    () => (mallsParam !== null ? mallsParam.split(",").filter((s) => /^\d{4}$/.test(s)) : loadMalls() ?? []).slice(0, MAX_MALLS),
    [mallsParam],
  );
  const [picker, setPicker] = useState(false);

  // Remembered malls go into the URL so the view can be shared as-is.
  useEffect(() => {
    if (mallsParam === null && malls.length) setParams({ malls: malls.join(",") });
  }, [mallsParam, malls]);

  const data = fd?.state === "ready" ? fd.data : null;
  const datesBySite = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const d of data?.dates ?? []) for (const s of d.sites) m.set(s, [...(m.get(s) ?? []), d.date]);
    return m;
  }, [data]);
  const playsSet = useMemo(() => new Set((data?.dates ?? []).flatMap((d) => d.sites.map((s) => `${d.date}|${s}`))), [data]);
  const plays = (date: string, site: string) => playsSet.has(`${date}|${site}`);
  const columns = useMemo(
    () => (data?.dates ?? []).filter((d) => d.sites.some((s) => malls.includes(s))).map((d) => d.date),
    [data, malls],
  );
  const siteById = useMemo(() => new Map((data?.sites ?? []).map((s) => [s.id, s])), [data]);
  const mallSites: Site[] = malls.map((id) => siteById.get(id) ?? { id, name: `Mall ${id}` });

  const dateParam = params.get("date");
  const selDate = dateParam && columns.includes(dateParam) ? dateParam : columns[0] ?? null;
  const selMall = params.get("mall") && malls.includes(params.get("mall")!) ? params.get("mall") : null;
  const show = params.get("show");

  // First visit with nothing chosen: open the mall picker.
  const autoOpened = useRef(false);
  useEffect(() => {
    if (data && !malls.length && datesBySite.size && !autoOpened.current) {
      autoOpened.current = true;
      setPicker(true);
    }
  }, [data, malls.length, datesBySite.size]);

  // Progressive loading: the selected date first, then the rest in order.
  useEffect(() => {
    if (!data || !malls.length) return;
    const order = selDate ? [selDate, ...columns.filter((d) => d !== selDate)] : columns;
    order.forEach((date, i) => {
      const sites = malls.filter((m) => plays(date, m));
      if (sites.length) loadDay(filmId, date, sites, i);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, filmId, columns, malls, selDate]);

  useEffect(() => {
    if (data) document.title = `${data.film.title} seats · SeatScout`;
  }, [data]);

  const setZone = (z: Zone) => setParams(zoneToParams(z));
  const chooseMalls = (ids: string[]) => {
    saveMalls(ids);
    setParams({ malls: ids.join(","), mall: selMall && ids.includes(selMall) ? selMall : null });
    setPicker(false);
  };

  if (!fd || fd.state === "loading") return <MovieSkeleton />;
  if (fd.state === "error")
    return (
      <main className="page">
        <div className="empty">
          <p className="empty-title">Unable to load this movie</p>
          <p className="muted">{fd.error}. Check the link, or go back and pick a movie from the list.</p>
          <Link className="btn btn-primary" href="/">See all movies</Link>
        </div>
      </main>
    );

  const film = data!.film;
  const meta = [film.rating, fmtRuntime(film.runtime), film.status === "soon" && film.releaseDate ? `Opens ${fmtDateShort(film.releaseDate)}` : null].filter(Boolean) as string[];

  return (
    <main className="page page-movie">
      <div className="movie-layout">
      <div className="movie-main">
      <FilmHeader film={film} meta={meta} />

      <section className="controls" aria-label="Filters">
        <div className="control">
          <span className="control-label" id="size-label">Seats together</span>
          <Stepper value={size} min={1} max={MAX_SIZE} label="Seats together" onChange={(n) => setParams({ size: n === 2 ? null : String(n) })} />
        </div>
        <div className="control">
          <span className="control-label">Malls</span>
          <button type="button" className="btn btn-field" onClick={() => setPicker(true)}>
            {malls.length ? plural(malls.length, "mall", "malls") : "Choose malls"}
            <svg viewBox="0 0 16 16" aria-hidden className="chev"><path d="M4.5 6.5 8 10l3.5-3.5" /></svg>
          </button>
        </div>
        <div className="control control-zone">
          <span className="control-label">Seat zone</span>
          <Segmented
            label="Seat zone"
            value={zone.kind}
            options={[
              { value: "middle", label: "Middle" },
              { value: "anywhere", label: "Anywhere" },
              { value: "custom", label: "Rows" },
            ]}
            onChange={(k) => setZone(k === "custom" ? { kind: "custom", from: "D", to: "G", centerOnly: true } : { kind: k })}
          />
        </div>
        {zone.kind === "custom" && (
          <div className="control control-rows">
            <label>
              <span className="control-label">From row</span>
              <select value={zone.from} onChange={(e) => setZone({ ...zone, from: e.target.value })}>
                {ROW_LETTERS.map((l) => <option key={l}>{l}</option>)}
              </select>
            </label>
            <label>
              <span className="control-label">To row</span>
              <select value={zone.to} onChange={(e) => setZone({ ...zone, to: e.target.value })}>
                {ROW_LETTERS.map((l) => <option key={l}>{l}</option>)}
              </select>
            </label>
            <label className="check">
              <input type="checkbox" checked={zone.centerOnly} onChange={(e) => setZone({ ...zone, centerOnly: e.target.checked })} />
              Center section only
            </label>
          </div>
        )}
        {zone.kind !== "anywhere" && (
          <p className="zone-hint muted">
            {zone.kind === "middle" ? "Center section, 20–45% back from the screen." : "Row A is closest to the screen."}
          </p>
        )}
      </section>

      {!malls.length ? (
        <div className="empty">
          <p className="empty-title">Choose malls to compare</p>
          <p className="muted">
            {datesBySite.size
              ? `${film.title} is showing at ${plural(datesBySite.size, "mall", "malls")}. Pick up to ${MAX_MALLS} to see where seats are left.`
              : "There are no showtimes for this movie yet. Check back closer to its release."}
          </p>
          {datesBySite.size > 0 && (
            <button type="button" className="btn btn-primary" onClick={() => setPicker(true)}>Choose malls</button>
          )}
        </div>
      ) : !columns.length ? (
        <div className="empty">
          <p className="empty-title">Not showing at these malls</p>
          <p className="muted">
            {datesBySite.size
              ? `${film.title} has no showtimes at the malls you chose. Try other malls.`
              : "There are no showtimes for this movie yet. Check back closer to its release."}
          </p>
          {datesBySite.size > 0 && <button type="button" className="btn btn-primary" onClick={() => setPicker(true)}>Choose malls</button>}
        </div>
      ) : (
          <section className="grid-section" aria-label="Seats by mall and date">
            <Progress film={filmId} dates={columns} malls={malls} plays={plays} />
            <HeatGrid
              film={filmId}
              dates={columns}
              malls={mallSites}
              plays={plays}
              zone={zone}
              size={size}
              selDate={selDate}
              selMall={selMall}
              onSelect={(date, mall) => setParams({ date, mall })}
            />
            <div className="heat-legend">
              <span><i className="sw sw-heat" />Fits {size}</span>
              <span><i className="sw sw-nofit" />No fit</span>
              <span><i className="sw sw-none" />Not showing</span>
              <span className="muted">Number: most seats together</span>
            </div>
          </section>
      )}
      </div>

      {malls.length > 0 && columns.length > 0 && selDate && (
        <aside className="movie-side">
            <DayPanel
              film={filmId}
              date={selDate}
              malls={selMall ? [selMall] : malls.filter((m) => plays(selDate, m))}
              siteById={siteById}
              zone={zone}
              size={size}
              onWiden={() => setZone({ kind: "anywhere" })}
              onShowAll={selMall ? () => setParams({ mall: null }) : undefined}
            />
        </aside>
      )}
      </div>

      <Sheet open={picker} onClose={() => setPicker(false)} title="Choose malls">
        {data && <MallPicker sites={data.sites} datesBySite={datesBySite} selected={malls} onDone={chooseMalls} />}
      </Sheet>

      <ShowSheet id={show} filmTitle={film.title} siteById={siteById} zone={zone} size={size} />
    </main>
  );
}

function DayPanel({
  film,
  date,
  malls,
  siteById,
  zone,
  size,
  onWiden,
  onShowAll,
}: {
  film: string;
  date: string;
  malls: string[];
  siteById: Map<string, Site>;
  zone: Zone;
  size: number;
  onWiden: () => void;
  onShowAll?: () => void;
}) {
  const groups = malls.map((m) => {
    const st = showtimes.get(stKey(film, date, m));
    const list = st?.state === "ready" ? sortByFit(st.data, zone, size) : null;
    return { mall: m, name: siteById.get(m)?.name ?? m, status: st, list };
  });
  const allReady = groups.every((g) => g.list);
  const cells = malls.map((m) => cellFor(film, date, m, true, zone, size));
  const settled = allReady && cells.every((c) => c.kind === "value" && !c.partial);
  const anyFit = cells.some((c) => c.kind === "value" && c.fits);
  const single = malls.length === 1;

  return (
    <section className="day" aria-labelledby="day-title">
      <header className="day-head">
        <div>
          <h2 id="day-title" className="day-title">{fmtDateLong(date)}</h2>
          {single && <p className="muted">{groups[0]?.name}</p>}
        </div>
        {onShowAll && (
          <button type="button" className="btn btn-quiet" onClick={onShowAll}>Show all malls</button>
        )}
      </header>

      {settled && !anyFit && (
        <div className="empty empty-inline">
          <p className="empty-title">No showtimes with {size} seats together {zonePhrase(zone)}</p>
          <p className="muted">Try another date or widen the seat zone.</p>
          {zone.kind !== "anywhere" && <button type="button" className="btn btn-primary" onClick={onWiden}>Search anywhere in the hall</button>}
        </div>
      )}

      {groups.map((g) => (
        <div key={g.mall} className="day-group">
          {!single && <h3 className="day-mall">{g.name}</h3>}
          {g.status?.state === "error" ? (
            <p className="muted">Unable to load showtimes for {g.name}. Pick the date again to retry.</p>
          ) : !g.list ? (
            <div className="cards">
              <Skeleton className="sk-card" />
              <Skeleton className="sk-card" />
            </div>
          ) : !g.list.length ? (
            <p className="muted">No showtimes at {g.name} on this date.</p>
          ) : (
            <div className="cards">
              {g.list.map((st) => (
                <ShowtimeCard
                  key={st.id}
                  st={st}
                  status={seats.get(st.id)}
                  zone={zone}
                  size={size}
                  onOpen={() => {
                    openedShow = true;
                    setParams({ show: st.id }, { replace: false });
                  }}
                />
              ))}
            </div>
          )}
        </div>
      ))}
    </section>
  );
}

function Progress({ film, dates, malls, plays }: { film: string; dates: string[]; malls: string[]; plays: (d: string, m: string) => boolean }) {
  let total = 0;
  let done = 0;
  let lists = 0;
  for (const d of dates)
    for (const m of malls) {
      if (!plays(d, m)) continue;
      const st = showtimes.get(stKey(film, d, m));
      if (st?.state !== "ready") {
        if (st?.state !== "error") lists++;
        continue;
      }
      for (const x of st.data) {
        total++;
        const s = seats.get(x.id)?.state;
        if (s === "ready" || s === "error") done++;
      }
    }
  if (!lists && done >= total) return null;
  const paused = pace.pausedUntil > Date.now();
  return (
    <div className="progress" role="status">
      <div className="progress-text">
        <span>{lists ? "Finding showtimes…" : `Checking seats: ${done} of ${plural(total, "showtime", "showtimes")}`}</span>
        {paused && <span className="muted">The cinema site limits seat checks. This can take a minute.</span>}
      </div>
      <div className="progress-bar" aria-hidden>
        <span style={{ width: `${total ? Math.round((done / total) * 100) : 4}%` }} />
      </div>
    </div>
  );
}

function sortByFit(list: Showtime[], zone: Zone, size: number): Showtime[] {
  const fit = (st: Showtime) => {
    const s = seats.get(st.id);
    if (s?.state !== "ready") return 1;
    return (analyzeCached(s.data, zone, size).best?.len ?? 0) >= size ? 0 : 2;
  };
  return [...list].sort((a, b) => fit(a) - fit(b) || a.startsAt.localeCompare(b.startsAt));
}

let openedShow = false;

function ShowSheet({
  id,
  filmTitle,
  siteById,
  zone,
  size,
}: {
  id: string | null;
  filmTitle: string;
  siteById: Map<string, Site>;
  zone: Zone;
  size: number;
}) {
  const [fetched, setFetched] = useState<Showtime | null>(null);
  let st: Showtime | null = null;
  if (id) {
    for (const v of showtimes.values()) {
      if (v.state === "ready") {
        const hit = v.data.find((x) => x.id === id);
        if (hit) {
          st = hit;
          break;
        }
      }
    }
  }
  if (!st && fetched?.id === id) st = fetched;

  useEffect(() => {
    if (!id || st) return;
    let live = true;
    api.showtime(id).then((r) => live && setFetched(r.showtime)).catch(() => {});
    return () => {
      live = false;
    };
  }, [id, !!st]);

  useEffect(() => {
    if (st) ensureSeats(st);
  }, [st?.id]);

  useEffect(() => {
    if (!id) openedShow = false;
  }, [id]);

  const close = () => {
    if (openedShow) {
      openedShow = false;
      history.back();
    } else setParams({ show: null });
  };

  return (
    <Sheet open={!!id} onClose={close} title="Showtime details">
      {st ? (
        <ShowtimeDetail st={st} siteName={siteById.get(st.siteId)?.name ?? ""} filmTitle={filmTitle} zone={zone} size={size} />
      ) : (
        <Skeleton className="sk-map-full" />
      )}
    </Sheet>
  );
}

function MovieSkeleton() {
  return (
    <main className="page page-movie" aria-busy="true">
      <div className="film-head">
        <Skeleton className="sk-poster" />
        <div className="film-head-text">
          <Skeleton className="sk-title" />
          <Skeleton className="sk-line" />
        </div>
      </div>
      <Skeleton className="sk-controls" />
      <Skeleton className="sk-grid" />
    </main>
  );
}
