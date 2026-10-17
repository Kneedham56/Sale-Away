import type { Metadata } from "next";
import Link from "next/link";
import { requireMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { signPaths } from "@/lib/photos";
import { money } from "@/lib/format";
import { ebayModeFor } from "@/lib/ebay/mode";
import { PageHeader } from "@/components/page-header";
import { Empty, Thumb } from "@/components/item-row";
import { CopyButton } from "@/components/copy-button";
import { PublishPanel } from "./publish-panel";

export const metadata: Metadata = { title: "Ready to list" };
export const maxDuration = 300;

export default async function ReadyPage() {
  const me = await requireMember();
  const mode = await ebayModeFor(me.workspace.id);
  const supabase = await createClient();
  const { data: items } = await supabase
    .from("items_view")
    .select("id, title, list_price, ebay_category_name, storage_location, thumb_path, photo_count, item_specifics, sku")
    .eq("status", "ready_to_list")
    .order("updated_at", { ascending: false })
    .limit(500);
  const urls = await signPaths(supabase, (items ?? []).map((i) => i.thumb_path));
  const canPublish = mode.canPublish;

  return (
    <>
      <PageHeader
        title="Ready to list"
        subtitle={
          canPublish
            ? "Reviewed listings. Select and publish to eBay, or copy into the eBay app."
            : "Reviewed listings. Copy each field into the eBay app, then mark it listed."
        }
        actions={<Link href="/batch" className="btn-small">Batch generate</Link>}
      />
      {canPublish && !!items?.length && <PublishPanel items={items.map((i) => ({ id: i.id, title: i.title }))} env={mode.env} />}
      {!items?.length ? (
        <Empty>Nothing here yet. Open an unlisted item and tap Generate listing, then Accept.</Empty>
      ) : (
        <ul className="space-y-3">
          {items.map((it) => (
            <li key={it.id} className="card flex gap-3 p-3">
              <Link href={`/items/${it.id}`}>
                <Thumb url={it.thumb_path ? urls.get(it.thumb_path) : null} className="h-20 w-20" />
              </Link>
              <div className="min-w-0 flex-1">
                <Link href={`/items/${it.id}`} className="line-clamp-2 text-[15px] leading-snug font-medium">
                  {it.title}
                </Link>
                <div className="mt-0.5 text-xs text-muted">
                  {money(it.list_price)} · {it.ebay_category_name ?? "no category"} · {it.photo_count} photo{it.photo_count === 1 ? "" : "s"}
                  {it.storage_location && ` · 📦 ${it.storage_location}`}
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <CopyButton text={it.title} label="Copy title" />
                  {it.list_price !== null && <CopyButton text={Number(it.list_price).toFixed(2)} label="Copy price" />}
                  <Link href={`/items/${it.id}`} className="btn-small">
                    All fields ›
                  </Link>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
