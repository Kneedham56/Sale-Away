import Link from "next/link";
import { requireMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { todayIso } from "@/lib/dates";
import { settingNumber } from "@/lib/data/lookups";
import { money } from "@/lib/format";
import { ebayStatusAndAutoSync } from "@/lib/ebay/status";

export const maxDuration = 300; // room for the background eBay sync

export default async function HomePage() {
  const member = await requireMember();
  const supabase = await createClient();
  const today = await todayIso();
  const monthStart = `${today.slice(0, 7)}-01`;

  const { data: staleSetting } = await supabase.from("settings").select("value").eq("key", "stale_listing_days").maybeSingle();
  const staleDays = settingNumber({ v: staleSetting?.value }, "v", 90);

  const ebay = await ebayStatusAndAutoSync(member.workspace.id);
  const head = { count: "exact" as const, head: true };
  const [toShip, late, unlisted, ready, listed, stale, unmatched, month] = await Promise.all([
    supabase.from("sales_view").select("id", head).in("fulfillment_status", ["to_ship", "packed"]),
    supabase.from("sales_view").select("id", head).in("fulfillment_status", ["to_ship", "packed"]).lt("ship_by", today),
    supabase.from("items").select("id", head).in("status", ["intake", "unlisted"]),
    supabase.from("items").select("id", head).eq("status", "ready_to_list"),
    supabase.from("items").select("id", head).eq("status", "listed"),
    supabase.from("items_view").select("id", head).eq("status", "listed").gte("days_active", staleDays),
    supabase.from("sales_view").select("id", head).is("item_id", null),
    supabase.from("monthly_summary").select("sales_count, gross, adjusted_net").eq("month", monthStart).maybeSingle(),
  ]);

  const tiles = [
    { href: "/outgoing", label: "To ship", value: toShip.count, highlight: !!toShip.count },
    { href: "/unlisted", label: "Unlisted", value: unlisted.count },
    { href: "/ready", label: "Ready to list", value: ready.count },
    { href: "/listed", label: "Listed", value: listed.count },
    { href: "/sold", label: "Sold this month", value: month.data?.sales_count ?? 0 },
  ];

  const attention = [
    ebay.expiresSoon && { href: "/settings/ebay", text: "eBay connection expires within 30 days. Reconnect.", tone: "text-danger" },
    ebay.lastError && { href: "/settings/ebay", text: `eBay sync failed: ${ebay.lastError.slice(0, 80)}`, tone: "text-danger" },
    late.count && { href: "/outgoing?sort=ship_by", text: `${late.count} order${late.count === 1 ? " is" : "s are"} past the ship-by date`, tone: "text-danger" },
    unmatched.count && { href: "/sold?unmatched=1", text: `${unmatched.count} sale${unmatched.count === 1 ? "" : "s"} not linked to an item`, tone: "text-coral" },
    stale.count && { href: "/listed?stale=1", text: `${stale.count.toLocaleString()} listings up ${staleDays}+ days`, tone: "text-muted" },
  ].filter(Boolean) as { href: string; text: string; tone: string }[];

  return (
    <div className="space-y-6 pt-2">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Hi {member.displayName.split(" ")[0]}</h1>
        {month.data && (
          <p className="text-sm text-muted">
            This month: {money(month.data.gross)} gross, {money(month.data.adjusted_net)} net.
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {tiles.map((t, i) => (
          <Link
            key={t.label}
            href={t.href}
            className={`card p-4 active:bg-border/40 ${i === 0 ? "col-span-2 sm:col-span-1" : ""} ${t.highlight ? "border-coral" : ""}`}
          >
            <div className="text-sm text-muted">{t.label}</div>
            <div className="mt-1 text-3xl font-semibold tabular-nums">{t.value === null ? "–" : t.value.toLocaleString()}</div>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Link href="/add" className="btn-primary bg-coral text-lg">
          + Add item
        </Link>
        <Link href="/quick" className="btn-secondary text-lg">
          Quick Check
        </Link>
      </div>

      {attention.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-muted">Needs attention</h2>
          <ul className="list">
            {attention.map((a) => (
              <li key={a.href}>
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
