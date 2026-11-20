import { useEffect, useRef, type ReactNode } from "react";

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  // Only report closes the person started (Esc, backdrop, Close), not ones driven by props.
  const openRef = useRef(open);
  openRef.current = open;
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      document.documentElement.classList.add("no-scroll");
    }
    if (!open && d.open) d.close();
    return () => document.documentElement.classList.remove("no-scroll");
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="sheet"
      aria-label={title}
      onClose={() => {
        document.documentElement.classList.remove("no-scroll");
        if (openRef.current) onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) ref.current?.close();
      }}
    >
      <div className="sheet-body">
        <div className="sheet-head">
          <span className="sheet-grip" aria-hidden />
          <button type="button" className="btn btn-quiet sheet-close" onClick={() => ref.current?.close()}>
            Close
          </button>
        </div>
        {open && children}
      </div>
    </dialog>
  );
}

export function Stepper({ value, min, max, onChange, label }: { value: number; min: number; max: number; onChange: (n: number) => void; label: string }) {
  return (
    <div className="stepper" role="group" aria-label={label}>
      <button type="button" aria-label="Remove a seat" disabled={value <= min} onClick={() => onChange(value - 1)}>
        <svg viewBox="0 0 16 16" aria-hidden><path d="M3.5 8h9" /></svg>
      </button>
      <output aria-live="polite">{value}</output>
      <button type="button" aria-label="Add a seat" disabled={value >= max} onClick={() => onChange(value + 1)}>
        <svg viewBox="0 0 16 16" aria-hidden><path d="M3.5 8h9M8 3.5v9" /></svg>
      </button>
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <span className={`skeleton ${className}`} aria-hidden />;
}
