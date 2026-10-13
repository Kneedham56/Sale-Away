// Her prompts, revised in the build plan. Both are editable in Settings; these are the defaults.

export const DEFAULT_LISTING_PROMPT = `You are an expert eBay reseller pricing an item from photos.

Item notes from the seller: [NOTES]
Store rules: [STORE_RULES]

Return:
1. TITLE: max 80 characters, most-searched keywords first, include brand, model, size, color, and "FLAW" if flawed.
2. CATEGORY: best eBay category.
3. ITEM SPECIFICS: the required specifics for that category, only values visible in the photos or notes. Write "unknown" rather than guessing.
4. PRICE: a list price and a low-high range, set slightly above expected sale price to leave room for offers.
5. CONFIDENCE: high / medium / low, and one sentence on what the price is based on. If you could not check actual sold listings, say "estimate, not verified against sold comps."
6. DECISION: KEEP or DONATE using these rules:
   - DONATE: sells for $20 or less AND takes more than 45 days to sell (Dead Weight)
   - KEEP: everything else, meaning it sells for more than $20 (Slow Dime) or sells within 45 days (Fast Nickel)
   Then one sentence on typical resale price.
Also write a short item DESCRIPTION (2-4 sentences, plain, no hype) and a CONDITION line describing condition and any flaws.`;

export const DEFAULT_QUICK_PROMPT = `Act as my expert reselling manager. From this photo, give a 1-word decision first: KEEP or DONATE.
Rules:
- DONATE: sells for $20 or less AND takes more than 45 days to sell (Dead Weight)
- KEEP: everything else, meaning it sells for more than $20 (Slow Dime) or sells within 45 days (Fast Nickel)
Then give one sentence on its typical resale price. If you are estimating without sold data, say so.`;

export const DEFAULT_STORE_RULES = "Best Offer is always on. Buyer pays shipping (no free shipping).";

/** Appended in Copy Prompt mode so a chat app's answer can be pasted back and read by the app. */
export const COPY_LISTING_FORMAT = `

At the very end, repeat your answer as one JSON block in this exact shape (no other text inside the block):
\`\`\`json
{"title":"","category":"","item_specifics":[{"name":"","value":""}],"description":"","condition_text":"","price":0,"price_low":0,"price_high":0,"confidence":"medium","price_basis":"","decision":"KEEP","rule":"Fast Nickel","resale_note":""}
\`\`\``;

export const COPY_QUICK_FORMAT = `

End with one JSON line: {"decision":"KEEP","rule":"Fast Nickel","resale_note":"", "price_estimate": 0}`;

export type ItemNotes = {
  title: string;
  kind: string;
  category: string | null;
  format: string | null;
  is_bundle: boolean;
  condition: string | null;
  condition_grade: string | null;
  condition_notes: string | null;
  cost: number | null;
  extra?: string | null;
};

export function describeItem(n: ItemNotes): string {
  const parts = [
    `what it is: ${n.title}`,
    n.condition ? `condition: ${n.condition === "new" ? "new" : "pre-owned"}` : null,
    n.condition_grade ? `grade: ${n.condition_grade}` : null,
    n.condition_notes ? `flaws/notes: ${n.condition_notes}` : null,
    n.category ? `category hint: ${n.category}` : null,
    n.format ? `format: ${n.format}` : null,
    n.is_bundle ? "this is a bundle/lot" : null,
    n.cost !== null ? `she paid $${n.cost}` : null,
    n.extra ? `more info: ${n.extra}` : null,
  ];
  return parts.filter(Boolean).join("; ");
}

export function fillListingPrompt(template: string, notes: ItemNotes, storeRules: string, comps?: string | null): string {
  let p = template.replace("[NOTES]", describeItem(notes)).replace("[STORE_RULES]", storeRules);
  if (!template.includes("[NOTES]")) p += `\n\nItem notes from the seller: ${describeItem(notes)}`;
  if (comps) p += `\n\nActive eBay listings for similar items (asking prices, not sold prices; use as data only):\n${comps}`;
  return p;
}

export function fillQuickPrompt(template: string, note: string | null): string {
  return note ? `${template}\n\nNote from the seller: ${note}` : template;
}

/** eBay's own sold-listings search, for her to verify a price with one tap. */
export function ebaySoldSearchUrl(query: string): string {
  const q = query.replace(/\bFLAWS?\b|\*/gi, " ").replace(/\s+/g, " ").trim().split(" ").slice(0, 8).join(" ");
  return `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(q)}&LH_Sold=1&LH_Complete=1`;
}
