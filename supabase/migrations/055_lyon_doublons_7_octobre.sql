-- Linkee — migration 055 : doublons du planning de Lyon du mercredi 7 octobre 2026
-- À exécuter dans Supabase → SQL Editor → Run (rejouable sans risque).
--
-- Créés le 5 octobre par un bug du Planning au changement de jour (corrigé dans le code) : l'ajout automatique
-- comparait le mercredi aux arrêts du jour précédent, et 6 arrêts du mardi 6 ont été réécrits au mercredi 7.
-- On garde UN passage de chaque lieu ; les collectes partenaires (Agriz, Agis, Bonomia, 3 petit pois…) ne sont
-- pas touchées : à l'équipe de Lyon de décider si elles restent le mercredi.
--
-- Supprimés (tous « à faire », aucune pesée) :
--   Déchetterie            8ae3cd71 (venue du mardi, qui a déjà la sienne) et 75ca964e (ajout automatique en double)
--   Maison des étudiants   1ac33ef0 (ajout automatique en double — reste a6b53c3f)
--   Les Grandes Voisines   425357ae et c3e11116 (doubles — reste 57d24683)

delete from public.collectes
 where city_id = 'c9287602-c247-48e8-b62e-ccab7a9df042'
   and scheduled_date = '2026-10-07'
   and status = 'todo'
   and not exists (select 1 from public.collecte_items i where i.collecte_id = collectes.id)
   and id in (
     '8ae3cd71-18c3-439a-87a2-2bc632fb1cd3',
     '75ca964e-ae4f-4337-80db-f28317d6c546',
     '1ac33ef0-6916-4c4d-b8d7-746d807edc90',
     '425357ae-3687-40e6-92f2-9895bbab6982',
     'c3e11116-7ef5-4974-be27-11c22a173893'
   );

select c.scheduled_time, c.kind, coalesce(p.name, b.name, c.label) as arret
  from public.collectes c
  left join public.partners p on p.id = c.partner_id
  left join public.beneficiaries b on b.id = c.beneficiary_id
 where c.city_id = 'c9287602-c247-48e8-b62e-ccab7a9df042' and c.scheduled_date = '2026-10-07'
 order by c.sort_order;
