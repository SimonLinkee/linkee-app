-- Linkee — migration 032 : passage déchetterie dans le planning (jour fixe, à valider par le logisticien)
-- À exécuter dans Supabase → SQL Editor → Run (rejouable), APRÈS la migration 031.

alter table public.collectes drop constraint if exists collectes_kind_check;
alter table public.collectes add constraint collectes_kind_check
  check (kind in ('partner', 'dropoff', 'stock', 'exceptionnel', 'demande_client', 'pause', 'dechetterie'));

select 'ok' as resultat;
