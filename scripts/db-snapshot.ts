// Quick save / restore of all app data, so test nonsense can be wiped.
//
//   npm run db:snapshot -- [name]                  saves data/snapshots/<timestamp>-<name>.json
//   npm run db:restore -- <file> [--photos]        puts every table back exactly as saved
//
// Not saved or touched: logins/members, the eBay connection (its secret stays put), and migrations.
// Photos: the snapshot records which photo files existed. With --photos, restore deletes photo files
// uploaded after the snapshot. Photos deleted after the snapshot can't come back (their bytes aren't saved).
import { config } from "dotenv";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import postgres from "postgres";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local", quiet: true });

// Parents before children (restore inserts in this order, truncates in reverse)
const TABLES = [
  "settings",
  "platforms",
  "categories",
  "storage_locations",
  "sources",
  "items",
  "item_photos",
  "item_events",
  "sales",
  "expenses",
  "mileage",
  "write_offs",
  "ai_runs",
  "activity_log",
  "import_runs",
  "ebay_transactions",
  "ebay_sync_state",
  "ebay_listings",
  "ebay_deletion_notices",
] as const;

function connect() {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) throw new Error("SUPABASE_DB_URL must be set in .env.local");
  const m = url.match(/^postgres(?:ql)?:\/\/([^:]+):(.*)@([^@:/]+):(\d+)\/([^?]+)/);
  if (!m) throw new Error("SUPABASE_DB_URL is not a postgres connection string");
  const [, user, rawPassword, host, port, database] = m;
  let password = rawPassword;
  try {
    if (/%[0-9A-Fa-f]{2}/.test(rawPassword)) password = decodeURIComponent(rawPassword);
  } catch {}
  return postgres({ host, port: port === "6543" ? 5432 : Number(port), user, password, database, ssl: "require", max: 1, onnotice: () => {} });
}

async function photoPaths(): Promise<string[]> {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
  const out: string[] = [];
  // Photos live in one folder per item
  const { data: folders } = await db.storage.from("item-photos").list("", { limit: 10000 });
  for (const f of folders ?? []) {
    const { data: files } = await db.storage.from("item-photos").list(f.name, { limit: 1000 });
    for (const file of files ?? []) out.push(`${f.name}/${file.name}`);
  }
  return out;
}

async function snapshot(name: string) {
  const sql = connect();
  try {
    const data: Record<string, unknown[]> = {};
    for (const t of TABLES) data[t] = await sql.unsafe(`select * from public.${t}`);
    const photos = await photoPaths();
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    mkdirSync("data/snapshots", { recursive: true });
    const file = `data/snapshots/${stamp}${name ? `-${name.replace(/[^a-z0-9-]+/gi, "-")}` : ""}.json`;
    writeFileSync(file, JSON.stringify({ takenAt: new Date().toISOString(), tables: data, photos }));
    console.log(`Saved ${file}`);
    for (const t of TABLES) if (data[t].length) console.log(`  ${t}: ${data[t].length}`);
    console.log(`  photo files: ${photos.length}`);
  } finally {
    await sql.end();
  }
}

async function restore(file: string, withPhotos: boolean) {
  const snap = JSON.parse(readFileSync(file, "utf8")) as { takenAt: string; tables: Record<string, unknown[]>; photos: string[] };
  console.log(`Restoring ${file} (taken ${snap.takenAt}) ...`);
  const sql = connect();
  try {
    await sql.begin(async (tx) => {
      await tx.unsafe(`truncate ${[...TABLES].reverse().map((t) => `public.${t}`).join(", ")} restart identity cascade`);
      for (const t of TABLES) {
        const rows = snap.tables[t] ?? [];
        for (let i = 0; i < rows.length; i += 1000) {
          const chunk = JSON.stringify(rows.slice(i, i + 1000));
          // items.item_number is an identity column: keep the saved numbers
          await tx.unsafe(
            `insert into public.${t} ${t === "items" ? "overriding system value" : ""} select * from json_populate_recordset(null::public.${t}, $1::text::json)`,
            [chunk]
          );
        }
        if (rows.length) console.log(`  ${t}: ${rows.length}`);
      }
      await tx.unsafe(`select setval(pg_get_serial_sequence('public.items', 'item_number'), coalesce((select max(item_number) from public.items), 1))`);
    });
  } finally {
    await sql.end();
  }

  if (withPhotos) {
    const keep = new Set(snap.photos);
    const extra = (await photoPaths()).filter((p) => !keep.has(p));
    if (extra.length) {
      const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
      for (let i = 0; i < extra.length; i += 100) await db.storage.from("item-photos").remove(extra.slice(i, i + 100));
    }
    console.log(`  removed ${extra.length} photo file(s) added after the snapshot`);
  }
  console.log("Done.");
}

const [mode, ...rest] = process.argv.slice(2);
const run =
  mode === "snapshot"
    ? snapshot(rest.filter((a) => !a.startsWith("--")).join("-"))
    : mode === "restore" && rest[0]
      ? restore(rest[0], rest.includes("--photos"))
      : Promise.reject(new Error("Usage: npm run db:snapshot -- [name]  |  npm run db:restore -- <file> [--photos]"));
run.catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
