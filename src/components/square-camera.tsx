"use client";

import { useEffect, useRef, useState } from "react";

/** Longest side we keep from the camera; uploads are resized to 1600px anyway. */
const MAX_EDGE = 2400;

type Shot = { key: string; url: string };

/**
 * Full-screen camera with a square viewfinder: what she sees in the square is exactly the photo (1:1, like eBay shows it).
 * Each shot is handed to `onCapture` right away so it can start uploading; she keeps shooting until Done.
 * If the browser won't give camera access, `onFallback` opens the phone's own camera instead.
 */
export function SquareCamera({
  onCapture,
  onClose,
  onFallback,
}: {
  onCapture: (file: File) => void;
  onClose: () => void;
  onFallback: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shots, setShots] = useState<Shot[]>([]);
  const [flash, setFlash] = useState(false);
  const [busy, setBusy] = useState(false);
  const [torch, setTorch] = useState<boolean | null>(null); // null = this camera has no light

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("unsupported");
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: "environment" }, width: { ideal: 4096 }, height: { ideal: 3072 } },
        });
        if (cancelled) return stream.getTracks().forEach((t) => t.stop());
        streamRef.current = stream;
        const video = videoRef.current!;
        video.srcObject = stream;
        await video.play().catch(() => {});
        const caps = stream.getVideoTracks()[0]?.getCapabilities?.() as { torch?: boolean } | undefined;
        if (caps?.torch) setTorch(false);
        setReady(true);
      } catch (e) {
        const denied = e instanceof DOMException && (e.name === "NotAllowedError" || e.name === "SecurityError");
        setError(
          denied
            ? "Sale Away isn't allowed to use the camera. Allow it in your phone's settings for this site, or use the phone's camera for now."
            : "This phone's browser won't open the square camera. Use the phone's camera instead."
        );
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // Free the little preview images when the camera closes
  const previewUrls = useRef<string[]>([]);
  useEffect(() => () => previewUrls.current.forEach((u) => URL.revokeObjectURL(u)), []);

  async function grabFrame(): Promise<{ source: CanvasImageSource; width: number; height: number; done?: () => void }> {
    const track = streamRef.current?.getVideoTracks()[0];
    // Android Chrome can take a full-resolution still; iPhone gets the (high-res) video frame
    const IC = (window as unknown as { ImageCapture?: new (t: MediaStreamTrack) => { takePhoto(): Promise<Blob> } }).ImageCapture;
    if (IC && track) {
      try {
        const bmp = await createImageBitmap(await new IC(track).takePhoto());
        return { source: bmp, width: bmp.width, height: bmp.height, done: () => bmp.close() };
      } catch {
        /* fall through to the video frame */
      }
    }
    const v = videoRef.current!;
    return { source: v, width: v.videoWidth, height: v.videoHeight };
  }

  async function shoot() {
    if (!ready || busy) return;
    setBusy(true);
    setFlash(true);
    setTimeout(() => setFlash(false), 120);
    try {
      const frame = await grabFrame();
      const side = Math.min(frame.width, frame.height);
      const out = Math.min(side, MAX_EDGE);
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = out;
      const ctx = canvas.getContext("2d")!;
      // The centered square: the same part the viewfinder shows
      ctx.drawImage(frame.source, (frame.width - side) / 2, (frame.height - side) / 2, side, side, 0, 0, out, out);
      frame.done?.();
      const blob = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("no image"))), "image/jpeg", 0.92));
      const file = new File([blob], `photo-${Date.now()}.jpg`, { type: "image/jpeg" });
      const url = URL.createObjectURL(blob);
      previewUrls.current.push(url);
      setShots((s) => [...s, { key: crypto.randomUUID(), url }]);
      onCapture(file);
    } catch {
      setError("That photo didn't take. Try again, or use the phone's camera.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track || torch === null) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torch } as MediaTrackConstraintSet] });
      setTorch(!torch);
    } catch {
      setTorch(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black text-white" role="dialog" aria-label="Square camera">
      <div className="flex items-center justify-between px-4 pt-[max(env(safe-area-inset-top),12px)] pb-3">
        <button type="button" className="text-sm text-white/80" onClick={onClose}>
          Cancel
        </button>
        <span className="text-sm text-white/70">{shots.length ? `${shots.length} taken` : "Square photo"}</span>
        {torch !== null ? (
          <button type="button" className="text-sm text-white/80" onClick={toggleTorch} aria-pressed={torch}>
            {torch ? "Light on" : "Light off"}
          </button>
        ) : (
          <span className="w-14" />
        )}
      </div>

      <div className="flex flex-1 items-center justify-center px-2">
        <div className="relative aspect-square w-full max-w-[min(100vw,70vh)] overflow-hidden rounded-xl bg-neutral-900">
          {/* object-cover in a square box shows exactly the centered square that gets saved */}
          <video ref={videoRef} playsInline muted autoPlay className="h-full w-full object-cover" />
          {/* thirds grid to help center the item */}
          <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="border border-white/15" />
            ))}
          </div>
          {flash && <div className="absolute inset-0 bg-white/80" />}
          {!ready && !error && <p className="absolute inset-0 flex items-center justify-center text-sm text-white/70">Opening camera…</p>}
          {error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
              <p className="text-sm">{error}</p>
              <button type="button" className="btn-primary bg-coral" onClick={onFallback}>
                Use the phone&apos;s camera
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="px-4 pt-3 pb-[max(env(safe-area-inset-bottom),16px)]">
        {shots.length > 0 && (
          <ul className="mb-3 flex gap-2 overflow-x-auto">
            {shots.map((s) => (
              <li key={s.key} className="shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element -- local preview blob */}
                <img src={s.url} alt="" className="h-12 w-12 rounded-md object-cover" />
              </li>
            ))}
          </ul>
        )}
        <div className="grid grid-cols-3 items-center">
          <span />
          <button
            type="button"
            aria-label="Take photo"
            disabled={!ready || busy}
            onClick={shoot}
            className="mx-auto h-18 w-18 rounded-full border-4 border-white bg-white/20 transition active:scale-95 disabled:opacity-40"
          />
          <button type="button" className="justify-self-end rounded-full bg-white px-4 py-2 text-sm font-semibold text-black" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
