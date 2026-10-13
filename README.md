# Sale Away With Me

A phone-first web app to log, list, ship and reconcile everything mommatom sells. See [docs/PLAN.md](docs/PLAN.md).

## Setup

1. `npm install`
2. Copy `.env.example` to `.env.local` and fill it in (Supabase dashboard > Project Settings > API Keys, and Connect > Session pooler).
3. `npm run db:migrate`
4. `npm run add-member -- you@example.com "Your Name" admin`, then `npm run set-password -- you@example.com`
5. `npm run import -- "data/2026 Reseller Inventory Tracking.xlsx"` to check the report, then again with `--apply`.
6. `npm run dev` and open http://localhost:3000

Her spreadsheet and the import report live in `data/`, which is never committed.

## eBay (Phases 3-4)

1. In the eBay developer portal, create keysets (sandbox and production) and a RuName whose
   "auth accepted URL" is `https://sale-away.vercel.app/api/ebay/callback`.
2. Production keys also need the marketplace account-deletion endpoint:
   `https://sale-away.vercel.app/api/ebay/account-deletion` with the `EBAY_VERIFICATION_TOKEN` value.
3. Set the `EBAY_*` variables (see `.env.example`) on Vercel, switch `EBAY_ENV`, redeploy, then Settings > eBay > Connect.
4. For 15-minute order sync, add repository secrets `APP_URL` and `CRON_SECRET` (same value as on Vercel).
5. Turn on publishing with `EBAY_WRITE_ENABLED=true` and reconnect (adds the listing permission).
