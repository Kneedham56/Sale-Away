"use client";

import { useState, useTransition } from "react";
import { acceptListing, buildCopyPrompt, generateListing, readPastedAnswer } from "../ai-actions";
import { CopyButton } from "@/components/copy-button";
import { Field, MoneyInput } from "@/components/fields";
import { ebaySoldSearchUrl } from "@/lib/ai/prompts";
import type { ListingSuggestion, Specific } from "@/lib/ai/types";
import { money } from "@/lib/format";

const TITLE_MAX = 80;

type Draft = ListingSuggestion & { runId: string | null };

export function ListingAssistant({
  itemId,
  intakeTitle,
  latest,
  hasPhotos,
  geminiAvailable,
}: {
  itemId: string;
  intakeTitle: string;
  latest: { runId: string; suggestion: ListingSuggestion } | null;
  hasPhotos: boolean;
  geminiAvailable: boolean;
}) {
  const [mode, setMode] = useState<"gemini" | "copy">(geminiAvailable ? "gemini" : "copy");
  const [extra, setExtra] = useState("");
  const [draft, setDraft] = useState<Draft | null>(latest ? { ...latest.suggestion, runId: latest.runId } : null);
  const [copyPrompt, setCopyPrompt] = useState<string | null>(null);
  const [pasted, setPasted] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [pending, start] = useTransition();

  function run(fn: () => Promise<void>) {
    setError(null);
    start(async () => {
      try {
        await fn();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      }
    });
  }

  const generate = () =>
    run(async () => {
      const res = await generateListing(itemId, extra.trim() || null);
      if (!res.ok) return setError(res.error);
      setDraft({ ...res.data!.suggestion, runId: res.data!.runId });
      setAccepted(false);
    });

  const makePrompt = () =>
    run(async () => {
      const res = await buildCopyPrompt(itemId, extra.trim() || null);
      if (!res.ok) return setError(res.error);
      setCopyPrompt(res.data!);
    });

  const readAnswer = () =>
    run(async () => {
      const res = await readPastedAnswer(itemId, pasted);
      if (!res.ok) return setError(res.error);
      setDraft({ ...res.data!.suggestion, runId: res.data!.runId });
      setPasted("");
      setAccepted(false);
    });

  const accept = () =>
    run(async () => {
      if (!draft) return;
      const res = await acceptListing(itemId, draft.runId, {
        title: draft.title,
        category: draft.category,
        item_specifics: draft.item_specifics,
        description: draft.description,
        condition_text: draft.condition_text,
        price: draft.price,
        price_low: draft.price_low,
        price_high: draft.price_high,
        decision: draft.decision,
        ebay_category_id: draft.ebay_category_id ?? null,
      });
      if (!res.ok) return setError(res.error);
      setAccepted(true);
    });

  const set = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const setSpec = (i: number, patch: Partial<Specific>) =>
    setDraft((d) => (d ? { ...d, item_specifics: d.item_specifics.map((s, j) => (j === i ? { ...s, ...patch } : s)) } : d));

  return (
    <section className="card space-y-4 p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold">Listing assistant</h2>
        <div className="flex gap-1">
          {geminiAvailable && (
            <button type="button" className={`chip ${mode === "gemini" ? "chip-active" : ""}`} onClick={() => setMode("gemini")}>
              Gemini
            </button>
          )}
          <button type="button" className={`chip ${mode === "copy" ? "chip-active" : ""}`} onClick={() => setMode("copy")}>
            Copy prompt
          </button>
        </div>
      </div>

      {!hasPhotos && <p className="text-sm text-coral">No photos yet. Add 2–4 photos for a much better answer.</p>}

      <Field label="Anything to add? (optional)" hint="Brand, size, measurements, flaws you know about. Then generate again.">
        <textarea className="input min-h-16" value={extra} onChange={(e) => setExtra(e.target.value)} />
      </Field>

      {mode === "gemini" ? (
        <button type="button" className="btn-primary w-full" onClick={generate} disabled={pending}>
          {pending ? "Thinking… (up to a minute)" : draft ? "Try again" : "Generate listing"}
        </button>
      ) : (
        <div className="space-y-3">
          {!copyPrompt ? (
            <button type="button" className="btn-secondary w-full" onClick={makePrompt} disabled={pending}>
              {pending ? "Building…" : "Build prompt"}
            </button>
          ) : (
            <div className="space-y-2 rounded-xl bg-bg p-3 text-sm">
              <p>
                1. Copy the prompt. 2. Open ChatGPT, Gemini or Claude, paste it and attach the item&apos;s photos. 3. Paste the whole
                answer below.
              </p>
              <div className="flex gap-2">
                <CopyButton text={copyPrompt} label="Copy prompt" className="btn-primary min-h-10 flex-1" />
                <button type="button" className="btn-small" onClick={() => setCopyPrompt(null)}>
                  Rebuild
                </button>
              </div>
            </div>
          )}
          <Field label="Paste the answer here">
            <textarea className="input min-h-24" value={pasted} onChange={(e) => setPasted(e.target.value)} />
          </Field>
          <button type="button" className="btn-secondary w-full" onClick={readAnswer} disabled={pending || !pasted.trim()}>
            Read answer
          </button>
        </div>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}

      {draft && (
        <div className="space-y-4 border-t border-border pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-3 py-1 text-sm font-bold ${draft.decision === "KEEP" ? "bg-ok/15 text-ok" : "bg-danger/15 text-danger"}`}
            >
              {draft.decision}
            </span>
            {draft.rule && <span className="text-sm font-medium">{draft.rule}</span>}
            <span className="text-xs text-muted">confidence: {draft.confidence}</span>
          </div>
          {draft.resale_note && <p className="text-sm">{draft.resale_note}</p>}

          {draft.flags.length > 0 && (
            <ul className="space-y-1 rounded-xl bg-coral/10 p-3 text-sm text-coral">
              {draft.flags.map((f) => (
                <li key={f}>• {f}</li>
              ))}
            </ul>
          )}

          <Field label={`Title (${draft.title.length}/${TITLE_MAX})`}>
            <textarea
              className={`input min-h-16 ${draft.title.length > TITLE_MAX ? "border-danger" : ""}`}
              value={draft.title}
              onChange={(e) => set({ title: e.target.value.replace(/\n/g, " ") })}
            />
          </Field>
          <p className="-mt-2 text-xs text-muted">Her description: {intakeTitle}</p>

          <div className="grid grid-cols-3 gap-2">
            <Field label="Price">
              <MoneyInput value={draft.price ?? ""} onChange={(e) => set({ price: e.target.value === "" ? null : Number(e.target.value) })} />
            </Field>
            <Field label="Low">
              <MoneyInput value={draft.price_low ?? ""} onChange={(e) => set({ price_low: e.target.value === "" ? null : Number(e.target.value) })} />
            </Field>
            <Field label="High">
              <MoneyInput value={draft.price_high ?? ""} onChange={(e) => set({ price_high: e.target.value === "" ? null : Number(e.target.value) })} />
            </Field>
          </div>
          {draft.price_basis && <p className="-mt-2 text-xs text-muted">{draft.price_basis}</p>}
          <a href={ebaySoldSearchUrl(draft.title || intakeTitle)} target="_blank" rel="noreferrer" className="btn-small">
            Check sold on eBay ↗
          </a>

          {!!draft.comps?.length && (
            <details className="text-sm">
              <summary className="cursor-pointer text-muted">{draft.comps.length} active eBay listings it looked at (asking prices)</summary>
              <ul className="mt-2 space-y-1">
                {draft.comps.map((c) => (
                  <li key={c.url}>
                    <a href={c.url} target="_blank" rel="noreferrer" className="text-accent">
                      {money(c.price)}
                    </a>{" "}
                    {c.title}
                  </li>
                ))}
              </ul>
            </details>
          )}

          <Field label="eBay category">
            <input className="input" value={draft.category} onChange={(e) => set({ category: e.target.value })} />
          </Field>

          <div>
            <span className="mb-1 block text-sm font-medium">Item specifics</span>
            <div className="space-y-2">
              {draft.item_specifics.map((s, i) => (
                <div key={i} className="flex gap-2">
                  <input className="input w-2/5 px-3" value={s.name} onChange={(e) => setSpec(i, { name: e.target.value })} />
                  <input
                    className={`input flex-1 px-3 ${/^unknown$/i.test(s.value) ? "border-coral" : ""}`}
                    value={s.value}
                    onChange={(e) => setSpec(i, { value: e.target.value })}
                  />
                  <button
                    type="button"
                    aria-label="Remove"
                    className="px-2 text-muted"
                    onClick={() => set({ item_specifics: draft.item_specifics.filter((_, j) => j !== i) })}
                  >
                    ×
                  </button>
                </div>
              ))}
              <button type="button" className="btn-small" onClick={() => set({ item_specifics: [...draft.item_specifics, { name: "", value: "" }] })}>
                + Specific
              </button>
            </div>
          </div>

          <Field label="Description">
            <textarea className="input min-h-28" value={draft.description} onChange={(e) => set({ description: e.target.value })} />
          </Field>
          <Field label="Condition">
            <textarea className="input min-h-16" value={draft.condition_text} onChange={(e) => set({ condition_text: e.target.value })} />
          </Field>

          {accepted ? (
            <p className="rounded-xl bg-ok/15 px-4 py-3 text-sm font-medium text-ok">Saved. It&apos;s in Ready to List with copy buttons.</p>
          ) : (
            <button type="button" className="btn-primary w-full" onClick={accept} disabled={pending || draft.title.length > TITLE_MAX}>
              {pending ? "Saving…" : "Accept → Ready to list"}
            </button>
          )}
          <p className="text-center text-xs text-muted">The AI never publishes. You approve every listing.</p>
        </div>
      )}
    </section>
  );
}
