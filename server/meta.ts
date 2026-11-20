// Link previews: crawlers don't run JS, so rewrite the SPA shell's meta tags per page.
import { getFilms, getShowtime, getSites } from "./domain";
import type { Client } from "./ocapi";

export type Meta = {
  title: string;
  description: string;
  image: string;
  imageWidth?: number;
  imageHeight?: number;
  imageAlt: string;
  card: "summary" | "summary_large_image";
};

const fmtDate = (d: string) =>
  new Intl.DateTimeFormat("en-PH", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`));
const fmtTime = (iso: string) =>
  new Intl.DateTimeFormat("en-PH", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" }).format(new Date(iso));
const list = (xs: string[]) => new Intl.ListFormat("en", { type: "conjunction" }).format(xs);

function zonePhrase(p: URLSearchParams): string {
  const z = p.get("zone");
  if (z === "anywhere") return "anywhere";
  if (z === "custom") {
    const [a = "D", b = "G"] = (p.get("rows") ?? "D-G").toUpperCase().split("-");
    return a === b ? `in row ${a}` : `in rows ${a}–${b}`;
  }
  return "in the middle";
}

const posterFor = (url: string) => url.replace(/width=\d+/, "width=600");

export async function movieMeta(c: Client, filmId: string, p: URLSearchParams): Promise<Meta | null> {
  const [films, sites] = await Promise.all([getFilms(c), getSites(c)]);
  const film = films.find((f) => f.id === filmId);
  if (!film) return null;
  const size = Math.min(10, Math.max(1, parseInt(p.get("size") ?? "", 10) || 2));
  const names = new Map(sites.map((s) => [s.id, s.name]));
  const malls = (p.get("malls") ?? "").split(",").map((id) => names.get(id)).filter((n): n is string => !!n);
  const date = p.get("date");
  const where = malls.length ? ` at ${list(malls)}` : "";
  const when = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? ` on ${fmtDate(date)}` : "";
  return {
    title: `${film.title} seats · SeatScout`,
    description: `Showtimes with ${size} seats together ${zonePhrase(p)}${where}${when}.`,
    image: posterFor(film.poster),
    imageAlt: `Poster for ${film.title}`,
    card: "summary",
  };
}

export async function showtimeMeta(c: Client, id: string): Promise<Meta | null> {
  const { showtime, site, film } = await getShowtime(id, c);
  const formats = showtime.formats.length ? `, ${showtime.formats.join(" ")}` : "";
  return {
    title: `${film.title}, ${fmtDate(showtime.date)}, ${fmtTime(showtime.startsAt)} · SeatScout`,
    description: `${site.name}, ${showtime.screen}${formats}. See which seats are still free together.`,
    image: posterFor(film.poster),
    imageAlt: `Poster for ${film.title}`,
    card: "summary",
  };
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

/** Serve the SPA shell with this page's meta tags. Falls back to the plain shell on any error. */
export async function withMeta(
  ctx: { request: Request; env: { ASSETS: Fetcher } },
  build: () => Promise<Meta | null>,
): Promise<Response> {
  const shell = await ctx.env.ASSETS.fetch(new URL("/", ctx.request.url));
  let meta: Meta | null = null;
  try {
    meta = await build();
  } catch {
    meta = null;
  }
  if (!meta) return shell;
  const m = meta;
  const url = ctx.request.url;
  const set = (content: string) => ({
    element: (el: Element) => {
      el.setAttribute("content", content);
    },
  });
  const res = new HTMLRewriter()
    .on("title", {
      element: (el) => {
        el.setInnerContent(m.title);
      },
    })
    .on('meta[name="description"]', set(m.description))
    .on('meta[property="og:title"]', set(m.title))
    .on('meta[property="og:description"]', set(m.description))
    .on('meta[property="og:url"]', set(url))
    .on('meta[property="og:image"]', set(m.image))
    .on('meta[property="og:image:alt"]', set(m.imageAlt))
    .on('meta[property="og:image:width"]', {
      element: (el) => {
        el.remove();
      },
    })
    .on('meta[property="og:image:height"]', {
      element: (el) => {
        el.remove();
      },
    })
    .on('meta[name="twitter:card"]', set(m.card))
    .on("head", {
      element: (el) => {
        el.append(`<link rel="canonical" href="${esc(url)}" />`, { html: true });
      },
    })
    .transform(shell);
  const headers = new Headers(res.headers);
  headers.set("cache-control", "public, max-age=300");
  return new Response(res.body, { status: 200, headers });
}
