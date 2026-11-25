import type { Metadata } from "next";
import { requireMember } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { ItemList } from "@/components/item-list";

export const metadata: Metadata = { title: "Listed" };

export default async function ListedPage({ searchParams }: PageProps<"/listed">) {
  await requireMember();
  return (
    <>
      <PageHeader title="Listed" subtitle="Everything live. Tap Relist due for listings ready to go back up as new (open one and tap Relist on eBay)." />
      <ItemList mode="listed" params={await searchParams} />
    </>
  );
}
