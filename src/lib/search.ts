import { useNavigate } from "@tanstack/react-router";

/**
 * Plain query strings, so links stay readable and old links keep working:
 * ?size=2&malls=1022,1003&date=2026-12-18 (no JSON quoting of values).
 */
export function parseSearch(search: string): Record<string, string> {
  return Object.fromEntries(new URLSearchParams(search.startsWith("?") ? search.slice(1) : search));
}

export function stringifySearch(search: Record<string, unknown>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(search)) {
    if (v === undefined || v === null || v === "") continue;
    p.set(k, String(v));
  }
  const qs = p.toString().replace(/%2C/g, ",");
  return qs ? `?${qs}` : "";
}

/** Keep only string values from a parsed query, for validateSearch. */
export function pickStrings<K extends string>(raw: Record<string, unknown>, keys: readonly K[]): Partial<Record<K, string>> {
  const out: Partial<Record<K, string>> = {};
  for (const k of keys) {
    const v = raw[k];
    if (typeof v === "string" && v) out[k] = v;
    else if (typeof v === "number") out[k] = String(v);
  }
  return out;
}

export type SearchPatch = Record<string, string | null | undefined>;

/** Merge a patch into the current route's search. null or "" removes a key. Replaces history by default. */
export function useSetSearch() {
  const navigate = useNavigate();
  return (patch: SearchPatch, opts: { replace?: boolean } = {}) =>
    navigate({
      to: ".",
      search: ((prev: Record<string, unknown>) => {
        const next: Record<string, unknown> = { ...prev };
        for (const [k, v] of Object.entries(patch)) {
          if (v === null || v === undefined || v === "") delete next[k];
          else next[k] = v;
        }
        return next;
      }) as never,
      replace: opts.replace ?? true,
      resetScroll: false,
    });
}
