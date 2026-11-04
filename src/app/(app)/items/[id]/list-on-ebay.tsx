"use client";

import { useState, useTransition } from "react";
import { publishToEbay } from "../../settings/ebay/actions";
import { MoneyInput } from "@/components/fields";
import { PackageFields, packageComplete, type PackageValue } from "@/components/package-fields";
import type { Policy } from "@/lib/ebay/types";
import type { ErrorHelp } from "@/lib/form";
import { ActionError } from "@/components/action-error";
import { MeasurementsField } from "@/components/measurements-field";
import type { Measurement } from "@/lib/measurements";
import type { StoreCategory } from "@/lib/store-category";

/** One tap from a reviewed item to a live eBay listing (moves it to Listed). */
export function ListOnEbay({
  itemId,
  listPrice,
  env,
  problems,
  connected,
  policies,
  storeCategories,
  storeDefault,
  requiredSpecifics,
  defaults,
  pkg,
  measurements,
  clothing,
  context,
}: {
  itemId: string;
  listPrice: number | null;
  env: string;
  /** What still blocks publishing, apart from things chosen right here (price, policies, package) */
  problems: string[];
  /** Her business's eBay account is connected (with listing permission) */
  connected: boolean;
  /** Her own eBay shipping and return policies (null in sample-data mode or if eBay didn't answer) */
  policies: { fulfillment: Policy[]; return: Policy[] } | null;
  /** Her eBay Store's own categories (empty when she has no store or eBay didn't answer) */
  storeCategories: StoreCategory[];
  /** What she picked for this item before, or the best guess */
  storeDefault: string | null;
  /** Item specifics eBay requires for this category that the listing is missing (with eBay's suggested values) */
  requiredSpecifics: { name: string; values: string[] }[];
  defaults: { shipping: string | null; returns: string | null };
  pkg: PackageValue;
  measurements: Measurement[];
  /** Clothing, shoes or bags: ask for measurements up front */
  clothing: boolean;
  /** "Item #11089: title", for the problem report */
  context: string;
}) {
  const [open, setOpen] = useState(false);
  const [price, setPrice] = useState(listPrice === null ? "" : String(listPrice));
  const [shipping, setShipping] = useState(defaults.shipping ?? "");
  const [returns, setReturns] = useState(defaults.returns ?? "");
  const [pack, setPack] = useState<PackageValue>(pkg);
  const [measured, setMeasured] = useState<Measurement[]>(measurements);
  const [storeCategory, setStoreCategory] = useState(storeDefault ?? "");
  const [specifics, setSpecifics] = useState<Record<string, string>>({});
  const [error, setError] = useState<{ error: string; help?: ErrorHelp } | null>(null);
  const [done, setDone] = useState<{ url: string | null; preview: boolean } | null>(null);
  const [pending, start] = useTransition();
  const label = env === "sandbox" ? "List on test eBay" : env === "mock" ? "Preview eBay listing" : "List on eBay";

  if (done) {
    return (
      <p className="rounded-xl bg-ok/15 px-4 py-3 text-sm font-medium text-ok">
        {done.preview ? "Preview OK: this is what would be sent to eBay." : env === "sandbox" ? "Live on test eBay. " : "Live on eBay. "}
        {done.url && (
          <a href={done.url} target="_blank" rel="noreferrer" className="underline">
            View listing ↗
          </a>
        )}
      </p>
    );
  }

  if (!open) {
    return (
      <button type="button" className="btn-primary w-full bg-coral" onClick={() => setOpen(true)}>
        {label}
      </button>
    );
  }

  if (!connected) {
    return (
      <div className="card space-y-2 border-coral p-4">
        <h3 className="font-semibold">{label}</h3>
        <p className="text-sm">Sale Away needs to be signed in to your eBay first. It only takes a minute, then come back here.</p>
        <a href="/settings/ebay" className="btn-primary w-full">
          Connect eBay
        </a>
        <button type="button" className="w-full text-sm text-muted" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    );
  }

  const chosen = policies?.fulfillment.find((p) => p.id === shipping);
  const needsPackage = !!chosen?.needsPackage;
  const missing = [
    ...problems,
    ...(policies && !shipping ? ["Pick a shipping policy."] : []),
    ...(policies && !returns ? ["Pick a return policy."] : []),
    ...(needsPackage && !packageComplete(pack) ? ["This shipping policy is calculated: add the package weight and size."] : []),
    ...requiredSpecifics.filter((r) => !specifics[r.name]?.trim()).map((r) => `eBay needs “${r.name}” for this category.`),
  ];
  const ready = missing.length === 0;

  return (
    <div className="card space-y-4 border-coral p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">{label}</h3>
        <button type="button" className="text-sm text-muted" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
      {env === "sandbox" && <p className="text-xs text-muted">Test eBay: the listing and any buyer are fake.</p>}
      <label className="block">
        <span className="mb-1 block text-sm font-medium">Price (Best Offer stays on)</span>
        <MoneyInput value={price} onChange={(e) => setPrice(e.target.value)} />
      </label>

      {requiredSpecifics.length > 0 && (
        <div className="space-y-3 rounded-xl bg-coral/5 p-3">
          <p className="text-sm font-medium">eBay requires these for this category</p>
          {requiredSpecifics.map((r) => (
            <label key={r.name} className="block">
              <span className="mb-1 block text-sm">{r.name}</span>
              <input
                className="input"
                list={`req-${r.name}`}
                value={specifics[r.name] ?? ""}
                onChange={(e) => setSpecifics({ ...specifics, [r.name]: e.target.value })}
                placeholder={r.values[0] ? `e.g. ${r.values[0]}` : ""}
              />
              <datalist id={`req-${r.name}`}>
                {r.values.map((v) => (
                  <option key={v} value={v} />
                ))}
              </datalist>
            </label>
          ))}
        </div>
      )}

      {storeCategories.length > 0 && (
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Store category</span>
          <select className="input" value={storeCategory} onChange={(e) => setStoreCategory(e.target.value)}>
            <option value="">Other (eBay&apos;s default)</option>
            {storeCategories
              .filter((c) => c.path !== "Other")
              .map((c) => (
                <option key={c.id} value={c.path}>
                  {c.label}
                </option>
              ))}
          </select>
          <span className="mt-1 block text-xs text-muted">Where it shows in your eBay Store. Sale Away remembers your pick for this kind of item.</span>
        </label>
      )}

      <MeasurementsField initial={measurements} onChange={setMeasured} startOpen={clothing} />

      {policies && (
        <>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Shipping policy</span>
            <select className="input" value={shipping} onChange={(e) => setShipping(e.target.value)}>
              <option value="">Choose…</option>
              {policies.fulfillment.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.needsPackage ? " (calculated)" : ""}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-xs text-muted">International shipping follows this policy on eBay.</span>
          </label>
          <PackageFields initial={pkg} onChange={setPack} required={needsPackage} />
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Return policy</span>
            <select className="input" value={returns} onChange={(e) => setReturns(e.target.value)}>
              <option value="">Choose…</option>
              {policies.return.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        </>
      )}

      {!ready && (
        <div className="rounded-xl bg-coral/10 p-3 text-sm text-coral">
          <p className="font-medium">Before it can go live:</p>
          <ul className="mt-1 space-y-0.5">
            {missing.map((p) => (
              <li key={p}>• {p}</li>
            ))}
          </ul>
        </div>
      )}
      {error && <ActionError error={error.error} help={error.help} context={context} />}
      <button
        type="button"
        className="btn-primary w-full"
        disabled={pending || !ready || !(Number(price) > 0)}
        onClick={() =>
          start(async () => {
            setError(null);
            const r = await publishToEbay(itemId, Number(price), {
              shippingPolicyId: policies ? shipping : undefined,
              returnPolicyId: policies ? returns : undefined,
              ...pack,
              measurements: measured,
              specifics: Object.entries(specifics)
                .filter(([, v]) => v.trim())
                .map(([name, value]) => ({ name, value: value.trim() })),
              ...(storeCategories.length ? { storeCategory: storeCategory || null } : {}),
            });
            if (!r.ok) setError({ error: r.error, help: r.help });
            else setDone({ url: r.data!.url, preview: r.data!.dryRun });
          })
        }
      >
        {pending ? "Sending to eBay…" : env === "mock" ? "Preview" : "List it now"}
      </button>
    </div>
  );
}
