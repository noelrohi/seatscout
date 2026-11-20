import { getSeats, type Seats } from "../../server/domain";
import { RateLimited, client, errorResponse, isLayoutId, isShowtimeId, json, retryAfterSeconds } from "../../server/ocapi";

const MAX_IDS = 6;

// GET /api/seats?ids=1003-5263~1003-2-12,1003-5250~1003-3-13[&fresh=1]
// Each item is showtimeId~seatLayoutId (the layout id keys the long-lived layout cache).
// Upstream rate-limits seat calls, so some items may come back in `pending` with `retryAfter`.
export const onRequestGet: PagesFunction = async (ctx) => {
  const url = new URL(ctx.request.url);
  const fresh = url.searchParams.get("fresh") === "1";
  const items = (url.searchParams.get("ids") ?? "")
    .split(",")
    .filter(Boolean)
    .map((s) => s.split("~") as [string, string]);
  if (!items.length || items.length > MAX_IDS || !items.every(([id, l]) => isShowtimeId(id) && isLayoutId(l ?? ""))) {
    return json({ error: `Expected 1–${MAX_IDS} ids as showtimeId~layoutId` }, 0, 400);
  }
  try {
    const c = client(ctx);
    const seats: Seats[] = [];
    const pending: string[] = [];
    const errors: string[] = [];
    const reasons: string[] = [];
    // One at a time: the upstream budget is small, and a 429 should stop the batch early.
    for (const [id, l] of items) {
      try {
        seats.push(await getSeats(id, l, fresh, c));
      } catch (e) {
        if (e instanceof RateLimited) pending.push(id);
        else {
          errors.push(id);
          reasons.push(e instanceof Error ? e.message : String(e));
        }
      }
    }
    const retryAfter = pending.length ? retryAfterSeconds() : 0;
    const allFresh = !pending.length && !errors.length && seats.every((s) => !s.stale);
    return json({ seats, pending, errors, reasons, retryAfter }, allFresh && !fresh ? 60 : 0);
  } catch (e) {
    return errorResponse(e);
  }
};
