-- Linkee — migration 081 : plus de notification « Planning du mois prêt » aux logisticiens
-- À exécuter dans Supabase → SQL Editor → Run (rejouable sans risque). Nécessite la migration 056.
--
-- La génération du planning (automatique le 20 de chaque mois, ou à la main) ne prévient plus les logisticiens :
-- la fonction generate_planning_month est reprise à l'identique de la migration 056, sans l'envoi de cette notification.
-- Les autres notifications du planning (« Ton planning a été modifié ») ne changent pas.

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
  end if;

  return jsonb_build_object('already', false, 'stops_created', n, 'from', v_from, 'to', v_end);
end $$;
revoke all on function public.generate_planning_month(uuid, date) from public;
grant execute on function public.generate_planning_month(uuid, date) to authenticated, service_role;

select 'ok' as resultat;
