import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getLookups } from "@/lib/data/lookups";
import { signPaths } from "@/lib/photos";
import { money, shortDate } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { ItemRow } from "@/components/item-row";
import { ConfirmButton, SubmitButton } from "@/components/fields";
import { deleteSale, linkSaleToItem } from "../actions";
import { SaleForm } from "./sale-form";

export const metadata: Metadata = { title: "Sale" };

export default async function SalePage({ params, searchParams }: PageProps<"/sales/[id]">) {
  await requireMember();
  const { id } = await params;
  const sp = await searchParams;
  const find = typeof sp.find === "string" ? sp.find.replace(/[,()*%\\]/g, " ").trim() : "";
  const supabase = await createClient();
  const [{ data: sale }, lookups] = await Promise.all([
    supabase.from("sales_view").select("*").eq("id", id).maybeSingle(),
    getLookups(supabase),
  ]);
  if (!sale) notFound();

  const { data: linked } = sale.item_id
    ? await supabase.from("items_view").select("id, title, storage_location, thumb_path").eq("id", sale.item_id).maybeSingle()
    : { data: null };
  // Suggest items by the first words of the sold title, or by her search
  const guess = find || (sale.title_snapshot ?? "").split(/\s+/).slice(0, 3).join(" ");
  const { data: candidates } = !sale.item_id
    ? await supabase
        .from("items_view")
        .select("id, title, status, storage_location, thumb_path")
        .ilike("title", `%${guess}%`)
        .limit(20)
    : { data: null };
  const urls = await signPaths(supabase, [linked?.thumb_path, ...(candidates ?? []).map((c) => c.thumb_path)]);

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader
        title={sale.title ?? "Sale"}
        back={{ href: `/sold?m=${sale.sold_date.slice(0, 7)}`, label: "Sold" }}
        subtitle={`${sale.platform} · ${shortDate(sale.sold_date)} · net ${money(sale.adjusted_net)}`}
      />

      <section className="mb-6">
        <h2 className="mb-2 text-sm font-semibold text-muted">Item</h2>
        {linked ? (
          <>
            <ul className="list">
              <ItemRow
                href={`/items/${linked.id}`}
                thumbUrl={linked.thumb_path ? urls.get(linked.thumb_path) : null}
                title={linked.title}
                meta={linked.storage_location ?? undefined}
              />
            </ul>
            <form action={linkSaleToItem} className="mt-2 text-right">
              <input type="hidden" name="id" value={sale.id} />
              <SubmitButton className="text-sm text-muted underline" pendingText="…">
                Unlink
              </SubmitButton>
            </form>
          </>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-coral">Not linked to an item. Find it below and tap Link.</p>
            <form className="flex gap-2">
              <input name="find" defaultValue={find} className="input" type="search" placeholder="Search item titles" />
              <button className="btn-small min-h-12">Find</button>
            </form>
            {!candidates?.length ? (
              <p className="text-sm text-muted">No matching items.</p>
            ) : (
              <ul className="list">
                {candidates.map((c) => (
                  <li key={c.id} className="flex items-center gap-2 pr-3">
                    <ul className="min-w-0 flex-1">
                      <ItemRow
                        href={`/items/${c.id}`}
                        thumbUrl={c.thumb_path ? urls.get(c.thumb_path) : null}
                        title={c.title}
                        meta={c.status}
                      />
                    </ul>
                    <form action={linkSaleToItem}>
                      <input type="hidden" name="id" value={sale.id} />
                      <input type="hidden" name="item_id" value={c.id} />
                      <SubmitButton className="btn-small" pendingText="…">
                        Link
                      </SubmitButton>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      <SaleForm sale={sale} platforms={lookups.platforms} />

      <form action={deleteSale} className="mt-8 text-center">
        <input type="hidden" name="id" value={sale.id} />
        <ConfirmButton message="Undo this sale? The item goes back to Listed.">Undo / delete this sale</ConfirmButton>
      </form>
      {sale.item_id && (
        <p className="mt-2 text-center text-xs text-muted">
          <Link href={`/items/${sale.item_id}`} className="underline">
            Open the item
          </Link>
        </p>
      )}
    </div>
  );
}
