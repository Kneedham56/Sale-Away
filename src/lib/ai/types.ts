export type Specific = { name: string; value: string };

export type ListingSuggestion = {
  title: string;
  category: string;
  item_specifics: Specific[];
  description: string;
  condition_text: string;
  price: number | null;
  price_low: number | null;
  price_high: number | null;
  confidence: "high" | "medium" | "low";
  price_basis: string;
  decision: "KEEP" | "DONATE";
  rule: string;
  resale_note: string;
  /** Problems the app found (title too long, missing required specifics, unverified price) */
  flags: string[];
  /** Filled by the app when eBay data is available */
  ebay_category_id?: string | null;
  comps?: { title: string; price: number; url: string }[];
};

export type QuickCheckResult = {
  decision: "KEEP" | "DONATE";
  rule: string;
  resale_note: string;
  price_estimate: number | null;
};

/** Gemini response schema (OpenAPI subset). */
export const LISTING_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string", description: "eBay title, max 80 characters" },
    category: { type: "string" },
    item_specifics: {
      type: "array",
      items: { type: "object", properties: { name: { type: "string" }, value: { type: "string" } }, required: ["name", "value"] },
    },
    description: { type: "string" },
    condition_text: { type: "string" },
    price: { type: "number" },
    price_low: { type: "number" },
    price_high: { type: "number" },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
    price_basis: { type: "string" },
    decision: { type: "string", enum: ["KEEP", "DONATE"] },
    rule: { type: "string", enum: ["Dead Weight", "Slow Dime", "Fast Nickel"] },
    resale_note: { type: "string" },
  },
  required: [
    "title", "category", "item_specifics", "description", "condition_text", "price", "price_low", "price_high",
    "confidence", "price_basis", "decision", "rule", "resale_note",
  ],
} as const;

export const QUICK_SCHEMA = {
  type: "object",
  properties: {
    decision: { type: "string", enum: ["KEEP", "DONATE"] },
    rule: { type: "string", enum: ["Dead Weight", "Slow Dime", "Fast Nickel"] },
    resale_note: { type: "string" },
    price_estimate: { type: "number" },
  },
  required: ["decision", "rule", "resale_note", "price_estimate"],
} as const;
