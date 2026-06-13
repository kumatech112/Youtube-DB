-- Run this in Supabase SQL Editor after the base schema.
-- Adds commercial customer services, payment slip workflow, private slip storage,
-- migration from legacy members, RLS, and customer-facing RPCs.

create extension if not exists pgcrypto;

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  access_code text not null,
  status text not null default 'active' check (status in ('active', 'inactive')),
  admin_note text,
  legacy_member_id uuid unique references public.members(id) on delete set null,
  needs_access_code_review boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.customer_services (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  service_plan_id uuid references public.service_plans(id) on delete set null,
  status text not null default 'active' check (status in ('active', 'pending_payment', 'expired', 'cancelled')),
  started_on date,
  expires_on date,
  legacy_member_id uuid unique references public.members(id) on delete set null,
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payment_slips (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  customer_service_id uuid references public.customer_services(id) on delete set null,
  service_plan_id uuid references public.service_plans(id) on delete set null,
  amount numeric(12, 2) not null check (amount > 0),
  paid_at timestamptz not null,
  slip_path text,
  status text not null default 'pending_review' check (status in ('pending_review', 'approved', 'rejected', 'needs_resubmit')),
  customer_note text,
  admin_note text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  actor_type text not null default 'system' check (actor_type in ('admin', 'customer', 'system')),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  customer_id uuid references public.customers(id) on delete set null,
  before_data jsonb,
  after_data jsonb,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists customers_access_code_idx on public.customers(access_code);
create index if not exists customers_status_idx on public.customers(status);
create index if not exists customer_services_customer_id_idx on public.customer_services(customer_id);
create index if not exists customer_services_plan_id_idx on public.customer_services(service_plan_id);
create index if not exists customer_services_expires_on_idx on public.customer_services(expires_on);
create index if not exists payment_slips_status_idx on public.payment_slips(status);
create index if not exists payment_slips_customer_id_idx on public.payment_slips(customer_id);
create index if not exists payment_slips_service_id_idx on public.payment_slips(customer_service_id);
create index if not exists payment_slips_paid_at_idx on public.payment_slips(paid_at);
create index if not exists audit_logs_customer_id_idx on public.audit_logs(customer_id);

drop trigger if exists set_customers_updated_at on public.customers;
create trigger set_customers_updated_at
before update on public.customers
for each row execute function public.set_updated_at();

drop trigger if exists set_customer_services_updated_at on public.customer_services;
create trigger set_customer_services_updated_at
before update on public.customer_services
for each row execute function public.set_updated_at();

drop trigger if exists set_payment_slips_updated_at on public.payment_slips;
create trigger set_payment_slips_updated_at
before update on public.payment_slips
for each row execute function public.set_updated_at();

alter table public.customers enable row level security;
alter table public.customer_services enable row level security;
alter table public.payment_slips enable row level security;
alter table public.audit_logs enable row level security;

grant select, insert, update, delete on public.customers to authenticated;
grant select, insert, update, delete on public.customer_services to authenticated;
grant select, insert, update, delete on public.payment_slips to authenticated;
grant select, insert on public.audit_logs to authenticated;

drop policy if exists "Admins can manage customers" on public.customers;
create policy "Admins can manage customers"
on public.customers
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins can manage customer services" on public.customer_services;
create policy "Admins can manage customer services"
on public.customer_services
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins can manage payment slips" on public.payment_slips;
create policy "Admins can manage payment slips"
on public.payment_slips
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins can read audit logs" on public.audit_logs;
create policy "Admins can read audit logs"
on public.audit_logs
for select
to authenticated
using (public.is_admin());

drop policy if exists "Admins can create audit logs" on public.audit_logs;
create policy "Admins can create audit logs"
on public.audit_logs
for insert
to authenticated
with check (public.is_admin());

insert into public.service_plans (title, description, price_label, is_active, display_order)
select 'บริการเดิม', 'ข้อมูลที่ย้ายมาจากระบบสมาชิกเดิม', null, false, 999
where not exists (
  select 1 from public.service_plans where title = 'บริการเดิม'
);

insert into public.customers (
  display_name,
  access_code,
  status,
  legacy_member_id,
  needs_access_code_review,
  created_at,
  updated_at
)
select
  m.member_name,
  m.access_code,
  'active',
  m.id,
  count(*) over (partition by m.access_code) > 1,
  m.created_at,
  m.updated_at
from public.members m
where not exists (
  select 1 from public.customers c where c.legacy_member_id = m.id
);

with fallback_plan as (
  select id
  from public.service_plans
  where title = 'บริการเดิม'
  order by created_at
  limit 1
)
insert into public.customer_services (
  customer_id,
  service_plan_id,
  status,
  started_on,
  expires_on,
  legacy_member_id,
  created_at,
  updated_at
)
select
  c.id,
  fp.id,
  case
    when m.payment_due_date is null then 'pending_payment'
    when m.payment_due_date < current_date then 'expired'
    else 'active'
  end,
  m.created_at::date,
  m.payment_due_date,
  m.id,
  m.created_at,
  m.updated_at
from public.members m
join public.customers c on c.legacy_member_id = m.id
cross join fallback_plan fp
where not exists (
  select 1 from public.customer_services cs where cs.legacy_member_id = m.id
);

insert into storage.buckets (id, name, public)
values ('payment-slips', 'payment-slips', false)
on conflict (id) do update set public = false;

drop policy if exists "Customers can upload payment slips" on storage.objects;
create policy "Customers can upload payment slips"
on storage.objects
for insert
to anon, authenticated
with check (
  bucket_id = 'payment-slips'
  and (storage.foldername(name))[1] = 'pending'
);

drop policy if exists "Admins can read payment slips" on storage.objects;
create policy "Admins can read payment slips"
on storage.objects
for select
to authenticated
using (bucket_id = 'payment-slips' and public.is_admin());

drop policy if exists "Admins can update payment slips" on storage.objects;
create policy "Admins can update payment slips"
on storage.objects
for update
to authenticated
using (bucket_id = 'payment-slips' and public.is_admin())
with check (bucket_id = 'payment-slips' and public.is_admin());

drop policy if exists "Admins can delete payment slips" on storage.objects;
create policy "Admins can delete payment slips"
on storage.objects
for delete
to authenticated
using (bucket_id = 'payment-slips' and public.is_admin());

create or replace function public.get_customer_portal(p_access_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_access_code text := trim(p_access_code);
  v_customer public.customers%rowtype;
  v_match_count int;
begin
  select count(*)
  into v_match_count
  from public.customers c
  where c.access_code = v_access_code
    and c.status = 'active';

  if v_match_count = 0 then
    return jsonb_build_object('ok', false, 'message', 'ไม่พบรหัสลูกค้า');
  end if;

  if v_match_count > 1 then
    return jsonb_build_object('ok', false, 'message', 'รหัสนี้ซ้ำในระบบ กรุณาติดต่อร้านเพื่อตรวจสอบ');
  end if;

  select *
  into v_customer
  from public.customers c
  where c.access_code = v_access_code
    and c.status = 'active'
  limit 1;

  return jsonb_build_object(
    'ok', true,
    'customer', jsonb_build_object(
      'id', v_customer.id,
      'display_name', v_customer.display_name,
      'status', v_customer.status,
      'needs_access_code_review', v_customer.needs_access_code_review
    ),
    'services', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', cs.id,
          'service_plan_id', cs.service_plan_id,
          'service_title', coalesce(sp.title, 'บริการเดิม'),
          'price_label', sp.price_label,
          'status', cs.status,
          'started_on', cs.started_on,
          'expires_on', cs.expires_on,
          'admin_note', cs.admin_note
        )
        order by cs.expires_on nulls last, coalesce(sp.title, 'บริการเดิม')
      )
      from public.customer_services cs
      left join public.service_plans sp on sp.id = cs.service_plan_id
      where cs.customer_id = v_customer.id
        and cs.status <> 'cancelled'
    ), '[]'::jsonb),
    'available_service_plans', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', p.id,
          'title', p.title,
          'price_label', p.price_label,
          'description', p.description
        )
        order by p.display_order, p.title
      )
      from public.service_plans p
      where p.is_active = true
    ), '[]'::jsonb),
    'payment_slips', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', ps.id,
          'customer_service_id', ps.customer_service_id,
          'service_plan_id', ps.service_plan_id,
          'service_title', coalesce(sp.title, 'บริการเดิม'),
          'amount', ps.amount,
          'paid_at', ps.paid_at,
          'status', ps.status,
          'customer_note', ps.customer_note,
          'admin_note', ps.admin_note,
          'reviewed_at', ps.reviewed_at,
          'created_at', ps.created_at
        )
        order by ps.created_at desc
      )
      from public.payment_slips ps
      left join public.service_plans sp on sp.id = ps.service_plan_id
      where ps.customer_id = v_customer.id
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

