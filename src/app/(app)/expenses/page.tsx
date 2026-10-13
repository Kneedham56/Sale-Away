import type { Metadata } from "next";
import Link from "next/link";
import { requireMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { todayIso } from "@/lib/dates";
import { getLookups, settingNumber } from "@/lib/data/lookups";
import { money, shortDate } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { ConfirmButton } from "@/components/fields";
import { deleteEntry } from "./actions";
import { ExpenseForms } from "./expense-forms";

export const metadata: Metadata = { title: "Expenses" };

const DEFAULT_TYPES = ["Business Expense", "Equipment or Tools", "Packaging Material", "Bills", "Other"];

export default async function ExpensesPage({ searchParams }: PageProps<"/expenses">) {
  await requireMember();
  const sp = await searchParams;
  const today = await todayIso();
  const year = typeof sp.y === "string" && /^\d{4}$/.test(sp.y) ? Number(sp.y) : Number(today.slice(0, 4));
  const supabase = await createClient();
  const [lookups, { data: expenses }, { data: mileage }] = await Promise.all([
    getLookups(supabase),
    supabase.from("expenses").select("*").gte("date", `${year}-01-01`).lte("date", `${year}-12-31`).order("date", { ascending: false }),
    supabase.from("mileage").select("*").gte("date", `${year}-01-01`).lte("date", `${year}-12-31`).order("date", { ascending: false }),
  ]);
  const types = (lookups.settings.expense_types as string[] | undefined) ?? DEFAULT_TYPES;
  const rate = settingNumber(lookups.settings, "mileage_rate", 0.725);
  const expTotal = (expenses ?? []).reduce((s, e) => s + Number(e.amount), 0);
  const miles = (mileage ?? []).reduce((s, m) => s + Number(m.miles), 0);
  const mileDeduction = (mileage ?? []).reduce((s, m) => s + Number(m.miles) * Number(m.rate), 0);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={`Expenses ${year}`}
        actions={
          <>
            <Link href={`/expenses?y=${year - 1}`} className="btn-small">‹ {year - 1}</Link>
            {year < Number(today.slice(0, 4)) && <Link href={`/expenses?y=${year + 1}`} className="btn-small">{year + 1} ›</Link>}
          </>
        }
      />
      <ExpenseForms types={types} today={today} rate={rate} />

      <div className="my-6 grid grid-cols-3 gap-2">
        <div className="card p-3"><div className="stat-label">Expenses</div><div className="stat-value">{money(expTotal)}</div></div>
        <div className="card p-3"><div className="stat-label">Miles</div><div className="stat-value">{miles.toLocaleString()}</div></div>
        <div className="card p-3"><div className="stat-label">Mileage deduction</div><div className="stat-value">{money(mileDeduction)}</div></div>
      </div>

      <h2 className="mb-2 text-sm font-semibold text-muted">Expenses</h2>
      {!expenses?.length ? (
        <p className="mb-6 text-sm text-muted">None for {year}.</p>
      ) : (
        <ul className="list mb-6">
          {expenses.map((e) => (
            <li key={e.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <div className="min-w-0 flex-1">
                <div className="font-medium">{e.description}</div>
                <div className="text-xs text-muted">{e.type} · {shortDate(e.date)}{e.notes && ` · ${e.notes}`}</div>
              </div>
              <span className="font-medium">{money(e.amount)}</span>
              <form action={deleteEntry}>
                <input type="hidden" name="table" value="expenses" />
                <input type="hidden" name="id" value={e.id} />
                <ConfirmButton message="Delete this expense?" className="px-1 text-muted">×</ConfirmButton>
              </form>
            </li>
          ))}
        </ul>
      )}

      <h2 className="mb-2 text-sm font-semibold text-muted">Mileage</h2>
      {!mileage?.length ? (
        <p className="text-sm text-muted">None for {year}.</p>
      ) : (
        <ul className="list">
          {mileage.map((m) => (
            <li key={m.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <div className="min-w-0 flex-1">
                <div className="font-medium">{Number(m.miles)} miles{m.purpose && ` · ${m.purpose}`}</div>
                <div className="text-xs text-muted">{shortDate(m.date)} · ${Number(m.rate)}/mi</div>
              </div>
              <span className="font-medium">{money(Number(m.miles) * Number(m.rate))}</span>
              <form action={deleteEntry}>
                <input type="hidden" name="table" value="mileage" />
                <input type="hidden" name="id" value={m.id} />
                <ConfirmButton message="Delete this mileage entry?" className="px-1 text-muted">×</ConfirmButton>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
