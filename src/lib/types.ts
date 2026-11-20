export type Film = {
  id: string;
  title: string;
  synopsis?: string;
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

export type FilmDetail = { film: Film; sites: Site[]; dates: Array<{ date: string; sites: string[] }> };

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

/** [label, [[column, seatNumber, free]]], front (screen) row first. */
export type SeatRow = [string, Array<[number, string, 0 | 1]>];

export type Seats = {
  id: string;
  fetchedAt: number;
  stale: boolean;
  free: number;
  total: number;
  soldOut: boolean;
  rows: SeatRow[];
};
