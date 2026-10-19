-- Clothing and shoe measurements (e.g. [{"name":"Pit to pit","value":"20"}]), in inches; added to the eBay description
alter table public.items add column measurements jsonb;

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
