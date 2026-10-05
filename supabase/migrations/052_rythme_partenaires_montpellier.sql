-- Linkee — migration 052 : rythme des partenaires actifs de Montpellier (Régulier / Ponctuel)
-- À exécuter dans Supabase → SQL Editor → Run (rejouable sans risque).
--
-- Le rythme vit dans la fiche (jsonb) : fiche.rythme = 'regulier' | 'ponctuel'.
--   • Réguliers : prévus au planning sur leurs créneaux (ajoutés automatiquement chaque jour concerné).
--   • Ponctuels : font leurs demandes eux-mêmes depuis leur espace partenaire.
-- fiche.linkSystematique = true : un Link bénévole est à prévoir sur chacun de ses créneaux (rappel dans le Planning).

-- Réguliers
update public.partners
   set fiche = coalesce(fiche, '{}'::jsonb) || '{"rythme":"regulier"}'::jsonb
 where city_id = 'd0cce78d-719a-43f5-81bd-ad6b71901877'
   and deleted_at is null
   and name in ('PLO Primeurs', 'Halle Bio d''Occitanie', 'Grand Fruit', 'Pain de l''espoir');

-- Pana : régulier, avec Link bénévole systématique sur son créneau
update public.partners
   set fiche = coalesce(fiche, '{}'::jsonb) || '{"rythme":"regulier","linkSystematique":true}'::jsonb
 where city_id = 'd0cce78d-719a-43f5-81bd-ad6b71901877'
   and deleted_at is null
   and name = 'Pana Boulangerie';

-- Ponctuels
update public.partners
   set fiche = coalesce(fiche, '{}'::jsonb) || '{"rythme":"ponctuel"}'::jsonb
 where city_id = 'd0cce78d-719a-43f5-81bd-ad6b71901877'
   and deleted_at is null
   and name in ('Brigades de Véro', 'Pas Perdu');

select name, active, fiche->>'rythme' as rythme, fiche->'linkSystematique' as link_systematique, fiche->'creneaux' as creneaux
  from public.partners
 where city_id = 'd0cce78d-719a-43f5-81bd-ad6b71901877' and deleted_at is null and active
 order by fiche->>'rythme' nulls last, name;
