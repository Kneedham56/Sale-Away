import { lotDate } from "@/lib/format";

export const DEFAULT_SKU_TEMPLATE = "{cost} {lot} {listed}";

export type SkuInput = {
  cost: number | null;
  lot_code: string | null;
  date_sourced: string | null;
  item_number: number;
};

/**
 * Her custom label encodes cost, trip lot and month/year listed, e.g. ".62 GS #3-1/18/25 11/2025".
 * Tokens: {cost} {lot} {sourced} {listed} {n}. The item number is always added (see withItemNumber).
 */
export function buildSku(item: SkuInput, template: string, listedOn: string): string {
  const cost = item.cost === null ? "X" : Number(item.cost).toFixed(2).replace(/^0(?=\.)/, "");
  const out = (template || DEFAULT_SKU_TEMPLATE)
    .replaceAll("{cost}", cost)
    .replaceAll("{lot}", (item.lot_code ?? "").trim() || "NA")
    .replaceAll("{sourced}", item.date_sourced ? lotDate(item.date_sourced) : "")
    .replaceAll("{listed}", `${listedOn.slice(5, 7)}/${listedOn.slice(0, 4)}`)
    .replaceAll("{n}", String(item.item_number));
  return withItemNumber(out, item.item_number);
}

/**
 * eBay treats a SKU as one product: posting a second item under a SKU it already knows rewrites that listing.
 * Her labels repeat (same cost, same trip, same month), so every SKU the app sends ends in the item number.
 */
export function withItemNumber(sku: string, n: number): string {
  const clean = sku.replace(/[^A-Za-z0-9 #/\-_.]/g, "").replace(/\s+/g, " ").trim();
  if (new RegExp(`(^|[^0-9])${n}$`).test(clean)) return clean.slice(-50);
  const tag = `#${n}`;
  return `${clean.slice(0, 50 - tag.length - 1).trim()} ${tag}`.trim();
}
