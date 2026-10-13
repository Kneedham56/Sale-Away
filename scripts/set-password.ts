// Sets a member's password. Run it yourself in a terminal; the password is typed hidden and never stored here.
//
//   npm run set-password -- someone@example.com
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local", quiet: true });

function askHidden(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write(prompt);
    const stdin = process.stdin;
    stdin.setRawMode?.(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    let value = "";
    const onData = (ch: string) => {
      for (const c of ch) {
        if (c === "\r" || c === "\n") {
          stdin.setRawMode?.(false);
          stdin.pause();
          stdin.off("data", onData);
          process.stdout.write("\n");
          return resolve(value);
        }
        if (c === "\u0003") process.exit(1);
        if (c === "\u007f" || c === "\b") value = value.slice(0, -1);
        else value += c;
      }
    };
    stdin.on("data", onData);
  });
}

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) throw new Error("Usage: npm run set-password -- someone@example.com");
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false },
  });
  const { data: member } = await db.from("members").select("user_id").eq("email", email).maybeSingle();
  if (!member) throw new Error(`${email} is not a member. Run add-member first.`);

  const pw = await askHidden(`New password for ${email}: `);
  if (pw.length < 10) throw new Error("Use at least 10 characters.");
  const again = await askHidden("Type it again: ");
  if (pw !== again) throw new Error("Passwords didn't match.");

  const { error } = await db.auth.admin.updateUserById(member.user_id, { password: pw });
  if (error) throw error;
  console.log(`Password set for ${email}.`);
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
