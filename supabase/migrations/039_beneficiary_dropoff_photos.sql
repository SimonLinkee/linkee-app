-- Linkee — migration 039 : une association peut voir les photos prises par le logisticien à sa dépose
-- Les photos de dépose sont déjà prises (obligatoires pour valider une dépose, voir journee/page.tsx) et
-- stockées dans le coffre privé "collecte-photos", sous "<ville>/<id de la collecte>/...". Jusqu'ici seule
-- l'équipe pouvait les lire. On ajoute une règle étroite : un compte bénéficiaire peut lire les photos des
-- collectes qui concernent SA structure (via beneficiary_users, même mécanisme que pour ses documents).
-- À exécuter dans Supabase → SQL Editor → Run (rejouable), APRÈS la migration 038.

create or replace function public.owns_beneficiary_collecte_photo_path(path text) returns boolean
  language sql stable security definer set search_path = public, storage as $$
  select exists (
    select 1 from public.collectes c
    join public.beneficiary_users bu on bu.beneficiary_id = c.beneficiary_id
    where c.id::text = (storage.foldername(path))[2]
      and bu.profile_id = auth.uid()
  ) $$;

drop policy if exists storage_beneficiary_collecte_photos on storage.objects;
create policy storage_beneficiary_collecte_photos on storage.objects for select to authenticated
  using (bucket_id = 'collecte-photos' and public.owns_beneficiary_collecte_photo_path(name));

select 'ok' as resultat;
