import type { Metadata } from "next";
import Link from "next/link";
import { requireMember } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { ItemList } from "@/components/item-list";

export const metadata: Metadata = { title: "Unlisted" };

export default async function UnlistedPage({ searchParams }: PageProps<"/unlisted">) {
  await requireMember();
  return (
    <>
      <PageHeader
        title="Unlisted"
        subtitle="Everything waiting to be listed."
        actions={
          <>
            <Link href="/batch" className="btn-small">Batch AI</Link>
            <Link href="/add" className="btn-small">+ Add</Link>
          </>
        }
      />
      <ItemList mode="unlisted" params={await searchParams} />
    </>
  );
}
