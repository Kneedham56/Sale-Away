import type { Metadata } from "next";
import Link from "next/link";
import { requireMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ebayModeFor } from "@/lib/ebay/mode";
import { PageHeader } from "@/components/page-header";
import { ItemList } from "@/components/item-list";
import { PublishPanel } from "../ready/publish-panel";

export const metadata: Metadata = { title: "Inventory" };
export const maxDuration = 300;

/** Step 3-4 of her workflow: what she owns but hasn't listed. "Drafted" = AI listing reviewed, ready to post. */
export default async function InventoryPage({ searchParams }: PageProps<"/unlisted">) {
  const me = await requireMember();
  const params = await searchParams;
  const drafted = params.stage === "drafted";
  const supabase = await createClient();
  const head = { count: "exact" as const, head: true };
  const [{ count: toList }, { count: draftedCount }] = await Promise.all([
    supabase.from("items").select("id", head).in("status", ["intake", "unlisted"]),
    supabase.from("items").select("id", head).eq("status", "ready_to_list"),
  ]);

  // Bulk publish on the Drafted tab when this business can publish
  let publish: { items: { id: string; title: string }[]; env: string } | null = null;
  if (drafted) {
    const mode = await ebayModeFor(me.workspace.id);
    const { data: conn } =
      mode.env === "mock"
        ? { data: true }
        : await createAdminClient().from("ebay_connection").select("environment").eq("workspace_id", me.workspace.id).eq("environment", mode.env).maybeSingle();
    if (mode.canPublish && conn) {
      const { data } = await supabase.from("items").select("id, title").eq("status", "ready_to_list").order("updated_at", { ascending: false }).limit(200);
      publish = { items: data ?? [], env: mode.env };
    }
  }

  return (
    <>
      <PageHeader
        title="Inventory"
        subtitle={drafted ? "Listings you've reviewed, ready to post." : "Things you've bought and haven't listed yet."}
        actions={
          <>
            {!drafted && <Link href="/batch" className="btn-small">Batch AI</Link>}
            <Link href="/add" className="btn-small">+ Add</Link>
          </>
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-2 rounded-xl bg-border/40 p-1">
        <Link href="/unlisted" className={`rounded-lg py-2 text-center text-sm font-medium ${!drafted ? "bg-surface shadow-sm" : "text-muted"}`}>
          To list · {(toList ?? 0).toLocaleString()}
        </Link>
        <Link href="/unlisted?stage=drafted" className={`rounded-lg py-2 text-center text-sm font-medium ${drafted ? "bg-surface shadow-sm" : "text-muted"}`}>
          Drafted · {(draftedCount ?? 0).toLocaleString()}
        </Link>
      </div>
      {publish && !!publish.items.length && <PublishPanel items={publish.items} env={publish.env} />}
      <ItemList mode="unlisted" params={params} />
    </>
  );
}
