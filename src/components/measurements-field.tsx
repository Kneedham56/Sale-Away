"use client";

import { useState } from "react";
import { MEASUREMENT_NAMES, MEASUREMENT_PRESETS, type Measurement } from "@/lib/measurements";

/**
 * Clothing / shoe measurements: tap a set (Top, Bottoms, ...) to add its usual measurements, or add one at a time
 * from the drop-down. With `name`, a hidden input carries the list as JSON for a plain form post.
 */
export function MeasurementsField({
  initial,
  onChange,
  name,
  startOpen = false,
}: {
  initial: Measurement[];
  onChange?: (list: Measurement[]) => void;
  name?: string;
  startOpen?: boolean;
}) {
  const [rows, setRows] = useState<Measurement[]>(initial);
  const [open, setOpen] = useState(startOpen || initial.length > 0);
  const update = (next: Measurement[]) => {
    setRows(next);
    onChange?.(next.filter((m) => m.name.trim() && m.value.trim()));
  };
  const addSet = (names: string[]) => update([...rows, ...names.filter((n) => !rows.some((r) => r.name === n)).map((n) => ({ name: n, value: "" }))]);

  if (!open) {
    return (
      <button type="button" className="btn-small" onClick={() => setOpen(true)}>
        + Measurements (clothing, shoes, bags)
      </button>
    );
  }

  return (
    <div className="space-y-2">
      <span className="block text-sm font-medium">Measurements (inches, laid flat)</span>
      <div className="flex flex-wrap gap-1.5">
        {Object.entries(MEASUREMENT_PRESETS).map(([label, names]) => (
          <button key={label} type="button" className="chip" onClick={() => addSet(names)}>
            + {label}
          </button>
        ))}
      </div>
      {rows.map((m, i) => {
        const custom = !MEASUREMENT_NAMES.includes(m.name);
        return (
          <div key={i} className="flex items-center gap-2">
            {custom && m.name !== "" ? (
              <input
                className="input min-w-0 flex-1"
                value={m.name}
                aria-label="Measurement name"
                onChange={(e) => update(rows.map((r, j) => (j === i ? { ...r, name: e.target.value } : r)))}
              />
            ) : (
              <select
                className="input min-w-0 flex-1"
                value={m.name}
                aria-label="Measurement"
                onChange={(e) =>
                  update(rows.map((r, j) => (j === i ? { ...r, name: e.target.value === "__other" ? "Other" : e.target.value } : r)))
                }
              >
                <option value="">Choose…</option>
                {MEASUREMENT_NAMES.map((n) => (
                  <option key={n}>{n}</option>
                ))}
                <option value="__other">Something else…</option>
              </select>
            )}
            <input
              className="input w-24 px-3 text-center"
              inputMode="decimal"
              value={m.value}
              aria-label={`${m.name || "Measurement"} in inches`}
              placeholder="in"
              onChange={(e) => update(rows.map((r, j) => (j === i ? { ...r, value: e.target.value } : r)))}
            />
            <button
              type="button"
              className="px-2 text-lg text-muted"
              aria-label="Remove"
              onClick={() => update(rows.filter((_, j) => j !== i))}
            >
              ×
            </button>
          </div>
        );
      })}
      <button type="button" className="text-sm text-accent" onClick={() => update([...rows, { name: "", value: "" }])}>
        + Add one
      </button>
      {name && <input type="hidden" name={name} value={JSON.stringify(rows.filter((m) => m.name.trim() && m.value.trim()))} />}
    </div>
  );
}
