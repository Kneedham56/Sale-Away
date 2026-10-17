-- "Gave up": taken down and thrown away (or otherwise gotten rid of) without selling
alter type public.item_status add value if not exists 'discarded';
