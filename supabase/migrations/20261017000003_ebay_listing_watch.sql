-- FLYP bridge: FLYP ends the eBay listing when an item sells on another site, and the app never hears about
-- that sale. So the app keeps a snapshot of her live eBay listings and flags listed items whose eBay
-- listing ended without an eBay order ("sold somewhere else?").

alter table public.items add column ebay_ended_at timestamptz;
create index items_ebay_ended_idx on public.items (workspace_id) where ebay_ended_at is not null;

create table public.ebay_active_listings (
  workspace_id uuid not null default public.request_workspace() references public.workspaces (id) on delete cascade,
  environment text not null check (environment in ('production', 'sandbox')),
  listing_id text not null,
  title text not null,
  sku text,
  price numeric(10, 2),
  quantity_available int,
  start_time timestamptz,
  item_id uuid references public.items (id) on delete set null,
  seen_at timestamptz not null default now(),
  primary key (workspace_id, environment, listing_id)
);
alter table public.ebay_active_listings enable row level security;
create policy business_rows on public.ebay_active_listings for all to authenticated
  using (workspace_id = public.request_workspace() and public.can_access(workspace_id))
  with check (workspace_id = public.request_workspace() and public.can_access(workspace_id));

alter table public.ebay_sync_state add column listings_synced_at timestamptz;

-- Items view picks up the new column
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
