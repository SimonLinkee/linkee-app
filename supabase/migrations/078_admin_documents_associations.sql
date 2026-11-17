-- Linkee — migration 078 : l'admin peut déposer des documents dans le porte-documents d'une association (bénéficiaire)
-- À exécuter dans Supabase → SQL Editor → Run (rejouable sans risque). Nécessite les migrations 018 (admin_in_city) et 030.
--
-- Problème : « new row violates row-level security policy » à l'import d'un document dans la fiche d'une association.
-- Le coffre « documents » autorisait l'admin sur les dossiers des PARTENAIRES (migration 004) et le compte rattaché à
-- l'association sur le dossier de SA structure (migration 030) — mais pas l'admin sur les dossiers des associations.
-- Règle ajoutée : le Superadmin, la Comptabilité et le Responsable d'antenne (pour SA ville) écrivent dans le dossier
-- <id de l'association> des associations de leur ville. Rien d'autre ne change : une association ne voit toujours que ses documents.

create or replace function public.admin_owns_beneficiary_path(path text) returns boolean
  language sql stable security definer set search_path = public, storage as
  $$ select exists (select 1 from public.beneficiaries b
                    where b.id::text = (storage.foldername(path))[1]
                      and public.admin_in_city(b.city_id)) $$;

drop policy if exists storage_admin_beneficiary_files on storage.objects;
create policy storage_admin_beneficiary_files on storage.objects for all to authenticated
  using (bucket_id in ('logos', 'documents') and public.admin_owns_beneficiary_path(name))
  with check (bucket_id in ('logos', 'documents') and public.admin_owns_beneficiary_path(name));

select 'ok' as resultat;
