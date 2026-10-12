import { requireMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

type Count = { label: string; value: number | null; hint?: string };

export default async function HomePage() {
  const member = await requireMember();
  const supabase = await createClient();

  const monthStart = new Date();
  monthStart.setDate(1);
  const monthStartIso = monthStart.toISOString().slice(0, 10);

  const count = (q: PromiseLike<{ count: number | null }>) => q.then((r) => r.count);
  const items = () => supabase.from("items").select("id", { count: "exact", head: true });

  const [toShip, unlisted, ready, listed, soldThisMonth] = await Promise.all([
    count(supabase.from("sales").select("id", { count: "exact", head: true }).in("fulfillment_status", ["to_ship", "packed"])),
    count(items().in("status", ["intake", "unlisted"])),
    count(items().eq("status", "ready_to_list")),
    count(items().eq("status", "listed")),
    count(supabase.from("sales").select("id", { count: "exact", head: true }).gte("sold_date", monthStartIso)),
  ]);

  const counts: Count[] = [
    { label: "To ship", value: toShip },
    { label: "Unlisted", value: unlisted },
    { label: "Ready to list", value: ready },
    { label: "Listed", value: listed },
    { label: "Sold this month", value: soldThisMonth },
  ];

  const firstName = member.displayName.split(" ")[0];

  return (
    <div className="space-y-6 pt-2">
      <h1 className="text-2xl font-semibold tracking-tight">Hi {firstName}</h1>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {counts.map((c, i) => (
          <div key={c.label} className={`card p-4 ${i === 0 ? "col-span-2 sm:col-span-1" : ""}`}>
            <div className="text-sm text-muted">{c.label}</div>
            <div className="mt-1 text-3xl font-semibold tabular-nums">
              {c.value === null ? "–" : c.value.toLocaleString()}
            </div>
          </div>
        ))}
      </div>
      <p className="text-sm text-muted">
        Phase 0: this is the foundation. Adding items, listing and sales screens come next.
      </p>
    </div>
  );
}
