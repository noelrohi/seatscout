// Seat analysis: split rows into aisle-separated blocks, pick the zone, find runs of free seats.
import type { Seats } from "./types";

export type Zone =
  | { kind: "middle" }
  | { kind: "anywhere" }
  | { kind: "custom"; from: string; to: string; centerOnly: boolean };

export type Run = { ri: number; si0: number; si1: number; len: number; label: string };

export type Analysis = {
  /** Row indices (into seats.rows) that are in the zone. */
  zoneRows: Set<number>;
  /** inZone[ri][si] */
  inZone: boolean[][];
  best: Run | null;
  /** Number of separate places in the zone that fit the party. */
  spots: number;
  zoneFree: number;
};

/** Front-to-back fraction band used by the "Middle" zone (rows D–G of 16 ≈ 20–45%). */
export const MIDDLE_BAND: [number, number] = [0.2, 0.45];

export function rowRank(label: string): number {
  // A=1 … Z=26, AA=27 …
  let n = 0;
  for (const ch of label.toUpperCase()) {
    const c = ch.charCodeAt(0) - 64;
    if (c < 1 || c > 26) return NaN;
    n = n * 26 + c;
  }
  return n;
}

type Block = { si0: number; si1: number; c0: number; c1: number };

function blocks(seats: Seats["rows"][number][1]): Block[] {
  const out: Block[] = [];
  seats.forEach(([c], si) => {
    const last = out[out.length - 1];
    if (last && c - last.c1 <= 1) {
      last.si1 = si;
      last.c1 = c;
    } else out.push({ si0: si, si1: si, c0: c, c1: c });
  });
  return out;
}

function middleRows(seats: Seats): Set<number> {
  const seatRows = seats.rows.map((r, i) => (r[1].length ? i : -1)).filter((i) => i >= 0);
  const n = seatRows.length;
  const picked = new Set<number>();
  const [lo, hi] = MIDDLE_BAND;
  seatRows.forEach((ri, k) => {
    const f = (k + 0.5) / n;
    if (f >= lo && f <= hi) picked.add(ri);
  });
  if (!picked.size && n) {
    const target = (lo + hi) / 2;
    let bestK = 0;
    seatRows.forEach((_, k) => {
      if (Math.abs((k + 0.5) / n - target) < Math.abs((bestK + 0.5) / n - target)) bestK = k;
    });
    picked.add(seatRows[bestK]);
  }
  return picked;
}

export function analyze(seats: Seats, zone: Zone, size: number): Analysis {
  let minC = Infinity;
  let maxC = -Infinity;
  for (const [, ss] of seats.rows) for (const [c] of ss) {
    minC = Math.min(minC, c);
    maxC = Math.max(maxC, c);
  }
  const center = (minC + maxC) / 2;

  let zoneRows: Set<number>;
  let centerOnly: boolean;
  if (zone.kind === "anywhere") {
    zoneRows = new Set(seats.rows.map((_, i) => i));
    centerOnly = false;
  } else if (zone.kind === "middle") {
    zoneRows = middleRows(seats);
    centerOnly = true;
  } else {
    const a = rowRank(zone.from);
    const b = rowRank(zone.to);
    const [lo, hi] = a <= b ? [a, b] : [b, a];
    zoneRows = new Set();
    seats.rows.forEach(([l], i) => {
      const r = rowRank(l);
      if (r >= lo && r <= hi) zoneRows.add(i);
    });
    centerOnly = zone.centerOnly;
  }

  const inZone: boolean[][] = seats.rows.map(([, ss]) => ss.map(() => false));
  const runs: Run[] = [];
  let zoneFree = 0;
  seats.rows.forEach(([label, ss], ri) => {
    if (!zoneRows.has(ri) || !ss.length) return;
    let bs = blocks(ss);
    if (centerOnly && bs.length > 1) {
      const dist = (b: Block) => (center < b.c0 ? b.c0 - center : center > b.c1 ? center - b.c1 : 0);
      const d = Math.min(...bs.map(dist));
      bs = bs.filter((b) => dist(b) - d < 0.01);
    }
    for (const b of bs) {
      let start = -1;
      for (let si = b.si0; si <= b.si1 + 1; si++) {
        const free = si <= b.si1 && ss[si][2] === 1;
        if (si <= b.si1) inZone[ri][si] = true;
        if (free) {
          zoneFree++;
          if (start < 0) start = si;
        } else if (start >= 0) {
          const si1 = si - 1;
          const len = si1 - start + 1;
          runs.push({
            ri,
            si0: start,
            si1,
            len,
            label: len > 1 ? `${label}${ss[start][1]}–${label}${ss[si1][1]}` : `${label}${ss[start][1]}`,
          });
          start = -1;
        }
      }
    }
  });

  const mid = (r: Run) => {
    const ss = seats.rows[r.ri][1];
    return Math.abs((ss[r.si0][0] + ss[r.si1][0]) / 2 - center);
  };
  runs.sort((a, b) => b.len - a.len || mid(a) - mid(b));
  return {
    zoneRows,
    inZone,
    best: runs[0] ?? null,
    spots: runs.filter((r) => r.len >= size).length,
    zoneFree,
  };
}

export function zoneFromParams(p: URLSearchParams): Zone {
  const z = p.get("zone");
  if (z === "anywhere") return { kind: "anywhere" };
  if (z === "custom") {
    const [from = "D", to = "G"] = (p.get("rows") ?? "D-G").toUpperCase().split("-");
    const ok = (s: string) => /^[A-Z]{1,2}$/.test(s);
    return { kind: "custom", from: ok(from) ? from : "D", to: ok(to) ? to : "G", centerOnly: p.get("block") !== "all" };
  }
  return { kind: "middle" };
}

export function zoneToParams(z: Zone): Record<string, string | null> {
  if (z.kind === "custom") return { zone: "custom", rows: `${z.from}-${z.to}`, block: z.centerOnly ? null : "all" };
  return { zone: z.kind === "middle" ? null : z.kind, rows: null, block: null };
}

export function zoneKey(z: Zone): string {
  return z.kind === "custom" ? `custom:${z.from}-${z.to}:${z.centerOnly}` : z.kind;
}

const memo = new WeakMap<Seats, Map<string, Analysis>>();
/** analyze() memoised per seat snapshot, zone and party size. */
export function analyzeCached(seats: Seats, zone: Zone, size: number): Analysis {
  let m = memo.get(seats);
  if (!m) memo.set(seats, (m = new Map()));
  const k = `${zoneKey(zone)}|${size}`;
  let a = m.get(k);
  if (!a) m.set(k, (a = analyze(seats, zone, size)));
  return a;
}
