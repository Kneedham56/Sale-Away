"use client";

import { useRef } from "react";
import type { NewPhoto } from "@/app/(app)/items/actions";

export type PendingPhoto = {
  key: string;
  previewUrl: string;
  status: "uploading" | "done" | "error";
  promise: Promise<NewPhoto>;
  result?: NewPhoto;
};

/** Two buttons: camera (one shot) and library (many). Uploads start as soon as photos are picked. */
export function PhotoPicker({
  photos,
  onAdd,
  onRemove,
}: {
  photos: PendingPhoto[];
  onAdd: (files: FileList) => void;
  onRemove: (key: string) => void;
}) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);

  function picked(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files?.length) onAdd(e.target.files);
    e.target.value = "";
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-3">
        <button type="button" className="btn-primary bg-coral" onClick={() => cameraRef.current?.click()}>
          Take photo
        </button>
        <button type="button" className="btn-secondary" onClick={() => libraryRef.current?.click()}>
          From library
        </button>
      </div>
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={picked} />
      <input ref={libraryRef} type="file" accept="image/*" multiple className="hidden" onChange={picked} />

      {photos.length > 0 && (
        <ul className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {photos.map((p, i) => (
            <li key={p.key} className="relative shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element -- local preview blob */}
              <img src={p.previewUrl} alt="" className="h-20 w-20 rounded-lg object-cover" />
              {i === 0 && (
                <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1 text-[10px] text-white">Cover</span>
              )}
              {p.status !== "done" && (
                <span
                  className={`absolute inset-0 flex items-center justify-center rounded-lg text-xs font-medium text-white ${p.status === "error" ? "bg-danger/70" : "bg-black/40"}`}
                >
                  {p.status === "error" ? "Failed" : "Uploading…"}
                </span>
              )}
              <button
                type="button"
                aria-label="Remove photo"
                className="absolute -top-1.5 -right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-fg text-xs text-bg"
                onClick={() => onRemove(p.key)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
