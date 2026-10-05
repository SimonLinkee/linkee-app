-- Linkee — migration 057 : nettoyage des données de démonstration et de test (Lyon)
-- À exécuter dans Supabase → SQL Editor → Run. Rejouable sans risque. Tout se fait d'un bloc (transaction).
--
--   1. Remontées de Lyon : toutes (les 7 de la simulation + « test »), avec leurs messages
--   2. Poids factices des distributions : les lignes de produits distribués créées par la simulation
--   3. Distributions de Lyon avant le 5 octobre 2026 (28/9, 29/9, 2/10), avec leurs lignes et interventions
--      — celles à partir du 5 octobre et toutes celles de Montpellier sont gardées
--   4. Missions (TODO) : toutes
--   5. Cerfa de Lyon : toutes les demandes (soumises, validées, émises, refusées) et leurs récapitulatifs joints
--      — la demande de Montpellier (Aromandise) est gardée
--   6. Links bénévoles : tous, quel que soit leur statut ; les statistiques des Linkers (niveau, points, kg sauvés,
--      Links livrés) sont remises à zéro puisqu'il n'y a plus aucun Link. Les comptes Linkers sont gardés.
-- Les fichiers (récapitulatifs, Cerfa PDF) sont supprimés à part, depuis le stockage.

begin;

-- 1. Remontées de Lyon (messages supprimés en cascade)
delete from public.remontees where city_id = 'c9287602-c247-48e8-b62e-ccab7a9df042';

-- 2. Poids factices de la simulation
delete from public.distribution_lines where id in ('0d822957-c1bf-4a8d-aa13-f64583809a5d', '4dfa7e9b-d4f1-47c8-90a8-ca88ffb9d1fa', '365a90e4-7b54-47e2-b118-dbfcfe030df8', 'a5abbd76-6d0c-4362-af7d-f6fa04e6023a', 'fdacd05d-731b-4b33-ad05-243db586dead', '74633f16-06ac-41b5-bb7a-44a3efa972ae', '4c6f53c0-f8f3-4ffe-82bf-eede735d6cfc', '62dc96ff-9cbe-4ce9-8721-20e0d91cf39e', '389bfb52-7fa2-49e0-b69d-21bf1879b737', '8a3fc8bb-8518-4f1d-89a9-7655e40cf4ec', '5ece119d-15bb-4b4c-9fcd-535321c98c51');

-- 3. Distributions de Lyon avant le 5 octobre (lignes et interventions en cascade)
delete from public.distributions where city_id = 'c9287602-c247-48e8-b62e-ccab7a9df042' and event_date < '2026-10-05';

-- 4. Missions
delete from public.missions;

-- 5. Cerfa de Lyon : récapitulatifs joints, puis demandes (liens supprimés en cascade)
create temporary table _cerfa_docs on commit drop as
  select distinct d.document_id from public.cerfa_request_documents d
    join public.cerfa_requests r on r.id = d.request_id
   where r.city_id = 'c9287602-c247-48e8-b62e-ccab7a9df042';
delete from public.cerfa_requests where city_id = 'c9287602-c247-48e8-b62e-ccab7a9df042';
delete from public.documents where id in (select document_id from _cerfa_docs);

-- 6. Links bénévoles + statistiques des Linkers
delete from public.links;
update public.linkers set level = 1, points = 0, kg_saved = 0, links_done = 0;

commit;

select 'remontées Lyon' as quoi, count(*) as restant from public.remontees where city_id = 'c9287602-c247-48e8-b62e-ccab7a9df042'
union all select 'distributions Lyon avant le 5/10', count(*) from public.distributions where city_id = 'c9287602-c247-48e8-b62e-ccab7a9df042' and event_date < '2026-10-05'
union all select 'missions', count(*) from public.missions
union all select 'Cerfa Lyon', count(*) from public.cerfa_requests where city_id = 'c9287602-c247-48e8-b62e-ccab7a9df042'
union all select 'links', count(*) from public.links;
