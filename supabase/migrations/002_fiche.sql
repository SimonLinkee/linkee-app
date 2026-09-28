-- Linkee — migration 002 : fiches complètes des partenaires et bénéficiaires
-- À exécuter dans Supabase → SQL Editor → Run (rejouable sans risque).

alter table public.partners add column if not exists fiche jsonb not null default '{}';
alter table public.beneficiaries add column if not exists fiche jsonb not null default '{}';
alter table public.beneficiaries add column if not exists category text;

select 'ok' as resultat;
