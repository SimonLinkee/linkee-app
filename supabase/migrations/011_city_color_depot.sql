-- Linkee — migration 011 : couleur et dépôt de chaque ville
-- À exécuter dans Supabase → SQL Editor → Run (rejouable sans risque).

alter table public.cities add column if not exists color text;            -- ex. "#2a78d6" (couleur du sélecteur de ville)
alter table public.cities add column if not exists depot_address text;    -- adresse de l'entrepôt / point de départ des tournées

update public.cities set color = '#2a78d6' where name = 'Lyon' and color is null;
update public.cities set depot_address = '110 Rue du Companet, 69140 Rillieux-la-Pape' where name = 'Lyon' and depot_address is null;

select 'ok' as resultat;
