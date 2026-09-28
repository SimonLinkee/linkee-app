-- Linkee — migration 005 : gestion des comptes (statut actif/inactif)
-- À exécuter dans Supabase → SQL Editor → Run (rejouable sans risque).

alter table public.profiles add column if not exists active boolean not null default true;

select 'ok' as resultat;
