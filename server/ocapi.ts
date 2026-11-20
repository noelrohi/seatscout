// Thin, cached client for the Vista OCAPI backend behind ayalaallaccess.com.
// Everything upstream goes through here: a guest token, an edge cache (Cache API
// plus a small in-isolate memory cache), request de-duplication and a
// concurrency cap so we stay a light client.

const BASE = "https://digital-api.ayalaallaccess.com/ocapi/v1/";
const TOKEN_SOURCE = "https://www.ayalaallaccess.com/robots.txt";
const CACHE_ORIGIN = "https://seatscout.cache/";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";
// Per request. The browser keeps two requests in flight, so one visitor drives at most ~6 upstream calls at once.
const MAX_CONCURRENCY = 3;

export class UpstreamError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

// ---------- caches ----------
// An entry is fresh until `expires`; it may still be served as stale until `staleUntil`.
type Entry = { body: string; fetchedAt: number; expires: number; staleUntil: number };
const mem = new Map<string, Entry>();
function memGet(key: string): Entry | undefined {
  const e = mem.get(key);
  if (!e) return;
  if (e.staleUntil < Date.now()) {
    mem.delete(key);
    return;
  }
  return e;
}
function memSet(key: string, e: Entry) {
  mem.delete(key);
  if (mem.size > 600) {
    const first = mem.keys().next().value;
    if (first) mem.delete(first);
  }
  mem.set(key, e);
}

function edgeCache(): Cache | undefined {
  try {
    return (caches as unknown as { default: Cache }).default;
  } catch {
    return undefined;
  }
}

async function cacheGet(key: string): Promise<Entry | undefined> {
  const m = memGet(key);
  if (m && m.expires > Date.now()) return m;
  const c = edgeCache();
  if (!c) return m;
  const hit = await c.match(new Request(CACHE_ORIGIN + key)).catch(() => undefined);
  if (!hit) return m;
  const fetchedAt = Number(hit.headers.get("x-fetched-at")) || Date.now();
  const expires = Number(hit.headers.get("x-expires")) || Date.now() + 60_000;
  const staleUntil = Number(hit.headers.get("x-stale-until")) || expires;
  const e = { body: await hit.text(), fetchedAt, expires, staleUntil };
  if (m && m.fetchedAt > e.fetchedAt) return m;
  memSet(key, e);
  return e;
}

function cachePut(key: string, e: Entry, wait?: (p: Promise<unknown>) => void) {
  memSet(key, e);
  const c = edgeCache();
  if (!c) return;
  const ttl = Math.max(1, Math.round((e.staleUntil - Date.now()) / 1000));
  const p = c
    .put(
      new Request(CACHE_ORIGIN + key),
      new Response(e.body, {
        headers: {
          "content-type": "application/json",
          "cache-control": `public, max-age=${ttl}`,
          "x-fetched-at": String(e.fetchedAt),
          "x-expires": String(e.expires),
          "x-stale-until": String(e.staleUntil),
        },
      }),
    )
    .catch(() => {});
  if (wait) wait(p);
}

// ---------- upstream rate budget ----------
// Seat endpoints allow a burst of about 10 calls, then roughly one every 1.5–2 s.
// Keep a token bucket per isolate (plain numbers, safe to share across requests) and
// back off hard when upstream says 429.
const BUCKET_SIZE = 6;
const REFILL_PER_SEC = 0.45;
let bucket = BUCKET_SIZE;
let bucketAt = Date.now();
let blockedUntil = 0;

function takeBudget(): boolean {
  const now = Date.now();
  if (now < blockedUntil) return false;
  bucket = Math.min(BUCKET_SIZE, bucket + ((now - bucketAt) / 1000) * REFILL_PER_SEC);
  bucketAt = now;
  if (bucket < 1) return false;
  bucket -= 1;
  return true;
}
export function retryAfterSeconds(): number {
  const now = Date.now();
  const wait = Math.max(blockedUntil - now, ((1 - Math.min(1, bucket)) / REFILL_PER_SEC) * 1000);
  return Math.max(2, Math.ceil(wait / 1000));
}
function noteRateLimited() {
  bucket = 0;
  bucketAt = Date.now();
  blockedUntil = Date.now() + 8_000;
}

export class RateLimited extends Error {
  constructor() {
    super("Seat data is busy");
  }
}

// ---------- guest token ----------
let token: { value: string; exp: number } | null = null;

function jwtExp(jwt: string): number {
  try {
    const part = jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = JSON.parse(atob(part + "=".repeat((4 - (part.length % 4)) % 4)));
    return Number(json.exp) * 1000;
  } catch {
    return Date.now() + 60 * 60 * 1000;
  }
}

async function fetchToken(): Promise<string> {
  const res = await fetch(TOKEN_SOURCE, {
    headers: { "user-agent": UA, accept: "text/html,*/*" },
  });
  if (!res.ok) throw new UpstreamError(502, `Token page returned ${res.status}`);
  const html = await res.text();
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) throw new UpstreamError(502, "Token page had no __NEXT_DATA__");
  const value: string | undefined = JSON.parse(m[1])?.props?.pageProps?.environment?.gasToken;
  if (!value) throw new UpstreamError(502, "Token page had no gasToken");
  return value;
}

