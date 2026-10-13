"use client";

import { useActionState, useState } from "react";
import { addExpense, addMileage } from "./actions";
import { Field, MoneyInput, SubmitButton } from "@/components/fields";
import { money } from "@/lib/format";

export function ExpenseForms({ types, today, rate }: { types: string[]; today: string; rate: number }) {
  const [tab, setTab] = useState<"expense" | "mileage">("expense");
  const [expState, expAction] = useActionState(addExpense, null);
  const [mileState, mileAction] = useActionState(addMileage, null);
  const [miles, setMiles] = useState("");

  return (
    <div className="card p-4">
      <div className="mb-4 flex gap-2">
        <button type="button" className={`chip ${tab === "expense" ? "chip-active" : ""}`} onClick={() => setTab("expense")}>
          Expense
        </button>
        <button type="button" className={`chip ${tab === "mileage" ? "chip-active" : ""}`} onClick={() => setTab("mileage")}>
          Mileage
        </button>
      </div>

      {/* key changes after each successful add, which clears the fields */}
      {tab === "expense" ? (
        <form key={expState?.ok ? expState.data : 0} action={expAction} className="space-y-3">
          <Field label="What">
            <input name="description" className="input" placeholder="e.g. Shipping supplies (Amazon)" required />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount">
              <MoneyInput name="amount" required />
            </Field>
            <Field label="Date">
              <input type="date" name="date" className="input" defaultValue={today} />
            </Field>
          </div>
          <Field label="Type">
            <select name="type" className="input" defaultValue={types[0]}>
              {types.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </Field>
          <Field label="Notes (optional)">
            <input name="notes" className="input" />
          </Field>
          {expState && !expState.ok && <p className="text-sm text-danger">{expState.error}</p>}
          <SubmitButton>Add expense</SubmitButton>
        </form>
      ) : (
        <form key={mileState?.ok ? mileState.data : 0} action={mileAction} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Miles">
              <input name="miles" className="input" inputMode="decimal" required value={miles} onChange={(e) => setMiles(e.target.value)} />
            </Field>
            <Field label="Date">
              <input type="date" name="date" className="input" defaultValue={today} />
            </Field>
          </div>
          <Field label="Trip / purpose (optional)">
            <input name="purpose" className="input" placeholder="e.g. Garage sales, post office" />
          </Field>
          <p className="text-sm text-muted">
            Deduction at ${rate}/mile: <strong className="text-fg">{money((Number(miles) || 0) * rate)}</strong>
          </p>
          {mileState && !mileState.ok && <p className="text-sm text-danger">{mileState.error}</p>}
          <SubmitButton>Add mileage</SubmitButton>
        </form>
      )}
    </div>
  );
}
