import { useState } from "react";
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
