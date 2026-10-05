-- Linkee — migration 053 : tournées de Montpellier du mercredi 7 octobre au mercredi 4 novembre 2026
-- À exécuter dans Supabase → SQL Editor → Run (rejouable sans risque : un arrêt déjà présent ce jour-là n'est pas recréé).
--
-- Lundi    : Halle Tropisme → PLO Primeurs → Grand Fruit → Halle Bio d'Occitanie → Pain de l'espoir → Paul Valéry → Triolet
--            (+ Richter après Triolet les semaines paires : 12 et 26 octobre) → retour Halle Tropisme
-- Mercredi : Halle Tropisme → PLO Primeurs → Grand Fruit → Halle Bio d'Occitanie → retour ; distribution Halle Tropisme à 17h
-- Pana (mercredi 18h–19h) passe par un Link bénévole : pas d'arrêt camion, rappel dans le Planning.
-- Heures = arrivées prévues (départ 9h00, trajets routiers réels, attente jusqu'à l'ouverture des créneaux) ;
-- l'app les recalcule dès qu'on modifie la journée.

insert into public.collectes (city_id, scheduled_date, scheduled_time, sort_order, kind, partner_id, beneficiary_id, duration_min, status, source)
select 'd0cce78d-719a-43f5-81bd-ad6b71901877'::uuid, v.d::date, v.t::time, v.o, v.kind, v.partner_id, v.beneficiary_id, v.dur, 'todo', 'planning'
  from (values
  ('2026-10-07', '09:08', 0, 'partner', '68aba471-1e67-4451-a6d6-74b99c6e580d'::uuid, null, 10),
  ('2026-10-07', '10:00', 1, 'partner', '2c707a1f-a181-48dd-a8e1-bbe2b2bd470b'::uuid, null, 10),
  ('2026-10-07', '11:00', 2, 'partner', '1401fc51-7384-49b7-909a-7dd0ece845f1'::uuid, null, 35),
  ('2026-10-07', '17:00', 3, 'dropoff', null, 'a1e94f4d-ff9d-4e43-9e7e-e06c30601394'::uuid, 10),
  ('2026-10-12', '09:30', 0, 'partner', '68aba471-1e67-4451-a6d6-74b99c6e580d'::uuid, null, 10),
  ('2026-10-12', '10:00', 1, 'partner', '2c707a1f-a181-48dd-a8e1-bbe2b2bd470b'::uuid, null, 10),
  ('2026-10-12', '11:00', 2, 'partner', '1401fc51-7384-49b7-909a-7dd0ece845f1'::uuid, null, 35),
  ('2026-10-12', '13:00', 3, 'partner', 'b25d0984-203d-4d3a-9cf8-b32cf0d96b14'::uuid, null, 10),
  ('2026-10-12', '15:00', 4, 'dropoff', null, '8d18395f-e6cf-497c-8d45-61da7c64d9d5'::uuid, 10),
  ('2026-10-12', '17:00', 5, 'dropoff', null, '1b79bd48-0d4f-44c4-8507-03d248e640be'::uuid, 10),
  ('2026-10-12', '17:24', 6, 'dropoff', null, 'd4f7ecc5-272b-4188-b690-c6d02408f8b8'::uuid, 10),
  ('2026-10-14', '09:08', 0, 'partner', '68aba471-1e67-4451-a6d6-74b99c6e580d'::uuid, null, 10),
  ('2026-10-14', '10:00', 1, 'partner', '2c707a1f-a181-48dd-a8e1-bbe2b2bd470b'::uuid, null, 10),
  ('2026-10-14', '11:00', 2, 'partner', '1401fc51-7384-49b7-909a-7dd0ece845f1'::uuid, null, 35),
  ('2026-10-14', '17:00', 3, 'dropoff', null, 'a1e94f4d-ff9d-4e43-9e7e-e06c30601394'::uuid, 10),
  ('2026-10-19', '09:30', 0, 'partner', '68aba471-1e67-4451-a6d6-74b99c6e580d'::uuid, null, 10),
  ('2026-10-19', '10:00', 1, 'partner', '2c707a1f-a181-48dd-a8e1-bbe2b2bd470b'::uuid, null, 10),
  ('2026-10-19', '11:00', 2, 'partner', '1401fc51-7384-49b7-909a-7dd0ece845f1'::uuid, null, 35),
  ('2026-10-19', '13:00', 3, 'partner', 'b25d0984-203d-4d3a-9cf8-b32cf0d96b14'::uuid, null, 10),
  ('2026-10-19', '15:00', 4, 'dropoff', null, '8d18395f-e6cf-497c-8d45-61da7c64d9d5'::uuid, 10),
  ('2026-10-19', '17:00', 5, 'dropoff', null, '1b79bd48-0d4f-44c4-8507-03d248e640be'::uuid, 10),
  ('2026-10-21', '09:08', 0, 'partner', '68aba471-1e67-4451-a6d6-74b99c6e580d'::uuid, null, 10),
  ('2026-10-21', '10:00', 1, 'partner', '2c707a1f-a181-48dd-a8e1-bbe2b2bd470b'::uuid, null, 10),
  ('2026-10-21', '11:00', 2, 'partner', '1401fc51-7384-49b7-909a-7dd0ece845f1'::uuid, null, 35),
  ('2026-10-21', '17:00', 3, 'dropoff', null, 'a1e94f4d-ff9d-4e43-9e7e-e06c30601394'::uuid, 10),
  ('2026-10-26', '09:30', 0, 'partner', '68aba471-1e67-4451-a6d6-74b99c6e580d'::uuid, null, 10),
  ('2026-10-26', '10:00', 1, 'partner', '2c707a1f-a181-48dd-a8e1-bbe2b2bd470b'::uuid, null, 10),
  ('2026-10-26', '11:00', 2, 'partner', '1401fc51-7384-49b7-909a-7dd0ece845f1'::uuid, null, 35),
  ('2026-10-26', '13:00', 3, 'partner', 'b25d0984-203d-4d3a-9cf8-b32cf0d96b14'::uuid, null, 10),
  ('2026-10-26', '15:00', 4, 'dropoff', null, '8d18395f-e6cf-497c-8d45-61da7c64d9d5'::uuid, 10),
  ('2026-10-26', '17:00', 5, 'dropoff', null, '1b79bd48-0d4f-44c4-8507-03d248e640be'::uuid, 10),
  ('2026-10-26', '17:24', 6, 'dropoff', null, 'd4f7ecc5-272b-4188-b690-c6d02408f8b8'::uuid, 10),
  ('2026-10-28', '09:08', 0, 'partner', '68aba471-1e67-4451-a6d6-74b99c6e580d'::uuid, null, 10),
  ('2026-10-28', '10:00', 1, 'partner', '2c707a1f-a181-48dd-a8e1-bbe2b2bd470b'::uuid, null, 10),
  ('2026-10-28', '11:00', 2, 'partner', '1401fc51-7384-49b7-909a-7dd0ece845f1'::uuid, null, 35),
  ('2026-10-28', '17:00', 3, 'dropoff', null, 'a1e94f4d-ff9d-4e43-9e7e-e06c30601394'::uuid, 10),
  ('2026-11-02', '09:30', 0, 'partner', '68aba471-1e67-4451-a6d6-74b99c6e580d'::uuid, null, 10),
  ('2026-11-02', '10:00', 1, 'partner', '2c707a1f-a181-48dd-a8e1-bbe2b2bd470b'::uuid, null, 10),
  ('2026-11-02', '11:00', 2, 'partner', '1401fc51-7384-49b7-909a-7dd0ece845f1'::uuid, null, 35),
  ('2026-11-02', '13:00', 3, 'partner', 'b25d0984-203d-4d3a-9cf8-b32cf0d96b14'::uuid, null, 10),
  ('2026-11-02', '15:00', 4, 'dropoff', null, '8d18395f-e6cf-497c-8d45-61da7c64d9d5'::uuid, 10),
  ('2026-11-02', '17:00', 5, 'dropoff', null, '1b79bd48-0d4f-44c4-8507-03d248e640be'::uuid, 10),
  ('2026-11-04', '09:08', 0, 'partner', '68aba471-1e67-4451-a6d6-74b99c6e580d'::uuid, null, 10),
  ('2026-11-04', '10:00', 1, 'partner', '2c707a1f-a181-48dd-a8e1-bbe2b2bd470b'::uuid, null, 10),
  ('2026-11-04', '11:00', 2, 'partner', '1401fc51-7384-49b7-909a-7dd0ece845f1'::uuid, null, 35),
  ('2026-11-04', '17:00', 3, 'dropoff', null, 'a1e94f4d-ff9d-4e43-9e7e-e06c30601394'::uuid, 10)
  ) as v(d, t, o, kind, partner_id, beneficiary_id, dur)
 where not exists (
   select 1 from public.collectes c
    where c.city_id = 'd0cce78d-719a-43f5-81bd-ad6b71901877'
      and c.scheduled_date = v.d::date
      and c.partner_id is not distinct from v.partner_id
      and c.beneficiary_id is not distinct from v.beneficiary_id
 );

select c.scheduled_date, to_char(c.scheduled_date, 'TMDay') as jour, c.scheduled_time, coalesce(p.name, b.name) as arret, c.duration_min
  from public.collectes c
  left join public.partners p on p.id = c.partner_id
  left join public.beneficiaries b on b.id = c.beneficiary_id
 where c.city_id = 'd0cce78d-719a-43f5-81bd-ad6b71901877' and c.scheduled_date between '2026-10-07' and '2026-11-04'
 order by c.scheduled_date, c.sort_order;
