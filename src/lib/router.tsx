import { useSyncExternalStore, type AnchorHTMLAttributes, type MouseEvent } from "react";

const EVT = "seatscout:navigate";

function subscribe(cb: () => void) {
  window.addEventListener("popstate", cb);
  window.addEventListener(EVT, cb);
  return () => {
    window.removeEventListener("popstate", cb);
    window.removeEventListener(EVT, cb);
  };
}

const snapshot = () => location.pathname + location.search;

export function useLocation() {
  const href = useSyncExternalStore(subscribe, snapshot);
  const url = new URL(href, location.origin);
  return { path: url.pathname, params: url.searchParams };
}

export function navigate(to: string, opts: { replace?: boolean; keepScroll?: boolean } = {}) {
  if (to === snapshot()) return;
  history[opts.replace ? "replaceState" : "pushState"](null, "", to);
  window.dispatchEvent(new Event(EVT));
  if (!opts.replace && !opts.keepScroll) window.scrollTo(0, 0);
}

/** Merge params into the current URL. null removes a key. */
export function setParams(patch: Record<string, string | null | undefined>, opts: { replace?: boolean } = { replace: true }) {
  const p = new URLSearchParams(location.search);
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === undefined || v === "") p.delete(k);
    else p.set(k, v);
  }
  const qs = p.toString().replace(/%2C/g, ",");
  navigate(location.pathname + (qs ? `?${qs}` : ""), { ...opts, keepScroll: true });
}

export function Link({ href, onClick, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  const handle = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    navigate(href);
  };
  return <a href={href} onClick={handle} {...rest} />;
}
