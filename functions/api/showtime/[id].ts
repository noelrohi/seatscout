import { getShowtime } from "../../../server/domain";
import { client, errorResponse, isShowtimeId, json } from "../../../server/ocapi";

export const onRequestGet: PagesFunction = async (ctx) => {
  const id = String(ctx.params.id);
  if (!isShowtimeId(id)) return json({ error: "Invalid showtime id" }, 0, 400);
  try {
    return json(await getShowtime(id, client(ctx)), 600);
  } catch (e) {
    return errorResponse(e);
  }
};
