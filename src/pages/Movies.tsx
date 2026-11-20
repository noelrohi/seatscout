import { useEffect } from "react";
import { Segmented, Skeleton } from "../components/ui";
import { fmtDateShort, fmtRuntime, plural } from "../lib/format";
import { Link, getRouteApi } from "@tanstack/react-router";
import { useSetSearch } from "../lib/search";
import { films, loadFilms, useStore } from "../lib/store";
import type { Film } from "../lib/types";
import { Poster } from "./parts";

const route = getRouteApi("/");

export function MoviesPage() {
  useStore();
  useEffect(loadFilms, []);
  const search = route.useSearch();
  const setParams = useSetSearch();
  const tab = search.tab === "soon" ? "soon" : "now";
  const q = search.q ?? "";
  useEffect(() => {
    document.title = "SeatScout: find seats together";
  }, []);
  const status = films.status;

  const all = status?.state === "ready" ? status.data.films : [];
  const needle = q.trim().toLocaleLowerCase();
  const list = all
    .filter((f) => f.status === tab)
    .filter((f) => !needle || f.title.toLocaleLowerCase().includes(needle))
    .sort((a, b) =>
      tab === "now"
        ? b.malls - a.malls || a.title.localeCompare(b.title)
        : (a.releaseDate ?? "").localeCompare(b.releaseDate ?? "") || a.title.localeCompare(b.title),
    );
  const otherTabCount = needle ? all.filter((f) => f.status !== tab && f.title.toLocaleLowerCase().includes(needle)).length : 0;

  return (
    <main className="page">
      <h1 className="intro-title">Find seats together at Ayala Malls Cinemas</h1>

      <div className="movies-bar">
        <Segmented
          label="Movies"
          value={tab}
          options={[
            { value: "now", label: "Now showing" },
            { value: "soon", label: "Coming soon" },
          ]}
          onChange={(v) => setParams({ tab: v === "now" ? null : v })}
        />
        <label className="search">
          <span className="visually-hidden">Search movies</span>
          <svg viewBox="0 0 16 16" aria-hidden><circle cx="7" cy="7" r="4.5" /><path d="m10.5 10.5 3 3" /></svg>
          <input
            type="search"
            placeholder="Avengers"
            value={q}
            onChange={(e) => setParams({ q: e.target.value || null })}
          />
        </label>
      </div>

      {!status || status.state === "loading" ? (
        <div className="posters" aria-busy="true">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="movie-card">
              <Skeleton className="sk-poster-card" />
              <Skeleton className="sk-line" />
            </div>
          ))}
        </div>
      ) : status.state === "error" ? (
        <div className="empty">
          <p className="empty-title">Unable to load movies</p>
          <p className="muted">The cinema listings didn't respond. Wait a moment, then try again.</p>
          <button type="button" className="btn btn-primary" onClick={loadFilms}>Try again</button>
        </div>
      ) : !list.length ? (
        <div className="empty">
          <p className="empty-title">{needle ? `No ${tab === "now" ? "showing" : "upcoming"} movies match “${q.trim()}”` : "Nothing here yet"}</p>
          <p className="muted">
            {otherTabCount
              ? `${plural(otherTabCount, "match is", "matches are")} in ${tab === "now" ? "Coming soon" : "Now showing"}.`
              : "Check the spelling or clear the search."}
          </p>
          {otherTabCount ? (
            <button type="button" className="btn btn-primary" onClick={() => setParams({ tab: tab === "now" ? "soon" : null })}>
              {tab === "now" ? "Show coming soon" : "Show now showing"}
            </button>
          ) : needle ? (
            <button type="button" className="btn btn-primary" onClick={() => setParams({ q: null })}>Clear search</button>
          ) : null}
        </div>
      ) : (
        <ul className="posters">
          {list.map((f) => (
            <li key={f.id}>
              <MovieCard film={f} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function MovieCard({ film }: { film: Film }) {
  const runtime = fmtRuntime(film.runtime);
  return (
    <Link className="movie-card" to="/movie/$filmId" params={{ filmId: film.id }}>
      <Poster film={film} />
      <span className="movie-title">{film.title}</span>
      <span className="movie-meta">
        {film.rating && <span className="tag">{film.rating}</span>}
        {runtime && <span>{runtime}</span>}
        <span>
        {film.malls
          ? `${film.status === "soon" && film.releaseDate ? `Opens ${fmtDateShort(film.releaseDate)}, ` : ""}${plural(film.malls, "mall", "malls")}`
          : film.releaseDate
            ? `Opens ${fmtDateShort(film.releaseDate)}, no showtimes yet`
            : "No showtimes yet"}
        </span>
      </span>
    </Link>
  );
}
