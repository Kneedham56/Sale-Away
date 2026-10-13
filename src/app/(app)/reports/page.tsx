import type { Metadata } from "next";
import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { todayIso } from "@/lib/dates";
import { monthLabel, money, pct } from "@/lib/format";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Reports" };

const VIEWS = [
  ["months", "Months"],
  ["trips", "Trips"],
  ["categories", "Categories"],
  ["platforms", "Platforms"],
  ["aging", "Aging inventory"],
] as const;
type View = (typeof VIEWS)[number][0];

export default async function ReportsPage({ searchParams }: PageProps<"/reports">) {
  await requireMember();
  const sp = await searchParams;
  const today = await todayIso();
  const thisYear = Number(today.slice(0, 4));
  const year = typeof sp.y === "string" && /^\d{4}$/.test(sp.y) ? Number(sp.y) : thisYear;
  const view: View = VIEWS.some(([k]) => k === sp.view) ? (sp.view as View) : "months";
  const supabase = await createClient();
  const href = (patch: { view?: string; y?: number }) => `/reports?view=${patch.view ?? view}&y=${patch.y ?? year}`;

  return (
    <>
      <PageHeader
        title="Reports"
        actions={
          view !== "aging" && (
            <>
              <Link href={href({ y: year - 1 })} className="btn-small">‹ {year - 1}</Link>
              <span className="btn-small border-accent text-accent">{year}</span>
              {year < thisYear && <Link href={href({ y: year + 1 })} className="btn-small">{year + 1} ›</Link>}
            </>
          )
        }
      />
      <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:px-0">
        {VIEWS.map(([k, label]) => (
          <Link key={k} href={href({ view: k })} className={`chip shrink-0 ${view === k ? "chip-active" : ""}`}>
            {label}
          </Link>
        ))}
      </div>
      {view === "months" && <Months supabase={supabase} year={year} />}
      {view === "trips" && <Trips supabase={supabase} year={year} />}
      {view === "categories" && <Categories supabase={supabase} year={year} />}
      {view === "platforms" && <Platforms supabase={supabase} year={year} />}
      {view === "aging" && <Aging supabase={supabase} />}
    </>
  );
}

function Table({ head, rows }: { head: string[]; rows: (React.ReactNode)[][] }) {
  if (!rows.length) return <p className="card px-4 py-10 text-center text-sm text-muted">No data for this period.</p>;
  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted">
            {head.map((h, i) => (
              <th key={h} className={`px-3 py-2 font-medium whitespace-nowrap ${i ? "text-right" : ""}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j} className={`px-3 py-2 ${j ? "text-right tabular-nums whitespace-nowrap" : ""}`}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type Props = { supabase: SupabaseClient; year: number };

async function Months({ supabase, year }: Props) {
  const { data } = await supabase.from("monthly_summary").select("*").gte("month", `${year}-01-01`).lte("month", `${year}-12-01`).order("month");
  const rows = (data ?? []).map((m) => [
    <Link key="m" href={`/sold?m=${m.month.slice(0, 7)}`} className="text-accent">{monthLabel(m.month.slice(0, 7))}</Link>,
    m.sales_count, money(m.gross), money(m.cogs), money(m.shipping), money(m.fees), money(m.adjusted_net), pct(m.margin),
  ]);
  const sum = (k: string) => (data ?? []).reduce((s, m) => s + Number(m[k] ?? 0), 0);
  if (rows.length)
    rows.push([
      <strong key="t">Total</strong>, sum("sales_count"), money(sum("gross")), money(sum("cogs")), money(sum("shipping")),
      money(sum("fees")), money(sum("adjusted_net")), pct(sum("gross") ? sum("adjusted_net") / sum("gross") : null),
    ]);
  return <Table head={["Month", "Sales", "Gross", "COGS", "Shipping", "Fees", "Adj. net", "Margin"]} rows={rows} />;
}

async function Trips({ supabase, year }: Props) {
  const { data } = await supabase
    .from("source_report")
    .select("id, lot_code, total_spent, items, sold, gross, adjusted_net")
    .gte("date", `${year}-01-01`)
    .lte("date", `${year}-12-31`)
    .order("adjusted_net", { ascending: false })
    .limit(300);
  return (
    <>
      <p className="mb-2 text-xs text-muted">Trips dated {year}, most profitable first. Profit = sales after shipping, fees and item cost.</p>
      <Table
        head={["Trip", "Spent", "Items", "Sold", "Gross", "Profit"]}
        rows={(data ?? []).map((t) => [
          <Link key="t" href={`/trips/${t.id}`} className="text-accent">{t.lot_code}</Link>,
          money(t.total_spent), t.items, t.sold, money(t.gross), money(t.adjusted_net),
        ])}
      />
    </>
  );
}

async function Categories({ supabase, year }: Props) {
  const { data } = await supabase.from("category_report").select("*").eq("year", year).order("gross", { ascending: false });
  return (
    <Table
      head={["Category", "Sales", "Gross", "Adj. net", "Avg days to sell"]}
      rows={(data ?? []).map((c) => [c.category, c.sales, money(c.gross), money(c.adjusted_net), c.avg_days_to_sell ?? "–"])}
    />
  );
}

async function Platforms({ supabase, year }: Props) {
  const { data } = await supabase.from("platform_report").select("*").eq("year", year).order("gross", { ascending: false });
  return (
    <>
      <Table
        head={["Platform", "Sales", "Gross", "Shipping", "Fees", "Adj. net"]}
        rows={(data ?? []).map((p) => [p.platform, p.sales, money(p.gross), money(p.shipping), `${money(p.fees)}${p.has_estimated_fees ? "*" : ""}`, money(p.adjusted_net)])}
      />
      <p className="mt-2 text-xs text-muted">* includes fees estimated from her rate table.</p>
    </>
  );
}

const BUCKETS: [string, number, number][] = [
  ["Under 30 days", 0, 29],
  ["30–89 days", 30, 89],
  ["90–179 days", 90, 179],
  ["180–364 days", 180, 364],
  ["1–2 years", 365, 729],
  ["2+ years", 730, Infinity],
];

async function Aging({ supabase }: { supabase: SupabaseClient }) {
  const rows: { days_active: number | null; list_price: number | null; cost: number | null }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await supabase.from("items_view").select("days_active, list_price, cost").eq("status", "listed").range(from, from + 999);
    rows.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }
  const buckets = BUCKETS.map(([label, lo, hi]) => {
    const inB = rows.filter((r) => r.days_active !== null && r.days_active >= lo && r.days_active <= hi);
    return [
      label,
      inB.length,
      money(inB.reduce((s, r) => s + Number(r.list_price ?? 0), 0)),
      money(inB.reduce((s, r) => s + Number(r.cost ?? 0), 0)),
    ];
  });
  return (
    <>
      <p className="mb-2 text-xs text-muted">Live listings by how long they&apos;ve been up. Old ones are candidates for a price drop, relist or donate.</p>
      <Table head={["Listed for", "Items", "List value", "Cost"]} rows={buckets} />
      <p className="mt-3 text-sm">
        <Link href="/listed?stale=1" className="text-accent">See stale listings ›</Link>
      </p>
    </>
  );
}
