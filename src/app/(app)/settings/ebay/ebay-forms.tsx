"use client";

import { useActionState, useState, useTransition } from "react";
import { saveEbaySettings, setEbayMode, syncNow } from "./actions";
import { Field, SubmitButton } from "@/components/fields";
import type { SyncResult } from "@/lib/ebay/sync";
import type { Policies } from "@/lib/ebay/types";
import { money } from "@/lib/format";
import { buildSku } from "@/lib/sku";

const SAMPLE = { cost: 2.5, lot_code: "GS #4-10/3/26", date_sourced: "2026-10-03", item_number: 5537 };

export function SyncButton({ env }: { env: string }) {
  const [result, setResult] = useState<SyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-3">
      <button
        type="button"
        className="btn-secondary w-full"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const r = await syncNow();
            if (r.ok) setResult(r.data!);
            else setError(r.error);
          })
        }
      >
        {pending ? "Syncing…" : env === "mock" ? "Preview sync with sample orders" : "Sync orders and fees now"}
      </button>
      {error && <p className="text-sm text-danger">{error}</p>}
      {result && (
        <div className="rounded-xl bg-bg p-3 text-sm">
          <p className="font-medium">
            {result.dryRun ? "Preview only, nothing saved. " : ""}
            {result.orders} orders · {result.lines} lines · {result.matched} matched · {result.unmatched.length} unmatched
            {!result.dryRun && ` · ${result.inserted} new · ${result.updated} updated · ${result.feesUpdated} fee updates`}
          </p>
          {result.financesError && (
            <p className="mt-1 text-xs text-coral">Orders synced, but eBay&apos;s fee service didn&apos;t answer ({result.financesError}). Fees stay estimated until the next sync.</p>
          )}
          {result.preview && (
            <ul className="mt-2 space-y-1">
              {result.preview.map((p, i) => (
                <li key={i} className="text-xs">
                  <span className="font-medium">{p.orderId}</span> · {money(p.gross)} · {p.status} · {p.title}{" "}
                  <span className={p.matchedItem ? "text-ok" : "text-coral"}>{p.matchedItem ? "→ matched" : "→ no matching item"}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export function EbaySettingsForm({
  policies,
  values,
}: {
  policies: Policies | null;
  values: { fulfillment?: string; fulfillment_media?: string; payment?: string; return?: string; zip: string; sku: string };
}) {
  const [state, action] = useActionState(saveEbaySettings, null);
  const [sku, setSku] = useState(values.sku);
  const select = (name: string, label: string, list: { id: string; name: string }[] | undefined, value?: string, optional = false) => (
    <Field label={label}>
      <select name={name} className="input" defaultValue={value ?? ""}>
        <option value="">{optional ? "Same as above" : "Choose…"}</option>
        {(list ?? []).map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </Field>
  );
  return (
    <form action={action} className="space-y-4">
      {policies ? (
        <>
          {select("fulfillment", "Shipping policy", policies.fulfillment, values.fulfillment)}
          {select("fulfillment_media", "Shipping policy for books & media", policies.fulfillment, values.fulfillment_media, true)}
          <div className="grid grid-cols-2 gap-3">
            {select("payment", "Payment policy", policies.payment, values.payment)}
            {select("return", "Return policy", policies.return, values.return)}
          </div>
        </>
      ) : (
        <p className="text-sm text-muted">Connect eBay to load her business policies (shipping, payment, returns).</p>
      )}
      <Field label="Ship-from ZIP code">
        <input name="ebay_postal_code" className="input" inputMode="numeric" defaultValue={values.zip} />
      </Field>
      <Field label="Custom SKU format" hint={`Tokens: {cost} {lot} {sourced} {listed} {n}. Example: ${buildSku(SAMPLE, sku, "2026-10-12")}`}>
        <input name="sku_template" className="input font-mono" value={sku} onChange={(e) => setSku(e.target.value)} />
      </Field>
      {state && !state.ok && <p className="text-sm text-danger">{state.error}</p>}
      {state?.ok && <p className="text-sm font-medium text-ok">Saved.</p>}
      <SubmitButton>Save eBay settings</SubmitButton>
    </form>
  );
}

/** Doc only: pick which eBay this business uses and whether it may publish. */
export function EbayModeForm({ env, publishing }: { env: string; publishing: boolean }) {
  const [state, action] = useActionState(setEbayMode, null);
  const [choice, setChoice] = useState(env);
  const options = [
    ["sandbox", "eBay sandbox (test site)", "Fake listings and test buyers. Safe for trying everything, including publishing."],
    ["production", "Real eBay", "Her actual account. Read-only unless publishing is switched on below."],
    ["mock", "Sample data", "No eBay at all; built-in sample orders."],
  ] as const;
  return (
    <form action={action} className="space-y-3">
      {options.map(([value, label, hint]) => (
        <label key={value} className={`flex cursor-pointer gap-3 rounded-xl border p-3 ${choice === value ? "border-accent bg-accent/5" : "border-border"}`}>
          <input type="radio" name="ebay_environment" value={value} checked={choice === value} onChange={() => setChoice(value)} className="mt-1" />
          <span>
            <span className="block font-medium">{label}</span>
            <span className="block text-xs text-muted">{hint}</span>
          </span>
        </label>
      ))}
      {choice === "production" && (
        <label className="flex items-start gap-3 rounded-xl bg-coral/10 p-3 text-sm">
          <input type="checkbox" name="ebay_publishing" defaultChecked={publishing} className="mt-0.5 h-5 w-5" />
          <span>
            <strong>Allow publishing real listings</strong> from this business. Also needs the server switch, and a reconnect so eBay grants the
            listing permission.
          </span>
        </label>
      )}
      {state && !state.ok && <p className="text-sm text-danger">{state.error}</p>}
      {state?.ok && <p className="text-sm font-medium text-ok">Saved. If the eBay changed, connect again below.</p>}
      <SubmitButton>Save eBay mode</SubmitButton>
    </form>
  );
}
