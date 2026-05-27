do $$
begin
  alter table public.groups
  add column if not exists owner_account_email text;

  alter table public.groups
  add column if not exists owner_account_password text;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'groups'
      and column_name = 'owner_account_code'
  ) then
    execute 'update public.groups set owner_account_password = coalesce(owner_account_password, owner_account_code)';
    alter table public.groups
    drop column owner_account_code;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'members'
      and column_name = 'email'
  )
  and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'members'
      and column_name = 'backup_email'
  ) then
    alter table public.members
    rename column email to backup_email;
  end if;

  alter table public.members
  add column if not exists backup_email text;

  alter table public.members
  alter column backup_email drop not null;
end $$;
