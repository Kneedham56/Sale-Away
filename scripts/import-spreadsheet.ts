// Imports her spreadsheet. Rerunnable: every row is upserted by its "<tab>!<row>" import_ref.
//
//   npm run import -- data/2026\ Reseller\ Inventory\ Tracking.xlsx           (dry run: report only)
//   npm run import -- data/2026\ Reseller\ Inventory\ Tracking.xlsx --apply   (writes to Supabase)
//
// The report is written to data/import-report.md (gitignored, like the spreadsheet).
import { config } from "dotenv";
import { writeFileSync, mkdirSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { parseWorkbook, reportToMarkdown, type ParsedWorkbook } from "./lib/parse-workbook";

config({ path: ".env.local" });

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const file = args.find((a) => !a.startsWith("--")) ?? "data/2026 Reseller Inventory Tracking.xlsx";

async function main() {
  console.log(`Reading ${file} ...`);
  const parsed = await parseWorkbook(file);
  const md = reportToMarkdown(parsed.report);
  mkdirSync("data", { recursive: true });
  writeFileSync("data/import-report.md", md);
  const r = parsed.report;
  console.log(`Parsed ${r.items} items, ${r.sales} sales, ${r.sources} sources.`);
  console.log(`Unmatched sales: ${r.unmatchedSales.length}. Month checks failing: ${r.monthChecks.filter((m) => !m.ok).length}.`);
  console.log(`Report: data/import-report.md`);

  if (!apply) {
    console.log(`Dry run. Add --apply to write to the database.`);
    return;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY must be set in .env.local");
  const db = createClient(url, key, { auth: { persistSession: false } });
  await write(db, parsed);
  await must(db.from("import_runs").insert({ file_name: r.file, report: r }));
  console.log("Done.");
}

async function must<T>(p: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data;
}

async function upsertChunks<T extends object>(db: SupabaseClient, table: string, rows: T[], onConflict: string) {
  for (let i = 0; i < rows.length; i += 500) {
    await must(db.from(table).upsert(rows.slice(i, i + 500), { onConflict }));
  }
  console.log(`  ${table}: ${rows.length}`);
}

async function selectAll<T>(db: SupabaseClient, table: string, columns: string): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const page = await must(db.from(table).select(columns).range(from, from + 999));
    out.push(...(page as T[]));
    if ((page as T[]).length < 1000) return out;
  }
}

async function write(db: SupabaseClient, p: ParsedWorkbook) {
  console.log("Writing ...");
  const { lookups } = p;

  await upsertChunks(db, "categories", lookups.categories.map((name, i) => ({ name, sort_order: i })), "name");
  await upsertChunks(db, "storage_locations", lookups.storageLocations, "name");
  for (const [code, fee_rate] of Object.entries(lookups.platformFees)) {
    await must(db.from("platforms").update({ fee_rate }).eq("code", code));
  }
  const settings = [
    { key: "item_event_actions", value: lookups.itemEventActions },
    { key: "expense_types", value: [...new Set([...lookups.expenseTypes, "Bills"])] },
    ...(lookups.mileageRate ? [{ key: "mileage_rate", value: lookups.mileageRate }] : []),
  ];
  await upsertChunks(db, "settings", settings, "key");

  await upsertChunks(db, "sources", p.sources, "lot_code");
  const sourceIds = new Map(
    (await selectAll<{ id: string; lot_code: string }>(db, "sources", "id, lot_code")).map((s) => [s.lot_code, s.id])
  );

  await upsertChunks(
    db,
    "items",
    p.items.map(({ lot_code, ...it }) => ({ ...it, source_id: lot_code ? sourceIds.get(lot_code) ?? null : null })),
    "import_ref"
  );
  const itemIds = new Map(
    (await selectAll<{ id: string; import_ref: string | null }>(db, "items", "id, import_ref"))
      .filter((i) => i.import_ref)
      .map((i) => [i.import_ref!, i.id])
  );

  await upsertChunks(
    db,
    "sales",
    // sheet_adjusted_net is only for the report check
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    p.sales.map(({ item_ref, sheet_adjusted_net, ...s }) => ({
      ...s,
      item_id: item_ref ? itemIds.get(item_ref) ?? null : null,
      fee_is_estimate: true,
      fulfillment_status: "shipped",
    })),
    "import_ref"
  );
  await upsertChunks(db, "expenses", p.expenses, "import_ref");
  await upsertChunks(db, "mileage", p.mileage, "import_ref");
  await upsertChunks(
    db,
    "write_offs",
    p.writeOffs.map(({ item_ref, ...w }) => ({ ...w, item_id: item_ref ? itemIds.get(item_ref) ?? null : null })),
    "import_ref"
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
