import { lotDate } from "@/lib/format";

export const DEFAULT_SKU_TEMPLATE = "{cost}-{lot}-{listed}-{n}";

export type SkuInput = {
  cost: number | null;
  lot_code: string | null;
  date_sourced: string | null;
  item_number: number;
};

/**
 * Her custom SKU encodes cost, where and when bought, and month/year listed.
 * Tokens: {cost} {lot} {sourced} {listed} {n}. eBay allows 50 characters of letters, digits, - _ .
 */
export function buildSku(item: SkuInput, template: string, listedOn: string): string {
  const mmyy = (iso: string | null) => (iso ? `${iso.slice(5, 7)}${iso.slice(2, 4)}` : "");
  const lot = (item.lot_code ?? "").replace(/[^A-Za-z0-9]+/g, "");
  const out = (template || DEFAULT_SKU_TEMPLATE)
    .replaceAll("{cost}", item.cost === null ? "X" : String(Number(item.cost)).replace(".", "p"))
    .replaceAll("{lot}", lot || "NA")
    .replaceAll("{sourced}", item.date_sourced ? lotDate(item.date_sourced).replaceAll("/", "") : "")
    .replaceAll("{listed}", mmyy(listedOn))
    .replaceAll("{n}", String(item.item_number));
  return out.replace(/[^A-Za-z0-9\-_.]/g, "").replace(/-{2,}/g, "-").slice(0, 50);
}
