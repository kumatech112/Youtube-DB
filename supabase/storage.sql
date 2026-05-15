-- Run this only if image upload says the public-assets bucket is missing.
-- You can also create it from Supabase Dashboard > Storage > New bucket.

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
