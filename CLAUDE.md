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
- `npm run add-member -- email "Name" [seller|admin] [--business "Name"]`: creates a login (and a new business it owns)
- `npm run set-password -- email`: prompts (hidden) and sets that member's password
- `npm run import -- "data/<file>.xlsx" [--apply --business "Name"]`: spreadsheet import; dry run writes `data/import-report.md`
- `npm run db:snapshot -- [name]` / `npm run db:restore -- <file> [--business "Name"] [--photos]`: save and put back app data
  (whole database, or reset one business)
  (`data/snapshots/`, gitignored; logins and the eBay connection are never touched)
- `npm test`: node:test suites in `tests/` (run with the react-server condition so `server-only` modules load)
- `npm run ai-eval -- [count] [model]`: prices N sold items with the listing prompt; report in `data/ai-eval.md`

## Layout

- `src/app/(app)/`: signed-in screens (Home, add, unlisted, listed, items/[id], items/[id]/sell, sold, sales/[id], outgoing,
  trips, expenses, taxes (+ CSV export route), reports, settings, more). Server actions live in `actions.ts` beside each feature.
- `src/lib/data/`: server data helpers (lookups, lot-code generator `createSource`, tax summary).
- `src/lib/photo-upload.ts`: phone-side JPEG + thumbnail and retrying uploads to `item-photos/<itemId>/`.
- Report views and `tax_summary()` are in `supabase/migrations/20261013000001_phase1_reports.sql`.
- `src/lib/ai/`: prompts (defaults; editable copies live in `settings`), Gemini REST call, JSON schema, tolerant parsers
  for Copy Prompt answers, `suggestListing()` / `quickCheck()` (every run logged in `ai_runs`).
- `src/lib/ebay/`: `EbayClient` (rest + mock, chosen by `EBAY_ENV`), OAuth tokens (refresh token AES-GCM encrypted with
  `EBAY_TOKEN_KEY`), `sync.ts` (orders -> sales, finances -> actual fees/labels/refunds), `publish.ts` (Inventory API),
  `status.ts` (banners + background sync via `after()` when the last sync is >15 min old).
- API routes: `/api/ebay/connect|callback` (OAuth), `/api/ebay/account-deletion` (public, signature-verified),
  `/api/cron/ebay-sync` (Bearer `CRON_SECRET`; Vercel daily cron + `.github/workflows/ebay-sync.yml` every 15 min).

## Conventions

- **Never commit anything under `/data`**, the spreadsheet, exports, or credentials. `.env.local` holds secrets.
- Next 16 renamed middleware to `src/proxy.ts`. With Cache Components, anything reading cookies (auth, Supabase queries)
  must render inside `<Suspense>`. Every route folder under `(app)` has a `loading.tsx` (re-exporting `(app)/loading.tsx`);
  add one for each new route or instant-navigation validation errors appear. The nav reads `usePathname()` inside Suspense.
- **Businesses (workspaces):** every data table has `workspace_id`. The active business id lives in the `sa_ws` cookie and is
  sent as the `x-workspace-id` header by `createClient()`; RLS (`request_workspace()` + `can_access()`) limits every query to
  that business and new rows default to it, so user-client code never sets `workspace_id`. Code using
  `createAdminClient()` bypasses RLS and MUST filter/stamp `workspace_id` itself (eBay sync, tokens, cron, scripts).
  Photos live at `item-photos/<workspace_id>/<item_id>/...` (storage policy checks the first folder).
- Pages call `requireMember()` (`src/lib/auth.ts`) first; it returns the member, the active `workspace` and all
  `workspaces`. Admins (Doc) belong to every business; `/businesses` switches (`/api/workspace?id=`) and creates them.
- Upsert conflict targets include `workspace_id` (e.g. `workspace_id,key`, `workspace_id,name`).
- `createClient()` from `@/lib/supabase/server` acts as the user; `createAdminClient()` bypasses RLS and is for
  server jobs only (eBay tokens, cron, account deletion).
- Dates are her local (Las Vegas) dates: use `todayIso()` from `src/lib/dates.ts`, never `new Date()` in renders.
- Mutations: server actions return `ActionResult` via `attempt()` (`src/lib/form.ts`) and call `refresh()`.
- Unknown values are `null`, never 0 (cost, category, etc.). Money is `numeric(10,2)`.
- Net profit, days active and monthly totals are computed in views (`sales_view`, `items_view`, `monthly_summary`).
- Schema changes: add a new timestamped file in `supabase/migrations/`; never edit an applied one.
- All eBay calls go through `getEbayClient()` (`EBAY_ENV` = mock | sandbox | production). Mock never writes her data
  (sync and publish are previews); sandbox sales are stored with `environment = 'sandbox'` and excluded by `sales_view`,
  so always read sales through `sales_view` (or filter `environment`). Publishing needs `EBAY_WRITE_ENABLED=true`.
- Every eBay write is logged to `activity_log`. Buyer names/addresses are scrubbed 30 days after shipping.
- AI goes through `suggestListing()`; it only fills fields. She accepts (item -> Ready to List); the AI never publishes.
