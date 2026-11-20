import { getFilm } from "../../../server/domain";
import { client, errorResponse, isFilmId, json } from "../../../server/ocapi";

export const onRequestGet: PagesFunction = async (ctx) => {
  const id = String(ctx.params.id);
  if (!isFilmId(id)) return json({ error: "Invalid film id" }, 0, 400);
  try {
    return json(await getFilm(id, client(ctx)), 300);
  } catch (e) {
    return errorResponse(e);
  }
};
