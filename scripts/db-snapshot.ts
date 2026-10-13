// Quick save / restore of app data, so test nonsense can be wiped.
//
//   npm run db:snapshot -- [name]                                  saves data/snapshots/<timestamp>-<name>.json (every business)
//   npm run db:restore -- <file> [--photos]                        puts every business back exactly as saved
//   npm run db:restore -- <file> --business "Doc's Test Shop" [--photos]   resets just that business
//
// Not saved or touched: logins/passwords, the eBay connection (its secret stays put), and migrations.
// Photos: the snapshot records which photo files existed. With --photos, restore deletes photo files
// uploaded after the snapshot. Photos deleted after the snapshot can't come back (their bytes aren't saved).
import { config } from "dotenv";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import postgres from "postgres";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local", quiet: true });

// Snapshots taken before businesses existed belong to her business
const FIRST_BUSINESS = "00000000-0000-4000-a000-000000000001";

// Parents before children (restore inserts in this order, deletes in reverse)
const BUSINESS_TABLES = [
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
] as const;
const TABLES = ["workspaces", "workspace_members", ...BUSINESS_TABLES, "ebay_deletion_notices"] as const;

type Snapshot = { takenAt: string; tables: Record<string, Record<string, unknown>[]>; photos: string[] };

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

function storage() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } }).storage.from(
    "item-photos"
  );
}

/** Every photo file path (folders: <business>/<item>/<file>; older uploads may be <item>/<file>). */
async function photoPaths(prefix = ""): Promise<string[]> {
  const bucket = storage();
  const out: string[] = [];
  async function walk(dir: string, depth: number) {
    const { data } = await bucket.list(dir, { limit: 10000 });
    for (const entry of data ?? []) {
      const path = dir ? `${dir}/${entry.name}` : entry.name;
      if (entry.id === null && depth < 3) await walk(path, depth + 1); // a folder
      else out.push(path);
    }
  }
  await walk(prefix, 0);
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

async function insertRows(tx: postgres.TransactionSql, table: string, rows: Record<string, unknown>[]) {
  for (let i = 0; i < rows.length; i += 1000) {
    const chunk = JSON.stringify(rows.slice(i, i + 1000));
    // items.item_number is an identity column: keep the saved numbers
    await tx.unsafe(
      `insert into public.${table} ${table === "items" ? "overriding system value" : ""} select * from json_populate_recordset(null::public.${table}, $1::text::json)`,
      [chunk]
    );
  }
  if (rows.length) console.log(`  ${table}: ${rows.length}`);
}

async function restore(file: string, opts: { photos: boolean; business: string | null }) {
  const snap = JSON.parse(readFileSync(file, "utf8")) as Snapshot;
  // Older snapshots: rows had no business yet
  for (const t of BUSINESS_TABLES) for (const r of snap.tables[t] ?? []) r.workspace_id ??= FIRST_BUSINESS;
  if (!snap.tables.workspaces?.length) snap.tables.workspaces = [{ id: FIRST_BUSINESS, name: "Mommatom's", created_at: snap.takenAt }];

  const sql = connect();
  let wsId: string | null = null;
  try {
    if (opts.business) {
      const live = await sql<{ id: string; name: string }[]>`select id, name from public.workspaces`;
      const pick = (list: { id: unknown; name: unknown }[]) =>
        list.find((w) => w.id === opts.business || String(w.name).toLowerCase() === opts.business!.toLowerCase());
      const found = pick(live) ?? pick(snap.tables.workspaces as { id: unknown; name: unknown }[]);
      if (!found) throw new Error(`No business "${opts.business}". Businesses: ${live.map((w) => w.name).join(", ")}`);
      wsId = String(found.id);
      if (!live.some((w) => w.id === wsId)) throw new Error("That business no longer exists; restore the whole snapshot instead.");
      console.log(`Resetting business "${found.name}" from ${file} (taken ${snap.takenAt}) ...`);
      await sql.begin(async (tx) => {
        for (const t of [...BUSINESS_TABLES].reverse()) await tx.unsafe(`delete from public.${t} where workspace_id = $1`, [wsId]);
        for (const t of BUSINESS_TABLES) await insertRows(tx, t, (snap.tables[t] ?? []).filter((r) => r.workspace_id === wsId));
      });
    } else {
      console.log(`Restoring every business from ${file} (taken ${snap.takenAt}) ...`);
      await sql.begin(async (tx) => {
        await tx.unsafe(`truncate ${[...TABLES].reverse().map((t) => `public.${t}`).join(", ")} restart identity cascade`);
        for (const t of TABLES) await insertRows(tx, t, snap.tables[t] ?? []);
        await tx.unsafe(
          `select setval(pg_get_serial_sequence('public.items', 'item_number'), coalesce((select max(item_number) from public.items), 1))`
        );
      });
    }
  } finally {
    await sql.end();
  }

  if (opts.photos) {
    const keep = new Set(snap.photos);
    const extra = (await photoPaths(wsId ?? "")).filter((p) => !keep.has(p));
    for (let i = 0; i < extra.length; i += 100) await storage().remove(extra.slice(i, i + 100));
    console.log(`  removed ${extra.length} photo file(s) added after the snapshot`);
  }
  console.log("Done.");
}

const [mode, ...rest] = process.argv.slice(2);
const bIdx = rest.indexOf("--business");
const business = bIdx >= 0 ? rest[bIdx + 1] ?? null : null;
const positional = rest.filter((a, i) => !a.startsWith("--") && !(bIdx >= 0 && i === bIdx + 1));
const run =
  mode === "snapshot"
    ? snapshot(positional.join("-"))
    : mode === "restore" && positional[0]
      ? restore(positional[0], { photos: rest.includes("--photos"), business })
      : Promise.reject(new Error('Usage: npm run db:snapshot -- [name]  |  npm run db:restore -- <file> [--business "Name"] [--photos]'));
run.catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
