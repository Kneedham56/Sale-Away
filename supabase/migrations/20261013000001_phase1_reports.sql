-- Phase 1: exit dates, report views, tax summary

-- When an item left inventory without selling (donated, damaged, kept). Needed for inventory-at-cost on a date.
alter table public.items add column date_exited date;

-- Items view: days active in her time zone (recreated: items gained a column)
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
  (select p.thumb_path from public.item_photos p where p.item_id = i.id order by p.sort_order, p.created_at limit 1) as thumb_path
from public.items i
left join public.sources src on src.id = i.source_id;

-- Per sourcing trip: what it cost, what came out of it, what it earned
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

-- Inventory at cost on a date: unsold items with a known cost that she had on that day
create or replace function public.inventory_at_cost(on_date date)
returns table (items bigint, cost numeric)
language sql
stable
set search_path = ''
as $$
  select count(*), coalesce(sum(i.cost), 0)
  from public.items i
  where i.cost is not null
    and coalesce(i.date_sourced, i.date_listed, i.created_at::date) <= on_date
    and not (i.status in ('sold', 'shipped') and i.date_sold is null)
    and (i.date_sold is null or i.date_sold > on_date)
    and (i.date_exited is null or i.date_exited > on_date)
    and not (i.status in ('donated', 'damaged', 'kept') and i.date_exited is null);
$$;

-- Every year-end figure on one call (Taxes page)
create or replace function public.tax_summary(tax_year int)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with bounds as (
    select make_date(tax_year, 1, 1) as d0, make_date(tax_year, 12, 31) as d1
  ),
  s as (
    select v.* from public.sales_view v, bounds b
    where v.sold_date between b.d0 and b.d1 and v.fulfillment_status <> 'cancelled'
  )
  select jsonb_build_object(
    'year', tax_year,
    'sales_count', (select count(*) from s),
    'gross', (select coalesce(sum(gross), 0) from s),
    'gross_by_platform', (select coalesce(jsonb_object_agg(platform, g), '{}'::jsonb) from (select platform, sum(gross) g from s group by platform) x),
    'cogs', (select coalesce(sum(cogs), 0) from s),
    'cogs_unknown_count', (select count(*) from s where cogs is null),
    'shipping', (select coalesce(sum(shipping_cost), 0) from s),
    'fees', (select coalesce(sum(fees), 0) from s),
    'fees_estimated', (select coalesce(sum(fees), 0) from s where fee_is_estimate),
    'adjustments', (select coalesce(sum(adjustments), 0) from s),
    'return_charges', (select coalesce(sum(return_charges), 0) from s),
    'net', (select coalesce(sum(adjusted_net), 0) from s),
    'ebay_gross', (select coalesce(sum(gross), 0) from s where platform = 'ebay'),
    'ebay_sales_count', (select count(*) from s where platform = 'ebay'),
    'expenses_by_type', (
      select coalesce(jsonb_object_agg(type, a), '{}'::jsonb) from (
        select e.type, sum(e.amount) a from public.expenses e, bounds b
        where e.date between b.d0 and b.d1 group by e.type
      ) x
    ),
    'expenses_total', (select coalesce(sum(e.amount), 0) from public.expenses e, bounds b where e.date between b.d0 and b.d1),
    'miles', (select coalesce(sum(m.miles), 0) from public.mileage m, bounds b where m.date between b.d0 and b.d1),
    'mileage_deduction', (select coalesce(sum(m.miles * m.rate), 0) from public.mileage m, bounds b where m.date between b.d0 and b.d1),
    'write_offs', (select coalesce(sum(w.value), 0) from public.write_offs w, bounds b where w.date between b.d0 and b.d1),
    'sourcing_spend', (select coalesce(sum(src.total_spent), 0) from public.sources src, bounds b where src.date between b.d0 and b.d1),
    'sourcing_trips', (select count(*) from public.sources src, bounds b where src.date between b.d0 and b.d1),
    'inventory_start', (select to_jsonb(x) from public.inventory_at_cost(make_date(tax_year - 1, 12, 31)) x),
    'inventory_end', (select to_jsonb(x) from public.inventory_at_cost(make_date(tax_year, 12, 31)) x)
  );
$$;
