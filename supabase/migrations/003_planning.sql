-- Linkee — migration 003 : planning réel (durée des arrêts, denrée/volume prévus, checklist par défaut)
-- À exécuter dans Supabase → SQL Editor → Run (rejouable sans risque).

alter table public.collectes add column if not exists duration_min int not null default 10;
alter table public.collectes add column if not exists denree text;
alter table public.collectes add column if not exists volume_kg numeric(10,2);

-- Checklist de départ par défaut du lundi (modifiable ensuite depuis le Planning)
insert into public.checklist_templates (city_id, weekday, items)
select id, 1, '[{"id":"ck1","label":"Vérifier le niveau de carburant"},{"id":"ck2","label":"Charger les caisses et les glacières"},{"id":"ck3","label":"Contrôler la pression des pneus"}]'::jsonb
from public.cities where name = 'Lyon'
on conflict (city_id, weekday) do nothing;

select 'ok' as resultat;
