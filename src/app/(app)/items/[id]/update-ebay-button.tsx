"use client";

import { useActionState } from "react";
import { updateEbayListing } from "../actions";
import { SubmitButton } from "@/components/fields";
import { ActionError } from "@/components/action-error";

/** Listed items: send Sale Away's photos, condition, package size, title and price to the live eBay listing. */
export function UpdateEbayButton({ itemId, context }: { itemId: string; context: string }) {
  const [state, action] = useActionState(updateEbayListing, null);
  return (
    <form action={action} className="card space-y-2 p-4">
      <input type="hidden" name="id" value={itemId} />
      <p className="text-sm text-muted">
        Edits here go to eBay when you save them. If eBay looks different from Sale Away, send everything again.
      </p>
      <SubmitButton className="btn-small min-h-10 w-full" pendingText="Updating eBay… (photos can take a minute)">
        Update eBay listing
      </SubmitButton>
      {state && !state.ok && <ActionError error={state.error} help={state.help} context={context} />}
      {state?.ok && !state.data && <p className="text-sm font-medium text-ok">eBay is up to date.</p>}
      {state?.ok && state.data && <p className="rounded-xl bg-coral/10 px-3 py-2 text-sm text-coral">{state.data}</p>}
    </form>
  );
}
