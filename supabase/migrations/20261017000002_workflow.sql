-- Workflow: Completed = shipped, or taken down (donated / damaged / kept / discarded)

-- Her spreadsheet's sold items all shipped long ago: move them from "sold" to "shipped" (Completed),
-- except anything with a sale still waiting to ship (those stay in Outgoing).
update public.items i
set status = 'shipped'
where i.status = 'sold'
  and not exists (
    select 1 from public.sales s
    where s.item_id = i.id and s.fulfillment_status in ('to_ship', 'packed')
  );

-- Trips report counts "discarded" with the other ways an item left without selling
create or replace view public.source_report with (security_invoker = true) as
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
    count(*) filter (where status in ('donated', 'damaged', 'kept', 'discarded')) as exited,
    sum(cost) as item_cost
  from public.items where source_id = s.id
) it on true
left join lateral (
  select count(*) as sales, sum(gross) as gross, sum(net) as net, sum(adjusted_net) as adjusted_net
  from public.sales_view where source_id = s.id and fulfillment_status <> 'cancelled'
) sa on true;

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
    and not (i.status in ('donated', 'damaged', 'kept', 'discarded') and i.date_exited is null);
$$;
