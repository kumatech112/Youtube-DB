-- Run this file in Supabase SQL Editor.
-- After creating your admin account in Supabase Auth, insert that user's UUID
-- into public.admin_profiles using the example near the bottom of this file.

create extension if not exists pgcrypto;

create table if not exists public.admin_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  group_name text not null,
  status text not null default 'active' check (status in ('active', 'maintenance')),
  data_updated_date date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  member_name text not null,
  access_code text not null,
  birthday_day int check (birthday_day between 1 and 31),
  birthday_month int check (birthday_month between 1 and 12),
  birthday_year int check (birthday_year between 1900 and 2200),
  email text not null,
  email_type text not null default 'store' check (email_type in ('store', 'customer')),
  payment_due_date date,
  data_updated_date date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  content_type text not null default 'announcement' check (content_type in ('announcement', 'promotion')),
  title text not null,
  detail text,
  image_url text,
  is_active boolean not null default true,
  display_order int not null default 0,
  data_updated_date date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.site_settings (
  id int primary key default 1 check (id = 1),
  hero_title text not null default 'FKP Shop',
  hero_subtitle text,
  line_url text,
  line_label text not null default 'ติดต่อ LINE',
  facebook_url text,
  facebook_label text not null default 'ติดต่อ Facebook',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.service_plans (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  price_label text,
  image_url text,
  icon_url text,
  slot_status text not null default 'available' check (slot_status in ('available', 'full')),
  available_slots int check (available_slots >= 0),
  total_slots int check (total_slots >= 0),
  features text[] not null default '{}',
  is_active boolean not null default true,
  display_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists groups_status_idx on public.groups(status);
create index if not exists members_group_id_idx on public.members(group_id);
create index if not exists members_access_code_idx on public.members(access_code);
create index if not exists members_payment_due_date_idx on public.members(payment_due_date);
create index if not exists announcements_active_idx on public.announcements(is_active);
create index if not exists service_plans_active_idx on public.service_plans(is_active);

grant usage on schema public to anon, authenticated;
grant select on public.admin_profiles to authenticated;
grant select, insert, update, delete on public.groups to authenticated;
grant select, insert, update, delete on public.members to authenticated;
grant select, insert, update, delete on public.announcements to authenticated;
grant select, insert, update, delete on public.site_settings to authenticated;
grant select, insert, update, delete on public.service_plans to authenticated;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

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

drop trigger if exists set_site_settings_updated_at on public.site_settings;
create trigger set_site_settings_updated_at
before update on public.site_settings
for each row execute function public.set_updated_at();

drop trigger if exists set_service_plans_updated_at on public.service_plans;
create trigger set_service_plans_updated_at
before update on public.service_plans
for each row execute function public.set_updated_at();

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_profiles
    where user_id = auth.uid()
      and is_active = true
  );
$$;

alter table public.admin_profiles enable row level security;
alter table public.groups enable row level security;
alter table public.members enable row level security;
alter table public.announcements enable row level security;
alter table public.site_settings enable row level security;
alter table public.service_plans enable row level security;

drop policy if exists "Admins can read admin profiles" on public.admin_profiles;
create policy "Admins can read admin profiles"
on public.admin_profiles
for select
to authenticated
using (public.is_admin());

drop policy if exists "Admins can manage groups" on public.groups;
create policy "Admins can manage groups"
on public.groups
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins can manage members" on public.members;
create policy "Admins can manage members"
on public.members
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins can manage announcements" on public.announcements;
create policy "Admins can manage announcements"
on public.announcements
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins can manage site settings" on public.site_settings;
create policy "Admins can manage site settings"
on public.site_settings
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins can manage service plans" on public.service_plans;
create policy "Admins can manage service plans"
on public.service_plans
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

insert into public.site_settings (id, hero_title, hero_subtitle)
values (1, 'FKP Shop', 'บริการพรีเมียม ราคาชัดเจน พร้อมช่องทางติดต่อร้าน')
on conflict (id) do nothing;

create or replace function public.get_customer_portal(p_access_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_access_code text := trim(p_access_code);
  v_member public.members%rowtype;
begin
  select *
  into v_member
  from public.members
  where access_code = v_access_code
  limit 1;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'message', 'ไม่พบรหัสสมาชิก'
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'customer', jsonb_build_object(
      'id', v_member.id,
      'display_name', v_member.member_name
    ),
    'groups', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', g.id,
          'group_name', g.group_name,
          'status', g.status,
          'data_updated_date', g.data_updated_date,
          'members', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id', m.id,
                'member_name', m.member_name,
                'birthday_day', m.birthday_day,
                'birthday_month', m.birthday_month,
                'birthday_year', m.birthday_year,
                'email_type', m.email_type,
                'payment_due_date', m.payment_due_date,
                'data_updated_date', m.data_updated_date
              )
              order by m.member_name
            )
            from public.members m
            where m.group_id = g.id
          ), '[]'::jsonb)
        )
        order by g.group_name
      )
      from public.groups g
      where g.id in (
        select distinct m_access.group_id
        from public.members m_access
        where m_access.access_code = v_access_code
      )
    ), '[]'::jsonb),
    'announcements', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', a.id,
          'content_type', a.content_type,
          'title', a.title,
          'detail', a.detail,
          'image_url', a.image_url,
          'data_updated_date', a.data_updated_date
        )
        order by a.display_order, a.created_at desc
      )
      from public.announcements a
      where a.is_active = true
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.get_public_home()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'settings', coalesce((
      select jsonb_build_object(
        'hero_title', s.hero_title,
        'hero_subtitle', s.hero_subtitle,
        'line_url', s.line_url,
        'line_label', s.line_label,
        'facebook_url', s.facebook_url,
        'facebook_label', s.facebook_label
      )
      from public.site_settings s
      where s.id = 1
    ), jsonb_build_object(
      'hero_title', 'FKP Shop',
      'hero_subtitle', 'บริการพรีเมียม ราคาชัดเจน พร้อมช่องทางติดต่อร้าน',
      'line_url', null,
      'line_label', 'ติดต่อ LINE',
      'facebook_url', null,
      'facebook_label', 'ติดต่อ Facebook'
    )),
    'service_plans', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', p.id,
          'title', p.title,
          'description', p.description,
          'price_label', p.price_label,
          'image_url', p.image_url,
          'icon_url', p.icon_url,
          'slot_status', p.slot_status,
          'available_slots', p.available_slots,
          'total_slots', p.total_slots,
          'features', p.features,
          'is_active', p.is_active,
          'display_order', p.display_order
        )
        order by p.display_order, p.created_at desc
      )
      from public.service_plans p
      where p.is_active = true
    ), '[]'::jsonb),
    'announcements', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', a.id,
          'content_type', a.content_type,
          'title', a.title,
          'detail', a.detail,
          'image_url', a.image_url,
          'is_active', a.is_active,
          'data_updated_date', a.data_updated_date
        )
        order by a.display_order, a.created_at desc
      )
      from public.announcements a
      where a.is_active = true
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.get_customer_portal(text) from public;
revoke all on function public.get_public_home() from public;
grant execute on function public.get_customer_portal(text) to anon, authenticated;
grant execute on function public.get_public_home() to anon, authenticated;
grant execute on function public.is_admin() to authenticated;

