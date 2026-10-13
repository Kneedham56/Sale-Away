-- Phases 3-4: eBay orders, finances, listings

-- Which eBay environment a sale came from. Sandbox test orders never count in her books.
alter table public.sales add column environment text not null default 'production'
  check (environment in ('production', 'sandbox'));
alter table public.sales add column ebay_last_modified timestamptz;

alter table public.ebay_connection add column ebay_username text;

-- Raw eBay finance transactions; sale fees, label costs and refunds are recomputed from these
create table public.ebay_transactions (
  transaction_id text not null,
  environment text not null check (environment in ('production', 'sandbox')),
  order_id text,
  line_item_id text,
  transaction_type text not null,
  booking_entry text not null,
  amount numeric(10, 2) not null,
  fee_amount numeric(10, 2),
  transaction_date timestamptz not null,
  raw jsonb not null,
  primary key (environment, transaction_id)
);
create index ebay_transactions_order_idx on public.ebay_transactions (environment, order_id);

create table public.ebay_sync_state (
  environment text primary key check (environment in ('production', 'sandbox')),
  orders_synced_at timestamptz,
  finances_synced_at timestamptz,
  last_run_at timestamptz,
  last_error text,
  last_result jsonb
);

-- What the app published to eBay, per environment (sandbox runs never touch her items' status)
create table public.ebay_listings (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items (id) on delete cascade,
  environment text not null check (environment in ('production', 'sandbox')),
  sku text not null,
  offer_id text,
  listing_id text,
  status text not null default 'draft' check (status in ('draft', 'published', 'failed', 'ended')),
  last_error text,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (environment, sku)
);
create trigger ebay_listings_updated_at before update on public.ebay_listings
  for each row execute function public.set_updated_at();

do $$
declare t text;
begin
  foreach t in array array['ebay_transactions', 'ebay_sync_state', 'ebay_listings'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy members_all on public.%I for all to authenticated using (public.is_member()) with check (public.is_member())',
      t
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Views: rebuilt so sales include the new columns and only production counts
-- ---------------------------------------------------------------------------
drop view if exists public.monthly_summary;
drop view if exists public.source_report;
drop view if exists public.category_report;
drop view if exists public.platform_report;
drop view if exists public.sales_view;

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
left join public.sources src on src.id = i.source_id
where s.environment = 'production';

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

create view public.source_report with (security_invoker = true) as
select
  s.id, s.lot_code, s.place, s.type, s.date, s.total_spent, s.notes,
  coalesce(it.items, 0) as items,
  coalesce(it.unlisted, 0) as unlisted,
  coalesce(it.listed, 0) as listed,
  coalesce(it.sold, 0) as sold,
  coalesce(it.exited, 0) as exited,
  it.item_cost,
  coalesce(sa.sales, 0) as sales,
  coalesce(sa.gross, 0) as gross,
  coalesce(sa.net, 0) as net,
  coalesce(sa.adjusted_net, 0) as adjusted_net
from public.sources s
left join lateral (
  select
    count(*) as items,
    count(*) filter (where status in ('intake', 'unlisted', 'ready_to_list')) as unlisted,
    count(*) filter (where status = 'listed') as listed,
    count(*) filter (where status in ('sold', 'shipped')) as sold,
    count(*) filter (where status in ('donated', 'damaged', 'kept')) as exited,
    sum(cost) as item_cost
  from public.items where source_id = s.id
) it on true
left join lateral (
  select count(*) as sales, sum(gross) as gross, sum(net) as net, sum(adjusted_net) as adjusted_net
  from public.sales_view where source_id = s.id and fulfillment_status <> 'cancelled'
) sa on true;

create view public.category_report with (security_invoker = true) as
select
  extract(year from sold_date)::int as year,
  coalesce(category, '(none)') as category,
  count(*) as sales,
  sum(gross) as gross,
  sum(adjusted_net) as adjusted_net,
  round(avg(sold_date - date_listed) filter (where date_listed is not null)) as avg_days_to_sell
from public.sales_view
where fulfillment_status <> 'cancelled'
group by 1, 2;

create view public.platform_report with (security_invoker = true) as
select
  extract(year from sold_date)::int as year,
  platform,
  count(*) as sales,
  sum(gross) as gross,
  sum(shipping_cost) as shipping,
  sum(fees) as fees,
  bool_or(fee_is_estimate) as has_estimated_fees,
  sum(adjusted_net) as adjusted_net
from public.sales_view
where fulfillment_status <> 'cancelled'
group by 1, 2;

insert into public.settings (key, value) values
  ('sku_template', '"{cost}-{lot}-{listed}-{n}"'),
  ('ebay_postal_code', '""')
on conflict (key) do nothing;
