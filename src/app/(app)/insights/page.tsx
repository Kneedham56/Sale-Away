import type { Metadata } from "next";
import Link from "next/link";
import { requireMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { todayIso } from "@/lib/dates";
import { money, pct } from "@/lib/format";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Insights" };

const CARDS = [
  ["/sold", "Sales by month", "Each month's sales, fees and profit (replaces the monthly tabs)"],
  ["/trips", "Trips", "What each sourcing trip cost and what it has earned so far"],
  ["/reports", "Reports", "By month, trip, category and platform; how long listings sit"],
  ["/expenses", "Expenses & mileage", "Supplies, bills and miles for the year"],
  ["/taxes", "Taxes", "Year-end figures and CSV export for her preparer"],
] as const;

/** The "hindsight" corner: everything for looking back rather than doing. */
export default async function InsightsPage() {
  await requireMember();
  const supabase = await createClient();
  const year = Number((await todayIso()).slice(0, 4));
  const { data: months } = await supabase
    .from("monthly_summary")
    .select("sales_count, gross, adjusted_net")
    .gte("month", `${year}-01-01`)
    .lte("month", `${year}-12-01`);
  const sum = (k: "sales_count" | "gross" | "adjusted_net") => (months ?? []).reduce((s, m) => s + Number(m[k] ?? 0), 0);
  const gross = sum("gross");

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Insights" subtitle={`Looking back on ${year}.`} />
      <div className="mb-6 grid grid-cols-3 gap-2">
        <div className="card p-3">
          <div className="stat-label">Sales</div>
          <div className="stat-value">{sum("sales_count").toLocaleString()}</div>
        </div>
        <div className="card p-3">
          <div className="stat-label">Gross</div>
          <div className="stat-value">{money(gross)}</div>
        </div>
        <div className="card p-3">
          <div className="stat-label">Net · margin</div>
          <div className="stat-value">
            {money(sum("adjusted_net"))} <span className="text-sm text-muted">{pct(gross ? sum("adjusted_net") / gross : null)}</span>
          </div>
        </div>
      </div>
      <ul className="list">
        {CARDS.map(([href, label, hint]) => (
          <li key={href}>
            <Link href={href} className="flex items-center justify-between gap-3 px-4 py-4 active:bg-border/40">
              <span>
                <span className="block font-medium">{label}</span>
                <span className="block text-xs text-muted">{hint}</span>
              </span>
              <span className="text-muted">›</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
