import type { Metadata } from "next";
import Link from "next/link";
import { requireMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { todayIso } from "@/lib/dates";
import { monthLabel, money, pct, shortDate } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { Empty } from "@/components/item-row";

export const metadata: Metadata = { title: "Sold" };

function shiftMonth(ym: string, delta: number) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default async function SoldPage({ searchParams }: PageProps<"/sold">) {
  await requireMember();
  const sp = await searchParams;
  const today = await todayIso();
  const unmatchedOnly = sp.unmatched === "1";
  const m = typeof sp.m === "string" && /^\d{4}-\d{2}$/.test(sp.m) ? sp.m : today.slice(0, 7);
  const start = `${m}-01`;
  const next = `${shiftMonth(m, 1)}-01`;
  const supabase = await createClient();

  let list = supabase
    .from("sales_view")
    .select("id, title, platform, sold_date, gross, shipping_cost, fees, fee_is_estimate, cogs, adjusted_net, item_id, fulfillment_status")
    .order("sold_date", { ascending: false })
    .order("created_at", { ascending: false });
  list = unmatchedOnly ? list.is("item_id", null) : list.gte("sold_date", start).lt("sold_date", next);

  const [{ data: sales }, { data: summary }, { count: unmatched }] = await Promise.all([
    list.limit(1000),
    supabase.from("monthly_summary").select("*").eq("month", start).maybeSingle(),
    supabase.from("sales").select("id", { count: "exact", head: true }).is("item_id", null),
  ]);
  const estimated = (sales ?? []).filter((s) => s.fee_is_estimate).length;

  const tiles: [string, string][] = summary
    ? [
        ["Sales", String(summary.sales_count)],
        ["Gross", money(summary.gross)],
        ["Shipping", money(summary.shipping)],
        ["Fees", money(summary.fees)],
        ["COGS", money(summary.cogs)],
        ["Net", money(summary.net)],
        ["Adjusted net", money(summary.adjusted_net)],
        ["Margin", pct(summary.margin)],
      ]
    : [];

  return (
    <>
      <PageHeader
        title={unmatchedOnly ? "Unmatched sales" : monthLabel(m)}
        subtitle={unmatchedOnly ? "Sales not linked to an item yet. Open one to link it." : "Replaces her monthly tab."}
        back={unmatchedOnly ? { href: "/sold", label: "Sold" } : undefined}
        actions={
          !unmatchedOnly && (
            <>
              <Link href={`/sold?m=${shiftMonth(m, -1)}`} className="btn-small" aria-label="Previous month">‹</Link>
              <Link href={`/sold?m=${shiftMonth(m, 1)}`} className="btn-small" aria-label="Next month">›</Link>
            </>
          )
        }
      />

      {!unmatchedOnly && !!unmatched && (
        <Link href="/sold?unmatched=1" className="mb-4 block rounded-xl bg-coral/15 px-4 py-3 text-sm font-medium text-coral">
          {unmatched} sale{unmatched === 1 ? "" : "s"} not linked to an item ›
        </Link>
      )}

      {!unmatchedOnly && tiles.length > 0 && (
        <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {tiles.map(([label, value]) => (
            <div key={label} className="card p-3">
              <div className="stat-label">{label}</div>
              <div className="stat-value">{value}</div>
            </div>
          ))}
        </div>
      )}
      {estimated > 0 && !unmatchedOnly && (
        <p className="mb-3 text-xs text-muted">
          {estimated} of {sales?.length} sales use estimated fees (her rate table). eBay&apos;s actual fees arrive in Phase 3.
        </p>
      )}

      {!sales?.length ? (
        <Empty>No sales {unmatchedOnly ? "to link" : "this month yet"}.</Empty>
      ) : (
        <ul className="list">
          {sales.map((s) => (
            <li key={s.id}>
              <Link href={`/sales/${s.id}`} className="flex items-center gap-3 px-4 py-3 active:bg-border/40">
                <div className="min-w-0 flex-1">
                  <div className="line-clamp-2 text-[15px] leading-snug font-medium">{s.title ?? "(no title)"}</div>
                  <div className="mt-0.5 text-xs text-muted">
                    {s.platform} · {shortDate(s.sold_date)}
                    {!s.item_id && <span className="text-coral"> · not linked</span>}
                  </div>
                </div>
                <div className="shrink-0 text-right text-sm">
                  <div className="font-medium">{money(s.gross)}</div>
                  <div className={Number(s.adjusted_net) < 0 ? "text-danger" : "text-ok"}>{money(s.adjusted_net)}</div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
