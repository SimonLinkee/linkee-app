-- Linkee — migration 045 : notifications Cerfa + alertes de retard — sujet 5 du lot Cerfa
-- À exécuter dans Supabase → SQL Editor → Run (rejouable), APRÈS la migration 044.
--
-- Notifications (dans l'appli uniquement, pas de mail) :
--   nouvelle demande            → Responsable(s) d'antenne de la ville (à défaut d'antenne : la Comptabilité)
--   demande validée             → Comptabilité ("Cerfa à émettre")
--   demande refusée             → partenaire (avec le commentaire)
--   Cerfa émis                  → partenaire
--   alerte de retard            → Comptabilité (voir plus bas)

create or replace function public.trg_notify_cerfa() returns trigger
  language plpgsql security definer set search_path = public as $$
declare v_partner text; v_amount text; u uuid; v_n int := 0;
begin
  select name into v_partner from public.partners where id = new.partner_id;
  v_amount := replace(trim(to_char(new.total_value, 'FM999999990.00')), '.', ',') || ' €';

  if tg_op = 'INSERT' then
    for u in select id from public.profiles where active and role = 'admin_local' and city_id = new.city_id loop
      perform public.notify(u, new.city_id, 'cerfa', 'Nouvelle demande de Cerfa à valider',
        coalesce(v_partner, 'Un partenaire') || ' — ' || v_amount, '/comptabilite', 'cerfa:' || new.id || ':soumise');
      v_n := v_n + 1;
    end loop;
    if v_n = 0 then -- aucune antenne dans cette ville : la Comptabilité voit la demande plutôt que de la laisser dormir
      for u in select id from public.profiles where active and role = 'comptabilite' loop
        perform public.notify(u, new.city_id, 'cerfa', 'Nouvelle demande de Cerfa (aucune antenne pour la valider)',
          coalesce(v_partner, 'Un partenaire') || ' — ' || v_amount, '/comptabilite', 'cerfa:' || new.id || ':soumise');
      end loop;
    end if;
    return null;
  end if;

  if new.status is distinct from old.status then
    if new.status = 'validee' then
      for u in select id from public.profiles where active and role = 'comptabilite' loop
        perform public.notify(u, new.city_id, 'cerfa', 'Cerfa à émettre',
          coalesce(v_partner, 'Un partenaire') || ' — ' || v_amount || ' (demande validée)', '/comptabilite', 'cerfa:' || new.id || ':validee');
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

drop trigger if exists notify_cerfa on public.cerfa_requests;
create trigger notify_cerfa after insert or update of status on public.cerfa_requests
  for each row execute function public.trg_notify_cerfa();

-- Alertes de retard ---------------------------------------------------------------------------------------------
-- Un partenaire en fréquence mensuelle / trimestrielle / annuelle est "en retard" pour la dernière période (mois,
-- trimestre ou année civils) terminée depuis plus de 15 jours si :
--   1) il n'a fait aucune demande de Cerfa depuis le début de cette période, ET
--   2) il a déposé, sur cette période, au moins un document qui n'est dans aucun Cerfa actif.
-- Rien n'est stocké : le calcul se refait à chaque lecture, donc l'alerte disparaît d'elle-même dès qu'une demande
-- est faite. Les périodes plus anciennes que la dernière échue ne sont pas relancées.
create or replace function public._cerfa_late()
returns table(partner_id uuid, partner_name text, city_id uuid, frequency text, period_start date, period_end date, due_date date, doc_count integer)
language sql stable security definer set search_path = public as $$
  with cfg as (
    select p.id, p.name, p.city_id, p.fiche->>'cerfaFrequency' as freq,
           case p.fiche->>'cerfaFrequency' when 'mensuel' then 1 when 'trimestriel' then 3 else 12 end as len
      from public.partners p
     where p.deleted_at is null and p.active and p.fiche->>'cerfaFrequency' in ('mensuel', 'trimestriel', 'annuel')
  ), cur as (
    select cfg.*, (case cfg.len when 1 then date_trunc('month', current_date) when 3 then date_trunc('quarter', current_date) else date_trunc('year', current_date) end)::date as s
      from cfg
  ), per as (
    select cur.*,
           case when current_date >= (cur.s - 1) + 15 then (cur.s - make_interval(months => cur.len))::date
                else (cur.s - make_interval(months => 2 * cur.len))::date end as p_start,
           case when current_date >= (cur.s - 1) + 15 then cur.s - 1
                else (cur.s - make_interval(months => cur.len))::date - 1 end as p_end
      from cur
  )
  select per.id, per.name, per.city_id, per.freq, per.p_start, per.p_end, per.p_end + 15, x.n
    from per
   cross join lateral (
     select count(*)::int as n from public.documents d
      where d.partner_id = per.id and d.created_at >= per.p_start and d.created_at < per.p_end + 1
        and not exists (select 1 from public.cerfa_request_documents c where c.document_id = d.id and c.active)
   ) x
   where x.n > 0
     and not exists (select 1 from public.cerfa_requests r where r.partner_id = per.id and r.created_at >= per.p_start)
$$;
revoke all on function public._cerfa_late() from public;

-- Lecture par l'appli : réservée au Superadmin et à la Comptabilité.
create or replace function public.cerfa_late_partners()
returns table(partner_id uuid, partner_name text, city_id uuid, frequency text, period_start date, period_end date, due_date date, doc_count integer)
language sql stable security definer set search_path = public as $$
  select * from public._cerfa_late() where public.my_role() = 'admin_principal'
$$;
revoke all on function public.cerfa_late_partners() from public;
grant execute on function public.cerfa_late_partners() to authenticated;

-- Envoi des alertes à la Comptabilité : appelée chaque jour par la tâche planifiée (/api/cron/cerfa-alerts, clé
-- serveur uniquement). Une seule notification par retard et par utilisateur, même si elle a déjà été lue.
create or replace function public.run_cerfa_alerts() returns integer
language plpgsql security definer set search_path = public as $$
declare l record; u uuid; v_key text; v_sent int := 0;
begin
  for l in select * from public._cerfa_late() loop
    v_key := 'cerfa-late:' || l.partner_id || ':' || l.period_start;
    for u in select id from public.profiles where active and role = 'comptabilite' loop
      if not exists (select 1 from public.notifications where user_id = u and key = v_key) then
        perform public.notify(u, l.city_id, 'cerfa', 'Cerfa en retard : ' || l.partner_name,
          'Période du ' || to_char(l.period_start, 'DD/MM/YYYY') || ' au ' || to_char(l.period_end, 'DD/MM/YYYY') || ' — '
          || l.doc_count || ' document(s) dans aucun Cerfa, aucune demande reçue.', '/comptabilite', v_key);
        v_sent := v_sent + 1;
      end if;
    end loop;
  end loop;
  return v_sent;
end $$;
revoke all on function public.run_cerfa_alerts() from public;
grant execute on function public.run_cerfa_alerts() to service_role;

select 'ok' as resultat;
