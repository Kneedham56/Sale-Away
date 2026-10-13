-- Separate businesses (workspaces): each login works in its own business with its own data.
-- Doc (admin) belongs to every business and has his own test business.
--
-- How scoping works: the app sends the active business id in the "x-workspace-id" request header.
-- Every table's RLS policy only shows rows of that business, and only if the user belongs to it.
-- New rows get workspace_id from the same header by default, so app queries didn't need to change.

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'admin')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index workspace_members_user_idx on public.workspace_members (user_id);

-- Active business from the request header (null if missing or malformed)
create or replace function public.request_workspace()
returns uuid
language plpgsql
stable
as $$
declare v text;
begin
  v := nullif(current_setting('request.headers', true)::json ->> 'x-workspace-id', '');
  return v::uuid;
exception when others then
  return null;
end;
$$;

create or replace function public.can_access(ws uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.workspace_members m where m.workspace_id = ws and m.user_id = auth.uid());
$$;

-- ---------------------------------------------------------------------------
-- Her existing data becomes the first business
-- ---------------------------------------------------------------------------
insert into public.workspaces (id, name) values ('00000000-0000-4000-a000-000000000001', 'Mommatom''s');
insert into public.workspace_members (workspace_id, user_id, role)
select '00000000-0000-4000-a000-000000000001', user_id, case when role = 'admin' then 'admin' else 'owner' end
from public.members;

do $$
declare
  t text;
  mom constant uuid := '00000000-0000-4000-a000-000000000001';
begin
  foreach t in array array[
    'categories', 'storage_locations', 'platforms', 'settings', 'sources', 'items', 'item_photos', 'item_events',
    'sales', 'expenses', 'mileage', 'write_offs', 'ai_runs', 'activity_log', 'import_runs',
    'ebay_connection', 'ebay_transactions', 'ebay_sync_state', 'ebay_listings'
  ] loop
    execute format('alter table public.%I add column workspace_id uuid references public.workspaces (id) on delete cascade', t);
    execute format('update public.%I set workspace_id = %L', t, mom);
    execute format('alter table public.%I alter column workspace_id set not null', t);
    execute format('alter table public.%I alter column workspace_id set default public.request_workspace()', t);
    execute format('create index %I on public.%I (workspace_id)', t || '_workspace_idx', t);
  end loop;
end $$;

-- Keys that were unique across the app become unique per business
alter table public.sales drop constraint sales_platform_fkey;

alter table public.categories drop constraint categories_pkey, add primary key (workspace_id, name);
alter table public.storage_locations drop constraint storage_locations_pkey, add primary key (workspace_id, name);
alter table public.platforms drop constraint platforms_pkey, add primary key (workspace_id, code);
alter table public.settings drop constraint settings_pkey, add primary key (workspace_id, key);
alter table public.sources drop constraint sources_lot_code_key, add constraint sources_lot_code_key unique (workspace_id, lot_code);
alter table public.items drop constraint items_import_ref_key, add constraint items_import_ref_key unique (workspace_id, import_ref);
alter table public.sales drop constraint sales_import_ref_key, add constraint sales_import_ref_key unique (workspace_id, import_ref);
alter table public.sales drop constraint sales_platform_order_id_line_item_id_key,
  add constraint sales_order_line_key unique (workspace_id, platform, order_id, line_item_id);
alter table public.sales add constraint sales_platform_fkey foreign key (workspace_id, platform) references public.platforms (workspace_id, code);
alter table public.expenses drop constraint expenses_import_ref_key, add constraint expenses_import_ref_key unique (workspace_id, import_ref);
alter table public.mileage drop constraint mileage_import_ref_key, add constraint mileage_import_ref_key unique (workspace_id, import_ref);
alter table public.write_offs drop constraint write_offs_import_ref_key, add constraint write_offs_import_ref_key unique (workspace_id, import_ref);
alter table public.ebay_connection drop constraint ebay_connection_environment_key,
  add constraint ebay_connection_environment_key unique (workspace_id, environment);
alter table public.ebay_transactions drop constraint ebay_transactions_pkey, add primary key (workspace_id, environment, transaction_id);
alter table public.ebay_sync_state drop constraint ebay_sync_state_pkey, add primary key (workspace_id, environment);
alter table public.ebay_listings drop constraint ebay_listings_environment_sku_key,
  add constraint ebay_listings_environment_sku_key unique (workspace_id, environment, sku);

