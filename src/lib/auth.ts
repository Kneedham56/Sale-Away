import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { validWorkspaceId, WORKSPACE_COOKIE } from "@/lib/workspace";

export type Business = { id: string; name: string; role: "owner" | "admin" };

export type Member = {
  userId: string;
  email: string;
  displayName: string;
  role: "seller" | "admin";
  /** The business the app is showing right now */
  workspace: Business;
  /** Every business this login can open (Doc: all of them) */
  workspaces: Business[];
};

// Deduplicated per request: the layout and the page both ask
const loadMember = cache(async function loadMember(): Promise<Member | "signed-out" | "not-a-member" | "no-business" | "switch"> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) return "signed-out";

  const [{ data: member }, { data: links }] = await Promise.all([
    supabase.from("members").select("user_id, email, display_name, role").eq("user_id", userId).maybeSingle(),
    supabase.from("workspace_members").select("role, workspaces(id, name)").eq("user_id", userId),
  ]);
  if (!member) return "not-a-member";
  const workspaces: Business[] = (links ?? [])
    .map((l) => {
      const w = l.workspaces as unknown as { id: string; name: string } | null;
      return w ? { id: w.id, name: w.name, role: l.role as Business["role"] } : null;
    })
    .filter((w): w is Business => !!w)
    .sort((a, b) => (a.role === b.role ? a.name.localeCompare(b.name) : a.role === "owner" ? -1 : 1));
  if (!workspaces.length) return "no-business";

  const active = validWorkspaceId((await cookies()).get(WORKSPACE_COOKIE)?.value);
  const workspace = workspaces.find((w) => w.id === active);
  if (!workspace) return "switch"; // cookie missing or for a business they can't open

  return {
    userId: member.user_id,
    email: member.email,
    displayName: member.display_name,
    role: member.role,
    workspace,
    workspaces,
  };
});

/** The signed-in member and active business, or a redirect. Call inside a Suspense boundary (it reads cookies). */
export async function requireMember(): Promise<Member> {
  const m = await loadMember();
  if (m === "signed-out") redirect("/login");
  if (m === "not-a-member") redirect("/login?error=not-a-member");
  if (m === "no-business") redirect("/login?error=no-business");
  if (m === "switch") redirect("/api/workspace");
  return m;
}

/** For route handlers: the signed-in member, or null (no redirect). */
export async function currentMember(): Promise<Member | null> {
  const m = await loadMember();
  return typeof m === "string" ? null : m;
}

export async function requireAdmin(): Promise<Member> {
  const m = await requireMember();
  if (m.role !== "admin") redirect("/");
  return m;
}
