# Sale Away With Me

Phone-first reseller app for mommatom (eBay + Mercari/Poshmark/Depop/Vinted/Etsy). Replaces her Excel tracker.
The full plan is `docs/PLAN.md`. Build one phase at a time and stop at each gate for Doc's review.

@AGENTS.md

## Stack

- Next.js 16 (App Router, TypeScript, Turbopack, Cache Components on) on Vercel
- Supabase: Postgres + Auth (email + password per member) + Storage (`item-photos` bucket, private)
- Tailwind v4; theme tokens in `src/app/globals.css` (`bg`, `surface`, `fg`, `muted`, `border`, `accent`, `coral`, `danger`, `ok`)
- PWA: `src/app/manifest.ts`, `public/sw.js` (no page/data caching), icons in `public/icons` (`npm run icons`)

## Commands

- `npm run dev` / `npm run build` / `npm run lint` / `npm run typecheck`
- `npm run db:migrate`: applies `supabase/migrations/*.sql` once each (needs `SUPABASE_DB_URL`)
- `npm run add-member -- email "Name" [seller|admin]`: creates a login and adds it to `members`
- `npm run set-password -- email`: prompts (hidden) and sets that member's password
- `npm run import -- "data/<file>.xlsx" [--apply]`: spreadsheet import; dry run writes `data/import-report.md`

## Conventions

- **Never commit anything under `/data`**, the spreadsheet, exports, or credentials. `.env.local` holds secrets.
- Next 16 renamed middleware to `src/proxy.ts`. With Cache Components, anything reading cookies (auth, Supabase queries)
  must render inside `<Suspense>`; `(app)/loading.tsx` gives every page its own boundary.
- Pages call `requireMember()` (`src/lib/auth.ts`) first. RLS allows only rows in `members`.
- `createClient()` from `@/lib/supabase/server` acts as the user; `createAdminClient()` bypasses RLS and is for
  server jobs only (eBay tokens, cron, account deletion).
- Dates are her local (Las Vegas) dates: use `todayIso()` from `src/lib/dates.ts`, never `new Date()` in renders.
- Unknown values are `null`, never 0 (cost, category, etc.). Money is `numeric(10,2)`.
- Net profit, days active and monthly totals are computed in views (`sales_view`, `items_view`, `monthly_summary`).
- Schema changes: add a new timestamped file in `supabase/migrations/`; never edit an applied one.
- All eBay calls will go through one `EbayClient` interface (`EBAY_ENV` = mock | sandbox | production).
- AI goes through one `suggestListing()`; the AI never publishes.
