import { useState } from "react";
import { fmtDateShort, plural } from "../lib/format";
import { MAX_MALLS, REGIONS } from "../lib/prefs";
import type { Site } from "../lib/types";

type Props = {
  sites: Site[];
  /** siteId -> sorted dates the film plays there */
  datesBySite: Map<string, string[]>;
  selected: string[];
  onDone: (ids: string[]) => void;
};

export function MallPicker({ sites, datesBySite, selected, onDone }: Props) {
  const [picked, setPicked] = useState<string[]>(selected.filter((id) => datesBySite.has(id)));
  const byId = new Map(sites.map((s) => [s.id, s]));
  const full = picked.length >= MAX_MALLS;

  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= MAX_MALLS ? p : [...p, id]));

  const regions = REGIONS.map((r) => ({
    ...r,
    sites: r.ids.map((id) => byId.get(id)).filter((s): s is Site => !!s).sort((a, b) => a.name.localeCompare(b.name)),
  }));
  const known = new Set(REGIONS.flatMap((r) => r.ids));
  const other = sites.filter((s) => !known.has(s.id));
  if (other.length) regions.push({ name: "Other malls", ids: other.map((s) => s.id), sites: other });

  return (
    <div className="picker">
      <h2 className="sheet-title">Choose malls</h2>
      <p className="muted">
        Compare up to {MAX_MALLS} malls at a time. {picked.length ? `${plural(picked.length, "mall", "malls")} chosen.` : ""}
      </p>
      {regions.map((r) => (
        <fieldset key={r.name} className="picker-group">
          <legend>{r.name}</legend>
          {r.sites.map((s) => {
            const dates = datesBySite.get(s.id);
            const on = picked.includes(s.id);
            const disabled = !dates || (!on && full);
            return (
              <label key={s.id} className={`picker-item${disabled ? " is-disabled" : ""}`}>
                <input type="checkbox" checked={on} disabled={disabled} onChange={() => toggle(s.id)} />
                <span className="picker-name">{s.name}</span>
                <span className="picker-meta">
                  {dates
                    ? dates.length > 1
                      ? `${fmtDateShort(dates[0])} – ${fmtDateShort(dates[dates.length - 1])}`
                      : fmtDateShort(dates[0])
                    : "Not showing"}
                </span>
              </label>
            );
          })}
        </fieldset>
      ))}
      <div className="picker-actions">
        <button type="button" className="btn btn-quiet" disabled={!picked.length} onClick={() => setPicked([])}>
          Clear all
        </button>
        <button type="button" className="btn btn-primary" disabled={!picked.length} onClick={() => onDone(picked)}>
          {picked.length ? `Show ${plural(picked.length, "mall", "malls")}` : "Choose a mall"}
        </button>
      </div>
    </div>
  );
}
