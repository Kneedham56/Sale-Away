-- Listing queue: the AI sorting a photo batch into items is logged in ai_runs like every other AI call.
alter table public.ai_runs drop constraint if exists ai_runs_mode_check;
alter table public.ai_runs add constraint ai_runs_mode_check check (mode in ('listing', 'quick_check', 'photo_group'));
