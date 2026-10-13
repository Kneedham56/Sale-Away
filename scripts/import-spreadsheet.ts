// Imports her spreadsheet. Rerunnable: every row is upserted by its "<tab>!<row>" import_ref.
//
//   npm run import -- data/2026\ Reseller\ Inventory\ Tracking.xlsx           (dry run: report only)
//   npm run import -- data/2026\ Reseller\ Inventory\ Tracking.xlsx --apply --business "Mommatom's"
//
// --business takes a business name or id (required with --apply).
//
// The report is written to data/import-report.md (gitignored, like the spreadsheet).
import { config } from "dotenv";
import { writeFileSync, mkdirSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { parseWorkbook, reportToMarkdown, type ParsedWorkbook } from "./lib/parse-workbook";

config({ path: ".env.local" });

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const bIdx = args.indexOf("--business");
const business = bIdx >= 0 ? args[bIdx + 1] : null;
const file = args.find((a, i) => !a.startsWith("--") && i !== bIdx + 1) ?? "data/2026 Reseller Inventory Tracking.xlsx";

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
  if (!business) throw new Error('Choose the business: --business "Mommatom\'s" (name or id)');
  const { data: list } = await db.from("workspaces").select("id, name");
  const ws = (list ?? []).find((w) => w.id === business || w.name.toLowerCase() === business.toLowerCase());
  if (!ws) throw new Error(`No business called "${business}". Businesses: ${(list ?? []).map((w) => w.name).join(", ")}`);
  console.log(`Writing into business "${ws.name}" ...`);
  await write(db, parsed, ws.id);
  await must(db.from("import_runs").insert({ workspace_id: ws.id, file_name: r.file, report: r }));
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

async function selectAll<T>(db: SupabaseClient, table: string, columns: string, ws: string): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const page = await must(db.from(table).select(columns).eq("workspace_id", ws).range(from, from + 999));
    out.push(...(page as T[]));
    if ((page as T[]).length < 1000) return out;
  }
}

async function write(db: SupabaseClient, p: ParsedWorkbook, ws: string) {
  const w = <T extends object>(rows: T[]) => rows.map((r) => ({ ...r, workspace_id: ws }));
  console.log("Writing ...");
  const { lookups } = p;

  await upsertChunks(db, "categories", w(lookups.categories.map((name, i) => ({ name, sort_order: i }))), "workspace_id,name");
  await upsertChunks(db, "storage_locations", w(lookups.storageLocations), "workspace_id,name");
  for (const [code, fee_rate] of Object.entries(lookups.platformFees)) {
    await must(db.from("platforms").update({ fee_rate }).eq("workspace_id", ws).eq("code", code));
  }
  const settings = [
    { key: "item_event_actions", value: lookups.itemEventActions },
    { key: "expense_types", value: [...new Set([...lookups.expenseTypes, "Bills"])] },
    ...(lookups.mileageRate ? [{ key: "mileage_rate", value: lookups.mileageRate }] : []),
  ];
  await upsertChunks(db, "settings", w(settings), "workspace_id,key");

  await upsertChunks(db, "sources", w(p.sources), "workspace_id,lot_code");
  const sourceIds = new Map(
    (await selectAll<{ id: string; lot_code: string }>(db, "sources", "id, lot_code", ws)).map((s) => [s.lot_code, s.id])
  );

  await upsertChunks(
    db,
    "items",
    w(p.items.map(({ lot_code, ...it }) => ({ ...it, source_id: lot_code ? sourceIds.get(lot_code) ?? null : null }))),
    "workspace_id,import_ref"
  );
  const itemIds = new Map(
    (await selectAll<{ id: string; import_ref: string | null }>(db, "items", "id, import_ref", ws))
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
    })).map((r) => ({ ...r, workspace_id: ws })),
    "workspace_id,import_ref"
  );
  await upsertChunks(db, "expenses", w(p.expenses), "workspace_id,import_ref");
  await upsertChunks(db, "mileage", w(p.mileage), "workspace_id,import_ref");
  await upsertChunks(
    db,
    "write_offs",
    w(p.writeOffs.map(({ item_ref, ...wo }) => ({ ...wo, item_id: item_ref ? itemIds.get(item_ref) ?? null : null }))),
    "workspace_id,import_ref"
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
