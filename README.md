# SeatScout

Find Ayala Malls Cinemas showtimes that still have N seats together in a good spot, across malls and dates, without opening every seat map.

Unofficial. Not affiliated with Ayala Malls Cinemas or Ayala All Access.

## How it works

- `/` lists movies (now showing and coming soon).
- `/movie/:filmId` shows a mall × date heat grid. Each cell is the longest run of free seats in your seat zone across that day's showtimes. Tap a cell for showtime cards with mini seat maps.
- `/showtime/:id` (or the sheet on the movie screen) shows the full seat map and links to the official seat page.

All state lives in the URL, for example `/movie/HO00000111?size=2&malls=1022,1003,1001&date=2026-12-18`.

### Seat zones

- **Middle**: the center aisle block, in rows whose midpoint sits 20–45% of the way back from the screen. This scales with hall size (rows D–G of a 16-row hall).
- **Anywhere**: every seat.
- **Rows**: a custom row-letter range, optionally center section only.

Rows are split into blocks at aisle gaps (column jumps). The center block is the one nearest the hall's horizontal center.

## Data source

The booking site runs on Vista OCAPI at `https://digital-api.ayalaallaccess.com/ocapi/v1/` with a guest JWT read from `__NEXT_DATA__` on `https://www.ayalaallaccess.com/robots.txt`. Endpoints used:

| Endpoint | Use |
| --- | --- |
| `GET films` | Film list (title, rating id, runtime, release date) |
| `GET films/{filmId}` | Single film fallback |
| `GET sites` | Mall names |
| `GET film-screening-dates?siteIds=…` (max 5 sites) | Which film plays where on which date |
| `GET showtimes/by-business-date/{date}?filmIds=…&siteIds=…` (max 5 sites) | Showtimes, screens, formats, seat layout ids |
| `GET showtimes/{id}` | One showtime with film, site, screen |
| `GET showtimes/{id}/seat-layout` | Rows, seat labels, column positions |
| `GET showtimes/{id}/seat-availability` | Seat status per seat id |

Posters come from `ayala-digital-cdn.app.vista.co/media/entity/get/FilmPosterGraphic/{filmId}` or `film-cdn.moviexchange.com` when the film has a MovieXchange release id.

Seat endpoints are rate-limited upstream (a burst of about 10 calls, then roughly one every 1.5–2 s). The API layer keeps a token bucket, caches availability for 3 minutes, serves older copies when the budget runs out, and tells the browser when to retry. Everything upstream goes through Pages Functions under `functions/api`; the browser never calls the cinema API directly.

## Develop

```sh
bun install
bun run build
bunx wrangler pages dev --port 8788   # serves dist/ and functions/
bun run dev                            # Vite on :5173, proxies /api to :8788
```

Deploy: `bun run deploy` (Cloudflare Pages project `seatscout`).
