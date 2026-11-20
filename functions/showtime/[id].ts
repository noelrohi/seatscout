import { showtimeMeta, withMeta } from "../../server/meta";
import { client, isShowtimeId } from "../../server/ocapi";

export const onRequestGet: PagesFunction<{ ASSETS: Fetcher }> = (ctx) => {
  const id = String(ctx.params.id);
  return withMeta(ctx, async () => (isShowtimeId(id) ? showtimeMeta(client(ctx), id) : null));
};
