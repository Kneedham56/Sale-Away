import type { Metadata } from "next";
import { requireMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { Empty } from "@/components/item-row";

export const metadata: Metadata = { title: "Activity" };

const LABELS: Record<string, string> = {
  "ebay.connected": "Connected eBay",
  "ebay.connect_started": "Started connecting eBay",
  "ebay.connect_declined": "eBay sign-in cancelled",
  "ebay.connect_failed": "Connecting eBay failed",
  "ebay.mode_changed": "Changed eBay mode",
  "ebay.offer.withdraw": "Ended listing on eBay",
  "ebay.disconnected": "Disconnected eBay",
  "ebay.inventory_item.put": "Saved listing details on eBay",
  "ebay.offer.upsert": "Saved price and policies on eBay",
  "ebay.offer.publish": "Published listing",
  "ebay.publish_failed": "Publish failed",
};

export default async function ActivityPage() {
  await requireMember();
  const supabase = await createClient();
  const [{ data: rows }, { data: members }] = await Promise.all([
    supabase.from("activity_log").select("*").order("at", { ascending: false }).limit(200),
    supabase.from("members").select("user_id, display_name"),
  ]);
  const who = new Map((members ?? []).map((m) => [m.user_id, m.display_name]));

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Activity" back={{ href: "/more", label: "More" }} subtitle="Every change the app made on eBay: who, what, when." />
      {!rows?.length ? (
        <Empty>Nothing yet.</Empty>
      ) : (
        <ul className="list text-sm">
          {rows.map((r) => (
            <li key={r.id} className="px-4 py-2.5">
              <div className="flex justify-between gap-3">
                <span className="font-medium">{LABELS[r.action] ?? r.action}</span>
                <span className="shrink-0 text-xs text-muted">
                  {new Date(r.at).toLocaleString("en-US", { timeZone: "America/Los_Angeles", dateStyle: "medium", timeStyle: "short" })}
                </span>
              </div>
              <div className="text-xs text-muted">
                {who.get(r.actor) ?? "System"} · {r.detail?.environment ?? ""}
                {r.detail?.sku && ` · SKU ${r.detail.sku}`}
                {r.detail?.listingId && ` · listing ${r.detail.listingId}`}
                {r.detail?.error && <span className="text-danger"> · {String(r.detail.error)}</span>}
                {r.detail?.reason && <span className="text-danger"> · {String(r.detail.reason)}</span>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
