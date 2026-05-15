-- Run this in Supabase SQL Editor for an existing project.
-- It removes the User flow from the app by moving access codes to members.
-- Existing customers/customer_groups tables are kept as unused backup data.

alter table public.members
add column if not exists access_code text;

update public.members
set access_code = 'MEM-' || upper(substr(replace(id::text, '-', ''), 1, 8))
where access_code is null or trim(access_code) = '';

alter table public.members
alter column access_code set not null;

create index if not exists members_access_code_idx on public.members(access_code);

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

revoke all on function public.get_customer_portal(text) from public;
grant execute on function public.get_customer_portal(text) to anon, authenticated;

-- Optional cleanup after you confirm the new member codes work:
-- drop table if exists public.customer_groups;
-- drop table if exists public.customers;
