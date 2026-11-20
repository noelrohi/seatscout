// Client-side data store and a small priority queue that keeps us to a couple of
// requests in flight at a time. Days load progressively; nothing blocks on the whole range.
import { useSyncExternalStore } from "react";
import { ApiError, api } from "./api";
import type { Film, FilmDetail, Seats, Showtime, Site } from "./types";

export type Status<T> =
  | { state: "loading" }
  | { state: "ready"; data: T }
  | { state: "error"; error: string };

const MAX_IN_FLIGHT = 2;
const SEAT_BATCH = 6;
const SEATS_STALE_MS = 5 * 60_000;

let version = 0;
const listeners = new Set<() => void>();
function emit() {
  version++;
  listeners.forEach((l) => l());
}
export function useStore(): number {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => version,
  );
}

export const films: { status: Status<{ films: Film[]; sites: Site[] }> | null } = { status: null };
export const filmDetails = new Map<string, Status<FilmDetail>>();
/** key: film|date|site */
export const showtimes = new Map<string, Status<Showtime[]>>();
export const seats = new Map<string, Status<Seats>>();

const msg = (e: unknown) => (e instanceof Error ? e.message : "Request failed");

// ---------- priority queue ----------
type Task = { pri: number; seq: number; run: () => Promise<void> };
const queue: Task[] = [];
let running = 0;
let seq = 0;
/** Set when the cinema site asks us to slow down; the queue waits until then. */
export const pace = { pausedUntil: 0 };
let pumpTimer: ReturnType<typeof setTimeout> | null = null;
function enqueue(pri: number, run: () => Promise<void>) {
  queue.push({ pri, seq: seq++, run });
  queue.sort((a, b) => a.pri - b.pri || a.seq - b.seq);
  pump();
}
const LIST_PRI = -1000;
function pump() {
  const wait = pace.pausedUntil - Date.now();
  while (running < MAX_IN_FLIGHT && queue.length) {
    // While paused for the seat rate limit, only cheap list requests may run.
    if (wait > 0 && queue[0].pri >= LIST_PRI / 2) {
      if (!pumpTimer) pumpTimer = setTimeout(() => ((pumpTimer = null), pump()), wait);
      return;
    }
    const t = queue.shift()!;
    running++;
    t.run().finally(() => {
      running--;
      pump();
    });
  }
}

// ---------- loaders ----------
export function loadFilms() {
  if (films.status && films.status.state !== "error") return;
  films.status = { state: "loading" };
  emit();
  api
    .films()
    .then((data) => (films.status = { state: "ready", data }))
    .catch((e) => (films.status = { state: "error", error: msg(e) }))
    .finally(emit);
}

export function loadFilm(id: string) {
  const s = filmDetails.get(id);
  if (s && s.state !== "error") return;
  filmDetails.set(id, { state: "loading" });
  emit();
  api
    .film(id)
    .then((data) => filmDetails.set(id, { state: "ready", data }))
    .catch((e) => filmDetails.set(id, { state: "error", error: msg(e) }))
    .finally(emit);
}

export const stKey = (film: string, date: string, site: string) => `${film}|${date}|${site}`;

/** Load showtimes (and then seats) for one date across the given malls. Lower pri runs first. */
export function loadDay(film: string, date: string, sites: string[], pri: number) {
  const missing = sites.filter((s) => {
    const st = showtimes.get(stKey(film, date, s));
    return !st || st.state === "error";
  });
  // Seats for already-known showtimes may still need loading.
  for (const s of sites) {
    const st = showtimes.get(stKey(film, date, s));
    if (st?.state === "ready") loadSeats(st.data, pri);
  }
  if (!missing.length) return;
  missing.forEach((s) => showtimes.set(stKey(film, date, s), { state: "loading" }));
  emit();
  // Showtime lists are cheap and not rate-limited: fetch them all before any seat maps.
  enqueue(LIST_PRI + pri, async () => {
    try {
      const { showtimes: list } = await api.showtimes(film, date, missing);
      for (const s of missing) showtimes.set(stKey(film, date, s), { state: "ready", data: list.filter((x) => x.siteId === s) });
      emit();
      loadSeats(list, pri);
    } catch (e) {
      missing.forEach((s) => showtimes.set(stKey(film, date, s), { state: "error", error: msg(e) }));
      emit();
    }
  });
}

function loadSeats(list: Showtime[], pri: number) {
  const need = list.filter((st) => {
    const s = seats.get(st.id);
    if (!s || s.state === "error") return true;
    return s.state === "ready" && Date.now() - s.data.fetchedAt > SEATS_STALE_MS;
  });
  if (!need.length) return;
  need.forEach((st) => {
    if (!seats.has(st.id) || seats.get(st.id)!.state === "error") seats.set(st.id, { state: "loading" });
  });
  emit();
  for (let i = 0; i < need.length; i += SEAT_BATCH) {
    const batch = need.slice(i, i + SEAT_BATCH);
    enqueue(pri + 0.5, () => fetchSeats(batch.map((b) => ({ id: b.id, layoutId: b.layoutId, pri })), false).then(() => {}));
  }
}

const attempts = new Map<string, number>();
const MAX_ATTEMPTS = 8;

/** Returns seconds to wait if the cinema site asked us to slow down, else 0. */
async function fetchSeats(batch: Array<{ id: string; layoutId: string; pri?: number }>, fresh: boolean): Promise<number> {
  let retryAfter = 0;
  let retry: typeof batch = [];
  try {
    const res = await api.seats(batch, fresh);
    for (const s of res.seats) {
      seats.set(s.id, { state: "ready", data: s });
      attempts.delete(s.id);
    }
    for (const id of res.errors) if (seats.get(id)?.state !== "ready") seats.set(id, { state: "error", error: "Unable to load seats" });
    retry = batch.filter((b) => res.pending.includes(b.id));
    retryAfter = res.retryAfter;
  } catch (e) {
    if (e instanceof ApiError && e.status === 429) {
      retry = batch;
      retryAfter = e.retryAfter ?? 5;
    } else for (const b of batch) if (seats.get(b.id)?.state !== "ready") seats.set(b.id, { state: "error", error: msg(e) });
  }
  if (retry.length && retryAfter) {
    pace.pausedUntil = Math.max(pace.pausedUntil, Date.now() + retryAfter * 1000);
    if (!fresh) {
      const again = retry.filter((b) => {
        const n = (attempts.get(b.id) ?? 0) + 1;
        attempts.set(b.id, n);
        if (n < MAX_ATTEMPTS) return true;
        if (seats.get(b.id)?.state !== "ready") seats.set(b.id, { state: "error", error: "Seat data is busy" });
        return false;
      });
      if (again.length) enqueue((again[0].pri ?? 0) + 0.5, () => fetchSeats(again, false).then(() => {}));
    }
  }
  emit();
  return retryAfter;
}

/** Refetch one showtime's seats now. Resolves to seconds to wait if the site is busy. */
export async function refreshSeats(st: { id: string; layoutId: string }): Promise<number> {
  return fetchSeats([st], true);
}

/** Load seats for a single showtime directly (standalone showtime page). */
export function ensureSeats(st: { id: string; layoutId: string }) {
  const s = seats.get(st.id);
  if (s && s.state !== "error") return;
  seats.set(st.id, { state: "loading" });
  emit();
  enqueue(-1, () => fetchSeats([{ id: st.id, layoutId: st.layoutId, pri: -1 }], false).then(() => {}));
}
