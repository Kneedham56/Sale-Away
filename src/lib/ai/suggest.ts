import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PHOTO_BUCKET } from "@/lib/photos";
import { callGemini, type InlineImage } from "./gemini";
import { normalizeListing, normalizeQuick } from "./parse";
import {
  DEFAULT_LISTING_PROMPT,
  DEFAULT_QUICK_PROMPT,
  DEFAULT_STORE_RULES,
  fillListingPrompt,
  fillQuickPrompt,
  type ItemNotes,
} from "./prompts";
import { LISTING_SCHEMA, QUICK_SCHEMA, type ListingSuggestion, type QuickCheckResult } from "./types";

export type AiSettings = {
  listingPrompt: string;
  quickPrompt: string;
  storeRules: string;
  listingModel: string;
  quickModel: string;
};

export async function getAiSettings(supabase: SupabaseClient): Promise<AiSettings> {
  const { data } = await supabase
    .from("settings")
    .select("key, value")
    .in("key", ["ai_listing_prompt", "ai_quick_prompt", "store_rules", "ai_listing_model", "ai_quick_model"]);
  const s = Object.fromEntries((data ?? []).map((r) => [r.key, r.value]));
  const text = (v: unknown, d: string) => (typeof v === "string" && v.trim() ? v : d);
  return {
    listingPrompt: text(s.ai_listing_prompt, DEFAULT_LISTING_PROMPT),
    quickPrompt: text(s.ai_quick_prompt, DEFAULT_QUICK_PROMPT),
    storeRules: text(s.store_rules, DEFAULT_STORE_RULES),
    listingModel: text(s.ai_listing_model, "gemini-flash-latest"),
    quickModel: text(s.ai_quick_model, "gemini-flash-lite-latest"),
  };
}

const MIME: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", heic: "image/heic", heif: "image/heif",
};

/** Up to 4 of the item's photos (the JPEG copies), as inline images. */
async function itemImages(supabase: SupabaseClient, itemId: string): Promise<InlineImage[]> {
  const { data: photos } = await supabase
    .from("item_photos")
    .select("storage_path, jpeg_path")
    .eq("item_id", itemId)
    .order("sort_order")
    .order("created_at")
    .limit(4);
  const out: InlineImage[] = [];
  for (const p of photos ?? []) {
    const path = p.jpeg_path ?? p.storage_path;
    const mimeType = MIME[path.split(".").pop()?.toLowerCase() ?? ""];
    if (!mimeType) continue;
    const { data } = await supabase.storage.from(PHOTO_BUCKET).download(path);
    if (data) out.push({ mimeType, base64: Buffer.from(await data.arrayBuffer()).toString("base64") });
  }
  return out;
}

export async function loadItemNotes(supabase: SupabaseClient, itemId: string, extra?: string | null): Promise<ItemNotes> {
  const { data: item, error } = await supabase
    .from("items")
    .select("title, intake_title, kind, category, format, is_bundle, condition, condition_grade, condition_notes, cost")
    .eq("id", itemId)
    .single();
  if (error || !item) throw new Error("Item not found.");
  return {
    title: item.intake_title ?? item.title,
    kind: item.kind,
    category: item.category,
    format: item.format,
    is_bundle: item.is_bundle,
    condition: item.condition,
    condition_grade: item.condition_grade,
    condition_notes: item.condition_notes,
    cost: item.cost === null ? null : Number(item.cost),
    extra: extra ?? null,
  };
}

export type CompsProvider = (query: string) => Promise<{ text: string; comps: ListingSuggestion["comps"] } | null>;
export type SpecificsValidator = (
  categoryName: string,
  specifics: ListingSuggestion["item_specifics"]
) => Promise<{ categoryId: string | null; missing: string[] } | null>;

/**
 * Generate listing: photos + her notes + store rules (+ active eBay comps when connected) -> structured suggestion.
 * Every run is saved in ai_runs, successful or not.
 */
export async function suggestListing(
  supabase: SupabaseClient,
  itemId: string,
  opts: { extra?: string | null; comps?: CompsProvider; validate?: SpecificsValidator } = {}
): Promise<{ runId: string; suggestion: ListingSuggestion }> {
  const settings = await getAiSettings(supabase);
  const notes = await loadItemNotes(supabase, itemId, opts.extra);
  const [images, comps] = await Promise.all([
    itemImages(supabase, itemId),
    opts.comps ? opts.comps(notes.title).catch(() => null) : Promise.resolve(null),
  ]);
  const prompt = fillListingPrompt(settings.listingPrompt, notes, settings.storeRules, comps?.text);
  const inputs = { notes, model: settings.listingModel, photo_count: images.length, comps: comps?.comps?.length ?? 0 };

  try {
    if (!images.length && !notes.title) throw new Error("Add a photo or a description first.");
    const result = await callGemini({ model: settings.listingModel, prompt, images, schema: LISTING_SCHEMA });
    const suggestion = normalizeListing(result.json);
    if (!images.length) suggestion.flags.unshift("No photos were sent; this is based on her notes only.");
    if (comps?.comps?.length) suggestion.comps = comps.comps;
    if (opts.validate && suggestion.category) {
      const v = await opts.validate(suggestion.category, suggestion.item_specifics).catch(() => null);
      if (v) {
        suggestion.ebay_category_id = v.categoryId;
        if (v.missing.length) suggestion.flags.push(`eBay requires these specifics: ${v.missing.join(", ")}.`);
      }
    }
    const { data: run } = await supabase
      .from("ai_runs")
      .insert({
        item_id: itemId, mode: "listing", provider: "gemini", model: result.model, inputs, output: suggestion,
        input_tokens: result.inputTokens, output_tokens: result.outputTokens,
      })
      .select("id")
      .single();
    return { runId: run?.id ?? "", suggestion };
  } catch (e) {
    await supabase.from("ai_runs").insert({
      item_id: itemId, mode: "listing", provider: "gemini", model: settings.listingModel, inputs,
      error: e instanceof Error ? e.message : String(e),
    });
    throw e;
  }
}

/** Saves a suggestion she pasted back from a chat app (Copy Prompt mode). */
export async function savePastedSuggestion(supabase: SupabaseClient, itemId: string, suggestion: ListingSuggestion) {
  const { data: run } = await supabase
    .from("ai_runs")
    .insert({ item_id: itemId, mode: "listing", provider: "copy_prompt", output: suggestion })
    .select("id")
    .single();
  return run?.id ?? "";
}

export async function quickCheck(
  supabase: SupabaseClient,
  image: InlineImage,
  note: string | null
): Promise<QuickCheckResult & { runId: string }> {
  const settings = await getAiSettings(supabase);
  const result = await callGemini({
    model: settings.quickModel,
    prompt: fillQuickPrompt(settings.quickPrompt, note),
    images: [image],
    schema: QUICK_SCHEMA,
    timeoutMs: 60_000,
  });
  const out = normalizeQuick(result.json);
  const { data: run } = await supabase
    .from("ai_runs")
    .insert({
      mode: "quick_check", provider: "gemini", model: result.model, inputs: { note }, output: out,
      input_tokens: result.inputTokens, output_tokens: result.outputTokens,
    })
    .select("id")
    .single();
  return { ...out, runId: run?.id ?? "" };
}
