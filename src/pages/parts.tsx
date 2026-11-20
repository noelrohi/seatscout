import { useState } from "react";
import { Link } from "../lib/router";
import type { Film } from "../lib/types";

export function Poster({ film, className = "" }: { film: Film; className?: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className={`poster ${className}`}>
      {!failed && (
        <img src={film.poster} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} />
      )}
      {failed && <span className="poster-fallback" aria-hidden>{film.title}</span>}
    </span>
  );
}

export function FilmHeader({ film, meta }: { film: Film; meta: string[] }) {
  return (
    <header className="film-head">
      <Poster film={film} className="poster-sm" />
      <div className="film-head-text">
        <Link className="back" href="/">All movies</Link>
        <h1 className="film-title">{film.title}</h1>
        <p className="film-meta">
          {meta.map((m) => (
            <span key={m}>{m}</span>
          ))}
        </p>
      </div>
    </header>
  );
}
