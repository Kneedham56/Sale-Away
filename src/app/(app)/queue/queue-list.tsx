"use client";

import Link from "next/link";
import { useState } from "react";
import { acceptListing, generateListing } from "../items/ai-actions";
import { publishToEbay } from "../settings/ebay/actions";
import { discardBatchItem, refreshQueue } from "./actions";
import { laneFor } from "@/lib/queue";
import { Thumb } from "@/components/item-row";
import { PackageFields, type PackageValue } from "@/components/package-fields";
import type { ListingSuggestion } from "@/lib/ai/types";

export type QueueRow = {
  id: string;
  title: string;
  fromBatch: boolean;
  thumbUrl: string | null;
  run: { runId: string; suggestion: ListingSuggestion } | null;
};

type Result = { id: string; title: string; ok: boolean; note: string; url?: string | null };

export function QueueList({
  rows,
  quickMax,
  canPost,
  env,
  geminiAvailable,
}: {
  rows: QueueRow[];
  quickMax: number;
  canPost: boolean;
  env: string;
  geminiAvailable: boolean;
}) {
  const pending = rows.filter((r) => !r.run);
  const quick = rows.filter((r) => r.run && laneFor(r.run.suggestion, quickMax) === "quick");
  const review = rows.filter((r) => r.run && laneFor(r.run.suggestion, quickMax) === "review");

  const [edits, setEdits] = useState<Record<string, { title?: string; price?: string }>>({});
  const [skip, setSkip] = useState<Set<string>>(new Set());
  const [pkg, setPkg] = useState<PackageValue>({ weightOz: null, lengthIn: null, widthIn: null, heightIn: null });
  const [busy, setBusy] = useState<string | null>(null);
  const [working, setWorking] = useState<Record<string, string>>({});
  const [results, setResults] = useState<Result[]>([]);
  const [error, setError] = useState<string | null>(null);

  const chosen = quick.filter((r) => !skip.has(r.id));
  const titleOf = (r: QueueRow) => edits[r.id]?.title ?? r.run!.suggestion.title;
  const priceOf = (r: QueueRow) => {
    const typed = edits[r.id]?.price;
    return typed === undefined ? r.run!.suggestion.price : typed.trim() === "" ? null : Number(typed);
  };

  async function sendQuick() {
    if (!chosen.length) return;
    if (canPost && env === "production" && !confirm(`Post ${chosen.length} listing${chosen.length === 1 ? "" : "s"} live on eBay?`)) return;
    setBusy("quick");
    setError(null);
    const out: Result[] = [];
    for (const r of chosen) {
      const s = r.run!.suggestion;
      const title = titleOf(r).trim();
      const price = priceOf(r);
      setWorking((w) => ({ ...w, [r.id]: canPost ? "Posting…" : "Saving…" }));
      const acc = await acceptListing(r.id, r.run!.runId, {
        title,
        category: s.category,
        item_specifics: s.item_specifics,
        description: s.description,
        condition_text: s.condition_text,
        price: price !== null && price > 0 ? price : s.price,
        price_low: s.price_low,
        price_high: s.price_high,
        decision: s.decision,
        ebay_category_id: s.ebay_category_id ?? null,
      });
      if (!acc.ok) {
        out.push({ id: r.id, title, ok: false, note: acc.error });
        continue;
      }
      if (!canPost) {
        out.push({ id: r.id, title, ok: true, note: "Saved to Drafted" });
        continue;
      }
      const pub = await publishToEbay(
        r.id,
        price,
        pkg.weightOz || pkg.lengthIn ? { weightOz: pkg.weightOz, lengthIn: pkg.lengthIn, widthIn: pkg.widthIn, heightIn: pkg.heightIn } : undefined
      );
      out.push(
        pub.ok
          ? { id: r.id, title, ok: true, note: pub.data!.dryRun ? "Checked (sample mode, not posted)" : "Live on eBay", url: pub.data!.url }
          : { id: r.id, title, ok: false, note: `${pub.error} (it's saved in Drafted: open it to fix and post)` }
      );
    }
    setResults((prev) => [...out, ...prev]);
    setWorking({});
    setBusy(null);
    await refreshQueue();
  }

  async function writePending() {
    setBusy("pending");
    for (const r of pending) {
      setWorking((w) => ({ ...w, [r.id]: "Writing listing…" }));
      let res = await generateListing(r.id, null);
      if (!res.ok && /busy|quota/i.test(res.error)) {
        await new Promise((t) => setTimeout(t, 30_000));
        res = await generateListing(r.id, null);
      }
      setWorking((w) => ({ ...w, [r.id]: res.ok ? "Done" : res.error }));
      await refreshQueue();
    }
    setWorking({});
    setBusy(null);
  }

  async function remove(r: QueueRow) {
    if (!confirm("Remove this item and its photos?")) return;
    const res = await discardBatchItem(r.id);
    if (!res.ok) setError(res.error);
  }

  if (!rows.length && !results.length) {
    return <p className="card p-4 text-sm text-muted">Nothing waiting. Items you add above show up here with their listings.</p>;
  }

  return (
    <div className="space-y-6">
      {error && <p className="text-sm text-danger">{error}</p>}

      {!!results.length && (
        <section className="card space-y-2 p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">
              Sent: {results.filter((r) => r.ok).length} ok{results.some((r) => !r.ok) && `, ${results.filter((r) => !r.ok).length} need a look`}
            </h2>
            <button type="button" className="btn-small" onClick={() => setResults([])}>
              Clear
            </button>
          </div>
          <ul className="space-y-1 text-sm">
            {results.map((r) => (
              <li key={r.id}>
                <Link href={`/items/${r.id}`} className="underline">
                  {r.title.slice(0, 50)}
                </Link>{" "}
                <span className={r.ok ? "text-ok" : "text-danger"}>{r.note}</span>
                {r.url && (
                  <>
                    {" "}
                    <a href={r.url} target="_blank" rel="noreferrer" className="underline">
                      view ↗
                    </a>
                  </>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {!!quick.length && (
        <section className="space-y-3">
          <div>
            <h2 className="font-semibold">2. Quick send · {quick.length}</h2>
            <p className="text-sm text-muted">
              ${quickMax} or less, nothing flagged. Glance at the title and price, untick anything you want to look at closer.
            </p>
          </div>
          <ul className="list">
            {quick.map((r) => {
              const s = r.run!.suggestion;
              return (
                <li key={r.id} className="flex items-start gap-3 px-3 py-2">
                  <input
                    type="checkbox"
                    className="mt-4 h-5 w-5 shrink-0"
                    checked={!skip.has(r.id)}
                    disabled={!!busy}
                    onChange={() =>
                      setSkip((prev) => {
                        const n = new Set(prev);
                        if (n.has(r.id)) n.delete(r.id);
                        else n.add(r.id);
                        return n;
                      })
                    }
                    aria-label="Include in quick send"
                  />
                  <Link href={`/items/${r.id}`} className="shrink-0">
                    <Thumb url={r.thumbUrl} className="h-14 w-14" />
                  </Link>
                  <div className="min-w-0 flex-1 space-y-1">
                    <input
                      className="input h-10 px-3 text-sm"
                      value={titleOf(r)}
                      maxLength={80}
                      disabled={!!busy}
                      onChange={(e) => setEdits((m) => ({ ...m, [r.id]: { ...m[r.id], title: e.target.value } }))}
                      aria-label="Title"
                    />
                    <div className="flex items-center gap-2 text-xs text-muted">
                      <span className="relative">
                        <span className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2">$</span>
                        <input
                          className="input h-9 w-24 pl-5 text-sm"
                          inputMode="decimal"
                          value={edits[r.id]?.price ?? (s.price === null ? "" : String(s.price))}
                          disabled={!!busy}
                          onChange={(e) => setEdits((m) => ({ ...m, [r.id]: { ...m[r.id], price: e.target.value } }))}
                          aria-label="Price"
                        />
                      </span>
                      <span className="truncate">{s.category}</span>
                    </div>
                    {working[r.id] && <p className="text-xs text-muted">{working[r.id]}</p>}
                  </div>
                </li>
              );
            })}
          </ul>
          {canPost && (
            <details className="card p-3">
              <summary className="cursor-pointer text-sm font-medium">Package for these (optional)</summary>
              <div className="mt-3">
                <PackageFields initial={pkg} onChange={setPkg} />
                <p className="mt-2 text-xs text-muted">Needed if your shipping policy is calculated. Left blank, each item keeps its own.</p>
              </div>
            </details>
          )}
          <button type="button" className="btn-primary w-full" disabled={!!busy || !chosen.length} onClick={sendQuick}>
            {busy === "quick"
              ? "Sending… keep this screen open"
              : canPost
                ? `${env === "mock" ? "Check" : "Post"} ${chosen.length} to eBay${env === "sandbox" ? " (test site)" : ""}`
                : `Accept ${chosen.length} (save to Drafted)`}
          </button>
        </section>
      )}

      {!!review.length && (
        <section className="space-y-3">
          <div>
            <h2 className="font-semibold">3. Review · {review.length}</h2>
            <p className="text-sm text-muted">Over ${quickMax}, flagged, or marked donate. Open each to check it, edit and post.</p>
          </div>
          <ul className="list">
            {review.map((r) => {
              const s = r.run!.suggestion;
              const why =
                s.decision !== "KEEP" ? "AI says donate" : s.price === null ? "No price" : s.price > quickMax ? `$${s.price}` : `$${s.price} · ${s.flags.length} flag${s.flags.length === 1 ? "" : "s"}`;
              return (
                <li key={r.id}>
                  <Link href={`/items/${r.id}`} className="flex items-center gap-3 px-3 py-2">
                    <Thumb url={r.thumbUrl} className="h-14 w-14" />
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 text-sm font-medium">{s.title}</span>
                      <span className="block text-xs text-muted">{why}</span>
                    </span>
                    <span className="shrink-0 text-sm text-accent">Review ›</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {!!pending.length && (
        <section className="space-y-3">
          <div>
            <h2 className="font-semibold">Waiting for a listing · {pending.length}</h2>
            <p className="text-sm text-muted">Saved with photos, no listing written yet (the screen was closed, or the AI was busy).</p>
          </div>
          <ul className="list">
            {pending.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-3 py-2">
                <Link href={`/items/${r.id}`} className="shrink-0">
                  <Thumb url={r.thumbUrl} className="h-12 w-12" />
                </Link>
                <span className="min-w-0 flex-1 truncate text-sm">{working[r.id] ?? (r.fromBatch ? "From photo batch" : r.title)}</span>
                {r.fromBatch && (
                  <button type="button" className="btn-small text-danger" disabled={!!busy} onClick={() => remove(r)}>
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
          {geminiAvailable && (
            <button type="button" className="btn-secondary w-full" disabled={!!busy} onClick={writePending}>
              {busy === "pending" ? "Writing… keep this screen open" : `Write ${pending.length} listing${pending.length === 1 ? "" : "s"}`}
            </button>
          )}
        </section>
      )}
    </div>
  );
}
