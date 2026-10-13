import type { ListingSuggestion, QuickCheckResult, Specific } from "./types";

export const TITLE_MAX = 80;

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return Math.round(v * 100) / 100;
  if (typeof v === "string") {
    const n = Number(v.replace(/[$,\s]/g, ""));
    return Number.isFinite(n) && v.trim() !== "" ? Math.round(n * 100) / 100 : null;
  }
  return null;
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : v === null || v === undefined ? "" : String(v).trim();
}

/** Finds the last JSON object in free text (chat apps wrap it in prose or ```json fences). */
export function extractJson(text: string): unknown {
  const fenced = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)].map((m) => m[1]);
  const candidates = [...fenced.reverse(), text];
  for (const c of candidates) {
    try {
      return JSON.parse(c.trim());
    } catch {}
    const start = c.indexOf("{");
    const end = c.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(c.slice(start, end + 1));
      } catch {}
    }
  }
  return null;
}

/** Reads "TITLE: ...", "PRICE: $24.99 ($20-30)" style answers when there's no JSON. */
function fromLabeledText(text: string): Record<string, unknown> {
  const grab = (label: string) => text.match(new RegExp(`${label}\\s*[:\\-]\\s*(.+)`, "i"))?.[1]?.trim() ?? "";
  const priceLine = grab("PRICE");
  const prices = [...priceLine.matchAll(/\$?\s*(\d+(?:\.\d{1,2})?)/g)].map((m) => Number(m[1]));
  const specificsBlock = text.match(/ITEM SPECIFICS\s*:?\s*([\s\S]*?)(?:\n\s*\d\.|\n\s*PRICE|$)/i)?.[1] ?? "";
  const item_specifics = specificsBlock
    .split("\n")
    .map((l) => l.replace(/^[\s*\-•]+/, "").match(/^([^:]{2,40}):\s*(.+)$/))
    .filter(Boolean)
    .map((m) => ({ name: m![1].trim(), value: m![2].trim() }));
  const decisionLine = grab("DECISION") || text;
  return {
    title: grab("TITLE").replace(/^"|"$/g, ""),
    category: grab("CATEGORY"),
    item_specifics,
    description: grab("DESCRIPTION"),
    condition_text: grab("CONDITION"),
    price: prices[0] ?? null,
    price_low: prices[1] ?? null,
    price_high: prices[2] ?? null,
    confidence: (grab("CONFIDENCE").match(/high|medium|low/i)?.[0] ?? "low").toLowerCase(),
    price_basis: grab("CONFIDENCE"),
    decision: /DONATE/i.test(decisionLine) ? "DONATE" : "KEEP",
    rule: decisionLine.match(/Dead Weight|Slow Dime|Fast Nickel/i)?.[0] ?? "",
    resale_note: decisionLine,
  };
}

export function normalizeListing(raw: unknown): ListingSuggestion {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const flags: string[] = [];
  let title = str(r.title).replace(/\s+/g, " ");
  if (title.length > TITLE_MAX) {
    flags.push(`Title was ${title.length} characters; trimmed to ${TITLE_MAX}. Check the end still reads well.`);
    title = title.slice(0, TITLE_MAX).replace(/\s+\S*$/, "").trim();
  }
  if (!title) flags.push("No title came back.");
  const specifics: Specific[] = Array.isArray(r.item_specifics)
    ? (r.item_specifics as unknown[])
        .map((s) => (s && typeof s === "object" ? { name: str((s as Specific).name), value: str((s as Specific).value) } : null))
        .filter((s): s is Specific => !!s && !!s.name)
    : [];
  const unknown = specifics.filter((s) => /^unknown$/i.test(s.value)).map((s) => s.name);
  if (unknown.length) flags.push(`Unknown specifics to fill in: ${unknown.join(", ")}.`);
  const confidence = ["high", "medium", "low"].includes(str(r.confidence)) ? (str(r.confidence) as ListingSuggestion["confidence"]) : "low";
  const price_basis = str(r.price_basis);
  if (!/sold comp|sold listing|sold data/i.test(price_basis) || /not verified|estimate/i.test(price_basis)) {
    flags.push("Price is an estimate, not verified against sold comps. Tap “Check sold on eBay” to confirm.");
  }
  let price_low = num(r.price_low);
  let price_high = num(r.price_high);
  if (price_low !== null && price_high !== null && price_low > price_high) [price_low, price_high] = [price_high, price_low];
  return {
    title,
    category: str(r.category),
    item_specifics: specifics,
    description: str(r.description),
    condition_text: str(r.condition_text),
    price: num(r.price),
    price_low,
    price_high,
    confidence,
    price_basis,
    decision: str(r.decision).toUpperCase() === "DONATE" ? "DONATE" : "KEEP",
    rule: str(r.rule),
    resale_note: str(r.resale_note),
    flags,
  };
}

/** Copy Prompt mode: whatever she pastes back from ChatGPT, Gemini or Claude. */
export function parsePastedListing(text: string): ListingSuggestion {
  const json = extractJson(text);
  return normalizeListing(json && typeof json === "object" && "title" in (json as object) ? json : fromLabeledText(text));
}

export function normalizeQuick(raw: unknown): QuickCheckResult {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    decision: str(r.decision).toUpperCase() === "DONATE" ? "DONATE" : "KEEP",
    rule: str(r.rule),
    resale_note: str(r.resale_note),
    price_estimate: num(r.price_estimate),
  };
}

export function parsePastedQuick(text: string): QuickCheckResult {
  const json = extractJson(text);
  if (json && typeof json === "object" && "decision" in (json as object)) return normalizeQuick(json);
  return normalizeQuick({
    decision: /\bDONATE\b/i.test(text.slice(0, 200)) ? "DONATE" : "KEEP",
    rule: text.match(/Dead Weight|Slow Dime|Fast Nickel/i)?.[0] ?? "",
    resale_note: text.trim().split("\n").slice(0, 3).join(" "),
  });
}
