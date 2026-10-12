// Creates (or finds) a login for someone and lets them into the app.
//
//   npm run add-member -- someone@example.com "Display Name" [seller|admin]
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });

async function main() {
  const [email, displayName, role = "seller"] = process.argv.slice(2);
  if (!email || !displayName || !["seller", "admin"].includes(role)) {
    throw new Error('Usage: npm run add-member -- email "Display Name" [seller|admin]');
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY must be set in .env.local");
  const db = createClient(url, key, { auth: { persistSession: false } });

  const normalized = email.trim().toLowerCase();
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
  console.log(`${displayName} <${normalized}> is a member (${role}).`);
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
