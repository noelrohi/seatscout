import { ALL_SITE_IDS, chunk, ocapi, type Client } from "./ocapi";

type Text = { text: string } | null;

type UFilm = {
  id: string;
  title: Text;
  synopsis: Text;
  censorRatingId: string | null;
  releaseDate: string | null;
  runtimeInMinutes: number | null;
  trailerUrl: string | null;
  displayPriority: number;
  externalIds?: { moviexchangeReleaseId: string | null } | null;
};
type URating = { id: string; classification: Text };
type UAttr = { id: string; name: Text; shortName: Text; displayPriority: number };
type UScreen = { id: string; name: Text };
type UShowtime = {
  id: string;
  schedule: { businessDate: string; startsAt: string };
  isSoldOut: boolean;
  seatLayoutId: string;
  filmId: string;
  siteId: string;
  screenId: string;
  attributeIds: string[];
};

export type Film = {
  id: string;
  title: string;
  synopsis: string;
  rating: string | null;
  runtime: number | null;
  releaseDate: string | null;
  poster: string;
  trailer: string | null;
  status: "now" | "soon";
  malls: number;
  firstDate: string | null;
};

export type Site = { id: string; name: string };

export type Showtime = {
  id: string;
  filmId: string;
  siteId: string;
  date: string;
  startsAt: string;
  screen: string;
  formats: string[];
  layoutId: string;
  soldOut: boolean;
};

// [label, [[column, seatNumber, free(1|0)], ...]] ordered front (screen) to back.
export type SeatRow = [string, Array<[number, string, 0 | 1]>];
export type Seats = {
  id: string;
  fetchedAt: number;
  /** Served from an older copy because upstream was busy. */
  stale: boolean;
  free: number;
  total: number;
  soldOut: boolean;
  rows: SeatRow[];
};

const txt = (t: Text) => t?.text?.trim() ?? "";

export function manilaToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
}

export function posterUrl(f: UFilm, width = 342): string {
  const mx = f.externalIds?.moviexchangeReleaseId;
  return mx
    ? `https://film-cdn.moviexchange.com/api/cdn/release/${mx}/media/Poster?width=${width}`
    : `https://ayala-digital-cdn.app.vista.co/media/entity/get/FilmPosterGraphic/${f.id}?width=${width}`;
}

export function shortSiteName(name: string): string {
  return name.replace(/^Ayala Malls\s+/i, "").replace(/\s+Mall$/i, "").trim();
}

function mapFilm(f: UFilm, ratings: Map<string, string>, sites: Set<string> | undefined, firstDate: string | null, today: string): Film {
  const release = f.releaseDate ? f.releaseDate.slice(0, 10) : null;
  return {
    id: f.id,
    title: txt(f.title),
    synopsis: txt(f.synopsis),
    rating: (f.censorRatingId && ratings.get(f.censorRatingId)) || null,
    runtime: f.runtimeInMinutes || null,
    releaseDate: release,
    poster: posterUrl(f),
    trailer: f.trailerUrl || null,
    status: release && release > today ? "soon" : "now",
    malls: sites?.size ?? 0,
    firstDate,
  };
}

async function filmsRaw(c: Client) {
  return ocapi<{ films: UFilm[]; relatedData: { censorRatings: URating[] } }>(c, "films", { ttl: 3600, stale: 7 * 24 * 3600 });
}

