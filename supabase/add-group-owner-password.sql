do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'groups'
      and column_name = 'owner_account_code'
  )
  and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'groups'
      and column_name = 'owner_account_password'
  ) then
    alter table public.groups
    rename column owner_account_code to owner_account_password;
  end if;

  alter table public.groups
  add column if not exists owner_account_password text;
end $$;
