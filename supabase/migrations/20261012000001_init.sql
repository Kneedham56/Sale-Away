-- Sale Away With Me: initial schema (Phase 0)
-- One items table with a status replaces the Unlisted, Master Listings and monthly tabs.
-- Computed numbers (net profit, days active, monthly totals) live in views, not columns.

create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------------
-- Members: the only people who can see anything (mommatom and Doc)
-- ---------------------------------------------------------------------------
create table public.members (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  display_name text not null,
  role text not null default 'seller' check (role in ('seller', 'admin')),
  created_at timestamptz not null default now()
);

create or replace function public.is_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.members m where m.user_id = auth.uid());
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Lookups (from the Titles tab)
-- ---------------------------------------------------------------------------
create table public.categories (
  name text primary key,
  sort_order int not null default 0
);

create table public.storage_locations (
  name text primary key,
  kind text not null default 'place' check (kind in ('bin', 'place')),
  notes text
);

create table public.platforms (
  code text primary key,                 -- ebay, poshmark, mercari, etsy, depop, vinted, other
  name text not null,
  fee_rate numeric(6, 4) not null default 0,
  active boolean not null default true,
  sort_order int not null default 0
);

create table public.settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Sourcing trips (her notebook + the Lot / Source columns)
-- ---------------------------------------------------------------------------
create table public.sources (
  id uuid primary key default gen_random_uuid(),
  lot_code text not null unique,         -- e.g. "GS #4-10/3/26"
  place text,
  type text not null default 'other'
    check (type in ('garage_sale', 'thrift', 'facebook_marketplace', 'estate_sale', 'person', 'online', 'other')),
  date date,
  total_spent numeric(10, 2),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger sources_updated_at before update on public.sources
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Items: every thing she owns to sell, through its whole life
-- ---------------------------------------------------------------------------
create type public.item_status as enum (
  'intake', 'unlisted', 'ready_to_list', 'listed', 'sold', 'shipped',
  'donated', 'damaged', 'kept'
);

create table public.items (
  id uuid primary key default gen_random_uuid(),
  item_number bigint generated always as identity unique,  -- short human reference
  title text not null,
  kind text not null default 'general' check (kind in ('general', 'book', 'media')),
  category text,
  format text,                           -- DVD, CD, VHS, game ... (media)
  is_bundle boolean not null default false,
  condition text check (condition in ('new', 'pre_owned')),
  condition_grade text check (condition_grade in ('excellent', 'good', 'acceptable')),
  condition_notes text,
  cost numeric(10, 2),                   -- COG; null = unknown (not zero)
  source_id uuid references public.sources (id) on delete set null,
  date_sourced date,
  storage_location text,
  list_price numeric(10, 2),
  date_listed date,
  status public.item_status not null default 'unlisted',
  date_sold date,
  owner text,                            -- null = hers; e.g. 'Tiffany' for items sold for someone else
  weight_oz numeric(8, 2),
  length_in numeric(6, 2),
  width_in numeric(6, 2),
  height_in numeric(6, 2),
  shipping_policy_id text,
  sku text,
  ebay_item_id text,                     -- legacy listing id (Seller Hub listings)
  ebay_offer_id text,
  notes text,
  import_ref text unique,                -- "<tab>!<row>" so the import is rerunnable
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index items_status_idx on public.items (status);
create index items_source_idx on public.items (source_id);
create index items_title_trgm_idx on public.items using gin (title gin_trgm_ops);
create index items_storage_idx on public.items (storage_location);
create index items_sku_idx on public.items (sku);
create index items_ebay_item_idx on public.items (ebay_item_id);
create trigger items_updated_at before update on public.items
  for each row execute function public.set_updated_at();

create table public.item_photos (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items (id) on delete cascade,
  storage_path text not null,            -- original upload in the item-photos bucket
  jpeg_path text,                        -- converted JPEG (~1600px long edge)
  thumb_path text,
  sort_order int not null default 0,
  ebay_picture_url text,
  ebay_picture_expires_at timestamptz,
  created_at timestamptz not null default now()
);
create index item_photos_item_idx on public.item_photos (item_id, sort_order);

create table public.item_events (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items (id) on delete cascade,
  action text not null,                  -- Reduced Price, Relisted, Revised, Changed Photos, Removed, Status Changed ...
  date date not null default current_date,
  note text,
  old_value text,
  new_value text,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index item_events_item_idx on public.item_events (item_id, date desc);

-- ---------------------------------------------------------------------------
-- Sales (the twelve monthly tabs)
-- ---------------------------------------------------------------------------
create table public.sales (
  id uuid primary key default gen_random_uuid(),
  item_id uuid references public.items (id) on delete set null,  -- null until matched
  platform text not null references public.platforms (code),
  order_id text,
  line_item_id text,
  title_snapshot text,                   -- title as sold; used for matching and for unmatched rows
  category_snapshot text,
  lot_code_snapshot text,
  sold_date date not null,
  quantity int not null default 1,
  gross numeric(10, 2) not null default 0,
  shipping_cost numeric(10, 2) not null default 0,   -- shipping she paid (label)
  fees numeric(10, 2) not null default 0,
  fee_rate numeric(6, 4),                -- rate used when fees are estimated
  fee_is_estimate boolean not null default true,
  cogs numeric(10, 2),                   -- cost of the item(s) sold; null = unknown
  adjustments numeric(10, 2) not null default 0,     -- subtracted from net (negative = credit)
  return_charges numeric(10, 2) not null default 0,
  buyer_name text,
  ship_to jsonb,
  ship_by date,
  shipping_service text,
  tracking_number text,
  fulfillment_status text not null default 'to_ship'
    check (fulfillment_status in ('to_ship', 'packed', 'shipped', 'delivered', 'cancelled', 'returned')),
  notes text,
  import_ref text unique,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (platform, order_id, line_item_id)
);
create index sales_sold_date_idx on public.sales (sold_date);
create index sales_item_idx on public.sales (item_id);
create index sales_fulfillment_idx on public.sales (fulfillment_status);
create trigger sales_updated_at before update on public.sales
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Expenses, mileage, write-offs (Expenses and Damages tabs)
-- ---------------------------------------------------------------------------
create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  description text not null,
  type text not null default 'Business Expense',  -- Business Expense, Equipment or Tools, Packaging Material, Other, Bills
  amount numeric(10, 2) not null,
  notes text,
  import_ref text unique,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index expenses_date_idx on public.expenses (date);

create table public.mileage (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  miles numeric(8, 1) not null,
  rate numeric(6, 4) not null,           -- copied from settings at entry time
  purpose text,
  source_id uuid references public.sources (id) on delete set null,
  import_ref text unique,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index mileage_date_idx on public.mileage (date);

create table public.write_offs (
  id uuid primary key default gen_random_uuid(),
  item_id uuid references public.items (id) on delete set null,
  title_snapshot text,
  date_purchased date,
  date date not null,
  value numeric(10, 2) not null default 0,
  reason text,
  import_ref text unique,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- AI runs, eBay connection, activity log, import runs
-- ---------------------------------------------------------------------------
create table public.ai_runs (
  id uuid primary key default gen_random_uuid(),
  item_id uuid references public.items (id) on delete set null,
  mode text not null check (mode in ('listing', 'quick_check')),
  provider text not null,                -- copy_prompt, gemini, anthropic, openai
  model text,
  inputs jsonb,
  output jsonb,
  input_tokens int,
  output_tokens int,
  cost_usd numeric(10, 5),
  accepted boolean,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

-- Server-only: no RLS policies, so only the secret key can read it.
create table public.ebay_connection (
  id uuid primary key default gen_random_uuid(),
  ebay_user_id text,
  environment text not null check (environment in ('sandbox', 'production')),
  refresh_token_encrypted text not null,
  refresh_token_expires_at timestamptz,
  scopes text[] not null default '{}',
  connected_by uuid references auth.users (id) on delete set null,
  connected_at timestamptz not null default now(),
  unique (environment)
);

create table public.activity_log (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),
  actor uuid references auth.users (id) on delete set null,
  action text not null,
  detail jsonb
);
create index activity_log_at_idx on public.activity_log (at desc);

create table public.import_runs (
  id uuid primary key default gen_random_uuid(),
  ran_at timestamptz not null default now(),
  file_name text,
  report jsonb not null
);

-- ---------------------------------------------------------------------------
-- Views (security_invoker so RLS applies to the caller)
-- ---------------------------------------------------------------------------
create view public.sales_view with (security_invoker = true) as
select
  s.*,
  coalesce(i.title, s.title_snapshot) as title,
  coalesce(i.category, s.category_snapshot) as category,
  i.storage_location,
  i.date_listed,
  i.owner,
  coalesce(src.lot_code, s.lot_code_snapshot) as lot_code,
  i.source_id,
  date_trunc('month', s.sold_date)::date as month,
  (s.gross - s.shipping_cost - s.fees - coalesce(s.cogs, 0)) as net,
  (s.gross - s.shipping_cost - s.fees - coalesce(s.cogs, 0) - s.adjustments - s.return_charges) as adjusted_net
from public.sales s
left join public.items i on i.id = s.item_id
left join public.sources src on src.id = i.source_id;

create view public.items_view with (security_invoker = true) as
select
  i.*,
  src.lot_code,
  src.place as source_place,
  case
    when i.date_listed is null then null
    else coalesce(i.date_sold, current_date) - i.date_listed
  end as days_active,
  (select p.thumb_path from public.item_photos p where p.item_id = i.id order by p.sort_order limit 1) as thumb_path
from public.items i
left join public.sources src on src.id = i.source_id;

create view public.monthly_summary with (security_invoker = true) as
select
  month,
  count(*) as sales_count,
  sum(coalesce(cogs, 0)) as cogs,
  sum(gross) as gross,
  sum(shipping_cost) as shipping,
  sum(fees) as fees,
  sum(net) as net,
  sum(adjusted_net) as adjusted_net,
  case when sum(gross) > 0 then sum(adjusted_net) / sum(gross) end as margin
from public.sales_view
where fulfillment_status <> 'cancelled'
group by month;

-- ---------------------------------------------------------------------------
-- Row-level security: members can do everything; nobody else can do anything
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'categories', 'storage_locations', 'platforms', 'settings', 'sources', 'items',
    'item_photos', 'item_events', 'sales', 'expenses', 'mileage', 'write_offs',
    'ai_runs', 'activity_log', 'import_runs'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy members_all on public.%I for all to authenticated using (public.is_member()) with check (public.is_member())',
      t
    );
  end loop;
end $$;

alter table public.members enable row level security;
create policy members_read on public.members for select to authenticated using (public.is_member());

alter table public.ebay_connection enable row level security;  -- no policies: server only

-- ---------------------------------------------------------------------------
-- Photo storage (private bucket; members only)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('item-photos', 'item-photos', false)
on conflict (id) do nothing;

create policy item_photos_members_select on storage.objects for select to authenticated
  using (bucket_id = 'item-photos' and public.is_member());
create policy item_photos_members_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'item-photos' and public.is_member());
create policy item_photos_members_update on storage.objects for update to authenticated
  using (bucket_id = 'item-photos' and public.is_member());
create policy item_photos_members_delete on storage.objects for delete to authenticated
  using (bucket_id = 'item-photos' and public.is_member());

-- ---------------------------------------------------------------------------
-- Seed values from her Titles tab (all editable in Settings)
-- ---------------------------------------------------------------------------
insert into public.platforms (code, name, fee_rate, sort_order) values
  ('ebay', 'eBay', 0.15, 1),
  ('poshmark', 'Poshmark', 0.20, 2),
  ('mercari', 'Mercari', 0.13, 3),
  ('etsy', 'Etsy', 0.10, 4),
  ('depop', 'Depop', 0.03, 5),
  ('vinted', 'Vinted', 0, 6),
  ('other', 'Other', 0, 99);

insert into public.settings (key, value) values
  ('mileage_rate', '0.725'),
  ('store_rules', '"Best Offer is always on. Buyer pays shipping (no free shipping)."'),
  ('description_template', '""'),
  ('stale_listing_days', '90');
