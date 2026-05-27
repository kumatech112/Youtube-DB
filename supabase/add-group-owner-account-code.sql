alter table public.groups
add column if not exists owner_account_code text;
