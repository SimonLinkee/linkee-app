-- Linkee — migration 041 : l'association peut gérer elle-même son logo (comme un partenaire)
-- Tout le reste du lot "self-service" de l'espace bénéficiaire (frais accepté, jauge de bénéficiaires,
-- présentation libre, contacts, créneaux de livraison fixe) vit dans la colonne "fiche" jsonb existante —
-- aucune migration nécessaire pour ces champs-là. Seul le logo a besoin d'une vraie colonne, comme pour
-- "partners.logo_url", et d'un accès au coffre public "logos".
-- À exécuter dans Supabase → SQL Editor → Run (rejouable), APRÈS la migration 040.

alter table public.beneficiaries add column if not exists logo_url text;

drop policy if exists storage_beneficiary_files on storage.objects;
create policy storage_beneficiary_files on storage.objects for all to authenticated
  using (bucket_id in ('documents', 'logos') and public.owns_beneficiary_path(name))
  with check (bucket_id in ('documents', 'logos') and public.owns_beneficiary_path(name));

select 'ok' as resultat;
