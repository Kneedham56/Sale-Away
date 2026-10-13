import "server-only";
import type { CompsProvider, SpecificsValidator } from "@/lib/ai/suggest";
import { getAppLevelClient } from "./client";

/**
 * eBay data for the AI, when app keys exist: active comps (Browse API) as context,
 * and category + required item specifics (Taxonomy API) to check the AI's answer.
 * Returns nothing in mock mode so the AI never sees invented prices.
 */
export async function ebayAiHelpers(): Promise<{ comps?: CompsProvider; validate?: SpecificsValidator }> {
  const client = getAppLevelClient();
  if (!client) return {};

  const comps: CompsProvider = async (query) => {
    const items = await client.searchActive(query, 10);
    if (!items.length) return null;
    return {
      text: items.map((i) => `- $${i.price.toFixed(2)} · ${i.title}${i.condition ? ` (${i.condition})` : ""}`).join("\n"),
      comps: items.map((i) => ({ title: i.title, price: i.price, url: i.url })),
    };
  };

  const validate: SpecificsValidator = async (categoryName, specifics) => {
    const [best] = await client.suggestCategories(categoryName);
    if (!best) return null;
    const aspects = await client.getAspects(best.categoryId);
    const have = new Set(specifics.filter((s) => s.value && !/^unknown$/i.test(s.value)).map((s) => s.name.toLowerCase()));
    const missing = aspects.filter((a) => a.required && !have.has(a.name.toLowerCase())).map((a) => a.name);
    return { categoryId: best.categoryId, missing };
  };

  return { comps, validate };
}
