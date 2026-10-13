// AI eval (Phase 2 gate): run the listing prompt on items she already sold and compare with what happened.
//
//   npm run ai-eval -- [count=20] [model]
//
// Uses her real titles as the item notes (imported items have no photos), so it measures pricing and
// KEEP/DONATE judgment from a description. Report: data/ai-eval.md (gitignored).
import { config } from "dotenv";
import { writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { DEFAULT_LISTING_PROMPT, DEFAULT_STORE_RULES, fillListingPrompt } from "../src/lib/ai/prompts";
import { normalizeListing } from "../src/lib/ai/parse";
import { LISTING_SCHEMA } from "../src/lib/ai/types";

config({ path: ".env.local", quiet: true });
const count = Number(process.argv[2]) || 20;
const model = process.argv[3] || "gemini-flash-latest";

async function gemini(prompt: string) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": process.env.GEMINI_API_KEY!, "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json", responseSchema: LISTING_SCHEMA, temperature: 0.4 },
    }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
  return JSON.parse(body.candidates[0].content.parts.map((p: { text: string }) => p.text).join(""));
}

async function main() {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
  const { data } = await db
    .from("sales_view")
    .select("title, category, gross, sold_date, date_listed, cogs, platform")
    .eq("platform", "ebay")
    .not("item_id", "is", null)
    .gte("sold_date", "2026-01-01")
    .limit(1000);
  // Spread across the price range: sort by price and take evenly spaced sales
  const all = (data ?? []).filter((s) => s.title).sort((a, b) => Number(a.gross) - Number(b.gross));
  const step = Math.max(1, Math.floor(all.length / count));
  const sample = all.filter((_, i) => i % step === 0).slice(0, count);

  const rows: string[] = [];
  const errors: number[] = [];
  let decisionsRight = 0;
  for (const [i, s] of sample.entries()) {
    const prompt = fillListingPrompt(
      DEFAULT_LISTING_PROMPT,
      { title: s.title, kind: "general", category: s.category, format: null, is_bundle: false, condition: null, condition_grade: null, condition_notes: null, cost: s.cogs === null ? null : Number(s.cogs) },
      DEFAULT_STORE_RULES
    );
    try {
      const t0 = Date.now();
      const out = normalizeListing(await gemini(prompt));
      const actual = Number(s.gross);
      const days = s.date_listed ? (new Date(s.sold_date).getTime() - new Date(s.date_listed).getTime()) / 86400_000 : null;
      // What actually happened under her rule: DONATE only if <= $20 AND it took more than 45 days
      const actualDecision = actual <= 20 && days !== null && days > 45 ? "DONATE" : "KEEP";
      const pctErr = out.price ? Math.abs(out.price - actual) / actual : null;
      if (pctErr !== null) errors.push(pctErr);
      if (out.decision === actualDecision) decisionsRight++;
      rows.push(
        `| ${s.title.slice(0, 60).replace(/\|/g, "/")} | $${actual.toFixed(2)} | ${out.price === null ? "?" : `$${out.price.toFixed(2)}`} | ${pctErr === null ? "?" : `${Math.round(pctErr * 100)}%`} | ${out.decision} / ${actualDecision}${days !== null ? ` (${Math.round(days)}d)` : ""} | ${out.confidence} |`
      );
      console.log(`${i + 1}/${sample.length} ${Math.round((Date.now() - t0) / 1000)}s  actual $${actual}  ai $${out.price}`);
    } catch (e) {
      rows.push(`| ${s.title.slice(0, 60)} | $${Number(s.gross).toFixed(2)} | error | | | ${e instanceof Error ? e.message.slice(0, 60) : e} |`);
      console.log(`${i + 1}/${sample.length} error`, e instanceof Error ? e.message : e);
      await new Promise((r) => setTimeout(r, 20_000));
    }
  }
  errors.sort((a, b) => a - b);
  const median = errors.length ? errors[Math.floor(errors.length / 2)] : null;
  const within25 = errors.filter((e) => e <= 0.25).length;
  const md = [
    `# AI eval`,
    ``,
    `Model: ${model} · ${sample.length} eBay sales from 2026 · text only (her titles, no photos) · run ${new Date().toISOString()}`,
    ``,
    `- Median price error: **${median === null ? "?" : `${Math.round(median * 100)}%`}**`,
    `- Within 25% of the actual sale: **${within25} of ${errors.length}**`,
    `- KEEP/DONATE matched what happened: **${decisionsRight} of ${sample.length}**`,
    ``,
    `Note: the AI suggests a *list* price set above the expected sale price to leave room for offers, so a positive bias is expected.`,
    ``,
    `| Item | Sold for | AI price | Error | AI / actual decision | Confidence |`,
    `| --- | ---: | ---: | ---: | --- | --- |`,
    ...rows,
  ].join("\n");
  writeFileSync("data/ai-eval.md", md + "\n");
  console.log(`\nMedian error ${median === null ? "?" : Math.round(median * 100) + "%"}, decisions ${decisionsRight}/${sample.length}. Report: data/ai-eval.md`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
