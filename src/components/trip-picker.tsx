"use client";

import { useMemo, useState } from "react";
import { SOURCE_TYPES, shortDate } from "@/lib/format";
import type { SourceOption } from "@/lib/data/lookups";

/**
 * Pick a sourcing trip: recent ones in a list, any trip by typing its lot code, or a new trip inline.
 * Submits `source_id` ("" | uuid | "new") plus new_trip_* fields.
 */
export function TripPicker({
  sources,
  value,
  onChange,
  today,
}: {
  sources: SourceOption[];
  value: string;
  onChange: (id: string) => void;
  today: string;
}) {
  const [mode, setMode] = useState<"pick" | "search">("pick");
  const [query, setQuery] = useState("");
  const recent = useMemo(() => {
    const list = sources.slice(0, 40);
    const selected = sources.find((s) => s.id === value);
    if (selected && !list.includes(selected)) list.unshift(selected);
    return list;
  }, [sources, value]);
  const byCode = useMemo(() => new Map(sources.map((s) => [s.lot_code.toLowerCase(), s.id])), [sources]);

  return (
    <div className="space-y-2">
      <input type="hidden" name="source_id" value={value} />
      {mode === "pick" ? (
        <select
          className="input"
          value={value}
          onChange={(e) => {
            if (e.target.value === "__search") {
              setMode("search");
              return;
            }
            onChange(e.target.value);
          }}
        >
          <option value="">No trip / unknown</option>
          <option value="new">+ New trip…</option>
          {recent.map((s) => (
            <option key={s.id} value={s.id}>
              {s.lot_code}
              {s.place && !s.lot_code.startsWith(s.place) ? ` · ${s.place}` : ""}
            </option>
          ))}
          <option value="__search">Find an older trip…</option>
        </select>
      ) : (
        <div className="flex gap-2">
          <input
            className="input"
            list="all-trips"
            placeholder="Type a lot code, e.g. GS #1-7/26/25"
            value={query}
            autoFocus
            onChange={(e) => {
              setQuery(e.target.value);
              const id = byCode.get(e.target.value.trim().toLowerCase());
              if (id) {
                onChange(id);
                setMode("pick");
                setQuery("");
              }
            }}
          />
          <button type="button" className="btn-small" onClick={() => setMode("pick")}>
            Cancel
          </button>
          <datalist id="all-trips">
            {sources.map((s) => (
              <option key={s.id} value={s.lot_code}>
                {s.date ? shortDate(s.date) : ""}
              </option>
            ))}
          </datalist>
        </div>
      )}

      {value === "new" && (
        <div className="grid grid-cols-2 gap-2 rounded-xl border border-dashed border-border p-3">
          <label className="col-span-2 block">
            <span className="mb-1 block text-xs text-muted">Type</span>
            <select name="new_trip_type" className="input" defaultValue="garage_sale">
              {Object.entries(SOURCE_TYPES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="col-span-2 block">
            <span className="mb-1 block text-xs text-muted">Place (street, store or person)</span>
            <input name="new_trip_place" className="input" placeholder="e.g. Los Prados, Goodwill Rancho" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-muted">Date</span>
            <input name="new_trip_date" type="date" className="input" defaultValue={today} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-muted">Total spent</span>
            <input name="new_trip_total" className="input" inputMode="decimal" placeholder="$" />
          </label>
          <p className="col-span-2 text-xs text-muted">The lot code (like GS #2-10/12/26) is made for you.</p>
        </div>
      )}
    </div>
  );
}