export async function getSites(c: Client): Promise<Site[]> {
  const { data } = await ocapi<{ sites: Array<{ id: string; name: Text }> }>(c, "sites", { ttl: 24 * 3600, stale: 30 * 24 * 3600 });
  return data.sites
    .map((s) => ({ id: s.id, name: shortSiteName(txt(s.name)) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

type ScreeningDates = Map<string, Map<string, Set<string>>>; // filmId -> date -> siteIds

export async function getScreeningDates(c: Client): Promise<ScreeningDates> {
  const chunks = chunk(ALL_SITE_IDS, 5);
  const results = await Promise.all(
    chunks.map((ids) =>
      ocapi<{ filmScreeningDates: Array<{ businessDate: string; filmScreenings: Array<{ filmId: string; sites: Array<{ siteId: string }> }> }> }>(c, "film-screening-dates?" + ids.map((id) => `siteIds=${id}`).join("&"),
        { ttl: 1800, stale: 2 * 24 * 3600 },
      ),
    ),
  );
  const out: ScreeningDates = new Map();
  for (const r of results) {
    for (const d of r.data.filmScreeningDates ?? []) {
      for (const fs of d.filmScreenings) {
        let byDate = out.get(fs.filmId);
        if (!byDate) out.set(fs.filmId, (byDate = new Map()));
        let set = byDate.get(d.businessDate);
        if (!set) byDate.set(d.businessDate, (set = new Set()));
        for (const s of fs.sites) set.add(s.siteId);
      }
    }
  }
  return out;
}

export async function getFilms(c: Client): Promise<Film[]> {
  const [{ data }, screenings] = await Promise.all([filmsRaw(c), getScreeningDates(c)]);
  const ratings = new Map(data.relatedData.censorRatings.map((r) => [r.id, txt(r.classification)]));
  const today = manilaToday();
  return data.films.map((f) => {
    const byDate = screenings.get(f.id);
    const sites = new Set<string>();
    let first: string | null = null;
    for (const [date, ids] of byDate ?? []) {
      ids.forEach((id) => sites.add(id));
      if (!first || date < first) first = date;
    }
    return mapFilm(f, ratings, sites, first, today);
  });
}

export async function getFilm(id: string, c: Client) {
  const [films, screenings, sites] = await Promise.all([getFilms(c), getScreeningDates(c), getSites(c)]);
  let film = films.find((f) => f.id === id);
  if (!film) {
    const { data } = await ocapi<{ film: UFilm; relatedData: { censorRating: URating | null } }>(c, `films/${id}`, { ttl: 3600, stale: 7 * 24 * 3600 });
    const ratings = new Map<string, string>();
    if (data.relatedData?.censorRating) ratings.set(data.relatedData.censorRating.id, txt(data.relatedData.censorRating.classification));
    film = mapFilm(data.film, ratings, undefined, null, manilaToday());
  }
  const byDate = screenings.get(id) ?? new Map();
  const dates = [...byDate.entries()]
    .map(([date, ids]) => ({ date, sites: [...ids].sort() }))
    .sort((a, b) => a.date.localeCompare(b.date));
  return { film, sites, dates };
}

function screenName(name: string): string {
  // "GB Cinema 2" -> "Cinema 2"; keep anything unusual as-is.
  return name.replace(/^[A-Z]{2,3}\s+(?=Cinema\b)/, "").trim() || name;
}

function formatsFor(ids: string[], attrs: Map<string, UAttr>): string[] {
  return ids
    .map((id) => attrs.get(id))
    .filter((a): a is UAttr => !!a)
    .filter((a) => !/^C\d+$/i.test(txt(a.shortName) || txt(a.name)))
    .sort((a, b) => a.displayPriority - b.displayPriority)
    .map((a) => {
      const n = txt(a.name) || txt(a.shortName);
      return n === "INFIVISION" ? "Infinity Vision" : n;
    });
}

function mapShowtime(s: UShowtime, screens: Map<string, string>, attrs: Map<string, UAttr>): Showtime {
  return {
    id: s.id,
    filmId: s.filmId,
    siteId: s.siteId,
    date: s.schedule.businessDate,
    startsAt: s.schedule.startsAt,
    screen: screenName(screens.get(s.screenId) ?? ""),
    formats: formatsFor(s.attributeIds ?? [], attrs),
    layoutId: s.seatLayoutId,
    soldOut: s.isSoldOut,
  };
}

export async function getShowtimes(filmId: string, date: string, siteIds: string[], c: Client): Promise<Showtime[]> {
  const results = await Promise.all(
    chunk(siteIds, 5).map((ids) =>
      ocapi<{ showtimes: UShowtime[]; relatedData: { screens: UScreen[]; attributes: UAttr[] } }>(c, `showtimes/by-business-date/${date}?filmIds=${filmId}&` + ids.map((id) => `siteIds=${id}`).join("&"),
        { ttl: 600, stale: 24 * 3600 },
      ),
    ),
  );
  const out: Showtime[] = [];
  for (const { data } of results) {
    const screens = new Map((data.relatedData?.screens ?? []).map((s) => [s.id, txt(s.name)]));
    const attrs = new Map((data.relatedData?.attributes ?? []).map((a) => [a.id, a]));
    for (const s of data.showtimes ?? []) if (s.filmId === filmId) out.push(mapShowtime(s, screens, attrs));
  }
  return out.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

export async function getShowtime(id: string, c: Client) {
  const { data } = await ocapi<{
    showtime: UShowtime;
    relatedData: { site: { id: string; name: Text }; film: UFilm; screen: UScreen; attributes: UAttr[]; censorRating: URating | null };
  }>(c, `showtimes/${id}`, { ttl: 3600, stale: 7 * 24 * 3600 });
  const rd = data.relatedData;
  const screens = new Map([[rd.screen.id, txt(rd.screen.name)]]);
  const attrs = new Map((rd.attributes ?? []).map((a) => [a.id, a]));
  const ratings = new Map<string, string>();
  if (rd.censorRating) ratings.set(rd.censorRating.id, txt(rd.censorRating.classification));
  return {
    showtime: mapShowtime(data.showtime, screens, attrs),
    site: { id: rd.site.id, name: shortSiteName(txt(rd.site.name)) },
    film: mapFilm(rd.film, ratings, undefined, null, manilaToday()),
  };
}

type ULayout = {
  seatLayout: {
    id: string;
    areas: Array<{
      rows: Array<{ label: string | null; seats: Array<{ id: string; label: string; position: { columnNumber: number } }> }>;
    }>;
  };
};

export async function getSeats(showtimeId: string, layoutId: string, fresh: boolean, c: Client): Promise<Seats> {
  const [layout, avail] = await Promise.all([
    ocapi<ULayout>(c, `showtimes/${showtimeId}/seat-layout`, { ttl: 7 * 24 * 3600, stale: 30 * 24 * 3600, key: `layout/${layoutId}`, budget: true }),
    ocapi<{ seatAvailabilities: Array<{ seatId: string; status: string }>; isSoldOut: boolean }>(c, `showtimes/${showtimeId}/seat-availability`,
      { ttl: 180, stale: 12 * 3600, maxAge: fresh ? 20 : undefined, budget: true },
    ),
  ]);
  const status = new Map(avail.data.seatAvailabilities.map((s) => [s.seatId, s.status]));
  const raw: SeatRow[] = [];
  let minCol = Infinity;
  for (const area of layout.data.seatLayout.areas) {
    for (const r of area.rows) {
      const seats = r.seats
        .map((s) => [s.position.columnNumber, s.label, status.get(s.id) === "Available" ? 1 : 0] as [number, string, 0 | 1])
        .sort((a, b) => a[0] - b[0]);
      for (const s of seats) minCol = Math.min(minCol, s[0]);
      raw.push([r.label ?? "", seats]);
    }
  }
  // Upstream lists the back row first; put the screen-side row first.
  const labelled = raw.filter((r) => r[1].length);
  if (labelled.length > 1 && labelled[0][0] > labelled[labelled.length - 1][0]) raw.reverse();
  // Trim blank rows at the edges, normalise columns to start at 0.
  while (raw.length && !raw[0][1].length) raw.shift();
  while (raw.length && !raw[raw.length - 1][1].length) raw.pop();
  const rows = raw.map(([l, seats]) => [l, seats.map(([c, n, f]) => [c - minCol, n, f])] as SeatRow);
  const total = rows.reduce((n, r) => n + r[1].length, 0);
  const free = rows.reduce((n, r) => n + r[1].filter((s) => s[2]).length, 0);
  return { id: showtimeId, fetchedAt: avail.fetchedAt, stale: avail.stale, free, total, soldOut: avail.data.isSoldOut || free === 0, rows };
}
