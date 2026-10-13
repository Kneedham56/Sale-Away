-- Phase 2: AI listing fields, prompts in settings, eBay account-deletion support

-- What a reviewed listing needs (filled by the AI, edited and accepted by her)
alter table public.items
  add column listing_description text,
  add column condition_text text,
  add column item_specifics jsonb,           -- [{ "name": "Brand", "value": "Vera Bradley" }, ...]
  add column ebay_category_id text,
  add column ebay_category_name text,
  add column price_low numeric(10, 2),
  add column price_high numeric(10, 2),
  add column ai_decision text check (ai_decision in ('KEEP', 'DONATE')),
  add column intake_title text;             -- her original short description, kept when the AI title replaces it

-- Recreate items_view so it picks up the new columns
drop view public.items_view;
create view public.items_view with (security_invoker = true) as
select
  i.*,
  src.lot_code,
  src.place as source_place,
  case
    when i.date_listed is null then null
    else coalesce(i.date_sold, (now() at time zone 'America/Los_Angeles')::date) - i.date_listed
  end as days_active,
  (select p.thumb_path from public.item_photos p where p.item_id = i.id order by p.sort_order, p.created_at limit 1) as thumb_path,
  (select count(*) from public.item_photos p where p.item_id = i.id) as photo_count
from public.items i
left join public.sources src on src.id = i.source_id;

-- Buyer's eBay username, so an account-deletion notice can find and erase their details
alter table public.sales add column buyer_username text;
create index sales_buyer_username_idx on public.sales (buyer_username);

-- AI run status for batch generation
alter table public.ai_runs add column error text;
create index ai_runs_item_idx on public.ai_runs (item_id, created_at desc);

-- Log of eBay marketplace account-deletion notices (no personal data kept)
create table public.ebay_deletion_notices (
  id uuid primary key default gen_random_uuid(),
  received_at timestamptz not null default now(),
  notification_id text unique,
  ebay_user_id text,
  rows_scrubbed int not null default 0
);
alter table public.ebay_deletion_notices enable row level security;
create policy members_read on public.ebay_deletion_notices for select to authenticated using (public.is_member());
