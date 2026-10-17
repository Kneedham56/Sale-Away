import type { Metadata } from "next";
import Link from "next/link";
import { requireMember } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { SignOutButton } from "./sign-out-button";

export const metadata: Metadata = { title: "More" };

// Grouped the way she works: do the work, look back, set things up
const SECTIONS = [
  {
    title: "Workflow",
    links: [
      ["/trips", "1 · Trips", "Log a sourcing trip, then add what you bought"],
      ["/unlisted", "2 · Inventory", "Bought but not listed yet (To list · Drafted)"],
      ["/listed", "3 · Listed", "Live listings; take down the stale ones"],
      ["/outgoing", "4 · Outgoing", "Sold: pack and ship"],
      ["/completed", "5 · Completed", "Shipped, or taken down for good"],
      ["/quick", "Quick Check", "Snap a photo in the store: KEEP or DONATE"],
      ["/batch", "Batch AI listings", "Draft listings for several items at once"],
    ],
  },
  {
    title: "Insights",
    links: [
      ["/sold", "Sales by month", "Replaces the monthly tabs"],
      ["/reports", "Reports", "By month, trip, category, platform; aging"],
      ["/expenses", "Expenses & mileage", "Supplies, bills and miles"],
      ["/taxes", "Taxes", "Year-end figures and export"],
    ],
  },
  {
    title: "Setup",
    links: [
      ["/settings", "Settings", "Fee rates, storage spots, categories, AI prompts"],
      ["/settings/ebay", "eBay", "Connection, sync, listing defaults"],
      ["/activity", "Activity", "Every change the app made on eBay"],
    ],
  },
] as const;

export default async function MorePage() {
  const me = await requireMember();
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="Menu" subtitle={`Signed in as ${me.displayName} · ${me.workspace.name}`} />
      {(me.workspaces.length > 1 || me.role === "admin") && (
        <Link href="/businesses" className="card mb-4 flex items-center justify-between px-4 py-3.5">
          <span>
            <span className="block font-medium">Business: {me.workspace.name}</span>
            <span className="block text-xs text-muted">{me.role === "admin" ? "Switch or add a business" : "Switch business"}</span>
          </span>
          <span className="text-muted">›</span>
        </Link>
      )}
      {SECTIONS.map((section) => (
        <section key={section.title} className="mb-5">
          <h2 className="mb-2 px-1 text-xs font-semibold tracking-wide text-muted uppercase">{section.title}</h2>
          <ul className="list">
            {section.links.map(([href, label, hint]) => (
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
        </section>
      ))}
      <div className="mt-6 text-center">
        <SignOutButton />
      </div>
    </div>
  );
}
