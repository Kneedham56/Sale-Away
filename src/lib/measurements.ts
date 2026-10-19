// Clothing / shoe measurements: what buyers ask for, in inches, added to the eBay description.

export type Measurement = { name: string; value: string };

/** Quick-add sets, in the order she'd measure them (laid flat). */
export const MEASUREMENT_PRESETS: Record<string, string[]> = {
  Top: ["Pit to pit", "Length", "Shoulder to shoulder", "Sleeve"],
  Bottoms: ["Waist", "Rise", "Inseam", "Hips", "Leg opening"],
  Dress: ["Pit to pit", "Waist", "Hips", "Length"],
  Outerwear: ["Pit to pit", "Length", "Shoulder to shoulder", "Sleeve"],
  Shoes: ["Insole length", "Width", "Heel height", "Shaft height"],
  Bag: ["Width", "Height", "Depth", "Strap drop"],
};

export const MEASUREMENT_NAMES = [...new Set(Object.values(MEASUREMENT_PRESETS).flat()), "Bust", "Chest", "Thigh", "Circumference"];

const CLOTHING =
  /cloth|apparel|shirt|blouse|top|tee\b|t-shirt|sweater|cardigan|hoodie|sweatshirt|jacket|coat|vest|dress|skirt|pant|jean|trouser|short|legging|romper|jumpsuit|overall|suit|blazer|bra\b|lingerie|swim|pajama|robe|uniform|jersey|shoe|boot|sneaker|sandal|heel|loafer|slipper|handbag|purse|tote/i;

/** Whether to offer measurements up front (she can always add them to anything). */
export function looksLikeClothing(...texts: (string | null | undefined)[]): boolean {
  return texts.some((t) => !!t && CLOTHING.test(t));
}

export function cleanMeasurements(raw: unknown): Measurement[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((m) => ({ name: String(m?.name ?? "").trim().slice(0, 40), value: String(m?.value ?? "").trim().slice(0, 20) }))
    .filter((m) => m.name && m.value);
}

/** "Pit to pit: 20 in" lines for the listing description; empty string when there are none. */
export function measurementsText(list: Measurement[]): string {
  if (!list.length) return "";
  const unit = (v: string) => (/^[\d.\s/½¼¾-]+$/.test(v) ? `${v} in` : v);
  return ["Measurements (laid flat):", ...list.map((m) => `${m.name}: ${unit(m.value)}`)].join("\n");
}
