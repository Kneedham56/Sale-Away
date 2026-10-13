"use client";

import { useActionState } from "react";
import { addLookup, renameLookup, saveRates } from "./actions";
import { DataList, Field, SubmitButton } from "@/components/fields";
import type { Platform } from "@/lib/data/lookups";

export function RatesForm({ platforms, mileageRate, staleDays }: { platforms: Platform[]; mileageRate: number; staleDays: number }) {
  const [state, action] = useActionState(saveRates, null);
  return (
    <form action={action} className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {platforms.map((p) => (
          <Field key={p.code} label={`${p.name} %`}>
            <input
              name={`fee_${p.code}`}
              className="input"
              inputMode="decimal"
              defaultValue={Math.round(p.fee_rate * 10000) / 100}
            />
          </Field>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Mileage rate ($/mile)">
          <input name="mileage_rate" className="input" inputMode="decimal" defaultValue={mileageRate} />
        </Field>
        <Field label="Stale listing after (days)">
          <input name="stale_listing_days" className="input" inputMode="numeric" defaultValue={staleDays} />
        </Field>
      </div>
      {state && !state.ok && <p className="text-sm text-danger">{state.error}</p>}
      {state?.ok && <p className="text-sm font-medium text-ok">Saved. New sales use these rates; past sales keep theirs.</p>}
      <SubmitButton>Save rates</SubmitButton>
    </form>
  );
}

export function LookupTools({ kind, label, options }: { kind: "category" | "storage"; label: string; options: string[] }) {
  const [renameState, renameAction] = useActionState(renameLookup, null);
  const [addState, addAction] = useActionState(addLookup, null);
  const listId = `opts-${kind}`;
  return (
    <div className="space-y-4">
      <DataList id={listId} options={options} />
      <form action={renameAction} className="space-y-3">
        <input type="hidden" name="kind" value={kind} />
        <div className="grid grid-cols-2 gap-3">
          <Field label={`Rename or merge ${label}`}>
            <input name="from" className="input" list={listId} placeholder="Current name" required autoComplete="off" />
          </Field>
          <Field label="Into">
            <input name="to" className="input" list={listId} placeholder="New name" required autoComplete="off" />
          </Field>
        </div>
        {renameState && (
          <p className={`text-sm ${renameState.ok ? "text-ok" : "text-danger"}`}>{renameState.ok ? renameState.data : renameState.error}</p>
        )}
        <SubmitButton className="btn-secondary w-full">Rename everywhere</SubmitButton>
      </form>
      <form action={addAction} className="flex items-end gap-2">
        <input type="hidden" name="kind" value={kind} />
        <Field label={`Add ${label}`} className="flex-1">
          <input name="name" className="input" required autoComplete="off" />
        </Field>
        <SubmitButton className="btn-small min-h-12" pendingText="…">Add</SubmitButton>
      </form>
      {addState && <p className={`text-sm ${addState.ok ? "text-ok" : "text-danger"}`}>{addState.ok ? addState.data : addState.error}</p>}
    </div>
  );
}