create or replace function public.create_payment_slip_submission(
  p_access_code text,
  p_customer_service_id uuid,
  p_service_plan_id uuid,
  p_amount numeric,
  p_paid_at timestamptz,
  p_customer_note text,
  p_file_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_access_code text := trim(p_access_code);
  v_customer public.customers%rowtype;
  v_match_count int;
  v_service public.customer_services%rowtype;
  v_service_plan_id uuid;
  v_slip_id uuid := gen_random_uuid();
  v_ext text;
  v_upload_path text;
begin
  select count(*)
  into v_match_count
  from public.customers c
  where c.access_code = v_access_code
    and c.status = 'active';

  if v_match_count = 0 then
    return jsonb_build_object('ok', false, 'message', 'ไม่พบรหัสลูกค้า');
  end if;

  if v_match_count > 1 then
    return jsonb_build_object('ok', false, 'message', 'รหัสนี้ซ้ำในระบบ กรุณาติดต่อร้านเพื่อตรวจสอบ');
  end if;

  select *
  into v_customer
  from public.customers c
  where c.access_code = v_access_code
    and c.status = 'active'
  limit 1;

  if p_amount is null or p_amount <= 0 then
    return jsonb_build_object('ok', false, 'message', 'ยอดเงินไม่ถูกต้อง');
  end if;

  if p_customer_service_id is not null then
    select *
    into v_service
    from public.customer_services cs
    where cs.id = p_customer_service_id
      and cs.customer_id = v_customer.id
    limit 1;

    if not found then
      return jsonb_build_object('ok', false, 'message', 'ไม่พบบริการของลูกค้านี้');
    end if;

    v_service_plan_id := coalesce(v_service.service_plan_id, p_service_plan_id);
  else
    v_service_plan_id := p_service_plan_id;
  end if;

  if v_service_plan_id is null then
    return jsonb_build_object('ok', false, 'message', 'กรุณาเลือกบริการ');
  end if;

  if not exists (select 1 from public.service_plans where id = v_service_plan_id) then
    return jsonb_build_object('ok', false, 'message', 'ไม่พบบริการที่เลือก');
  end if;

  v_ext := lower(regexp_replace(coalesce(p_file_name, ''), '^.*(\.[a-z0-9]{1,8})$', '\1'));
  if v_ext = coalesce(lower(p_file_name), '') or v_ext not in ('.jpg', '.jpeg', '.png', '.webp', '.pdf') then
    v_ext := '.jpg';
  end if;
  v_upload_path := 'pending/' || v_slip_id::text || v_ext;

  insert into public.payment_slips (
    id,
    customer_id,
    customer_service_id,
    service_plan_id,
    amount,
    paid_at,
    slip_path,
    status,
    customer_note
  )
  values (
    v_slip_id,
    v_customer.id,
    p_customer_service_id,
    v_service_plan_id,
    p_amount,
    p_paid_at,
    v_upload_path,
    'pending_review',
    nullif(trim(coalesce(p_customer_note, '')), '')
  );

  insert into public.audit_logs (actor_type, action, entity_type, entity_id, customer_id, after_data, note)
  values (
    'customer',
    'payment_slip_submitted',
    'payment_slip',
    v_slip_id,
    v_customer.id,
    jsonb_build_object('amount', p_amount, 'service_plan_id', v_service_plan_id),
    'ลูกค้าสร้างรายการสลิป'
  );

  return jsonb_build_object(
    'ok', true,
    'payment_slip_id', v_slip_id,
    'upload_path', v_upload_path
  );
end;
$$;

create or replace function public.finalize_payment_slip_upload(
  p_access_code text,
  p_payment_slip_id uuid,
  p_slip_path text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_access_code text := trim(p_access_code);
  v_customer public.customers%rowtype;
  v_slip public.payment_slips%rowtype;
  v_match_count int;
begin
  select count(*)
  into v_match_count
  from public.customers c
  where c.access_code = v_access_code
    and c.status = 'active';

  if v_match_count = 0 then
    return jsonb_build_object('ok', false, 'message', 'ไม่พบรหัสลูกค้า');
  end if;

  if v_match_count > 1 then
    return jsonb_build_object('ok', false, 'message', 'รหัสนี้ซ้ำในระบบ กรุณาติดต่อร้านเพื่อตรวจสอบ');
  end if;

  select *
  into v_customer
  from public.customers c
  where c.access_code = v_access_code
    and c.status = 'active'
  limit 1;

  select *
  into v_slip
  from public.payment_slips ps
  where ps.id = p_payment_slip_id
    and ps.customer_id = v_customer.id
  limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'message', 'ไม่พบรายการสลิป');
  end if;

  update public.payment_slips
  set slip_path = p_slip_path
  where id = p_payment_slip_id
    and customer_id = v_customer.id;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.get_customer_portal(text) from public;
revoke all on function public.create_payment_slip_submission(text, uuid, uuid, numeric, timestamptz, text, text) from public;
revoke all on function public.finalize_payment_slip_upload(text, uuid, text) from public;

grant execute on function public.get_customer_portal(text) to anon, authenticated;
grant execute on function public.create_payment_slip_submission(text, uuid, uuid, numeric, timestamptz, text, text) to anon, authenticated;
grant execute on function public.finalize_payment_slip_upload(text, uuid, text) to anon, authenticated;
