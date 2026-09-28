-- Linkee — migration 016 : bénévoles et coordinateurs présents à une distribution
-- À exécuter dans Supabase → SQL Editor → Run (rejouable sans risque). Nécessite la migration 014.
alter table public.distributions add column if not exists volunteers_total int;   -- nombre de bénévoles présents (total)
alter table public.distributions add column if not exists coordinators int;       -- dont coordinateurs

select 'ok' as resultat;
