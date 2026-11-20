import { getFilms, getSites } from "../../server/domain";
import { client, errorResponse, json } from "../../server/ocapi";

export const onRequestGet: PagesFunction = async (ctx) => {
  try {
    const c = client(ctx);
    const [films, sites] = await Promise.all([getFilms(c), getSites(c)]);
    return json({ films: films.map(({ synopsis: _s, ...f }) => f), sites }, 300);
  } catch (e) {
    return errorResponse(e);
  }
};
