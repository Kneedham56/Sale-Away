import type { Metadata } from "next";
import { requireMember } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { ItemList } from "@/components/item-list";

export const metadata: Metadata = { title: "Listed" };

export default async function ListedPage({ searchParams }: PageProps<"/listed">) {
  await requireMember();
  return (
    <>
      <PageHeader title="Listed" subtitle="Everything live. Tap Stale for listings due a price drop or relist." />
      <ItemList mode="listed" params={await searchParams} />
    </>
  );
}
