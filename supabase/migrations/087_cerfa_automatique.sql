-- Linkee — migration 087 : Cerfa automatiques (une demande par partenaire et par période, créée toute seule)
-- À exécuter dans Supabase → SQL Editor → Run (rejouable sans risque). Nécessite les migrations 044, 045 et 064.
--
-- Circuit :
--   1) Chaque matin, la tâche planifiée (/api/cron/cerfa-generate) appelle generate_auto_cerfa().
--   2) Pour chaque partenaire actif dont la fiche a une périodicité (mensuel, trimestriel, annuel — mois, trimestre et année
--      CIVILS), on regarde la dernière période terminée (celle du mois / trimestre / de l'année précédent) :
--        • toutes les collectes de la période doivent être renseignées (plus aucune « à faire ») et valorisées (chaque ligne de poids
--          a sa valeur en €). Sinon : la période reste « en attente » et l'antenne est prévenue (un rappel par semaine).
--        • quand tout est complet : une demande de Cerfa est créée (statut « soumise », total = somme des valeurs).
--          Rien n'est créé si le total est nul. Les collectes comptées sont rattachées à la demande (jamais comptées deux fois).
--   3) Le Responsable d'antenne VALIDE (ou refuse) la demande, comme aujourd'hui ; la Comptabilité émet le Cerfa ; il part par mail.
--   Si l'antenne refuse une demande, ses collectes sont libérées et la période est recalculée (après correction des valeurs).

alter table public.cerfa_requests add column if not exists period_start date;
alter table public.cerfa_requests add column if not exists period_end date;
alter table public.cerfa_requests add column if not exists auto boolean not null default false;

-- Collectes comptées dans une demande automatique -------------------------------------------------------------------
create table if not exists public.cerfa_request_collectes (
  request_id uuid not null references public.cerfa_requests(id) on delete cascade,
  collecte_id uuid not null references public.collectes(id) on delete cascade,
  value numeric(12,2) not null default 0,
  active boolean not null default true,
  primary key (request_id, collecte_id)
);
create unique index if not exists cerfa_collectes_one_active on public.cerfa_request_collectes (collecte_id) where active;
alter table public.cerfa_request_collectes enable row level security;
drop policy if exists cerfa_collectes_read on public.cerfa_request_collectes;
create policy cerfa_collectes_read on public.cerfa_request_collectes for select to authenticated
  using (public.can_see_cerfa_request(request_id));

create or replace function public.trg_cerfa_release_collectes() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status then
    update public.cerfa_request_collectes set active = (new.status <> 'refusee') where request_id = new.id;
  end if;
  return new;
end $$;
drop trigger if exists cerfa_release_collectes on public.cerfa_requests;
create trigger cerfa_release_collectes after update of status on public.cerfa_requests
  for each row execute function public.trg_cerfa_release_collectes();

