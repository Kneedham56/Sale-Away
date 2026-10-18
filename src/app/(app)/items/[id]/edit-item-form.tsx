"use client";

import { useActionState, useState } from "react";
import { updateItem } from "../actions";
import { DataList, Field, MoneyInput, SubmitButton } from "@/components/fields";
import { TripPicker } from "@/components/trip-picker";
import { PackageFields } from "@/components/package-fields";
import { KIND_LABELS } from "@/lib/format";
import type { Lookups } from "@/lib/data/lookups";

export type EditableItem = {
  id: string;
  title: string;
  kind: string;
  category: string | null;
  format: string | null;
  is_bundle: boolean;
  cost: number | null;
  source_id: string | null;
  date_sourced: string | null;
  storage_location: string | null;
  list_price: number | null;
  date_listed: string | null;
  condition: string | null;
  condition_grade: string | null;
  condition_notes: string | null;
  weight_oz: number | null;
  length_in: number | null;
  width_in: number | null;
  height_in: number | null;
  sku: string | null;
  ebay_item_id: string | null;
  notes: string | null;
};

export function EditItemForm({ item, lookups, today }: { item: EditableItem; lookups: Lookups; today: string }) {
  const [state, action] = useActionState(updateItem, null);
  const [sourceId, setSourceId] = useState(item.source_id ?? "");
  const [kind, setKind] = useState(item.kind);
  const v = (n: number | string | null) => (n === null ? "" : String(n));

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="id" value={item.id} />
      <Field label="Title">
        <textarea name="title" className="input min-h-20" defaultValue={item.title} required maxLength={300} />
      </Field>

      <div className="flex gap-2">
        {Object.entries(KIND_LABELS).map(([k, label]) => (
          <label key={k} className={`chip cursor-pointer ${kind === k ? "chip-active" : ""}`}>
            <input type="radio" name="kind" value={k} className="sr-only" checked={kind === k} onChange={() => setKind(k)} />
            {label}
          </label>
        ))}
      </div>
      {kind === "media" && (
        <Field label="Format">
          <input name="format" className="input" defaultValue={item.format ?? ""} />
        </Field>
      )}
      {kind === "book" && (
        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" name="is_bundle" className="h-5 w-5" defaultChecked={item.is_bundle} /> Bundle / lot
        </label>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label="Category">
          <input name="category" className="input" list="edit-categories" defaultValue={item.category ?? ""} autoComplete="off" />
        </Field>
        <Field label="Storage spot">
          <input name="storage_location" className="input" list="edit-storage" defaultValue={item.storage_location ?? ""} autoComplete="off" />
        </Field>
        <Field label="Cost">
          <MoneyInput name="cost" defaultValue={v(item.cost)} />
        </Field>
        <Field label="List price">
          <MoneyInput name="list_price" defaultValue={v(item.list_price)} />
        </Field>
        <Field label="Date sourced">
          <input type="date" name="date_sourced" className="input" defaultValue={item.date_sourced ?? ""} />
        </Field>
        <Field label="Date listed">
          <input type="date" name="date_listed" className="input" defaultValue={item.date_listed ?? ""} />
        </Field>
      </div>
      <DataList id="edit-categories" options={lookups.categories} />
      <DataList id="edit-storage" options={lookups.storageLocations} />

      <Field label="Sourcing trip">
        <TripPicker sources={lookups.sources} value={sourceId} onChange={setSourceId} today={today} />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Condition">
          <select name="condition" className="input" defaultValue={item.condition ?? ""}>
            <option value="">–</option>
            <option value="new">New</option>
            <option value="pre_owned">Pre-owned</option>
          </select>
        </Field>
        <Field label="Grade">
          <select name="condition_grade" className="input" defaultValue={item.condition_grade ?? ""}>
            <option value="">–</option>
            <option value="excellent">Excellent</option>
            <option value="good">Good</option>
            <option value="acceptable">Acceptable</option>
          </select>
        </Field>
      </div>
      <Field label="Flaws / condition notes">
        <textarea name="condition_notes" className="input min-h-20" defaultValue={item.condition_notes ?? ""} />
      </Field>

      <PackageFields
        names
        initial={{
          weightOz: item.weight_oz === null ? null : Number(item.weight_oz),
          lengthIn: item.length_in === null ? null : Number(item.length_in),
          widthIn: item.width_in === null ? null : Number(item.width_in),
          heightIn: item.height_in === null ? null : Number(item.height_in),
        }}
      />

      <div className="grid grid-cols-2 gap-3">
        <Field label="Custom SKU">
          <input name="sku" className="input" defaultValue={item.sku ?? ""} />
        </Field>
        <Field label="eBay item #">
          <input name="ebay_item_id" className="input" inputMode="numeric" defaultValue={item.ebay_item_id ?? ""} />
        </Field>
      </div>
      <Field label="Notes">
        <textarea name="notes" className="input min-h-20" defaultValue={item.notes ?? ""} />
      </Field>

      {state && !state.ok && <p className="text-sm text-danger">{state.error}</p>}
      {state?.ok && !state.data && <p className="text-sm font-medium text-ok">Saved.</p>}
      {state?.ok && state.data && <p className="rounded-xl bg-coral/10 px-3 py-2 text-sm text-coral">{state.data}</p>}
      <SubmitButton>Save changes</SubmitButton>
    </form>
  );
}
