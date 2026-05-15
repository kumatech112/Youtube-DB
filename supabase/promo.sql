-- Run this in Supabase SQL Editor for an existing project.
-- Adds a public promotion homepage with service/pricing cards and contact links.

create table if not exists public.site_settings (
  id int primary key default 1 check (id = 1),
  hero_title text not null default 'Kuma Premium Shop',
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

alter table public.service_plans add column if not exists image_url text;
alter table public.service_plans add column if not exists icon_url text;
alter table public.service_plans add column if not exists slot_status text not null default 'available';
alter table public.service_plans add column if not exists available_slots int;
alter table public.service_plans add column if not exists total_slots int;

create index if not exists service_plans_active_idx on public.service_plans(is_active);

grant select, insert, update, delete on public.site_settings to authenticated;
grant select, insert, update, delete on public.service_plans to authenticated;

drop trigger if exists set_site_settings_updated_at on public.site_settings;
create trigger set_site_settings_updated_at
before update on public.site_settings
for each row execute function public.set_updated_at();

drop trigger if exists set_service_plans_updated_at on public.service_plans;
create trigger set_service_plans_updated_at
before update on public.service_plans
for each row execute function public.set_updated_at();

alter table public.site_settings enable row level security;
alter table public.service_plans enable row level security;

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
values (1, 'Kuma Premium Shop', 'บริการพรีเมียม ราคาชัดเจน พร้อมช่องทางติดต่อร้าน')
on conflict (id) do nothing;

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
      'hero_title', 'Kuma Premium Shop',
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

revoke all on function public.get_public_home() from public;
grant execute on function public.get_public_home() to anon, authenticated;
