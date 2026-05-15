create or replace function public.set_data_updated_date()
returns trigger
language plpgsql
as $$
begin
  new.data_updated_date = (now() at time zone 'Asia/Bangkok')::date;
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_groups_updated_at on public.groups;
create trigger set_groups_updated_at
before update on public.groups
for each row execute function public.set_data_updated_date();

drop trigger if exists set_members_updated_at on public.members;
create trigger set_members_updated_at
before update on public.members
for each row execute function public.set_data_updated_date();

drop trigger if exists set_announcements_updated_at on public.announcements;
create trigger set_announcements_updated_at
before update on public.announcements
for each row execute function public.set_data_updated_date();
