-- Linkee — migration 031 : pause déjeuner comme étape déplaçable du planning
-- À exécuter dans Supabase → SQL Editor → Run (rejouable), APRÈS la migration 030.

alter table public.collectes drop constraint if exists collectes_kind_check;
alter table public.collectes add constraint collectes_kind_check
  check (kind in ('partner', 'dropoff', 'stock', 'exceptionnel', 'demande_client', 'pause'));

select 'ok' as resultat;
