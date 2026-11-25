"use client";

import { useActionState, useState } from "react";
import { relistOnEbay } from "../actions";
import { MoneyInput, SubmitButton } from "@/components/fields";
import { PackageFields, type PackageValue } from "@/components/package-fields";
import { ActionError } from "@/components/action-error";

/**
 * Her 6-month routine: check shipping, maybe drop the price a little, and put it up as a fresh eBay listing.
 * One tap ends the old listing and posts the new one with the same photos and details.
 */
export function RelistBox({
  itemId,
  price,
  pkg,
  daysActive,
  dueDays,
  context,
}: {
  itemId: string;
  price: number | null;
  pkg: PackageValue;
  daysActive: number | null;
  dueDays: number;
  context: string;
}) {
  const [state, action] = useActionState(relistOnEbay, null);
  const [value, setValue] = useState(price === null ? "" : price.toFixed(2));
  const due = daysActive !== null && daysActive >= dueDays;
  // A few percent off, landing on .99 like her prices ($189.99 -10% -> $169.99)
  const drop = (pct: number) => {
    if (price === null) return;
    const x = price * (1 - pct / 100);
    const nice = Math.floor(x + 0.01) - 0.01;
    setValue((nice > 0 ? nice : x).toFixed(2));
  };

  if (state?.ok) {
    return (
      <div className="card space-y-1 p-4 text-sm">
        <p className="font-medium text-ok">Relisted: it&apos;s a new eBay listing now (item {state.data!.listingId}).</p>
        {state.data!.url && (
          <a href={state.data!.url} target="_blank" rel="noreferrer" className="underline">
            View it on eBay ↗
          </a>
        )}
      </div>
    );
  }

  return (
    <details className={`card p-4 ${due ? "border-coral" : ""}`} open={due}>
      <summary className="cursor-pointer font-medium">
        Relist on eBay {due && <span className="text-sm font-normal text-coral">· listed {daysActive} days, due</span>}
      </summary>
      <form action={action} className="mt-3 space-y-3">
        <input type="hidden" name="id" value={itemId} />
        <p className="text-sm text-muted">
          Ends this listing and posts it again as a new one: same photos, title, description and SKU. Check the shipping and price first.
        </p>
        <div>
          <span className="mb-1 block text-sm font-medium">New price</span>
          <div className="flex items-center gap-2">
            <MoneyInput name="list_price" value={value} onChange={(e) => setValue(e.target.value)} />
            {[5, 10, 15].map((p) => (
              <button key={p} type="button" className="btn-small shrink-0" onClick={() => drop(p)}>
                −{p}%
              </button>
            ))}
          </div>
        </div>
        <PackageFields names initial={pkg} />
        {state && !state.ok && <ActionError error={state.error} help={state.help} context={context} />}
        <SubmitButton className="btn-primary w-full" pendingText="Relisting… (about a minute)">
          End and relist
        </SubmitButton>
      </form>
    </details>
  );
}
