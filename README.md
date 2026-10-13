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
