// Applies supabase/migrations/*.sql in order, once each. Needs SUPABASE_DB_URL in .env.local
// (Supabase dashboard > Connect > Session pooler connection string, with the database password).
//
//   npm run db:migrate
import { config } from "dotenv";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";

config({ path: ".env.local" });

async function main() {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) throw new Error("SUPABASE_DB_URL must be set in .env.local");
  const sql = postgres(url, { ssl: "require", max: 1, onnotice: () => {} });
  try {
    await sql`create table if not exists public._migrations (name text primary key, applied_at timestamptz not null default now())`;
    await sql`alter table public._migrations enable row level security`;
    const applied = new Set((await sql<{ name: string }[]>`select name from public._migrations`).map((r) => r.name));
    const dir = join("supabase", "migrations");
    const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
    let ran = 0;
    for (const f of files) {
      if (applied.has(f)) continue;
      console.log(`Applying ${f} ...`);
      await sql.begin(async (tx) => {
        await tx.unsafe(readFileSync(join(dir, f), "utf8"));
        await tx`insert into public._migrations (name) values (${f})`;
      });
      ran++;
    }
    console.log(ran ? `Applied ${ran} migration(s).` : "Database is up to date.");
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
