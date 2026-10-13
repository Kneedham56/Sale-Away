// Creates (or finds) a login. With --business, also creates a new business owned by that login.
//
//   npm run add-member -- someone@example.com "Display Name" [seller|admin]
//   npm run add-member -- aunt@example.com "Aunt Linda" --business "Aunt Linda's Finds"
//
// Then set their password yourself: npm run set-password -- someone@example.com
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { createBusiness } from "../src/lib/data/businesses";

config({ path: ".env.local", quiet: true });

async function main() {
  const args = process.argv.slice(2);
  const bIdx = args.indexOf("--business");
  const businessName = bIdx >= 0 ? args[bIdx + 1] : null;
  const positional = args.filter((_, i) => bIdx < 0 || (i !== bIdx && i !== bIdx + 1));
  const [email, displayName, role = "seller"] = positional;
  if (!email || !displayName || !["seller", "admin"].includes(role) || (bIdx >= 0 && !businessName)) {
    throw new Error('Usage: npm run add-member -- email "Display Name" [seller|admin] [--business "Business name"]');
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY must be set in .env.local");
  const db = createClient(url, key, { auth: { persistSession: false } });
  const normalized = email.trim().toLowerCase();

  if (businessName) {
    const { workspaceId, ownerCreated } = await createBusiness(db, { name: businessName, ownerEmail: normalized, ownerName: displayName });
    console.log(`${ownerCreated ? "Created login and" : "Created"} business “${businessName}” (${workspaceId}) owned by ${normalized}.`);
    return;
  }

  let userId: string | undefined;
  for (let page = 1; !userId; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    userId = data.users.find((u) => u.email?.toLowerCase() === normalized)?.id;
    if (data.users.length < 1000) break;
  }
  if (!userId) {
    const { data, error } = await db.auth.admin.createUser({ email: normalized, email_confirm: true });
    if (error) throw error;
    userId = data.user.id;
    console.log(`Created login for ${normalized}`);
  }
  const { error } = await db
    .from("members")
    .upsert({ user_id: userId, email: normalized, display_name: displayName, role }, { onConflict: "user_id" });
  if (error) throw error;
  if (role === "admin") {
    // Admins can open every business
    const { data: all } = await db.from("workspaces").select("id");
    const links = (all ?? []).map((w) => ({ workspace_id: w.id, user_id: userId, role: "admin" }));
    if (links.length) await db.from("workspace_members").upsert(links, { onConflict: "workspace_id,user_id", ignoreDuplicates: true });
  }
  console.log(`${displayName} <${normalized}> is a member (${role}).`);
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
