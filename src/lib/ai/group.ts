import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { callGemini } from "./gemini";
import { getAiSettings } from "./suggest";
import { groupsFromStarts } from "@/lib/queue";

const GROUP_PROMPT = `These photos are numbered 1 to N in the order they were taken. A reseller photographed several
different items for sale, one item after another, usually 2 to 6 photos per item (front, back, tags, labels, flaws,
close-ups). Decide where each new item starts. Photos of the same item show the same object from different angles
or a close-up of its tag/label/flaw. A new item is a different object (different color, print, shape or product).
Return item_starts: the photo numbers where a new item begins, starting with 1.`;

const GROUP_SCHEMA = {
  type: "object",
  properties: { item_starts: { type: "array", items: { type: "integer" } } },
  required: ["item_starts"],
} as const;

/** The AI sorts a photo batch (small JPEG previews, base64, in order) into items. Returns each item's photo count. */
export async function groupPhotoBatch(supabase: SupabaseClient, previews: string[]): Promise<number[]> {
  const settings = await getAiSettings(supabase);
  const result = await callGemini({
    model: settings.listingModel,
    fallbackModel: settings.quickModel,
    prompt: GROUP_PROMPT.replace("1 to N", `1 to ${previews.length}`),
    images: previews.map((base64) => ({ mimeType: "image/jpeg", base64 })),
    schema: GROUP_SCHEMA,
    mainTimeoutMs: 60_000,
  });
  const starts = ((result.json as { item_starts?: unknown[] })?.item_starts ?? []).map(Number).map((n) => n - 1);
  const sizes = groupsFromStarts(previews.length, starts);
  await supabase.from("ai_runs").insert({
    mode: "photo_group", provider: "gemini", model: result.model, inputs: { photos: previews.length }, output: { sizes },
    input_tokens: result.inputTokens, output_tokens: result.outputTokens,
  });
  return sizes;
}
