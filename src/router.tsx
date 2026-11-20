import { Link, Outlet, createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { pickStrings, parseSearch, stringifySearch } from "./lib/search";
import { MoviePage } from "./pages/Movie";
import { MoviesPage } from "./pages/Movies";
import { ShowtimePage } from "./pages/ShowtimePage";

function RootLayout() {
  return (
    <>
      <a className="skip" href="#content">Skip to content</a>
      <header className="topbar">
        <Link to="/" search={{}} className="wordmark" aria-label="SeatScout home">
          <svg viewBox="0 0 28 16" aria-hidden className="wordmark-mark">
            <rect x="0" y="4" width="8" height="8" rx="2" />
            <rect x="10" y="4" width="8" height="8" rx="2" />
            <rect x="20" y="4" width="8" height="8" rx="2" />
          </svg>
          SeatScout
        </Link>
      </header>
      <div id="content">
        <Outlet />
      </div>
      <footer className="footer">
        <p>Unofficial. Not affiliated with Ayala Malls Cinemas.</p>
      </footer>
    </>
  );
}

function NotFound() {
  return (
    <main className="page">
      <div className="empty">
        <p className="empty-title">Page not found</p>
        <p className="muted">This link doesn't lead anywhere. Start from the movie list.</p>
        <Link className="btn btn-primary" to="/" search={{}}>See all movies</Link>
      </div>
    </main>
  );
}

const rootRoute = createRootRoute({ component: RootLayout, notFoundComponent: NotFound });

export const MOVIES_KEYS = ["tab", "q"] as const;
const moviesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  validateSearch: (raw: Record<string, unknown>) => pickStrings(raw, MOVIES_KEYS),
  component: MoviesPage,
});

export const MOVIE_KEYS = ["size", "zone", "rows", "block", "malls", "date", "mall", "show", "fit"] as const;
const movieRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/movie/$filmId",
  validateSearch: (raw: Record<string, unknown>) => pickStrings(raw, MOVIE_KEYS),
  component: function MovieRoute() {
    const { filmId } = movieRoute.useParams();
    return <MoviePage key={filmId} filmId={filmId} />;
  },
});

export const SHOWTIME_KEYS = ["size", "zone", "rows", "block"] as const;
const showtimeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/showtime/$id",
  validateSearch: (raw: Record<string, unknown>) => pickStrings(raw, SHOWTIME_KEYS),
  component: function ShowtimeRoute() {
    const { id } = showtimeRoute.useParams();
    return <ShowtimePage key={id} id={id} />;
  },
});

export const router = createRouter({
  routeTree: rootRoute.addChildren([moviesRoute, movieRoute, showtimeRoute]),
  parseSearch,
  stringifySearch,
  defaultPreload: "intent",
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
