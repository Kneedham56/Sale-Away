// Parses her "Reseller Inventory Tracking" workbook into normalized records.
// Pure: reads the file, returns rows + a report. Writing to the database is the caller's job.
import ExcelJS from "exceljs";

export type SourceRow = {
  lot_code: string;
  place: string | null;
  type: string;
  date: string | null;
};

export type ItemRow = {
  import_ref: string;
  title: string;
  kind: "general" | "book" | "media";
  category: string | null;
  format: string | null;
  is_bundle: boolean;
  cost: number | null;
  lot_code: string | null;
  date_sourced: string | null;
  storage_location: string | null;
  list_price: number | null;
  date_listed: string | null;
  status: "unlisted" | "listed" | "sold" | "damaged";
  date_sold: string | null;
  owner: string | null;
  notes: string | null;
};

export type SaleRow = {
  import_ref: string;
  item_ref: string | null; // import_ref of the matched item
  platform: string;
  title_snapshot: string;
  category_snapshot: string | null;
  lot_code_snapshot: string | null;
  sold_date: string;
  gross: number;
  shipping_cost: number;
  fees: number;
  fee_rate: number | null;
  cogs: number | null;
  adjustments: number;
  return_charges: number;
  sheet_adjusted_net: number | null; // her number, for the check only
};

export type ExpenseRow = {
  import_ref: string;
  date: string;
  description: string;
  type: string;
  amount: number;
  notes: string | null;
};

export type MileageRow = {
  import_ref: string;
  date: string;
  miles: number;
  rate: number;
  purpose: string | null;
};

export type WriteOffRow = {
  import_ref: string;
  item_ref: string | null;
  title_snapshot: string;
  date_purchased: string | null;
  date: string;
  value: number;
};

export type Lookups = {
  categories: string[];
  storageLocations: { name: string; kind: "bin" | "place" }[];
  itemEventActions: string[];
  expenseTypes: string[];
  platformFees: Record<string, number>;
  mileageRate: number | null;
};

export type MonthCheck = {
  month: string;
  sheet: { count: number | null; gross: number | null; adjustedNet: number | null };
  imported: { count: number; gross: number; adjustedNet: number };
  ok: boolean;
};

export type ImportReport = {
  file: string;
  tabs: { tab: string; rowsRead: number; imported: number; skipped: { row: number; reason: string }[] }[];
  sources: number;
  items: number;
  sales: number;
  unmatchedSales: { ref: string; title: string }[];
  ambiguousMatches: { ref: string; title: string; candidates: number }[];
  multiSoldItems: { title: string; sales: number }[];
  monthChecks: MonthCheck[];
  notes: string[];
};

export type ParsedWorkbook = {
  sources: SourceRow[];
  items: ItemRow[];
  sales: SaleRow[];
  expenses: ExpenseRow[];
  mileage: MileageRow[];
  writeOffs: WriteOffRow[];
  lookups: Lookups;
  report: ImportReport;
};

// ---------------------------------------------------------------------------
// Cell helpers
// ---------------------------------------------------------------------------

type Cell = ExcelJS.CellValue;

function unwrap(v: Cell): unknown {
  if (v && typeof v === "object" && !(v instanceof Date)) {
    if ("result" in v) return unwrap((v as { result: Cell }).result);
    if ("richText" in v) return (v as ExcelJS.CellRichTextValue).richText.map((r) => r.text).join("");
    if ("text" in v) return (v as { text: string }).text;
    if ("error" in v) return null;
  }
  return v;
}

const PLACEHOLDERS = new Set(["", ".", "?", "-", "--", "n/a", "na"]);

function str(v: Cell): string | null {
  const u = unwrap(v);
  if (u === null || u === undefined) return null;
  if (u instanceof Date) return null;
  const s = String(u).replace(/\s+/g, " ").trim();
  return PLACEHOLDERS.has(s.toLowerCase()) ? null : s;
}

