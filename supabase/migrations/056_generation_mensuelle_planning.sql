-- Linkee — migration 056 : génération mensuelle du planning, sans doublon possible
-- À exécuter dans Supabase → SQL Editor → Run (rejouable sans risque).
--
-- Principe : une fois par mois et par ville, l'app crée d'un coup toutes les collectes du mois à partir des fiches :
--   • partenaires actifs au rythme « Régulier » ayant des créneaux de collecte (pas les « Éligible collecte bénévole » :
--     les Links bénévoles restent indépendants),
--   • associations actives ayant un « Créneau de livraison fixe »,
--   • passage déchetterie (Lyon uniquement : mardi 9h, mercredi 10h).
-- Le responsable d'antenne revoit et réarrange ensuite chaque journée dans le Planning (les heures se calculent
-- à l'ouverture de la journée). Plus aucun ajout automatique à l'ouverture d'un jour.
--
-- Anti-doublon, à trois niveaux :
--   1) un mois n'est généré qu'une fois par ville (table planning_generations) : un arrêt retiré à la main ne revient pas ;
--   2) un lieu déjà présent ce jour-là (ajouté à la main, demande partenaire validée…) n'est pas recréé ;
--   3) index unique en base sur (ville, date, lieu) pour les arrêts générés : même deux générations simultanées
--      ne peuvent pas créer deux fois le même arrêt.
--
-- Déclenchement : automatiquement le 20 de chaque mois pour le mois suivant (Vercel Cron → /api/cron/planning),
-- ou à la main depuis le Planning (bouton « Générer le planning du mois »), par exemple pour le mois en cours.

-- 1) Clé des arrêts générés + index unique
alter table public.collectes add column if not exists auto_key text;   -- 'p:<partenaire>' | 'b:<association>' | 'dechetterie'
create unique index if not exists collectes_auto_key_unique
  on public.collectes (city_id, scheduled_date, auto_key) where auto_key is not null;

-- 2) Mois déjà générés
create table if not exists public.planning_generations (
  city_id uuid not null references public.cities(id) on delete cascade,
  month date not null,                                   -- 1er jour du mois
  generated_at timestamptz not null default now(),
  generated_by uuid references public.profiles(id) on delete set null,   -- vide = tâche automatique
  stops_created int not null default 0,
  primary key (city_id, month)
);
alter table public.planning_generations enable row level security;
drop policy if exists pgen_read on public.planning_generations;
create policy pgen_read on public.planning_generations for select to authenticated using (public.staff_in_city(city_id));
-- écriture uniquement via generate_planning_month (security definer)

-- 3) Heures d'ouverture des créneaux d'une fiche pour une date (même règle que src/lib/creneaux.ts : jour de la
--    semaine + semaines paires / impaires selon le numéro de semaine ISO)
create or replace function public.planning_slot_opens(p_creneaux jsonb, p_day date)
returns setof time
language sql immutable set search_path = public as $$
  with d as (
    select (array['lun','mar','mer','jeu','ven','sam','dim'])[extract(isodow from p_day)::int] as k,
           case when extract(week from p_day)::int % 2 = 0 then 'even' else 'odd' end as parity
  )
  select (s->>'open')::time
    from d, jsonb_array_elements(case when jsonb_typeof(p_creneaux -> d.k) = 'array' then p_creneaux -> d.k else '[]'::jsonb end) s
   where coalesce(s->>'open', '') <> ''
     and (coalesce(s->>'weekParity', '') = '' or s->>'weekParity' = d.parity)
$$;

-- 4) Pas de notification « Ton planning a été modifié » par jour pendant une génération (une seule, globale, à la fin)
create or replace function public.trg_notify_collecte() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  r public.collectes%rowtype;
  v_name text;
  u uuid;
begin
  r := case when tg_op = 'DELETE' then old else new end;
  if r.source = 'manual' then return null; end if;
  if current_setting('linkee.generation', true) = 'on' then return null; end if;

  if public.is_admin() then
    if r.scheduled_date >= current_date then
      for u in select id from public.profiles where active and role = 'logisticien' and city_id = r.city_id loop
        perform public.notify(u, r.city_id, 'planning', 'Ton planning a été modifié',
          'Le planning du ' || to_char(r.scheduled_date, 'DD/MM') || ' vient d''être mis à jour par l''équipe.',
          '/journee', 'planning:' || r.scheduled_date);
      end loop;
    end if;
  elsif tg_op = 'UPDATE' and new.status = 'annule' and old.status is distinct from 'annule' then
    select coalesce((select name from public.partners where id = new.partner_id),
                    (select name from public.beneficiaries where id = new.beneficiary_id), new.label, 'Un arrêt') into v_name;
    for u in select * from public.admin_recipients(new.city_id) loop
      perform public.notify(u, new.city_id, 'cancel', 'Collecte annulée sur le terrain',
        v_name || ' — ' || coalesce(nullif(new.motif, ''), 'sans motif') , '/planning', 'cancel:' || new.id);
    end loop;
  end if;
  return null;
end $$;

-- 5) Génération d'un mois pour une ville (à partir d'aujourd'hui si le mois est entamé)
create or replace function public.generate_planning_month(p_city uuid, p_month date)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_start date := date_trunc('month', p_month)::date;
  v_end date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
  v_from date;
  v_lyon boolean;
  v_label text;
  n int := 0;
  g public.planning_generations%rowtype;
  u uuid;