-- Defaults every new business starts with (her Titles-tab fee rates and settings)
create or replace function public.seed_workspace(ws uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.platforms (workspace_id, code, name, fee_rate, sort_order) values
    (ws, 'ebay', 'eBay', 0.15, 1), (ws, 'poshmark', 'Poshmark', 0.20, 2), (ws, 'mercari', 'Mercari', 0.13, 3),
    (ws, 'etsy', 'Etsy', 0.10, 4), (ws, 'depop', 'Depop', 0.03, 5), (ws, 'vinted', 'Vinted', 0, 6), (ws, 'other', 'Other', 0, 99)
  on conflict do nothing;
  insert into public.settings (workspace_id, key, value) values
    (ws, 'mileage_rate', '0.725'),
    (ws, 'store_rules', '"Best Offer is always on. Buyer pays shipping (no free shipping)."'),
    (ws, 'description_template', '""'),
    (ws, 'stale_listing_days', '90'),
    (ws, 'sku_template', '"{cost}-{lot}-{listed}-{n}"'),
    (ws, 'ebay_postal_code', '""'),
    (ws, 'item_event_actions', '["Reduced Price","Relisted Item","Revised Listing","Changed Photos","Removed Listing"]'),
    (ws, 'expense_types', '["Business Expense","Equipment or Tools","Packaging Material","Other","Bills"]')
  on conflict do nothing;
  insert into public.categories (workspace_id, name, sort_order)
  select ws, c, ord from unnest(array[
    'Accessories', 'Art & Craft Supplies', 'Baby Products', 'Books', 'Cameras & Photo', 'Clothing', 'Collectible',
    'DVD & Media', 'Electronics', 'Hats', 'Health & Beauty', 'Holiday', 'Home Décor', 'Housewares', 'Jewelry', 'Linens',
    'Luggage & Bags', 'Mens Clothing', 'Mens Shoes', 'Musical Instruments', 'Other', 'Outdoor & Sports', 'Small Appliances',
    'Tools', 'Toys & Games', 'Video Gaming', 'Womens Clothing', 'Womens Shoes'
  ]) with ordinality as t(c, ord)
  on conflict do nothing;
$$;

-- ---------------------------------------------------------------------------
-- Row-level security: only the active business, and only if you belong to it
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'categories', 'storage_locations', 'platforms', 'settings', 'sources', 'items', 'item_photos', 'item_events',
    'sales', 'expenses', 'mileage', 'write_offs', 'ai_runs', 'activity_log', 'import_runs',
    'ebay_transactions', 'ebay_sync_state', 'ebay_listings'
  ] loop
    execute format('drop policy if exists members_all on public.%I', t);
    execute format(
      'create policy business_rows on public.%I for all to authenticated
         using (workspace_id = public.request_workspace() and public.can_access(workspace_id))
         with check (workspace_id = public.request_workspace() and public.can_access(workspace_id))',
      t
    );
  end loop;
end $$;
-- ebay_connection keeps no policies: server only

alter table public.workspaces enable row level security;
create policy workspaces_read on public.workspaces for select to authenticated using (public.can_access(id));
alter table public.workspace_members enable row level security;
create policy workspace_members_read on public.workspace_members for select to authenticated using (public.can_access(workspace_id));

-- Photos live under <workspace_id>/<item_id>/..., readable and writable only by that business
drop policy item_photos_members_select on storage.objects;
drop policy item_photos_members_insert on storage.objects;
drop policy item_photos_members_update on storage.objects;
drop policy item_photos_members_delete on storage.objects;

create or replace function public.can_access_photo_path(path text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare ws uuid;
begin
  ws := (storage.foldername(path))[1]::uuid;
  return public.can_access(ws);
exception when others then
  return false;
end;
$$;

create policy item_photos_business_select on storage.objects for select to authenticated
  using (bucket_id = 'item-photos' and public.can_access_photo_path(name));
create policy item_photos_business_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'item-photos' and public.can_access_photo_path(name));
create policy item_photos_business_update on storage.objects for update to authenticated
  using (bucket_id = 'item-photos' and public.can_access_photo_path(name));
create policy item_photos_business_delete on storage.objects for delete to authenticated
  using (bucket_id = 'item-photos' and public.can_access_photo_path(name));
