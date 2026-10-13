import type { Metadata } from "next";
import Link from "next/link";
import { requireMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { todayIso } from "@/lib/dates";
import { getLookups } from "@/lib/data/lookups";
import { FORM_1099K, getTaxSummary, taxRows } from "@/lib/data/taxes";
import { money } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { PrintButton } from "@/components/print-button";

export const metadata: Metadata = { title: "Taxes" };

export default async function TaxesPage({ searchParams }: PageProps<"/taxes">) {
  await requireMember();
  const sp = await searchParams;
  const today = await todayIso();
  const thisYear = Number(today.slice(0, 4));
  const year = typeof sp.y === "string" && /^\d{4}$/.test(sp.y) ? Number(sp.y) : thisYear;
  const supabase = await createClient();
  const [t, lookups] = await Promise.all([getTaxSummary(supabase, year), getLookups(supabase)]);
  const names = Object.fromEntries(lookups.platforms.map((p) => [p.code, p.name]));
  const rows = taxRows(t, names);
  const pct1099 = Math.min(100, Math.round((t.ebay_gross / FORM_1099K.gross) * 100));

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={`Taxes ${year}`}
        subtitle="Every year-end figure in one place. Numbers only, not tax advice: her preparer decides the treatment."
        actions={
          <>
            <Link href={`/taxes?y=${year - 1}`} className="btn-small">‹ {year - 1}</Link>
            {year < thisYear && <Link href={`/taxes?y=${year + 1}`} className="btn-small">{year + 1} ›</Link>}
          </>
        }
      />

      <div className="card mb-6 p-4">
        <div className="flex items-baseline justify-between">
          <h2 className="font-semibold">eBay 1099-K check</h2>
          <span className="text-sm text-muted">{year === thisYear ? "year to date" : year}</span>
        </div>
        <p className="mt-1 text-sm text-muted">
          A 1099-K is sent at {money(FORM_1099K.gross)} in payments <em>and</em> more than {FORM_1099K.transactions} transactions. It reports
          gross before fees and shipping. All income is reportable either way.
        </p>
        <div className="mt-3 h-3 overflow-hidden rounded-full bg-border">
          <div className="h-full rounded-full bg-accent" style={{ width: `${pct1099}%` }} />
        </div>
        <p className="mt-2 text-sm">
          <strong>{money(t.ebay_gross)}</strong> of {money(FORM_1099K.gross)} · {t.ebay_sales_count} eBay sales
        </p>
      </div>

      <table className="w-full text-sm">
        <tbody className="divide-y divide-border">
          {rows.map(([label, value, note]) => (
            <tr key={label} className={label.startsWith("  ") ? "text-muted" : ""}>
              <td className="py-2 pr-3">
                {label.trim()}
                {note && <div className="text-xs text-muted">{note}</div>}
              </td>
              <td className="py-2 text-right font-medium tabular-nums">{typeof value === "number" ? money(value) : value}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-6 flex flex-wrap gap-2 print:hidden">
        <a href={`/taxes/export?y=${year}&kind=summary`} className="btn-secondary">Download summary (CSV)</a>
        <a href={`/taxes/export?y=${year}&kind=sales`} className="btn-secondary">Download all sales (CSV)</a>
        <PrintButton label="Print / save as PDF" />
      </div>
    </div>
  );
}