-- Suivi des périodes : créée, vide (rien à déclarer) ou en attente de valeurs ----------------------------------------
create table if not exists public.cerfa_periods (
  partner_id uuid not null references public.partners(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  city_id uuid not null references public.cities(id),
  status text not null default 'attente' check (status in ('attente', 'creee', 'vide')),
  missing jsonb not null default '[]',      -- [{ collecte_id, date, reason }] reason : non_saisie | sans_ligne | valeur_manquante
  request_id uuid references public.cerfa_requests(id) on delete set null,
  checked_at timestamptz not null default now(),
  primary key (partner_id, period_start)
);
alter table public.cerfa_periods enable row level security;
drop policy if exists cerfa_periods_read on public.cerfa_periods;
create policy cerfa_periods_read on public.cerfa_periods for select to authenticated
  using (public.antenne_in_city(city_id));

-- Notification de l'antenne : un titre dédié pour les demandes automatiques ------------------------------------------
create or replace function public.trg_notify_cerfa() returns trigger
  language plpgsql security definer set search_path = public as $$
declare v_partner text; v_amount text; u uuid; v_n int := 0; v_title text; v_period text;
begin
  select name into v_partner from public.partners where id = new.partner_id;
  v_amount := replace(trim(to_char(new.total_value, 'FM999999990.00')), '.', ',') || ' €';
  v_period := case when new.auto and new.period_start is not null
    then ' · du ' || to_char(new.period_start, 'DD/MM/YYYY') || ' au ' || to_char(new.period_end, 'DD/MM/YYYY') else '' end;
  v_title := case when new.auto then 'Cerfa automatique à valider' else 'Nouvelle demande de Cerfa à valider' end;

  if tg_op = 'INSERT' then
    for u in select id from public.profiles where active and role = 'admin_local' and city_id = new.city_id loop
      perform public.notify(u, new.city_id, 'cerfa', v_title,
        coalesce(v_partner, 'Un partenaire') || ' — ' || v_amount || v_period, '/comptabilite', 'cerfa:' || new.id || ':soumise');
      v_n := v_n + 1;
    end loop;
    if v_n = 0 then -- aucune antenne dans cette ville : la Comptabilité voit la demande plutôt que de la laisser dormir
      for u in select id from public.profiles where active and role = 'comptabilite' loop
        perform public.notify(u, new.city_id, 'cerfa', v_title || ' (aucune antenne pour la valider)',
          coalesce(v_partner, 'Un partenaire') || ' — ' || v_amount || v_period, '/comptabilite', 'cerfa:' || new.id || ':soumise');
      end loop;
    end if;
    return null;
  end if;

  if new.status is distinct from old.status then
    if new.status = 'validee' then
      for u in select id from public.profiles where active and role = 'comptabilite' loop
        perform public.notify(u, new.city_id, 'cerfa', 'Cerfa à émettre',
          coalesce(v_partner, 'Un partenaire') || ' — ' || v_amount || ' (demande validée)' || v_period, '/comptabilite', 'cerfa:' || new.id || ':validee');
      end loop;
    elsif new.status = 'refusee' then
      for u in select profile_id from public.partner_users where partner_id = new.partner_id loop
        perform public.notify(u, new.city_id, 'cerfa', 'Votre demande de Cerfa a été refusée',
          coalesce(new.refusal_comment, ''), '/espace-partenaire', 'cerfa:' || new.id || ':refusee');
      end loop;
    elsif new.status = 'emise' then
      for u in select profile_id from public.partner_users where partner_id = new.partner_id loop
        perform public.notify(u, new.city_id, 'cerfa', 'Votre Cerfa est disponible',
          'Téléchargez-le dans « Mes documents », bloc « Mes Cerfa ».', '/espace-partenaire', 'cerfa:' || new.id || ':emise');
      end loop;
    end if;
  end if;
  return null;
end $$;

-- Génération (appelée chaque matin par /api/cron/cerfa-generate, clé serveur uniquement) ----------------------------
create or replace function public.generate_auto_cerfa(p_today date default current_date) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  pr record; v_missing jsonb; v_total numeric; v_nb int; v_req uuid;
  v_created int := 0; v_wait int := 0; v_empty int := 0; c record; u uuid;
begin
  -- une demande refusée par l'antenne : sa période est recalculée
  update public.cerfa_periods p set status = 'attente'
   where p.status = 'creee' and exists (select 1 from public.cerfa_requests r where r.id = p.request_id and r.status = 'refusee');

  for pr in
    with cfg as (
      select p.id, p.city_id, case p.fiche->>'cerfaFrequency' when 'mensuel' then 1 when 'trimestriel' then 3 else 12 end as len
        from public.partners p
       where p.deleted_at is null and p.active and p.fiche->>'cerfaFrequency' in ('mensuel', 'trimestriel', 'annuel')
    ), cur as (
      select cfg.*, (case cfg.len when 1 then date_trunc('month', p_today) when 3 then date_trunc('quarter', p_today) else date_trunc('year', p_today) end)::date as s from cfg
    )
    select cur.id as partner_id, cur.city_id, (cur.s - make_interval(months => cur.len))::date as ps, (cur.s - 1) as pe from cur
    union
    select pe.partner_id, pe.city_id, pe.period_start, pe.period_end from public.cerfa_periods pe
      join public.partners pa on pa.id = pe.partner_id and pa.deleted_at is null
     where pe.status = 'attente'
  loop
    if exists (select 1 from public.cerfa_periods x where x.partner_id = pr.partner_id and x.period_start = pr.ps and x.status in ('creee', 'vide')) then
      continue;
    end if;

    -- ce qui empêche d'émettre : collecte pas renseignée, sans ligne de poids, ou ligne sans valeur
    select coalesce(jsonb_agg(jsonb_build_object('collecte_id', t.id, 'date', t.scheduled_date, 'reason', t.reason) order by t.scheduled_date), '[]'::jsonb)
      into v_missing
      from (
        select c2.id, c2.scheduled_date,
               case when c2.status = 'todo' then 'non_saisie'
                    when not exists (select 1 from public.collecte_items i where i.collecte_id = c2.id) then 'sans_ligne'
                    else 'valeur_manquante' end as reason
          from public.collectes c2
         where c2.partner_id = pr.partner_id and c2.source = 'planning'
           and c2.kind in ('partner', 'exceptionnel', 'demande_client')
           and c2.scheduled_date between pr.ps and pr.pe and c2.status <> 'annule'
           and not exists (select 1 from public.cerfa_request_collectes x where x.collecte_id = c2.id and x.active)
           and (c2.status = 'todo'
                or not exists (select 1 from public.collecte_items i where i.collecte_id = c2.id)
                or exists (select 1 from public.collecte_items i where i.collecte_id = c2.id and i.value_snapshot is null))
      ) t;

    if jsonb_array_length(v_missing) > 0 then
      insert into public.cerfa_periods (partner_id, period_start, period_end, city_id, status, missing, checked_at)
        values (pr.partner_id, pr.ps, pr.pe, pr.city_id, 'attente', v_missing, now())
        on conflict (partner_id, period_start) do update set status = 'attente', missing = excluded.missing, checked_at = now(), request_id = null;
      v_wait := v_wait + 1;
      continue;
    end if;

    select count(distinct c3.id), coalesce(sum(i.value_snapshot), 0) into v_nb, v_total
      from public.collectes c3 join public.collecte_items i on i.collecte_id = c3.id
     where c3.partner_id = pr.partner_id and c3.source = 'planning' and c3.status = 'collecte'
       and c3.kind in ('partner', 'exceptionnel', 'demande_client')
       and c3.scheduled_date between pr.ps and pr.pe
       and not exists (select 1 from public.cerfa_request_collectes x where x.collecte_id = c3.id and x.active);

    if v_nb = 0 or v_total <= 0 then
      insert into public.cerfa_periods (partner_id, period_start, period_end, city_id, status, missing, checked_at)
        values (pr.partner_id, pr.ps, pr.pe, pr.city_id, 'vide', '[]', now())
        on conflict (partner_id, period_start) do update set status = 'vide', missing = '[]', checked_at = now(), request_id = null;
      v_empty := v_empty + 1;
      continue;
    end if;

    insert into public.cerfa_requests (partner_id, city_id, requested_by, total_value, period_start, period_end, auto)
      values (pr.partner_id, pr.city_id, null, round(v_total, 2), pr.ps, pr.pe, true) returning id into v_req;
    insert into public.cerfa_request_collectes (request_id, collecte_id, value)
      select v_req, c4.id, round(sum(i.value_snapshot), 2)
        from public.collectes c4 join public.collecte_items i on i.collecte_id = c4.id
       where c4.partner_id = pr.partner_id and c4.source = 'planning' and c4.status = 'collecte'
         and c4.kind in ('partner', 'exceptionnel', 'demande_client')
         and c4.scheduled_date between pr.ps and pr.pe
         and not exists (select 1 from public.cerfa_request_collectes x where x.collecte_id = c4.id and x.active)
       group by c4.id;
    insert into public.cerfa_periods (partner_id, period_start, period_end, city_id, status, missing, request_id, checked_at)
      values (pr.partner_id, pr.ps, pr.pe, pr.city_id, 'creee', '[]', v_req, now())
      on conflict (partner_id, period_start) do update set status = 'creee', missing = '[]', request_id = v_req, checked_at = now();
    v_created := v_created + 1;
  end loop;

  -- rappel à l'antenne : UNE notification par ville et par semaine pour les périodes qui attendent des valeurs
  for c in select city_id, count(*) as n from public.cerfa_periods where status = 'attente' group by city_id loop
    for u in select * from public.admin_recipients(c.city_id) loop
      perform public.notify(u, c.city_id, 'cerfa', 'Cerfa en attente : des collectes à compléter',
        c.n || ' partenaire(s) ont une période à compléter (collectes non saisies ou sans valeur) avant de créer leur Cerfa. Voir l''onglet Cerfa.',
        '/comptabilite', 'cerfa-wait:' || c.city_id || ':' || to_char(p_today, 'IYYY-IW'));
    end loop;
  end loop;

  return jsonb_build_object('created', v_created, 'waiting', v_wait, 'empty', v_empty);
end $$;
revoke all on function public.generate_auto_cerfa(date) from public;
grant execute on function public.generate_auto_cerfa(date) to service_role;

select 'ok' as resultat;
