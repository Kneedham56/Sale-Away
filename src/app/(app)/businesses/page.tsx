import type { Metadata } from "next";
import { requireMember } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/page-header";
import { NewBusinessForm } from "./new-business-form";

export const metadata: Metadata = { title: "Businesses" };

export default async function BusinessesPage() {
  const me = await requireMember();
  const isAdmin = me.role === "admin";
  // Item counts per business (admin view only; counts, not contents)
  const counts = new Map<string, number>();
  const owners = new Map<string, string>();
  if (isAdmin) {
    const admin = createAdminClient();
    const ids = me.workspaces.map((w) => w.id);
    const [{ data: links }, { data: people }, ...itemCounts] = await Promise.all([
      admin.from("workspace_members").select("workspace_id, user_id").in("workspace_id", ids).eq("role", "owner"),
      admin.from("members").select("user_id, display_name"),
      ...ids.map((id) => admin.from("items").select("id", { count: "exact", head: true }).eq("workspace_id", id)),
    ]);
    ids.forEach((id, i) => counts.set(id, itemCounts[i].count ?? 0));
    const names = new Map((people ?? []).map((p) => [p.user_id, p.display_name]));
    for (const l of links ?? []) {
      const n = names.get(l.user_id);
      if (n) owners.set(l.workspace_id, [owners.get(l.workspace_id), n].filter(Boolean).join(", "));
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title="Businesses"
        back={{ href: "/more", label: "More" }}
        subtitle="Each business has its own items, trips, sales, settings and eBay account. Nothing is shared between them."
      />
      <ul className="list">
        {me.workspaces.map((w) => {
          const active = w.id === me.workspace.id;
          return (
            <li key={w.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="font-medium">
                  {w.name} {active && <span className="text-xs font-normal text-ok">· open now</span>}
                </div>
                <div className="text-xs text-muted">
                  {w.role === "owner" ? "Yours" : `Admin access${owners.get(w.id) ? ` · owner ${owners.get(w.id)}` : ""}`}
                  {isAdmin && ` · ${(counts.get(w.id) ?? 0).toLocaleString()} items`}
                </div>
              </div>
              {!active && (
                // A full page load so every screen picks up the new business
                <a href={`/api/workspace?id=${w.id}`} className="btn-small">
                  Open
                </a>
              )}
            </li>
          );
        })}
      </ul>

      {isAdmin && (
        <section className="card p-4">
          <h2 className="mb-3 font-semibold">New business</h2>
          <NewBusinessForm />
        </section>
      )}
    </div>
  );
}
