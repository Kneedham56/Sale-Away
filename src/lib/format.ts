export type ItemStatus =
  | "intake" | "unlisted" | "ready_to_list" | "listed" | "sold" | "shipped" | "donated" | "damaged" | "kept";

export const STATUS_LABELS: Record<ItemStatus, string> = {
  intake: "Intake",
  unlisted: "Unlisted",
  ready_to_list: "Ready to list",
  listed: "Listed",
  sold: "Sold",
  shipped: "Shipped",
  donated: "Donated",
  damaged: "Damaged",
  kept: "Kept",
};

export const KIND_LABELS = { general: "General", book: "Book", media: "Media" } as const;

export const SOURCE_TYPES: Record<string, string> = {
  garage_sale: "Garage sale",
  thrift: "Thrift store",
  facebook_marketplace: "Facebook Marketplace",
  estate_sale: "Estate sale",
  person: "Person",
  online: "Online",
  other: "Other",
};

export const FULFILLMENT_LABELS: Record<string, string> = {
  to_ship: "To ship",
  packed: "Packed",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
  returned: "Returned",
};

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

/** "$12.34"; null/undefined shows a dash (unknown, not zero). */
export function money(n: number | string | null | undefined): string {
  if (n === null || n === undefined || n === "") return "–";
  return usd.format(Number(n));
}

/** "Oct 3, 2026" from a YYYY-MM-DD date (no time-zone shifting). */
export function shortDate(iso: string | null | undefined): string {
  if (!iso) return "–";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
  });
}

export function monthLabel(isoMonth: string): string {
  const [y, m] = isoMonth.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

/** "M/D/YY" as she writes dates in lot codes. */
export function lotDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${m}/${d}/${String(y).slice(2)}`;
}

export function pct(n: number | null | undefined): string {
  if (n === null || n === undefined) return "–";
  return `${Math.round(Number(n) * 100)}%`;
}
