const KEY = "seatscout.malls";
export const MAX_MALLS = 6;

export function loadMalls(): string[] | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string" && /^\d{4}$/.test(x)).slice(0, MAX_MALLS) : null;
  } catch {
    return null;
  }
}

export function saveMalls(ids: string[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(ids));
  } catch {}
}

export const REGIONS: Array<{ name: string; ids: string[] }> = [
  { name: "Metro Manila", ids: ["1001", "1003", "1005", "1006", "1011", "1012", "1015", "1017", "1018", "1019", "1020", "1022"] },
  { name: "North and South Luzon", ids: ["1007", "1009", "1013", "1024"] },
  { name: "Visayas and Mindanao", ids: ["1004", "1010", "1021", "1023"] },
];
