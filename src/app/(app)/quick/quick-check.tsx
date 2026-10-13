"use client";

import { useRef, useState, useTransition } from "react";
import { quickCheckAction, quickCopyPrompt, readPastedQuick } from "../items/ai-actions";
import { processPhoto } from "@/lib/photo-upload";
import { CopyButton } from "@/components/copy-button";
import { money } from "@/lib/format";
import type { QuickCheckResult } from "@/lib/ai/types";

export function QuickCheck({ geminiAvailable }: { geminiAvailable: boolean }) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [note, setNote] = useState("");
  const [result, setResult] = useState<QuickCheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<string | null>(null);
  const [pasted, setPasted] = useState("");
  const [pending, start] = useTransition();

  async function onPhoto(file: File | undefined) {
    if (!file) return;
    setResult(null);
    setError(null);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(URL.createObjectURL(file));
    const { full } = await processPhoto(file);
    setPhoto(full);
    if (geminiAvailable) check(full);
  }

  function check(blob: Blob | null = photo) {
    if (!blob) return;
    setError(null);
    start(async () => {
      const fd = new FormData();
      fd.set("photo", new File([blob], "photo.jpg", { type: blob.type || "image/jpeg" }));
      if (note.trim()) fd.set("note", note.trim());
      const res = await quickCheckAction(fd);
      if (!res.ok) setError(res.error);
      else setResult(res.data!);
    });
  }

  return (
    <div className="space-y-4">
      <button type="button" className="btn-primary h-16 w-full bg-coral text-lg" onClick={() => cameraRef.current?.click()}>
        {preview ? "Take another photo" : "📷 Take a photo"}
      </button>
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { onPhoto(e.target.files?.[0]); e.target.value = ""; }} />

      <input className="input" placeholder="Optional note (brand, size, price tag…)" value={note} onChange={(e) => setNote(e.target.value)} />

      {preview && (
        // eslint-disable-next-line @next/next/no-img-element -- local preview
        <img src={preview} alt="" className="mx-auto max-h-64 rounded-2xl object-contain" />
      )}

      {pending && <p className="text-center text-muted">Checking…</p>}
      {error && <p className="text-sm text-danger">{error}</p>}

      {result && (
        <div className={`rounded-2xl p-5 text-center ${result.decision === "KEEP" ? "bg-ok/15" : "bg-danger/15"}`}>
          <div className={`text-5xl font-black tracking-tight ${result.decision === "KEEP" ? "text-ok" : "text-danger"}`}>{result.decision}</div>
          {result.rule && <div className="mt-1 font-semibold">{result.rule}</div>}
          {result.price_estimate !== null && <div className="mt-1 text-sm">about {money(result.price_estimate)}</div>}
          <p className="mt-3 text-sm">{result.resale_note}</p>
          <p className="mt-2 text-xs text-muted">Estimate from one photo, not verified against sold listings.</p>
        </div>
      )}

      {preview && geminiAvailable && !pending && (
        <button type="button" className="btn-secondary w-full" onClick={() => check()}>
          Check again{note ? " with note" : ""}
        </button>
      )}

      <details className="card p-4 text-sm" open={!geminiAvailable}>
        <summary className="cursor-pointer font-medium">Use a chat app instead (Copy prompt)</summary>
        <div className="mt-3 space-y-3">
          {!prompt ? (
            <button
              type="button"
              className="btn-small"
              onClick={() =>
                start(async () => {
                  const r = await quickCopyPrompt(note.trim() || null);
                  if (r.ok) setPrompt(r.data!);
                  else setError(r.error);
                })
              }
            >
              Build prompt
            </button>
          ) : (
            <CopyButton text={prompt} label="Copy prompt" className="btn-primary min-h-10 w-full" />
          )}
          <p className="text-muted">Paste it into ChatGPT, Gemini or Claude with the photo, then paste the answer here.</p>
          <textarea className="input min-h-20" value={pasted} onChange={(e) => setPasted(e.target.value)} />
          <button
            type="button"
            className="btn-small"
            disabled={!pasted.trim()}
            onClick={() =>
              start(async () => {
                const r = await readPastedQuick(pasted);
                if (r.ok) setResult(r.data!);
                else setError(r.error);
              })
            }
          >
            Read answer
          </button>
        </div>
      </details>
    </div>
  );
}
