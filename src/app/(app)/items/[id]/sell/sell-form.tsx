"use client";

import { useActionState, useState } from "react";
import { markSold } from "../../actions";
import { Field, MoneyInput, SubmitButton } from "@/components/fields";
import { money } from "@/lib/format";
import type { Platform } from "@/lib/data/lookups";

export function SellForm({
  itemId,
  cost,
  listPrice,
  platforms,
  today,
  defaultPlatform,
}: {
  itemId: string;
  cost: number | null;
  listPrice: number | null;
  platforms: Platform[];
  today: string;
  defaultPlatform?: string;
}) {
  const [state, action] = useActionState(markSold, null);
  const [platform, setPlatform] = useState(defaultPlatform ?? platforms[0]?.code ?? "ebay");
  const [gross, setGross] = useState(listPrice ? String(listPrice) : "");
  const [shipping, setShipping] = useState("");
  const [fees, setFees] = useState("");
  const rate = platforms.find((p) => p.code === platform)?.fee_rate ?? 0;
  const g = Number(gross) || 0;
  const estFees = Math.round(g * rate * 100) / 100;
  const net = g - (Number(shipping) || 0) - (fees === "" ? estFees : Number(fees) || 0) - (cost ?? 0);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="item_id" value={itemId} />
      <div>
        <span className="mb-1 block text-sm font-medium">Sold on</span>
        <div className="flex flex-wrap gap-2">
          {platforms.map((p) => (
            <label key={p.code} className={`chip cursor-pointer ${platform === p.code ? "chip-active" : ""}`}>
              <input type="radio" name="platform" value={p.code} className="sr-only" checked={platform === p.code} onChange={() => setPlatform(p.code)} />
              {p.name}
            </label>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Sale price">
          <MoneyInput name="gross" value={gross} onChange={(e) => setGross(e.target.value)} required />
        </Field>
        <Field label="Date sold">
          <input type="date" name="sold_date" className="input" defaultValue={today} />
        </Field>
        <Field label="Shipping you paid" hint="Label cost; 0 if buyer's label">
          <MoneyInput name="shipping_cost" value={shipping} onChange={(e) => setShipping(e.target.value)} />
        </Field>
        <Field label="Fees" hint={`Blank = estimate ${money(estFees)} (${Math.round(rate * 100)}%)`}>
          <MoneyInput name="fees" value={fees} onChange={(e) => setFees(e.target.value)} placeholder={estFees.toFixed(2)} />
        </Field>
        <Field label="Ship by">
          <input type="date" name="ship_by" className="input" />
        </Field>
        <Field label="Buyer (optional)">
          <input name="buyer_name" className="input" autoComplete="off" />
        </Field>
      </div>
      <Field label="Order # (optional)">
        <input name="order_id" className="input" autoComplete="off" />
      </Field>
      <label className="flex items-center gap-3 text-sm">
        <input type="checkbox" name="already_shipped" className="h-5 w-5" /> Already shipped
      </label>
      <Field label="Notes">
        <input name="notes" className="input" />
      </Field>

      <div className="card flex justify-between p-4 text-sm">
        <span className="text-muted">Net profit{cost === null ? " (cost unknown)" : ` after ${money(cost)} cost`}</span>
        <span className={`font-semibold ${net < 0 ? "text-danger" : "text-ok"}`}>{money(net)}</span>
      </div>
      {state && !state.ok && <p className="text-sm text-danger">{state.error}</p>}
      <SubmitButton>Mark sold</SubmitButton>
    </form>
  );
}
