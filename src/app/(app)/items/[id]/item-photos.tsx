"use client";

import { useRef, useState, useTransition } from "react";
import { addPhotos, deletePhoto, movePhoto } from "../actions";
import { uploadPhoto } from "@/lib/photo-upload";
import { SquareCamera } from "@/components/square-camera";

type Photo = { id: string; url: string | null; thumbUrl: string | null };

export function ItemPhotos({ itemId, workspaceId, photos }: { itemId: string; workspaceId: string; photos: Photo[] }) {
  const [selected, setSelected] = useState(0);
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState<string | null>(null);
  // eBay didn't take a photo change on a listed item (the photos are saved in Sale Away)
  const [note, setNote] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [camera, setCamera] = useState(false);
  // Shots from the square camera, saved together when she taps Done
  const shotsRef = useRef<File[]>([]);
  const current = photos[Math.min(selected, photos.length - 1)];

  async function onFiles(files: FileList | File[] | null) {
    if (!files?.length) return;
    setError(null);
    setNote(null);
    setUploading(files.length);
    const results = await Promise.allSettled(Array.from(files).map((f) => uploadPhoto(workspaceId, itemId, f)));
    const ok = results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
    if (ok.length) {
      const res = await addPhotos(itemId, ok);
      if (!res.ok) setError(res.error);
      else setNote(res.data ?? null);
    }
    if (ok.length < results.length) setError(`${results.length - ok.length} photo(s) failed to upload.`);
    setUploading(0);
  }

  function run(fn: () => Promise<{ ok: boolean; error?: string; data?: string | null }>) {
    setError(null);
    setNote(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Something went wrong.");
      else setNote(res.data ?? null);
    });
  }

  return (
    <div className="space-y-2">
      {current ? (
        // eslint-disable-next-line @next/next/no-img-element -- signed storage URL
        <img src={current.url ?? current.thumbUrl ?? ""} alt="" className="aspect-square w-full rounded-2xl bg-border object-contain" />
      ) : (
        <div className="flex aspect-[4/3] w-full items-center justify-center rounded-2xl border border-dashed border-border text-sm text-muted">
          No photos yet
        </div>
      )}

      {photos.length > 0 && (
        <ul className="flex gap-2 overflow-x-auto pb-1">
          {photos.map((p, i) => (
            <li key={p.id} className="shrink-0">
              <button
                type="button"
                onClick={() => setSelected(i)}
                className={`block overflow-hidden rounded-lg border-2 ${i === selected ? "border-accent" : "border-transparent"}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- signed storage URL */}
                <img src={p.thumbUrl ?? p.url ?? ""} alt="" className="h-16 w-16 object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-small" disabled={uploading > 0} onClick={() => setCamera(true)}>
          Camera
        </button>
        <label className="btn-small cursor-pointer">
          {uploading ? `Uploading ${uploading}…` : "+ Photos"}
          <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => onFiles(e.target.files)} />
        </label>
        {current && (
          <>
            {selected > 0 && (
              <button className="btn-small" disabled={pending} onClick={() => run(() => movePhoto(current.id, "first"))}>
                Make cover
              </button>
            )}
            {selected > 0 && (
              <button className="btn-small" disabled={pending} onClick={() => { setSelected(selected - 1); run(() => movePhoto(current.id, "left")); }}>
                ‹ Move
              </button>
            )}
            {selected < photos.length - 1 && (
              <button className="btn-small" disabled={pending} onClick={() => { setSelected(selected + 1); run(() => movePhoto(current.id, "right")); }}>
                Move ›
              </button>
            )}
            <button
              className="btn-small text-danger"
              disabled={pending}
              onClick={() => {
                if (!confirm("Delete this photo?")) return;
                setSelected(Math.max(0, selected - 1));
                run(() => deletePhoto(current.id));
              }}
            >
              Delete
            </button>
          </>
        )}
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      {note && <p className="rounded-xl bg-coral/10 px-3 py-2 text-sm text-coral">{note}</p>}
      {camera && (
        <SquareCamera
          onCapture={(file) => shotsRef.current.push(file)}
          onClose={() => {
            setCamera(false);
            const files = shotsRef.current;
            shotsRef.current = [];
            onFiles(files);
          }}
          onFallback={() => setCamera(false)}
        />
      )}
    </div>
  );
}
