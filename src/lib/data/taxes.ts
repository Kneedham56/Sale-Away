import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type TaxSummary = {
  year: number;
  sales_count: number;
  gross: number;
  gross_by_platform: Record<string, number>;
  cogs: number;
  cogs_unknown_count: number;
  shipping: number;
  fees: number;
  fees_estimated: number;
  adjustments: number;
  return_charges: number;
  net: number;
  ebay_gross: number;
  ebay_sales_count: number;
  expenses_by_type: Record<string, number>;
  expenses_total: number;
  miles: number;
  mileage_deduction: number;
  write_offs: number;
  sourcing_spend: number;
  sourcing_trips: number;
  inventory_start: { items: number; cost: number };
  inventory_end: { items: number; cost: number };
};

/** 2026 federal 1099-K threshold: $20,000 in payments and more than 200 transactions. */
export const FORM_1099K = { gross: 20000, transactions: 200 };

export async function getTaxSummary(supabase: SupabaseClient, year: number): Promise<TaxSummary> {
  const { data, error } = await supabase.rpc("tax_summary", { tax_year: year });
  if (error) throw new Error(error.message);
  return data as TaxSummary;
}

/** Rows for the Taxes page and the CSV export, in the order a preparer reads them. */
export function taxRows(t: TaxSummary, platformNames: Record<string, string>): [string, number | string, string?][] {
  const rows: [string, number | string, string?][] = [];
  rows.push(["Gross sales", t.gross, `${t.sales_count} sales`]);
  for (const [p, v] of Object.entries(t.gross_by_platform).sort((a, b) => b[1] - a[1])) {
    rows.push([`  ${platformNames[p] ?? p}`, v]);
  }
  rows.push(["Cost of goods sold", t.cogs, t.cogs_unknown_count ? `${t.cogs_unknown_count} sales with unknown cost` : undefined]);
  rows.push(["Shipping paid", t.shipping]);
  rows.push([
    "Platform fees",
    t.fees,
    t.fees_estimated ? `${Math.round((t.fees_estimated / (t.fees || 1)) * 100)}% estimated from rate table` : "actual",
  ]);
  rows.push(["Adjustments", t.adjustments]);
  rows.push(["Return charges", t.return_charges]);
  rows.push(["Net profit from sales", t.net]);
  for (const [type, v] of Object.entries(t.expenses_by_type).sort((a, b) => b[1] - a[1])) rows.push([`Expense: ${type}`, v]);
  rows.push(["Expenses total", t.expenses_total]);
  rows.push(["Mileage deduction", t.mileage_deduction, `${t.miles.toLocaleString()} miles`]);
  rows.push(["Damaged write-offs", t.write_offs]);
  rows.push(["Sourcing spend (trip totals)", t.sourcing_spend, `${t.sourcing_trips} trips dated this year`]);
  rows.push([`Inventory at cost, Jan 1 ${t.year}`, t.inventory_start.cost, `${t.inventory_start.items.toLocaleString()} items`]);
  rows.push([`Inventory at cost, Dec 31 ${t.year}`, t.inventory_end.cost, `${t.inventory_end.items.toLocaleString()} items`]);
  return rows;
}
