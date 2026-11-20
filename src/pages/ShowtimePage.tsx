import { useEffect, useState } from "react";
import { ShowtimeDetail } from "../components/Showtime";
import { Skeleton } from "../components/ui";
import { api } from "../lib/api";
import { Link, useLocation } from "../lib/router";
import { zoneFromParams, zoneToParams } from "../lib/seats";
import { ensureSeats, useStore } from "../lib/store";
import type { Film, Showtime, Site } from "../lib/types";

export function ShowtimePage({ id }: { id: string }) {
  useStore();
  const { params } = useLocation();
  const size = Math.min(10, Math.max(1, parseInt(params.get("size") ?? "", 10) || 2));
  const zone = zoneFromParams(params);
  const [data, setData] = useState<{ showtime: Showtime; site: Site; film: Film } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setData(null);
    setError(null);
    api
      .showtime(id)
      .then((r) => {
        if (!live) return;
        setData(r);
        ensureSeats(r.showtime);
      })
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [id]);

  if (error)
    return (
      <main className="page">
        <div className="empty">
          <p className="empty-title">Unable to find this showtime</p>
          <p className="muted">It may have ended or been removed. Pick a movie to see current showtimes.</p>
          <Link className="btn btn-primary" href="/">See all movies</Link>
        </div>
      </main>
    );

  if (!data)
    return (
      <main className="page page-narrow" aria-busy="true">
        <Skeleton className="sk-title" />
        <Skeleton className="sk-map-full" />
      </main>
    );

  const q = new URLSearchParams();
  q.set("malls", data.site.id);
  q.set("date", data.showtime.date);
  if (size !== 2) q.set("size", String(size));
  for (const [k, v] of Object.entries(zoneToParams(zone))) if (v) q.set(k, v);

  return (
    <main className="page page-narrow">
      <Link className="back" href={`/movie/${data.film.id}?${q.toString().replace(/%2C/g, ",")}`}>
        All showtimes for {data.film.title}
      </Link>
      <div className="detail-page">
        <ShowtimeDetail st={data.showtime} siteName={data.site.name} filmTitle={data.film.title} zone={zone} size={size} />
      </div>
    </main>
  );
}
