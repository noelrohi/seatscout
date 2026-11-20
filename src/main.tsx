import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { Link, useLocation } from "./lib/router";
import { MoviePage } from "./pages/Movie";
import { MoviesPage } from "./pages/Movies";
import { ShowtimePage } from "./pages/ShowtimePage";
import "./styles.css";

function App() {
  const { path } = useLocation();
  const movie = path.match(/^\/movie\/([^/]+)\/?$/);
  const show = path.match(/^\/showtime\/([^/]+)\/?$/);

  useEffect(() => {
    if (!movie) document.title = show ? "Showtime seats · SeatScout" : "SeatScout: find seats together";
  }, [path]);

  return (
    <>
      <a className="skip" href="#content">Skip to content</a>
      <header className="topbar">
        <Link href="/" className="wordmark" aria-label="SeatScout home">
          <svg viewBox="0 0 28 16" aria-hidden className="wordmark-mark">
            <rect x="0" y="4" width="8" height="8" rx="2" />
            <rect x="10" y="4" width="8" height="8" rx="2" />
            <rect x="20" y="4" width="8" height="8" rx="2" />
          </svg>
          SeatScout
        </Link>
      </header>
      <div id="content">
        {movie ? (
          <MoviePage key={movie[1]} filmId={decodeURIComponent(movie[1])} />
        ) : show ? (
          <ShowtimePage id={decodeURIComponent(show[1])} />
        ) : path === "/" ? (
          <MoviesPage />
        ) : (
          <main className="page">
            <div className="empty">
              <p className="empty-title">Page not found</p>
              <p className="muted">This link doesn't lead anywhere. Start from the movie list.</p>
              <Link className="btn btn-primary" href="/">See all movies</Link>
            </div>
          </main>
        )}
      </div>
      <footer className="footer">
        <p>Unofficial. Not affiliated with Ayala Malls Cinemas.</p>
      </footer>
    </>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
