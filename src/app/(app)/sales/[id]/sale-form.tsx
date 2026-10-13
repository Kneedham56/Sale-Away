"use client";

import { useActionState } from "react";
import { updateSale } from "../actions";
import { Field, MoneyInput, SubmitButton } from "@/components/fields";
import { FULFILLMENT_LABELS } from "@/lib/format";
import type { Platform } from "@/lib/data/lookups";

export type SaleRecord = {
  id: string;
  platform: string;
  sold_date: string;
  gross: number;
  shipping_cost: number;
  fees: number;
  fee_is_estimate: boolean;
  cogs: number | null;
  adjustments: number;
  return_charges: number;
  order_id: string | null;
  buyer_name: string | null;
  ship_by: string | null;
  tracking_number: string | null;
  fulfillment_status: string;
  notes: string | null;
};

export function SaleForm({ sale, platforms }: { sale: SaleRecord; platforms: Platform[] }) {
  const [state, action] = useActionState(updateSale, null);
  const v = (n: number | string | null) => (n === null ? "" : String(n));
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="id" value={sale.id} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Platform">
          <select name="platform" className="input" defaultValue={sale.platform}>
            {platforms.map((p) => (
              <option key={p.code} value={p.code}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Date sold">
          <input type="date" name="sold_date" className="input" defaultValue={sale.sold_date} required />
        </Field>
        <Field label="Sale price">
          <MoneyInput name="gross" defaultValue={v(sale.gross)} required />
        </Field>
        <Field label="Shipping paid">
          <MoneyInput name="shipping_cost" defaultValue={v(sale.shipping_cost)} />
        </Field>
        <Field label="Fees" hint={sale.fee_is_estimate ? "Estimated. Type the real amount to replace it." : "Actual"}>
          <MoneyInput name="fees" defaultValue={v(sale.fees)} />
        </Field>
        <Field label="Cost of goods">
          <MoneyInput name="cogs" defaultValue={v(sale.cogs)} />
        </Field>
        <Field label="Adjustments" hint="Subtracted from net; negative = credit">
          <MoneyInput name="adjustments" defaultValue={v(sale.adjustments)} />
        </Field>
        <Field label="Return charges">
          <MoneyInput name="return_charges" defaultValue={v(sale.return_charges)} />
        </Field>
        <Field label="Status">
          <select name="fulfillment_status" className="input" defaultValue={sale.fulfillment_status}>
            {Object.entries(FULFILLMENT_LABELS).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Ship by">
          <input type="date" name="ship_by" className="input" defaultValue={sale.ship_by ?? ""} />
        </Field>
        <Field label="Buyer">
          <input name="buyer_name" className="input" defaultValue={sale.buyer_name ?? ""} />
        </Field>
        <Field label="Order #">
          <input name="order_id" className="input" defaultValue={sale.order_id ?? ""} />
        </Field>
      </div>
      <Field label="Tracking #">
        <input name="tracking_number" className="input" defaultValue={sale.tracking_number ?? ""} />
      </Field>
      <Field label="Notes">
        <textarea name="notes" className="input min-h-20" defaultValue={sale.notes ?? ""} />
      </Field>
      {state && !state.ok && <p className="text-sm text-danger">{state.error}</p>}
      {state?.ok && <p className="text-sm font-medium text-ok">Saved.</p>}
      <SubmitButton>Save sale</SubmitButton>
    </form>
  );
}
