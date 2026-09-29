-- Linkee — migration 029 : suppression logique des partenaires et bénéficiaires (deleted_at au lieu d'un DELETE),
-- pour ne jamais casser l'historique des collectes et distributions déjà liées à eux.
-- À exécuter dans Supabase → SQL Editor → Run (rejouable), APRÈS la migration 028.

alter table public.partners add column if not exists deleted_at timestamptz;
alter table public.beneficiaries add column if not exists deleted_at timestamptz;

create index if not exists partners_not_deleted on public.partners (city_id) where deleted_at is null;
create index if not exists beneficiaries_not_deleted on public.beneficiaries (city_id) where deleted_at is null;

select 'ok' as resultat;
