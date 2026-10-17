"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createItem } from "../items/actions";
import { uploadPhoto } from "@/lib/photo-upload";
import { DataList, Field, MoneyInput } from "@/components/fields";
import { TripPicker } from "@/components/trip-picker";
import { PhotoPicker, type PendingPhoto } from "@/components/photo-picker";
import { KIND_LABELS } from "@/lib/format";
import type { Lookups } from "@/lib/data/lookups";

const STICKY_KEY = "sale-away:add-item";
const MEDIA_FORMATS = ["DVD", "Blu-ray", "CD", "VHS", "Video Game", "PC Game", "Vinyl", "Cassette", "Other"];

type Sticky = { sourceId: string; storage: string; kind: string; category: string };

function readSticky(): Sticky {
  const fallback = { sourceId: "", storage: "", kind: "general", category: "" };
  try {
    return { ...fallback, ...JSON.parse(localStorage.getItem(STICKY_KEY) ?? "{}") };
  } catch {
    return fallback;
  }
}

export function AddItemForm({
  lookups,
  today,
  workspaceId,
  tripId = null,
}: {
  lookups: Lookups;
  today: string;
  workspaceId: string;
  /** Opened from a trip's "Add items" button: that trip is pre-selected */
  tripId?: string | null;
}) {
  const router = useRouter();
  const itemId = useRef<string | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [photos, setPhotos] = useState<PendingPhoto[]>([]);
  const [sticky, setSticky] = useState<Sticky>({ sourceId: "", storage: "", kind: "general", category: "" });
  const [savedCount, setSavedCount] = useState(0);
  const [phase, setPhase] = useState<null | { step: "uploading" | "saving"; next: "another" | "open" }>(null);
  const [error, setError] = useState<string | null>(null);

  // Trip, storage spot and kind carry over between items (she logs a whole haul at once)
  useEffect(() => {
    const s = readSticky();
    if (tripId && lookups.sources.some((src) => src.id === tripId)) s.sourceId = tripId;
    const validSource = s.sourceId === "" || lookups.sources.some((src) => src.id === s.sourceId);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time restore from localStorage after hydration
    setSticky(validSource ? s : { ...s, sourceId: "" });
  }, [lookups.sources, tripId]);

  function updateSticky(patch: Partial<Sticky>) {
    setSticky((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(STICKY_KEY, JSON.stringify({ ...next, sourceId: next.sourceId === "new" ? "" : next.sourceId }));
      } catch {}
      return next;
    });
  }

  function getItemId() {
    itemId.current ??= crypto.randomUUID();
    return itemId.current;
  }

  function addFiles(files: FileList) {
    const id = getItemId();
    for (const file of Array.from(files)) {
      const key = crypto.randomUUID();
      const promise = uploadPhoto(workspaceId, id, file);
      setPhotos((p) => [...p, { key, previewUrl: URL.createObjectURL(file), status: "uploading", promise }]);
      promise.then(
        (result) => setPhotos((p) => p.map((x) => (x.key === key ? { ...x, status: "done", result } : x))),
        () => setPhotos((p) => p.map((x) => (x.key === key ? { ...x, status: "error" } : x)))
      );
    }
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const next = submitter?.value === "another" ? "another" : "open";
    const fd = new FormData(e.currentTarget);
    fd.set("id", getItemId());
    setError(null);
    setPhase({ step: "uploading", next });
    const settled = await Promise.allSettled(photos.map((p) => p.promise));
    fd.set("photos", JSON.stringify(settled.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []))));
    setPhase({ step: "saving", next });
    const res = await createItem(null, fd);
    setPhase(null);
    if (!res.ok || !res.data) {
      setError(res.ok ? "Something went wrong." : res.error);
      return;
    }
    if (next === "open") {
      router.push(`/items/${res.data.id}`);
      return;
    }
    // Clear the form for the next item; trip, storage and kind stay
    itemId.current = null;
    photos.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    setPhotos([]);
    setSavedCount((n) => n + 1);
    if (res.data.sourceId) updateSticky({ sourceId: res.data.sourceId });
    setFormKey((k) => k + 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const busy = phase !== null;
  const failed = photos.filter((p) => p.status === "error").length;
  const label = (mode: "another" | "open", idle: string) =>
    phase?.next === mode ? (phase.step === "uploading" ? "Uploading…" : "Saving…") : idle;

  return (
    <form key={formKey} onSubmit={onSubmit} className="space-y-5">
      {savedCount > 0 && (
        <p className="rounded-xl bg-ok/15 px-4 py-2 text-sm font-medium text-ok">
          Saved {savedCount} item{savedCount === 1 ? "" : "s"}. Ready for the next one.
        </p>
      )}

      <PhotoPicker
        photos={photos}
        onAdd={addFiles}
        onRemove={(key) => setPhotos((p) => p.filter((x) => x.key !== key))}
      />
      {failed > 0 && (
        <p className="text-sm text-danger">
          {failed} photo{failed === 1 ? "" : "s"} didn&apos;t upload. Remove and try again, or save without.
        </p>
      )}

      <Field label="What is it?">
        <input name="title" className="input" placeholder="e.g. Vera Bradley backpack, floral" required autoComplete="off" />
      </Field>

      <div>
        <span className="mb-1 block text-sm font-medium">Kind</span>
        <div className="flex gap-2">
          {Object.entries(KIND_LABELS).map(([k, label]) => (
            <label key={k} className={`chip cursor-pointer ${sticky.kind === k ? "chip-active" : ""}`}>
              <input
                type="radio"
                name="kind"
                value={k}
                className="sr-only"
                checked={sticky.kind === k}
                onChange={() => updateSticky({ kind: k })}
              />
              {label}
            </label>
          ))}
        </div>
      </div>

      {sticky.kind === "media" && (
        <Field label="Format">
          <select name="format" className="input" defaultValue="DVD">
            {MEDIA_FORMATS.map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
        </Field>
      )}
      {sticky.kind === "book" && (
        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" name="is_bundle" className="h-5 w-5" /> Bundle / lot of books
        </label>
      )}

      <Field label="Sourcing trip">
        <TripPicker
          sources={lookups.sources}
          value={sticky.sourceId}
          onChange={(id) => updateSticky({ sourceId: id })}
          today={today}
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Cost">
          <MoneyInput name="cost" placeholder="0.00" />
        </Field>
        <Field label="Storage spot">
          <input
            name="storage_location"
            className="input"
            list="storage-locations"
            value={sticky.storage}
            onChange={(e) => updateSticky({ storage: e.target.value })}
            autoComplete="off"
          />
        </Field>
      </div>
      <DataList id="storage-locations" options={lookups.storageLocations} />

      <Field label="Category">
        <input
          name="category"
          className="input"
          list="categories"
          autoComplete="off"
          defaultValue={sticky.kind === "book" ? "Books" : sticky.kind === "media" ? "DVD & Media" : ""}
        />
      </Field>
      <DataList id="categories" options={lookups.categories} />

      <details className="rounded-xl border border-border bg-surface px-4 py-3">
        <summary className="cursor-pointer text-sm font-medium">More details (condition, price, notes)</summary>
        <div className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Condition">
              <select name="condition" className="input" defaultValue="">
                <option value="">–</option>
                <option value="new">New</option>
                <option value="pre_owned">Pre-owned</option>
              </select>
            </Field>
            <Field label="Grade">
              <select name="condition_grade" className="input" defaultValue="">
                <option value="">–</option>
                <option value="excellent">Excellent</option>
                <option value="good">Good</option>
                <option value="acceptable">Acceptable</option>
              </select>
            </Field>
          </div>
          <Field label="Flaws / condition notes">
            <textarea name="condition_notes" className="input min-h-20" />
          </Field>
          <Field label="Planned list price">
            <MoneyInput name="list_price" />
          </Field>
          <Field label="Notes">
            <textarea name="notes" className="input min-h-20" />
          </Field>
        </div>
      </details>

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="sticky bottom-[calc(env(safe-area-inset-bottom)+5rem)] z-10 grid grid-cols-2 gap-3 md:static">
        <button className="btn-secondary" name="next" value="another" disabled={busy}>
          {label("another", "Save + next")}
        </button>
        <button className="btn-primary" name="next" value="open" disabled={busy}>
          {label("open", "Save")}
        </button>
      </div>
    </form>
  );
}
