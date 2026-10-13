"use client";

import { createClient } from "@/lib/supabase/client";
import type { NewPhoto } from "@/app/(app)/items/actions";

const BUCKET = "item-photos";
const FULL_EDGE = 1600;
const THUMB_EDGE = 400;

async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    // Older Safari: fall back to an <img> element (also decodes HEIC on iPhone)
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  }
}

async function toJpeg(src: ImageBitmap | HTMLImageElement, longEdge: number, quality: number): Promise<Blob> {
  const w = "naturalWidth" in src ? src.naturalWidth : src.width;
  const h = "naturalHeight" in src ? src.naturalHeight : src.height;
  const scale = Math.min(1, longEdge / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No canvas");
  ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't encode JPEG"))), "image/jpeg", quality)
  );
}

/** JPEG (~1600px) + thumbnail made on the phone: smaller uploads on bad signal, and AI models want JPEG. */
export async function processPhoto(file: File): Promise<{ full: Blob; thumb: Blob | null; converted: boolean }> {
  try {
    const img = await decode(file);
    const [full, thumb] = await Promise.all([toJpeg(img, FULL_EDGE, 0.85), toJpeg(img, THUMB_EDGE, 0.8)]);
    if ("close" in img) img.close();
    return { full, thumb, converted: true };
  } catch {
    return { full: file, thumb: null, converted: false };
  }
}

async function uploadWithRetry(path: string, body: Blob, contentType: string, attempts = 6) {
  const supabase = createClient();
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    const { error } = await supabase.storage.from(BUCKET).upload(path, body, { contentType, upsert: true });
    if (!error) return;
    lastError = error;
    // Wait for signal, then back off: 1s, 2s, 4s, 8s ...
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      await new Promise<void>((r) => window.addEventListener("online", () => r(), { once: true }));
    } else {
      await new Promise((r) => setTimeout(r, 1000 * 2 ** i));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Upload failed");
}

/** Uploads one photo under <business>/<item>/ (storage rules only allow her own business folder). */
export async function uploadPhoto(workspaceId: string, itemId: string, file: File): Promise<NewPhoto> {
  const photoId = crypto.randomUUID();
  const { full, thumb, converted } = await processPhoto(file);
  const ext = converted ? "jpg" : (file.name.split(".").pop() || "bin").toLowerCase();
  const fullPath = `${workspaceId}/${itemId}/${photoId}.${ext}`;
  const thumbPath = `${workspaceId}/${itemId}/${photoId}_thumb.jpg`;
  await uploadWithRetry(fullPath, full, converted ? "image/jpeg" : file.type || "application/octet-stream");
  if (thumb) await uploadWithRetry(thumbPath, thumb, "image/jpeg");
  return {
    storage_path: fullPath,
    jpeg_path: converted ? fullPath : null,
    thumb_path: thumb ? thumbPath : null,
  };
}
