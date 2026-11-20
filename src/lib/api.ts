import type { Film, FilmDetail, Seats, Showtime, Site } from "./types";

export class ApiError extends Error {
  constructor(public status: number, message: string, public retryAfter?: number) {
    super(message);
  }
}

async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(path, { signal, headers: { accept: "application/json" } });
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    let retryAfter: number | undefined;
    try {
      const body = await res.json();
      msg = body.error ?? msg;
      retryAfter = body.retryAfter;
    } catch {}
    throw new ApiError(res.status, msg, retryAfter);
  }
  return res.json();
}

export const api = {
  films: () => get<{ films: Film[]; sites: Site[] }>("/api/films"),
  film: (id: string) => get<FilmDetail>(`/api/film/${encodeURIComponent(id)}`),
  showtimes: (film: string, date: string, sites: string[]) =>
    get<{ date: string; showtimes: Showtime[] }>(
      `/api/showtimes?film=${encodeURIComponent(film)}&date=${date}&sites=${[...sites].sort().join(",")}`,
    ),
  seats: (items: Array<{ id: string; layoutId: string }>, fresh = false) =>
    get<{ seats: Seats[]; pending: string[]; errors: string[]; retryAfter: number }>(
      `/api/seats?ids=${items.map((i) => `${i.id}~${i.layoutId}`).join(",")}${fresh ? "&fresh=1" : ""}`,
    ),
  showtime: (id: string) =>
    get<{ showtime: Showtime; site: Site; film: Film }>(`/api/showtime/${encodeURIComponent(id)}`),
};