insert into storage.buckets (id, name, public)
values ('public-assets', 'public-assets', true)
on conflict (id) do update set public = true;

drop policy if exists "Public can read public assets" on storage.objects;
create policy "Public can read public assets"
on storage.objects
for select
to public
using (bucket_id = 'public-assets');

drop policy if exists "Admins can upload public assets" on storage.objects;
create policy "Admins can upload public assets"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'public-assets' and public.is_admin());

drop policy if exists "Admins can update public assets" on storage.objects;
create policy "Admins can update public assets"
on storage.objects
for update
to authenticated
using (bucket_id = 'public-assets' and public.is_admin())
with check (bucket_id = 'public-assets' and public.is_admin());

drop policy if exists "Admins can delete public assets" on storage.objects;
create policy "Admins can delete public assets"
on storage.objects
for delete
to authenticated
using (bucket_id = 'public-assets' and public.is_admin());

-- Bootstrap admin example:
-- 1. Create your admin user in Supabase Dashboard > Authentication > Users.
-- 2. Copy that user's UUID.
-- 3. Run this with your UUID/email:
--
-- insert into public.admin_profiles (user_id, email)
-- values ('00000000-0000-0000-0000-000000000000', 'you@example.com')
-- on conflict (user_id) do update set email = excluded.email, is_active = true;
