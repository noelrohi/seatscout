import { getShowtimes } from "../../server/domain";
import { client, errorResponse, isDate, isFilmId, isSiteId, json } from "../../server/ocapi";

const MAX_MALLS = 6;

// GET /api/showtimes?film=HO00000111&date=2026-12-18&sites=1022,1003
export const onRequestGet: PagesFunction = async (ctx) => {
  const url = new URL(ctx.request.url);
  const film = url.searchParams.get("film") ?? "";
  const date = url.searchParams.get("date") ?? "";
  const sites = [...new Set((url.searchParams.get("sites") ?? "").split(",").filter(Boolean))];
  if (!isFilmId(film) || !isDate(date) || !sites.length || !sites.every(isSiteId)) {
    return json({ error: "Expected film, date and sites" }, 0, 400);
  }
  if (sites.length > MAX_MALLS) return json({ error: `Choose up to ${MAX_MALLS} malls` }, 0, 400);
  try {
    const showtimes = await getShowtimes(film, date, sites.sort(), client(ctx));
    return json({ date, showtimes }, 300);
  } catch (e) {
    return errorResponse(e);
  }
};