begin
  -- tâche automatique (pas d'utilisateur) ou Superadmin / Responsable d'antenne de la ville
  if auth.uid() is not null and not public.admin_in_city(p_city) then raise exception 'Accès refusé'; end if;

  select * into g from public.planning_generations where city_id = p_city and month = v_start;
  if found then
    return jsonb_build_object('already', true, 'generated_at', g.generated_at, 'stops_created', g.stops_created);
  end if;

  v_from := greatest(v_start, current_date);
  if v_from > v_end then return jsonb_build_object('already', false, 'stops_created', 0, 'reason', 'mois passé'); end if;
  select name = 'Lyon' into v_lyon from public.cities where id = p_city;
  perform set_config('linkee.generation', 'on', true);

  with days as (
    select d::date as day from generate_series(v_from, v_end, interval '1 day') d
  ),
  cand as (
    select dy.day, 'partner'::text as kind, p.id as partner_id, null::uuid as beneficiary_id, null::text as label,
           'p:' || p.id as auto_key, p.name as nm,
           coalesce(nullif(round((p.fiche->>'dureeCollecte')::numeric)::int, 0), 10) as dur,
           (select min(t) from public.planning_slot_opens(p.fiche->'creneaux', dy.day) t) as first_open
      from days dy
      cross join public.partners p
     where p.city_id = p_city and p.active and p.deleted_at is null and not p.benevole_only
       and p.fiche->>'rythme' = 'regulier'
    union all
    select dy.day, 'dropoff', null, b.id, null, 'b:' || b.id, b.name, 10,
           (select min(t) from public.planning_slot_opens(b.fiche->'creneaux', dy.day) t)
      from days dy
      cross join public.beneficiaries b
     where b.city_id = p_city and b.active and b.deleted_at is null
    union all
    select dy.day, 'dechetterie', null, null, 'Déchetterie', 'dechetterie', 'Déchetterie', 60,
           case extract(isodow from dy.day)::int when 2 then time '09:00' when 3 then time '10:00' end
      from days dy
     where v_lyon
  ),
  todo as (
    select c.*
      from cand c
     where c.first_open is not null
       and not exists (
         select 1 from public.collectes x
          where x.city_id = p_city and x.scheduled_date = c.day and x.source = 'planning'
            and (   (c.partner_id is not null and x.partner_id = c.partner_id)
                 or (c.beneficiary_id is not null and x.kind = 'dropoff' and x.beneficiary_id = c.beneficiary_id)
                 or (c.kind = 'dechetterie' and x.kind = 'dechetterie'))
       )
  ),
  ins as (
    insert into public.collectes (city_id, kind, partner_id, beneficiary_id, label, scheduled_date, scheduled_time,
                                  sort_order, status, duration_min, source, auto_key)
    select p_city, t.kind, t.partner_id, t.beneficiary_id, t.label, t.day, null,
           coalesce((select max(x.sort_order) + 1 from public.collectes x where x.city_id = p_city and x.scheduled_date = t.day), 0)
             + (row_number() over (partition by t.day order by t.first_open, t.nm))::int - 1,
           'todo', t.dur, 'planning', t.auto_key
      from todo t
    on conflict (city_id, scheduled_date, auto_key) where auto_key is not null do nothing
    returning 1
  )
  select count(*) into n from ins;

  perform set_config('linkee.generation', 'off', true);

  -- on ne marque le mois « généré » que s'il a produit quelque chose (une ville sans fiche pourra générer plus tard)
  if n > 0 then
    insert into public.planning_generations (city_id, month, generated_by, stops_created)
    values (p_city, v_start, auth.uid(), n)
    on conflict (city_id, month) do nothing;
    v_label := to_char(v_start, 'MM/YYYY');
    for u in select id from public.profiles where active and role = 'logisticien' and city_id = p_city loop
      perform public.notify(u, p_city, 'planning', 'Planning du mois prêt',
        'Les tournées de ' || v_label || ' sont planifiées (' || n || ' arrêts). Elles peuvent encore être ajustées par l''équipe.',
        '/journee', 'planning-month:' || v_start);
    end loop;
  end if;

  return jsonb_build_object('already', false, 'stops_created', n, 'from', v_from, 'to', v_end);
end $$;
revoke all on function public.generate_planning_month(uuid, date) from public;
grant execute on function public.generate_planning_month(uuid, date) to authenticated, service_role;

-- 6) Tâche automatique : toutes les villes, mois suivant
create or replace function public.generate_planning_next_month()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c record;
  res jsonb := '{}'::jsonb;
  m date := (date_trunc('month', current_date) + interval '1 month')::date;
begin
  if auth.uid() is not null then raise exception 'Réservé à la tâche automatique'; end if;
  for c in select id, name from public.cities order by name loop
    res := res || jsonb_build_object(c.name, public.generate_planning_month(c.id, m));
  end loop;
  return res;
end $$;
revoke all on function public.generate_planning_next_month() from public, authenticated;
grant execute on function public.generate_planning_next_month() to service_role;

select 'ok' as resultat;
