import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTaxSummary, taxRows } from "@/lib/data/taxes";

function csv(rows: (string | number | null | undefined)[][]) {
  return rows
    .map((r) =>
      r
        .map((v) => {
          const s = v === null || v === undefined ? "" : String(v);
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(",")
    )
    .join("\r\n");
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const { data: member } = claims?.claims?.sub
    ? await supabase.from("members").select("user_id").eq("user_id", claims.claims.sub).maybeSingle()
    : { data: null };
  if (!member) return new NextResponse("Not signed in", { status: 401 });

  const year = Number(request.nextUrl.searchParams.get("y")) || new Date().getFullYear();
  const kind = request.nextUrl.searchParams.get("kind") === "sales" ? "sales" : "summary";
  let body: string;

  if (kind === "summary") {
    const t = await getTaxSummary(supabase, year);
    const { data: platforms } = await supabase.from("platforms").select("code, name");
    const names = Object.fromEntries((platforms ?? []).map((p) => [p.code, p.name]));
    body = csv([["Figure", "Amount", "Note"], ...taxRows(t, names).map(([l, v, n]) => [l.trim(), typeof v === "number" ? v.toFixed(2) : v, n])]);
  } else {
    const rows: (string | number | null)[][] = [];
    for (let from = 0; ; from += 1000) {
      const { data } = await supabase
        .from("sales_view")
        .select("sold_date, platform, title, category, lot_code, gross, shipping_cost, fees, fee_is_estimate, cogs, adjustments, return_charges, adjusted_net, order_id")
        .gte("sold_date", `${year}-01-01`)
        .lte("sold_date", `${year}-12-31`)
        .neq("fulfillment_status", "cancelled")
        .order("sold_date")
        .range(from, from + 999);
      for (const s of data ?? [])
        rows.push([s.sold_date, s.platform, s.title, s.category, s.lot_code, s.gross, s.shipping_cost, s.fees, s.fee_is_estimate ? "estimated" : "actual", s.cogs, s.adjustments, s.return_charges, s.adjusted_net, s.order_id]);
      if ((data ?? []).length < 1000) break;
    }
    body = csv([
      ["Date sold", "Platform", "Title", "Category", "Lot", "Gross", "Shipping paid", "Fees", "Fees are", "COGS", "Adjustments", "Return charges", "Net", "Order #"],
      ...rows,
    ]);
  }

  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="sale-away-${year}-${kind}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
