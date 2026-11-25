"use client";

import { useState } from "react";
import { smallPreview, uploadPhoto } from "@/lib/photo-upload";
import { chunk, everyN, mergeUp, splitAt } from "@/lib/queue";
import { generateListing } from "../items/ai-actions";
import { createBatchItem, groupPhotos, refreshQueue, type BatchDefaults } from "./actions";
import { DataList, Field, MoneyInput } from "@/components/fields";
import type { SourceOption } from "@/lib/data/lookups";

type Preview = { url: string; base64: string };
type Phase = "pick" | "previewing" | "grouping" | "ready" | "working";
type Progress = { state: "waiting" | "uploading" | "writing" | "done" | "error"; note?: string };

const CONDITIONS: [string, string][] = [
  ["pre_owned:good", "Pre-owned, good"],
  ["pre_owned:excellent", "Pre-owned, excellent"],
  ["pre_owned:acceptable", "Pre-owned, acceptable"],
  ["new:", "New"],
  [":", "Not set (pick on each item)"],
];

export function PhotoBatch({
  workspaceId,
  geminiAvailable,
  sources,
  storageLocations,
}: {
  workspaceId: string;
  geminiAvailable: boolean;
  sources: SourceOption[];
  storageLocations: string[];
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<Preview[]>([]);
  const [sizes, setSizes] = useState<number[]>([]);
  const [phase, setPhase] = useState<Phase>("pick");
  const [perItem, setPerItem] = useState("4");
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<Progress[]>([]);
  const [sourceId, setSourceId] = useState("");
  const [storage, setStorage] = useState("");
  const [cost, setCost] = useState("");
  const [condition, setCondition] = useState("pre_owned:good");

  async function onPick(list: FileList | null) {
    if (!list?.length) return;
    setError(null);
    const picked = Array.from(list).filter((f) => f.type.startsWith("image/") || /\.(heic|heif|jpe?g|png|webp)$/i.test(f.name));
    if (!picked.length) return setError("Those weren't photos.");
    setPhase("previewing");
    const made: Preview[] = [];
    // A few at a time: decoding 50 iPhone photos at once runs a phone out of memory
    for (let i = 0; i < picked.length; i += 4) {
      made.push(...(await Promise.all(picked.slice(i, i + 4).map((f) => smallPreview(f)))));
    }
    const allFiles = [...files, ...picked];
    const allPreviews = [...previews, ...made];
    setFiles(allFiles);
    setPreviews(allPreviews);
    await group(allPreviews, geminiAvailable ? "ai" : "every");
  }

  async function group(list: Preview[], how: "ai" | "every") {
    setError(null);
    if (how === "every") {
      setSizes(everyN(list.length, Number(perItem)));
      return setPhase("ready");
    }
    setPhase("grouping");
    const res = await groupPhotos(list.map((p) => p.base64));
    if (res.ok) setSizes(res.data!);
    else {
      setError(`${res.error} Grouped every ${perItem} photos instead; fix any that are off.`);
      setSizes(everyN(list.length, Number(perItem)));
    }
    setPhase("ready");
  }

  function reset() {
    previews.forEach((p) => URL.revokeObjectURL(p.url));
    setFiles([]);
    setPreviews([]);
    setSizes([]);
    setProgress([]);
    setPhase("pick");
  }

  async function createAll() {
    const [cond, grade] = condition.split(":");
    const defaults: BatchDefaults = {
      sourceId: sourceId || null,
      storage: storage.trim() || null,
      cost: cost.trim() === "" ? null : Number(cost),
      condition: cond === "new" || cond === "pre_owned" ? cond : null,
      grade: grade === "excellent" || grade === "good" || grade === "acceptable" ? grade : null,
    };
    if (defaults.cost !== null && !(defaults.cost >= 0)) return setError("Cost each should be a number.");
    const groups = chunk(files, sizes);
    setPhase("working");
    setError(null);
    setProgress(groups.map(() => ({ state: "waiting" })));
    const mark = (g: number, p: Progress) => setProgress((all) => all.map((x, i) => (i === g ? p : x)));

    // 1. Save every item with its photos first, so nothing is lost if the AI is slow or she closes the screen
    const ids: (string | null)[] = [];
    for (let g = 0; g < groups.length; g++) {
      mark(g, { state: "uploading" });
      const id = crypto.randomUUID();
      try {
        const photos = await Promise.all(groups[g].map((f) => uploadPhoto(workspaceId, id, f)));
        const res = await createBatchItem(id, photos, defaults);
        if (!res.ok) throw new Error(res.error);
        ids.push(id);
        mark(g, { state: "waiting", note: "Saved" });
      } catch (e) {
        ids.push(null);
        mark(g, { state: "error", note: e instanceof Error ? e.message : "Upload failed" });
      }
    }
    await refreshQueue();

    // 2. Write each listing (one at a time: the AI has a per-minute limit)
    if (geminiAvailable) {
      for (let g = 0; g < ids.length; g++) {
        const id = ids[g];
        if (!id) continue;
        mark(g, { state: "writing" });
        let res = await generateListing(id, null);
        if (!res.ok && /busy|quota/i.test(res.error)) {
          await new Promise((r) => setTimeout(r, 30_000));
          res = await generateListing(id, null);
        }
        mark(g, res.ok ? { state: "done", note: `${res.data!.suggestion.title.slice(0, 40)}… $${res.data!.suggestion.price ?? "?"}` } : { state: "error", note: res.error });
        await refreshQueue();
      }
    }
    previews.forEach((p) => URL.revokeObjectURL(p.url));
    setFiles([]);
    setPreviews([]);
    setSizes([]);
    setPhase("pick");
  }

  const grouped = chunk(previews, sizes);
  let offset = 0;

  return (
    <section className="card space-y-4 p-4">
      <h2 className="font-semibold">1. Add a batch of photos</h2>

      {phase === "pick" && !progress.length && (
        <p className="text-sm text-muted">
          Shoot each item one after another (front, back, tag…). Pick them all here: Sale Away sorts them into items and writes every
          listing. Tip: start each item with the same kind of shot (like the front) and the sorting is near perfect.
        </p>
      )}

      {(phase === "pick" || phase === "ready") && (
        <label className="btn-secondary w-full cursor-pointer text-center">
          {previews.length ? "+ Add more photos" : "Pick photos"}
          <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => onPick(e.target.files)} />
        </label>
      )}
      {phase === "previewing" && <p className="text-sm text-muted">Loading photos…</p>}
      {phase === "grouping" && <p className="text-sm text-muted">Sorting {previews.length} photos into items… (up to a minute)</p>}
      {error && <p className="text-sm text-danger">{error}</p>}

      {phase === "ready" && !!previews.length && (
        <>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium">
              {previews.length} photos → {sizes.length} item{sizes.length === 1 ? "" : "s"}
            </span>
            {geminiAvailable && (
              <button type="button" className="btn-small" onClick={() => group(previews, "ai")}>
                Sort again with AI
              </button>
            )}
            <span className="flex items-center gap-1">
              <button type="button" className="btn-small" onClick={() => group(previews, "every")}>
                Every
              </button>
              <input className="input h-9 w-14 px-2 text-center" inputMode="numeric" value={perItem} onChange={(e) => setPerItem(e.target.value)} aria-label="Photos per item" />
              photos
            </span>
          </div>
          <p className="text-xs text-muted">Tap a photo to start a new item there. Tap “Join above” if one item got split.</p>
          <ol className="space-y-3">
            {grouped.map((g, gi) => {
              const start = offset;
              offset += g.length;
              return (
                <li key={`${gi}-${start}`} className="rounded-xl border border-border p-2">
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span className="font-medium">Item {gi + 1}</span>
                    {gi > 0 && (
                      <button type="button" className="btn-small" onClick={() => setSizes((s) => mergeUp(s, gi))}>
                        Join above
                      </button>
                    )}
                  </div>
                  <div className="flex gap-2 overflow-x-auto">
                    {g.map((p, k) => (
                      <button
                        key={p.url}
                        type="button"
                        disabled={k === 0}
                        onClick={() => setSizes((s) => splitAt(s, start + k))}
                        className="shrink-0 rounded-lg disabled:cursor-default"
                        title={k === 0 ? "First photo (cover)" : "Start a new item here"}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element -- local preview */}
                        <img src={p.url} alt="" className={`h-16 w-16 rounded-lg object-cover ${k === 0 ? "ring-2 ring-accent" : ""}`} />
                      </button>
                    ))}
                  </div>
                </li>
              );
            })}
          </ol>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Trip (all items)">
              <select className="input" value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
                <option value="">None</option>
                {sources.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.lot_code} {s.place ? `· ${s.place}` : ""}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Storage spot (all items)">
              <input className="input" list="batch-storage" value={storage} onChange={(e) => setStorage(e.target.value)} autoComplete="off" />
            </Field>
            <Field label="Cost each">
              <MoneyInput value={cost} onChange={(e) => setCost(e.target.value)} />
            </Field>
            <Field label="Condition (all items)">
              <select className="input" value={condition} onChange={(e) => setCondition(e.target.value)}>
                {CONDITIONS.map(([v, label]) => (
                  <option key={v} value={v}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <DataList id="batch-storage" options={storageLocations} />

          <div className="flex gap-2">
            <button type="button" className="btn-secondary" onClick={reset}>
              Start over
            </button>
            <button type="button" className="btn-primary flex-1" onClick={createAll}>
              Make {sizes.length} item{sizes.length === 1 ? "" : "s"} and write listings
            </button>
          </div>
        </>
      )}

      {!!progress.length && (
        <div className="space-y-2">
          {phase === "working" && <p className="text-sm font-medium">Working… keep this screen open. Items are saved as you go.</p>}
          <ul className="space-y-1 text-sm">
            {progress.map((p, i) => (
              <li key={i} className="flex gap-2">
                <span className="w-16 shrink-0 text-muted">Item {i + 1}</span>
                <span className={p.state === "error" ? "text-danger" : p.state === "done" ? "text-ok" : "text-muted"}>
                  {p.state === "uploading" ? "Uploading photos…" : p.state === "writing" ? "Writing listing…" : p.note ?? "Waiting"}
                </span>
              </li>
            ))}
          </ul>
          {phase === "pick" && (
            <button type="button" className="btn-small" onClick={() => setProgress([])}>
              Clear
            </button>
          )}
        </div>
      )}
    </section>
  );
}
