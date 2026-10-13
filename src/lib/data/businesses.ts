import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Creates a business with its owner's login (created without a password if new) and default settings.
 * Every admin (Doc) is added too, so he can open it for support. Uses the admin (secret-key) client.
 */
export async function createBusiness(
  admin: SupabaseClient,
  input: { name: string; ownerEmail: string; ownerName: string }
): Promise<{ workspaceId: string; ownerCreated: boolean }> {
  const email = input.ownerEmail.trim().toLowerCase();

  let ownerId: string | undefined;
  for (let page = 1; !ownerId; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    ownerId = data.users.find((u) => u.email?.toLowerCase() === email)?.id;
    if (data.users.length < 1000) break;
  }
  let ownerCreated = false;
  if (!ownerId) {
    const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
    if (error) throw error;
    ownerId = data.user.id;
    ownerCreated = true;
  }
  const { data: existingMember } = await admin.from("members").select("user_id").eq("user_id", ownerId).maybeSingle();
  if (!existingMember) {
    const { error } = await admin.from("members").insert({ user_id: ownerId, email, display_name: input.ownerName, role: "seller" });
    if (error) throw new Error(error.message);
  }

  const { data: ws, error: wsErr } = await admin.from("workspaces").insert({ name: input.name }).select("id").single();
  if (wsErr || !ws) throw new Error(wsErr?.message ?? "Couldn't create the business.");
  const { error: seedErr } = await admin.rpc("seed_workspace", { ws: ws.id });
  if (seedErr) throw new Error(seedErr.message);

  const { data: admins } = await admin.from("members").select("user_id").eq("role", "admin");
  const links = [
    { workspace_id: ws.id, user_id: ownerId, role: "owner" },
    ...(admins ?? []).filter((a) => a.user_id !== ownerId).map((a) => ({ workspace_id: ws.id, user_id: a.user_id, role: "admin" })),
  ];
  const { error: linkErr } = await admin.from("workspace_members").upsert(links, { onConflict: "workspace_id,user_id" });
  if (linkErr) throw new Error(linkErr.message);
  return { workspaceId: ws.id, ownerCreated };
}
