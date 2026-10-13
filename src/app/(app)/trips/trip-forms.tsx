"use client";

import { useActionState } from "react";
import { createTrip, updateTrip } from "./actions";
import { Field, MoneyInput, SubmitButton } from "@/components/fields";
import { SOURCE_TYPES } from "@/lib/format";

type Trip = {
  id: string;
  lot_code: string;
  type: string;
  place: string | null;
  date: string | null;
  total_spent: number | null;
  notes: string | null;
};

function TripFields({ trip, today }: { trip?: Trip; today: string }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Type">
          <select name="type" className="input" defaultValue={trip?.type ?? "garage_sale"}>
            {Object.entries(SOURCE_TYPES).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Date">
          <input type="date" name="date" className="input" defaultValue={trip ? trip.date ?? "" : today} />
        </Field>
        <Field label="Place">
          <input name="place" className="input" defaultValue={trip?.place ?? ""} placeholder="Street, store or person" />
        </Field>
        <Field label="Total spent">
          <MoneyInput name="total_spent" defaultValue={trip?.total_spent ?? ""} />
        </Field>
      </div>
      <Field label="Notes">
        <input name="notes" className="input" defaultValue={trip?.notes ?? ""} />
      </Field>
    </>
  );
}

export function NewTripForm({ today }: { today: string }) {
  const [state, action] = useActionState(createTrip, null);
  return (
    <form action={action} className="space-y-3">
      <TripFields today={today} />
      <p className="text-xs text-muted">The lot code is made for you, like GS #2-10/12/26.</p>
      {state && !state.ok && <p className="text-sm text-danger">{state.error}</p>}
      <SubmitButton>Add trip</SubmitButton>
    </form>
  );
}

export function EditTripForm({ trip, today }: { trip: Trip; today: string }) {
  const [state, action] = useActionState(updateTrip, null);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={trip.id} />
      <Field label="Lot code">
        <input name="lot_code" className="input" defaultValue={trip.lot_code} required />
      </Field>
      <TripFields trip={trip} today={today} />
      {state && !state.ok && <p className="text-sm text-danger">{state.error}</p>}
      {state?.ok && <p className="text-sm font-medium text-ok">Saved.</p>}
      <SubmitButton>Save trip</SubmitButton>
    </form>
  );
}
