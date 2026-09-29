-- Linkee — migration 026 : transport du Linker (pied/vélo), partenaires benevole_only côté planning
-- À exécuter dans Supabase → SQL Editor → Run (rejouable), APRÈS la migration 025.

-- Le Linker choisit désormais "à pied" ou "vélo" (au lieu du seul rayon) — indépendant de `mode`, qui reste
-- la capacité 🎒/🚗 utilisée par le matching des Links (la voiture y reste masquée côté UI pour l'instant).
alter table public.linkers add column if not exists transport text not null default 'pied' check (transport in ('pied', 'velo'));

select 'ok' as resultat;
