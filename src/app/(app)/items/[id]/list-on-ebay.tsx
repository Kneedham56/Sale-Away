"use client";

import { useState, useTransition } from "react";
import { publishToEbay } from "../../settings/ebay/actions";
import { MoneyInput } from "@/components/fields";

/** One tap from a reviewed item to a live eBay listing (moves it to Listed). */
export function ListOnEbay({
  itemId,
  listPrice,
  env,
  problems,
}: {
  itemId: string;
  listPrice: number | null;
  env: string;
  /** What still blocks publishing (price is handled here, so it's not in this list) */
  problems: string[];
}) {
  const [open, setOpen] = useState(false);
  const [price, setPrice] = useState(listPrice === null ? "" : String(listPrice));
  const [error, setError] = useState<string | null>(null);
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

  const ready = problems.length === 0;
  return (
    <div className="card space-y-3 border-coral p-4">
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
      {!ready && (
        <div className="rounded-xl bg-coral/10 p-3 text-sm text-coral">
          <p className="font-medium">Before it can go live:</p>
          <ul className="mt-1 space-y-0.5">
            {problems.map((p) => (
              <li key={p}>• {p}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs">Fix these with the Listing assistant or Edit details below, then try again.</p>
        </div>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
      <button
        type="button"
        className="btn-primary w-full"
        disabled={pending || !ready || !(Number(price) > 0)}
        onClick={() =>
          start(async () => {
            setError(null);
            const r = await publishToEbay(itemId, Number(price));
            if (!r.ok) setError(r.error);
            else setDone({ url: r.data!.url, preview: r.data!.dryRun });
          })
        }
      >
        {pending ? "Sending to eBay…" : env === "mock" ? "Preview" : "List it now"}
      </button>
    </div>
  );
}
