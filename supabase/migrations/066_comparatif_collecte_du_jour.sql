-- Linkee — migration 066 : nettoyage du comparatif (suite de la 065)
-- À exécuter dans Supabase → SQL Editor → Run (rejouable sans risque).
--
-- L'onglet « Collecté » affiche désormais directement les collectes DU JOUR de la distribution (les vraies lignes du Planning,
-- modifiables) : le rattachement collecte → distribution de la migration 065 ne sert plus. On le retire.
-- Les commentaires d'écart (distribution_gap_notes) et la règle de lecture can_read_comparatif() sont conservés.

drop function if exists public.prefill_distribution_sources(uuid, boolean);
drop table if exists public.distribution_sources;
drop function if exists public.trg_dsrc_same_city();
alter table public.distributions drop column if exists sources_prefilled_at;

select 'ok' as resultat;