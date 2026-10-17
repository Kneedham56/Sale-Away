"use server";

import { refresh } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireMember } from "@/lib/auth";
import { attempt, FormError, type ActionResult } from "@/lib/form";
import { getAiSettings, loadItemNotes, quickCheck, savePastedSuggestion, suggestListing } from "@/lib/ai/suggest";
import { COPY_LISTING_FORMAT, COPY_QUICK_FORMAT, fillListingPrompt, fillQuickPrompt } from "@/lib/ai/prompts";
import { parsePastedListing, parsePastedQuick, TITLE_MAX } from "@/lib/ai/parse";
import type { ListingSuggestion, QuickCheckResult, Specific } from "@/lib/ai/types";
import { ebayAiHelpers } from "@/lib/ebay/ai-helpers";

async function db() {
  await requireMember();
  return createClient();
}

export async function generateListing(
  itemId: string,
  extra: string | null
): Promise<ActionResult<{ runId: string; suggestion: ListingSuggestion }>> {
  return attempt(async () => {
    const supabase = await db();
    const helpers = await ebayAiHelpers();
    return suggestListing(supabase, itemId, { extra, ...helpers });
  });
}

/** Copy Prompt mode, step 1: the full prompt to paste into any chat app along with the photos. */
export async function buildCopyPrompt(itemId: string, extra: string | null): Promise<ActionResult<string>> {
  return attempt(async () => {
    const supabase = await db();
    const [settings, notes] = await Promise.all([getAiSettings(supabase), loadItemNotes(supabase, itemId, extra)]);
    return fillListingPrompt(settings.listingPrompt, notes, settings.storeRules) + COPY_LISTING_FORMAT;
  });
}

/** Copy Prompt mode, step 2: read the chat app's answer. */
export async function readPastedAnswer(
  itemId: string,
  text: string
): Promise<ActionResult<{ runId: string; suggestion: ListingSuggestion }>> {
  return attempt(async () => {
    if (!text.trim()) throw new FormError("Paste the chat app's answer first.");
    const supabase = await db();
    const suggestion = parsePastedListing(text);
    if (!suggestion.title) throw new FormError("Couldn't find a title in that answer. Paste the whole reply.");
    const runId = await savePastedSuggestion(supabase, itemId, suggestion);
    return { runId, suggestion };
  });
}

export type AcceptedListing = {
  title: string;
  category: string;
  item_specifics: Specific[];
  description: string;
  condition_text: string;
  price: number | null;
  price_low: number | null;
  price_high: number | null;
  decision: "KEEP" | "DONATE";
  ebay_category_id?: string | null;
};

/** She approves (after any edits): fields land on the item and it moves to Inventory > Drafted. The AI never publishes. */
export async function acceptListing(itemId: string, runId: string | null, l: AcceptedListing): Promise<ActionResult> {
  return attempt(async () => {
    const supabase = await db();
    const title = l.title.trim();
    if (!title) throw new FormError("Title is required.");
    if (title.length > TITLE_MAX) throw new FormError(`Title is ${title.length} characters; eBay allows ${TITLE_MAX}.`);
    const { data: item, error } = await supabase.from("items").select("title, intake_title, status").eq("id", itemId).single();
    if (error || !item) throw new Error("Item not found.");

    const patch: Record<string, unknown> = {
      title,
      intake_title: item.intake_title ?? (item.title !== title ? item.title : null),
      ebay_category_name: l.category || null,
      ebay_category_id: l.ebay_category_id ?? null,
      item_specifics: l.item_specifics.filter((s) => s.name.trim() && s.value.trim()),
      listing_description: l.description || null,
      condition_text: l.condition_text || null,
      list_price: l.price,
      price_low: l.price_low,
      price_high: l.price_high,
      ai_decision: l.decision,
    };
    if (["intake", "unlisted"].includes(item.status)) patch.status = "ready_to_list";
    const upd = await supabase.from("items").update(patch).eq("id", itemId);
    if (upd.error) throw new Error(upd.error.message);
    if (runId) await supabase.from("ai_runs").update({ accepted: true }).eq("id", runId);
    await supabase.from("item_events").insert({ item_id: itemId, action: "Listing reviewed", note: `AI suggestion accepted at $${l.price ?? "?"}` });
    refresh();
  });
}

export async function quickCheckAction(fd: FormData): Promise<ActionResult<QuickCheckResult & { runId: string }>> {
  return attempt(async () => {
    const supabase = await db();
    const photo = fd.get("photo");
    if (!(photo instanceof File) || !photo.size) throw new FormError("Take a photo first.");
    const note = typeof fd.get("note") === "string" ? (fd.get("note") as string).trim() || null : null;
    const base64 = Buffer.from(await photo.arrayBuffer()).toString("base64");
    return quickCheck(supabase, { mimeType: photo.type || "image/jpeg", base64 }, note);
  });
}

export async function quickCopyPrompt(note: string | null): Promise<ActionResult<string>> {
  return attempt(async () => {
    const supabase = await db();
    const settings = await getAiSettings(supabase);
    return fillQuickPrompt(settings.quickPrompt, note) + COPY_QUICK_FORMAT;
  });
}

export async function readPastedQuick(text: string): Promise<ActionResult<QuickCheckResult>> {
  return attempt(async () => {
    await requireMember();
    if (!text.trim()) throw new FormError("Paste the answer first.");
    return parsePastedQuick(text);
  });
}
