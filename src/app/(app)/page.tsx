import Link from "next/link";
import { requireMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { todayIso } from "@/lib/dates";
import { settingNumber } from "@/lib/data/lookups";
import { money, STAGE_STATUSES } from "@/lib/format";
import { ebayStatusAndAutoSync } from "@/lib/ebay/status";

export const maxDuration = 300; // room for the background eBay sync

type Step = { n: number; href: string; label: string; value: number | null; detail?: string; tone?: string };

export default async function HomePage() {
  const member = await requireMember();
  const supabase = await createClient();
  const today = await todayIso();
  const monthStart = `${today.slice(0, 7)}-01`;

  const { data: staleSetting } = await supabase.from("settings").select("value").eq("key", "stale_listing_days").maybeSingle();
  const staleDays = settingNumber({ v: staleSetting?.value }, "v", 90);

  const ebay = await ebayStatusAndAutoSync(member.workspace.id);
  const head = { count: "exact" as const, head: true };
  const [trips, toList, drafted, listed, stale, toShip, late, completedThisMonth, unmatched, month, endedOnEbay] = await Promise.all([
    supabase.from("sources").select("id", head).gte("date", monthStart),
    supabase.from("items").select("id", head).in("status", ["intake", "unlisted"]),
    supabase.from("items").select("id", head).eq("status", "ready_to_list"),
    supabase.from("items").select("id", head).eq("status", "listed"),
    supabase.from("items_view").select("id", head).eq("status", "listed").gte("days_active", staleDays),
    supabase.from("sales_view").select("id", head).in("fulfillment_status", ["to_ship", "packed"]),
    supabase.from("sales_view").select("id", head).in("fulfillment_status", ["to_ship", "packed"]).lt("ship_by", today),
    // Finished this month: shipped (by sale date) or taken down (by exit date)
    supabase
      .from("items")
      .select("id", head)
      .in("status", STAGE_STATUSES.completed)
      .or(`date_sold.gte.${monthStart},date_exited.gte.${monthStart}`),
    supabase.from("sales_view").select("id", head).is("item_id", null),
    supabase.from("monthly_summary").select("sales_count, gross, adjusted_net").eq("month", monthStart).maybeSingle(),
    supabase.from("items").select("id", head).eq("status", "listed").not("ebay_ended_at", "is", null),
  ]);

  const steps: Step[] = [
    { n: 1, href: "/trips", label: "Trips", value: trips.count, detail: "this month" },
    {
      n: 2,
      href: drafted.count ? "/unlisted?stage=drafted" : "/unlisted",
      label: "Inventory",
      value: (toList.count ?? 0) + (drafted.count ?? 0),
      detail: drafted.count ? `${drafted.count} drafted, ready to post` : "to list",
    },
    { n: 3, href: "/listed", label: "Listed", value: listed.count, detail: stale.count ? `${stale.count.toLocaleString()} up ${staleDays}+ days` : "live" },
    {
      n: 4,
      href: "/outgoing",
      label: "Outgoing",
      value: toShip.count,
      detail: late.count ? `${late.count} past ship-by!` : "to ship",
      tone: toShip.count ? "border-coral" : "",
    },
    { n: 5, href: "/completed", label: "Completed", value: completedThisMonth.count, detail: "this month" },
  ];

  const attention = [
    ebay.expiresSoon && { href: "/settings/ebay", text: "eBay connection expires within 30 days. Reconnect.", tone: "text-danger" },
    ebay.lastError && { href: "/settings/ebay", text: `eBay sync failed: ${ebay.lastError.slice(0, 80)}`, tone: "text-danger" },
    endedOnEbay.count && {
      href: "/listed?ended=1",
      text: `${endedOnEbay.count} listing${endedOnEbay.count === 1 ? "" : "s"} ended on eBay without an eBay sale. Sold somewhere else?`,
      tone: "text-coral",
    },
    late.count && { href: "/outgoing?sort=ship_by", text: `${late.count} order${late.count === 1 ? " is" : "s are"} past the ship-by date`, tone: "text-danger" },
    unmatched.count && { href: "/sold?unmatched=1", text: `${unmatched.count} sale${unmatched.count === 1 ? "" : "s"} not linked to an item`, tone: "text-coral" },
  ].filter(Boolean) as { href: string; text: string; tone: string }[];

  return (
    <div className="space-y-6 pt-2">
      <h1 className="text-2xl font-semibold tracking-tight">Hi {member.displayName.split(" ")[0]}</h1>

      <div className="grid grid-cols-2 gap-3">
        <Link href="/add" className="btn-primary bg-coral text-lg">
          + Add item
        </Link>
        <Link href="/quick" className="btn-secondary text-lg">
          Quick Check
        </Link>
      </div>

      <ol className="space-y-2">
        {steps.map((s) => (
          <li key={s.n}>
            <Link href={s.href} className={`card flex items-center gap-4 px-4 py-3 active:bg-border/40 ${s.tone ?? ""}`}>
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/10 text-sm font-semibold text-accent">
                {s.n}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{s.label}</span>
                <span className={`block text-xs ${s.detail?.endsWith("!") ? "font-medium text-danger" : "text-muted"}`}>{s.detail}</span>
              </span>
              <span className="text-2xl font-semibold tabular-nums">{s.value === null ? "–" : s.value.toLocaleString()}</span>
              <span className="text-muted">›</span>
            </Link>
          </li>
        ))}
      </ol>

      <Link href="/insights" className="card flex items-center justify-between px-4 py-3 active:bg-border/40">
        <span>
          <span className="block font-medium">Insights</span>
          <span className="block text-xs text-muted">
            This month: {month.data?.sales_count ?? 0} sales · {money(month.data?.gross ?? 0)} gross · {money(month.data?.adjusted_net ?? 0)} net
          </span>
        </span>
        <span className="text-muted">›</span>
      </Link>

      {attention.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-muted">Needs attention</h2>
          <ul className="list">
            {attention.map((a) => (
              <li key={a.href + a.text}>
                <Link href={a.href} className={`flex justify-between px-4 py-3 text-sm font-medium ${a.tone}`}>
                  {a.text} <span>›</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
