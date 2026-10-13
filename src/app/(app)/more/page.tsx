import type { Metadata } from "next";
import Link from "next/link";
import { requireMember } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { SignOutButton } from "./sign-out-button";

export const metadata: Metadata = { title: "More" };

const LINKS = [
  ["/quick", "Quick Check", "Snap a photo in the store: KEEP or DONATE"],
  ["/ready", "Ready to list", "Reviewed listings: copy into eBay or publish"],
  ["/batch", "Batch generate", "AI listings for several unlisted items at once"],
  ["/outgoing", "Outgoing", "Orders to pack and ship, pick list"],
  ["/sold", "Sold", "Month by month, replaces the monthly tabs"],
  ["/trips", "Sourcing trips", "Where things came from and what they earned"],
  ["/expenses", "Expenses & mileage", "Quick add for supplies, bills and miles"],
  ["/reports", "Reports", "By month, trip, category, platform; aging"],
  ["/taxes", "Taxes", "Year-end figures and export"],
  ["/settings", "Settings", "Fee rates, storage spots, categories, AI prompts"],
  ["/settings/ebay", "eBay", "Connect, sync orders and fees, listing defaults"],
  ["/activity", "Activity", "Every change the app made on eBay"],
] as const;

export default async function MorePage() {
  const me = await requireMember();
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="More" subtitle={`Signed in as ${me.displayName}`} />
      <ul className="list">
        {LINKS.map(([href, label, hint]) => (
          <li key={href}>
            <Link href={href} className="flex items-center justify-between gap-3 px-4 py-3.5 active:bg-border/40">
              <span>
                <span className="block font-medium">{label}</span>
                <span className="block text-xs text-muted">{hint}</span>
              </span>
              <span className="text-muted">›</span>
            </Link>
          </li>
        ))}
      </ul>
      <div className="mt-6 text-center">
        <SignOutButton />
      </div>
    </div>
  );
}