function num(v: Cell): number | null {
  const u = unwrap(v);
  if (typeof u === "number" && Number.isFinite(u)) return u;
  if (typeof u === "string") {
    const s = u.replace(/[$,\s]/g, "");
    if (PLACEHOLDERS.has(s.toLowerCase())) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function date(v: Cell): string | null {
  const u = unwrap(v);
  if (u instanceof Date && !Number.isNaN(u.getTime())) return u.toISOString().slice(0, 10);
  return null;
}

function money(n: number | null): number | null {
  return n === null ? null : Math.round(n * 100) / 100;
}

function rowValues(ws: ExcelJS.Worksheet, r: number, cols: number): Cell[] {
  const row = ws.getRow(r);
  const out: Cell[] = [];
  for (let c = 1; c <= cols; c++) out.push(row.getCell(c).value);
  return out;
}

// ---------------------------------------------------------------------------
// Lot codes / sources
// ---------------------------------------------------------------------------

function inferSourceType(lot: string): string {
  const s = lot.toLowerCase();
  if (/^(\d*h?)?gs\b|^\d+hgs|garage|rummage|yard/.test(s)) return "garage_sale";
  if (/^gw\b|goodwill|savers|deseret|thrift|bins/.test(s)) return "thrift";
  if (/^fbmp\b|marketplace/.test(s)) return "facebook_marketplace";
  if (/^es\b|estate/.test(s)) return "estate_sale";
  // People (family, friends) can't be told apart from places by name; she sets those types in the app.
  return "other";
}

const DATE_SUFFIX = /[-\s]+(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})$/;

function parseLot(lot: string): SourceRow {
  const m = lot.match(DATE_SUFFIX);
  let place: string | null = lot;
  let d: string | null = null;
  if (m) {
    place = lot.slice(0, m.index).trim() || null;
    const yy = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    const mm = Number(m[1]);
    const dd = Number(m[2]);
    if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
      d = `${yy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
    }
  }
  return { lot_code: lot, place, type: inferSourceType(lot), date: d };
}

function shortDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${m}/${d}/${String(y).slice(2)}`;
}

/** "gs #1" -> "GS #1", "GS#1" -> "GS #1". */
function normalizeSourceName(s: string): string {
  return s
    .replace(/^gs\s*#\s*/i, "GS #")
    .replace(/^gs\b/i, "GS")
    .replace(/\blot\s*(\w+)/i, (_m, x: string) => `Lot ${x}`)
    .trim();
}

/** Unlisted tabs store "GS #1" + Date Sourced; Master stores "GS #1-7/26/25". Build the Master form. */
function lotFromSourceAndDate(source: string | null, dateSourced: string | null): string | null {
  if (!source) return null;
  if (DATE_SUFFIX.test(source)) return source;
  const name = normalizeSourceName(source);
  return dateSourced ? `${name}-${shortDate(dateSourced)}` : name;
}

function lotFromCell(v: Cell): string | null {
  const u = unwrap(v);
  if (u instanceof Date) return `?-${shortDate(u.toISOString().slice(0, 10))}`;
  return str(v);
}

// ---------------------------------------------------------------------------
// Main parse
// ---------------------------------------------------------------------------

const MONTH_TAB = /^(jan|feb|mar|apr|may|june?|jul|aug|sep|oct|nov|dec)\w*\s+'(\d\d)$/i;
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

const PLATFORM_CODES: Record<string, string> = {
  ebay: "ebay",
  poshmark: "poshmark",
  mercari: "mercari",
  etsy: "etsy",
  depop: "depop",
  vinted: "vinted",
};

function kindFromCategory(category: string | null): ItemRow["kind"] {
  if (!category) return "general";
  if (/^books?\b/i.test(category)) return "book";
  if (/dvd|media|video gam/i.test(category)) return "media";
  return "general";
}

export async function parseWorkbook(filePath: string): Promise<ParsedWorkbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);

  const report: ImportReport = {
    file: filePath.split(/[\\/]/).pop() ?? filePath,
    tabs: [],
    sources: 0,
    items: 0,
    sales: 0,
    unmatchedSales: [],
    ambiguousMatches: [],
    multiSoldItems: [],
    monthChecks: [],
    notes: [],
  };

  const items: ItemRow[] = [];
  const sales: SaleRow[] = [];
  const expenses: ExpenseRow[] = [];
  const mileage: MileageRow[] = [];
  const writeOffs: WriteOffRow[] = [];
  const lots = new Set<string>();

  const sheet = (name: string) => {
    const ws = wb.getWorksheet(name);
    if (!ws) throw new Error(`Tab not found: "${name}"`);
    return ws;
  };

  // ---- Titles tab: lookups ------------------------------------------------
  const titles = sheet("Titles");
  const lookups: Lookups = {
    categories: [],
    storageLocations: [],
    itemEventActions: [],
    expenseTypes: [],
    platformFees: {},
    mileageRate: null,
  };
  for (let r = 4; r <= titles.rowCount; r++) {
    const v = rowValues(titles, r, 16);
    const cat = str(v[3]);
    const loc = str(v[5]);
    const action = str(v[7]);
    const exp = str(v[9]);
    const plat = str(v[11]);
    const fee = num(v[13]);
    if (cat && !lookups.categories.includes(cat)) lookups.categories.push(cat);
    if (loc && !lookups.storageLocations.some((l) => l.name === loc))
      lookups.storageLocations.push({ name: loc, kind: /^\d+$/.test(loc) ? "bin" : "place" });
    if (action && !/^-+$/.test(action) && !lookups.itemEventActions.includes(action))
      lookups.itemEventActions.push(action);
    if (exp && !/^-+$/.test(exp) && !lookups.expenseTypes.includes(exp)) lookups.expenseTypes.push(exp);
    if (plat && fee !== null && PLATFORM_CODES[plat.toLowerCase()])
      lookups.platformFees[PLATFORM_CODES[plat.toLowerCase()]] = fee;
  }

  // ---- Master Listings ----------------------------------------------------
  {
    const ws = sheet("Master Listings");
    const tab = { tab: ws.name, rowsRead: 0, imported: 0, skipped: [] as { row: number; reason: string }[] };
    for (let r = 5; r <= ws.rowCount; r++) {
      const v = rowValues(ws, r, 10);
      const title = str(v[1]);
      if (!title) continue;
      tab.rowsRead++;
      const category = str(v[2]);
      const sold = (str(v[7]) ?? "").toLowerCase() === "yes";
      const lot = lotFromCell(v[5]);
      if (lot) lots.add(lot);
      items.push({
        import_ref: `${ws.name}!${r}`,
        title,
        kind: kindFromCategory(category),
        category,
        format: null,
        is_bundle: false,
        cost: money(num(v[3])),
        lot_code: lot,
        date_sourced: null,
        storage_location: str(v[6]),
        list_price: null,
        date_listed: date(v[4]),
        status: sold ? "sold" : "listed",
        date_sold: sold ? date(v[9]) : null,
        owner: lot === "Tiffany" ? "Tiffany" : null,
        notes: null,
      });
      tab.imported++;
    }
    report.tabs.push(tab);
  }

  // ---- Unlisted tabs ------------------------------------------------------
  const unlistedTabs: {
    name: string;
    kind: ItemRow["kind"];
    map: (v: Cell[]) => Partial<ItemRow>;
  }[] = [
    {
      name: "Unlisted Inventory",
      kind: "general",
      map: (v) => ({
        category: str(v[1]),
        list_price: money(num(v[5])),
        notes: str(v[6]) ? `Date Listed column: ${str(v[6])}` : null,
        date_listed: date(v[6]),
      }),
    },
    {
      name: "Unlisted Books",
      kind: "book",
      map: (v) => ({ category: "Books", is_bundle: (str(v[1]) ?? "").toLowerCase() === "y", list_price: money(num(v[5])) }),
    },
    {
      name: "DVD,CD,Games",
      kind: "media",
      map: (v) => ({ category: "DVD & Media", format: str(v[1]) }),
    },
  ];
  for (const t of unlistedTabs) {
    const ws = sheet(t.name);
    const tab = { tab: ws.name, rowsRead: 0, imported: 0, skipped: [] as { row: number; reason: string }[] };
    for (let r = 5; r <= ws.rowCount; r++) {
      const v = rowValues(ws, r, 8);
      const title = str(v[0]);
      if (!title) {
        if (v.slice(1, 7).some((c) => str(c) || num(c))) tab.skipped.push({ row: r, reason: "subtotal row (no title)" });
        continue;
      }
      tab.rowsRead++;
      const dateSourced = date(v[3]);
      const lot = lotFromSourceAndDate(str(v[2]), dateSourced);
      if (lot) lots.add(lot);
      const extra = t.map(v);
      items.push({
        import_ref: `${ws.name}!${r}`,
        title,
        kind: t.kind,
        category: null,
        format: null,
        is_bundle: false,
        cost: money(num(v[4])),
        lot_code: lot,
        date_sourced: dateSourced,
        storage_location: null,
        list_price: null,
        date_listed: null,
        status: "unlisted",
        date_sold: null,
        owner: null,
        notes: null,
        ...extra,
      });
      tab.imported++;
    }
    report.tabs.push(tab);
  }

  // ---- Tiffany tab: tag items already in Master, add the rest -------------
  {
    const ws = sheet("Tiffany");
    const tab = { tab: ws.name, rowsRead: 0, imported: 0, skipped: [] as { row: number; reason: string }[] };
    let tagged = 0;
    for (let r = 5; r <= ws.rowCount; r++) {
      const v = rowValues(ws, r, 8);
      const title = str(v[0]);
      if (!title || /^totals?:?$/i.test(title)) continue;
      if (!str(v[1]) && !date(v[2])) continue;
      tab.rowsRead++;
      const sp = money(num(v[5]));
      const platform = str(v[6]);
      const net = money(num(v[7]));
      const note = sp !== null ? `Tiffany tab: sold for $${sp}${platform ? ` on ${platform}` : ""}${net !== null ? `, net $${net}` : ""}` : null;
      const existing = items.find((i) => i.title === title && i.import_ref.startsWith("Master Listings!"));
      if (existing) {
        existing.owner = "Tiffany";
        if (note) existing.notes = note;
        tagged++;
        continue;
      }
      const sold = date(v[3]);
      items.push({
        import_ref: `${ws.name}!${r}`,
        title,
        kind: kindFromCategory(str(v[1])),
        category: str(v[1]),
        format: null,
        is_bundle: false,
        cost: null,
        lot_code: "Tiffany",
        date_sourced: null,
        storage_location: null,
        list_price: money(num(v[4])),
        date_listed: date(v[2]),
        status: sold || sp !== null ? "sold" : "listed",
        date_sold: sold,
        owner: "Tiffany",
        notes: note,
      });
      lots.add("Tiffany");
      tab.imported++;
    }
    report.tabs.push(tab);
    report.notes.push(
      `Tiffany tab: ${tagged} rows matched Master Listings items (tagged owner = Tiffany); ${tab.imported} added as new items. Sale prices from this tab are kept in item notes, not counted as sales, until we know how the Tiffany split works.`
    );
  }

  // ---- Monthly sales tabs -------------------------------------------------
  const byTitle = new Map<string, ItemRow[]>();
  for (const it of items) {
    const list = byTitle.get(it.title) ?? [];
    list.push(it);
    byTitle.set(it.title, list);
  }
  const salesPerItem = new Map<string, number>();
  const sheetSummaries: Record<string, MonthCheck["sheet"]> = {};

  for (const ws of wb.worksheets) {
    const mt = ws.name.trim().match(MONTH_TAB);
    if (!mt) continue;
    const monthIdx = MONTHS.indexOf(mt[1].slice(0, 3).toLowerCase());
    const monthKey = `20${mt[2]}-${String(monthIdx + 1).padStart(2, "0")}`;
    const tab = { tab: ws.name, rowsRead: 0, imported: 0, skipped: [] as { row: number; reason: string }[] };
    const summary: MonthCheck["sheet"] = { count: null, gross: null, adjustedNet: null };

    for (let r = 5; r <= ws.rowCount; r++) {
      const v = rowValues(ws, r, 21);
      // Summary block (columns R..U); its row offset differs by month (August sits one row higher)
      for (const [labelCol, valCol] of [[17, 18], [19, 20]]) {
        const label = (str(v[labelCol]) ?? "").toLowerCase();
        const val = num(v[valCol]);
        if (label === "number of sales") summary.count = val;
        else if (label === "gross sales") summary.gross = val;
        else if (label === "net adjusted profit") summary.adjustedNet = val;
      }

      const title = str(v[1]);
      if (!title) continue;
      tab.rowsRead++;
      const soldDate = date(v[6]);
      if (!soldDate) {
        tab.skipped.push({ row: r, reason: "no Date Sold" });
        continue;
      }
      const platRaw = (str(v[7]) ?? "").toLowerCase();
      const platform = PLATFORM_CODES[platRaw] ?? "other";
      if (platform === "other") report.notes.push(`${ws.name} row ${r}: unknown platform "${str(v[7])}", saved as Other`);

      const ref = `${ws.name}!${r}`;
      const candidates = byTitle.get(title) ?? [];
      let match: ItemRow | null = null;
      if (candidates.length === 1) match = candidates[0];
      else if (candidates.length > 1) {
        match =
          candidates.find((c) => c.date_sold === soldDate && !salesPerItem.has(c.import_ref)) ??
          candidates.find((c) => c.status === "sold" && !salesPerItem.has(c.import_ref)) ??
          candidates.find((c) => !salesPerItem.has(c.import_ref)) ??
          candidates[0];
        report.ambiguousMatches.push({ ref, title, candidates: candidates.length });
      } else {
        report.unmatchedSales.push({ ref, title });
      }
      if (match) salesPerItem.set(match.import_ref, (salesPerItem.get(match.import_ref) ?? 0) + 1);

      const category = str(v[2]);
      const lot = lotFromCell(v[3]);
      sales.push({
        import_ref: ref,
        item_ref: match?.import_ref ?? null,
        platform,
        title_snapshot: title,
        category_snapshot: category && category !== "0" ? category : null,
        lot_code_snapshot: lot,
        sold_date: soldDate,
        gross: money(num(v[9])) ?? 0,
        shipping_cost: money(num(v[10])) ?? 0,
        fees: money(num(v[11])) ?? 0,
        fee_rate: num(v[8]),
        cogs: money(num(v[4])),
        adjustments: money(num(v[13])) ?? 0,
        return_charges: money(num(v[14])) ?? 0,
        sheet_adjusted_net: num(v[15]),
      });
      tab.imported++;
    }
    sheetSummaries[monthKey] = summary;
    report.tabs.push(tab);
  }

  for (const [ref, n] of salesPerItem) {
    if (n > 1) report.multiSoldItems.push({ title: items.find((i) => i.import_ref === ref)!.title, sales: n });
  }

  // Month-by-month check against her own summary blocks
  const byMonth = new Map<string, { count: number; gross: number; adjustedNet: number }>();
  for (const s of sales) {
    const k = s.sold_date.slice(0, 7);
    const agg = byMonth.get(k) ?? { count: 0, gross: 0, adjustedNet: 0 };
    agg.count++;
    agg.gross += s.gross;
    agg.adjustedNet += s.gross - s.shipping_cost - s.fees - (s.cogs ?? 0) - s.adjustments - s.return_charges;
    byMonth.set(k, agg);
  }
  for (const [month, sheetVals] of Object.entries(sheetSummaries).sort()) {
    const imp = byMonth.get(month) ?? { count: 0, gross: 0, adjustedNet: 0 };
    const close = (a: number | null, b: number) => a === null || Math.abs(a - b) < 0.05 + Math.abs(a) * 0.0005;
    if (!sheetVals.count && imp.count === 0) continue;
    report.monthChecks.push({
      month,
      sheet: sheetVals,
      imported: { count: imp.count, gross: round2(imp.gross), adjustedNet: round2(imp.adjustedNet) },
      ok: (sheetVals.count === null || sheetVals.count === imp.count) && close(sheetVals.gross, imp.gross) && close(sheetVals.adjustedNet, imp.adjustedNet),
    });
  }

  // ---- Expenses tab -------------------------------------------------------
  {
    const ws = sheet("Expenses");
    const tab = { tab: ws.name, rowsRead: 0, imported: 0, skipped: [] as { row: number; reason: string }[] };
    lookups.mileageRate = num(rowValues(ws, 1, 10)[9]);
    for (let r = 5; r <= ws.rowCount; r++) {
      const v = rowValues(ws, r, 16);
      // Expense tracker: B..F
      const desc = str(v[1]);
      const amt = num(v[4]);
      if (desc || amt) {
        tab.rowsRead++;
        const d = date(v[3]);
        if (desc && amt !== null && d) {
          expenses.push({ import_ref: `${ws.name}!${r}!expense`, date: d, description: desc, type: str(v[2]) ?? "Other", amount: money(amt)!, notes: null });
          tab.imported++;
        } else if (amt) tab.skipped.push({ row: r, reason: "expense missing description, date or amount" });
      }
      // Mileage: H..K
      const mDate = date(v[7]);
      const miles = num(v[8]);
      if (mDate && miles) {
        tab.rowsRead++;
        mileage.push({ import_ref: `${ws.name}!${r}!mileage`, date: mDate, miles, rate: lookups.mileageRate ?? 0.725, purpose: str(v[10]) });
        tab.imported++;
      }
      // Bills & other: M..P
      const bDate = date(v[12]);
      const bDesc = str(v[13]);
      const bAmt = num(v[14]);
      if (bDate && bDesc && bAmt) {
        tab.rowsRead++;
        expenses.push({ import_ref: `${ws.name}!${r}!bill`, date: bDate, description: bDesc, type: "Bills", amount: money(bAmt)!, notes: str(v[15]) });
        tab.imported++;
      }
    }
    report.tabs.push(tab);
  }

  // ---- Damages tab --------------------------------------------------------
  {
    const ws = sheet("Damages");
    const tab = { tab: ws.name, rowsRead: 0, imported: 0, skipped: [] as { row: number; reason: string }[] };
    for (let r = 2; r <= ws.rowCount; r++) {
      const v = rowValues(ws, r, 6);
      const title = str(v[0]);
      if (!title) continue;
      tab.rowsRead++;
      const d = date(v[3]);
      if (!d) {
        tab.skipped.push({ row: r, reason: "no Date Damaged" });
        continue;
      }
      const match = (byTitle.get(title) ?? []).find((i) => i.status === "unlisted" || i.status === "listed") ?? null;
      if (match) match.status = "damaged";
      writeOffs.push({
        import_ref: `${ws.name}!${r}`,
        item_ref: match?.import_ref ?? null,
        title_snapshot: title,
        date_purchased: date(v[1]),
        date: d,
        value: money(num(v[5])) ?? 0,
      });
      tab.imported++;
    }
    report.tabs.push(tab);
  }

  // ---- Lookups seen in the data -------------------------------------------
  for (const it of items) {
    if (it.category && !lookups.categories.includes(it.category)) lookups.categories.push(it.category);
    const loc = it.storage_location;
    if (loc && !lookups.storageLocations.some((l) => l.name === loc))
      lookups.storageLocations.push({ name: loc, kind: /^\d+$/.test(loc) ? "bin" : "place" });
  }

  const sources = [...lots].sort().map(parseLot);
  report.sources = sources.length;
  report.items = items.length;
  report.sales = sales.length;
  report.notes.push(
    `Storage locations: ${lookups.storageLocations.length} distinct (${lookups.storageLocations.filter((l) => l.kind === "bin").length} numbered bins). Kept exactly as written.`
  );
  report.notes.push(`Placeholders (".", "?", blank) were saved as unknown, not zero.`);

  return { sources, items, sales, expenses, mileage, writeOffs, lookups, report };
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export function reportToMarkdown(r: ImportReport): string {
  const lines: string[] = [];
  lines.push(`# Import report`, ``, `File: ${r.file}  `, `Run: ${new Date().toISOString()}`, ``);
  lines.push(`**${r.items} items, ${r.sales} sales, ${r.sources} sourcing trips.**`, ``);
  lines.push(`## Rows per tab`, ``, `| Tab | Rows read | Imported | Skipped |`, `| --- | ---: | ---: | ---: |`);
  for (const t of r.tabs) lines.push(`| ${t.tab} | ${t.rowsRead} | ${t.imported} | ${t.skipped.length} |`);
  lines.push(``, `## Monthly totals vs. her summary blocks`, ``);
  lines.push(`| Month | Sales (sheet / import) | Gross (sheet / import) | Adjusted net (sheet / import) | OK |`, `| --- | --- | --- | --- | --- |`);
  for (const m of r.monthChecks) {
    const f = (n: number | null) => (n === null ? "?" : n.toFixed(2));
    lines.push(
      `| ${m.month} | ${m.sheet.count ?? "?"} / ${m.imported.count} | ${f(m.sheet.gross)} / ${m.imported.gross.toFixed(2)} | ${f(m.sheet.adjustedNet)} / ${m.imported.adjustedNet.toFixed(2)} | ${m.ok ? "yes" : "**CHECK**"} |`
    );
  }
  lines.push(``, `## Sales that did not match a listing (${r.unmatchedSales.length})`, ``);
  if (!r.unmatchedSales.length) lines.push(`None.`);
  for (const u of r.unmatchedSales) lines.push(`- ${u.ref}: ${u.title}`);
  lines.push(``, `## Titles listed more than once (${r.ambiguousMatches.length} sales)`, ``);
  lines.push(`These sales matched one of several items with the exact same title. Worth a glance.`, ``);
  for (const a of r.ambiguousMatches) lines.push(`- ${a.ref}: ${a.title} (${a.candidates} items)`);
  lines.push(``, `## Items with more than one sale (${r.multiSoldItems.length})`, ``);
  lines.push(`Probably multi-quantity listings. Each sale is kept; all point at the same item.`, ``);
  for (const m of r.multiSoldItems) lines.push(`- ${m.title}: ${m.sales} sales`);
  lines.push(``, `## Skipped rows`, ``);
  for (const t of r.tabs) for (const s of t.skipped) lines.push(`- ${t.tab} row ${s.row}: ${s.reason}`);
  lines.push(``, `## Notes`, ``);
  for (const n of r.notes) lines.push(`- ${n}`);
  return lines.join("\n") + "\n";
}