async function getToken(c: Client, force = false): Promise<string> {
  const now = Date.now();
  if (!force && token && token.exp - 5 * 60_000 > now) return token.value;
  if (!force) {
    const cached = await cacheGet("token");
    if (cached) {
      const exp = jwtExp(cached.body);
      if (exp - 5 * 60_000 > now) {
        token = { value: cached.body, exp };
        return cached.body;
      }
    }
  }
  // Promises can't be shared across requests in Workers, so de-dupe per request only.
  if (!c.tokenInflight) {
    c.tokenInflight = fetchToken().then((value) => {
      const exp = jwtExp(value);
      token = { value, exp };
      cachePut("token", { body: value, fetchedAt: Date.now(), expires: exp - 5 * 60_000, staleUntil: exp - 5 * 60_000 }, c.wait);
      return value;
    });
    c.tokenInflight.catch(() => (c.tokenInflight = null));
  }
  return c.tokenInflight;
}

// ---------- per-request client ----------
export type Client = {
  wait: (p: Promise<unknown>) => void;
  tokenInflight: Promise<string> | null;
  inflight: Map<string, Promise<Entry>>;
  active: number;
  queue: Array<() => void>;
};

export function client(ctx: { waitUntil: (p: Promise<unknown>) => void }): Client {
  return { wait: (p) => ctx.waitUntil(p), tokenInflight: null, inflight: new Map(), active: 0, queue: [] };
}

async function limited<T>(c: Client, fn: () => Promise<T>): Promise<T> {
  if (c.active >= MAX_CONCURRENCY) await new Promise<void>((r) => c.queue.push(r));
  c.active++;
  try {
    return await fn();
  } finally {
    c.active--;
    c.queue.shift()?.();
  }
}

export type Fetched<T> = { data: T; fetchedAt: number; stale: boolean };

export async function ocapi<T>(
  c: Client,
  path: string,
  opts: {
    ttl: number; // seconds a copy counts as fresh
    stale?: number; // seconds a copy may still be served when upstream is busy or failing
    key?: string; // cache key override
    maxAge?: number; // seconds; ask for a newer copy than this (used by Refresh)
    budget?: boolean; // count against the seat-endpoint rate budget
  },
): Promise<Fetched<T>> {
  const key = "ocapi/" + (opts.key ?? path);
  const now = Date.now();
  const cached = await cacheGet(key);
  const wantFresh = (e: Entry) =>
    e.expires > now && (opts.maxAge === undefined || now - e.fetchedAt < opts.maxAge * 1000);
  if (cached && wantFresh(cached)) return { data: JSON.parse(cached.body) as T, fetchedAt: cached.fetchedAt, stale: false };
  const fallback = cached && cached.staleUntil > now ? cached : undefined;
  const serveStale = () => ({ data: JSON.parse(fallback!.body) as T, fetchedAt: fallback!.fetchedAt, stale: true });

  if (opts.budget && !takeBudget()) {
    if (fallback) return serveStale();
    throw new RateLimited();
  }

  let p = c.inflight.get(key);
  if (!p) {
    p = (async () => {
      const run = async (tok: string) =>
        limited(c, () =>
          fetch(BASE + path, {
            headers: { authorization: `Bearer ${tok}`, accept: "application/json", "user-agent": UA },
          }),
        );
      let res = await run(await getToken(c));
      if (res.status === 401) res = await run(await getToken(c, true));
      if (res.status === 429) {
        noteRateLimited();
        throw new RateLimited();
      }
      if (!res.ok) {
        throw new UpstreamError(res.status === 404 ? 404 : 502, `Upstream ${res.status} for ${path}`);
      }
      const body = await res.text();
      const t = Date.now();
      const e = { body, fetchedAt: t, expires: t + opts.ttl * 1000, staleUntil: t + Math.max(opts.ttl, opts.stale ?? 0) * 1000 };
      cachePut(key, e, c.wait);
      return e;
    })();
    c.inflight.set(key, p);
  }
  try {
    const e = await p;
    return { data: JSON.parse(e.body) as T, fetchedAt: e.fetchedAt, stale: false };
  } catch (err) {
    if (fallback && (err instanceof RateLimited || err instanceof UpstreamError)) return serveStale();
    throw err;
  }
}

// ---------- helpers ----------
export function json(data: unknown, maxAge: number, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": maxAge > 0 ? `public, max-age=${maxAge}` : "no-store",
    },
  });
}

export function errorResponse(err: unknown): Response {
  if (err instanceof RateLimited) {
    const after = retryAfterSeconds();
    return new Response(JSON.stringify({ error: "Seat data is busy. Try again in a few seconds.", retryAfter: after }), {
      status: 429,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "retry-after": String(after) },
    });
  }
  if (err instanceof UpstreamError) {
    return json({ error: err.message }, 0, err.status === 404 ? 404 : 502);
  }
  return json({ error: err instanceof Error ? err.message : "Unknown error" }, 0, 500);
}

export function chunk<T>(xs: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

export const ALL_SITE_IDS = [
  "1001", "1003", "1004", "1005", "1006", "1007", "1009", "1010", "1011", "1012",
  "1013", "1015", "1017", "1018", "1019", "1020", "1021", "1022", "1023", "1024",
];

export const isFilmId = (s: string) => /^[A-Za-z0-9]{4,20}$/.test(s);
export const isSiteId = (s: string) => /^\d{4}$/.test(s);
export const isShowtimeId = (s: string) => /^\d{4}-\d{1,7}$/.test(s);
export const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
export const isLayoutId = (s: string) => /^[\w-]{3,40}$/.test(s);
