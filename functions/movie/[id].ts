import { movieMeta, showtimeMeta, withMeta } from "../../server/meta";
import { client, isFilmId, isShowtimeId } from "../../server/ocapi";

export const onRequestGet: PagesFunction<{ ASSETS: Fetcher }> = (ctx) => {
  const id = String(ctx.params.id);
  const url = new URL(ctx.request.url);
  const show = url.searchParams.get("show") ?? "";
  return withMeta(ctx, async () => {
    if (!isFilmId(id)) return null;
    // A link with an open showtime previews that showtime.
    if (isShowtimeId(show)) return showtimeMeta(client(ctx), show);
    return movieMeta(client(ctx), id, url.searchParams);
  });
};
