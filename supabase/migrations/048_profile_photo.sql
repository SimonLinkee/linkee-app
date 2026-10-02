-- Linkee — migration 048 : photo de profil personnelle (facultative) pour chaque compte
-- La photo est une donnée personnelle : coffre PRIVÉ "avatars", dossier <id du compte>/. Chacun voit et gère la
-- sienne ; le Superadmin peut la consulter (équipe), personne d'autre. Elle est supprimée avec le compte.
-- À exécuter dans Supabase → SQL Editor → Run (rejouable), APRÈS la migration 047.

alter table public.profiles add column if not exists photo_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('avatars', 'avatars', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
  on conflict (id) do update set file_size_limit = 2097152, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

drop policy if exists storage_avatars_read on storage.objects;
create policy storage_avatars_read on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and ((storage.foldername(name))[1] = auth.uid()::text or public.real_role() = 'admin_principal'));

drop policy if exists storage_avatars_insert on storage.objects;
create policy storage_avatars_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists storage_avatars_update on storage.objects;
create policy storage_avatars_update on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists storage_avatars_delete on storage.objects;
create policy storage_avatars_delete on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

select 'ok' as resultat;
