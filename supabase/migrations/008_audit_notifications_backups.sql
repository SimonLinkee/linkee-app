-- Linkee — migration 008 : historique des modifications, notifications, sauvegardes
-- À exécuter dans Supabase → SQL Editor → Run (rejouable sans risque).

-- =====================================================================
-- 1) HISTORIQUE (audit) : qui a modifié quoi, quand — lecture réservée à l'admin principal
-- =====================================================================
create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor uuid,
  actor_email text,
  city_id uuid,
  table_name text not null,
  row_id text,
  action text not null check (action in ('INSERT','UPDATE','DELETE')),
  old_row jsonb,
  new_row jsonb
);
create index if not exists audit_log_at on public.audit_log (at desc);
create index if not exists audit_log_table on public.audit_log (table_name, at desc);
alter table public.audit_log enable row level security;
drop policy if exists audit_read on public.audit_log;
create policy audit_read on public.audit_log for select to authenticated using (public.my_role() = 'admin_principal');
-- aucune politique d'écriture : seuls les déclencheurs (security definer) écrivent

create or replace function public.log_change() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end;
  v_row jsonb := coalesce(v_new, v_old);
  v_email text;
begin
  if tg_op = 'UPDATE' and v_old = v_new then return null; end if;
  select email into v_email from public.profiles where id = auth.uid();
  insert into public.audit_log (actor, actor_email, city_id, table_name, row_id, action, old_row, new_row)
  values (auth.uid(), v_email, nullif(v_row->>'city_id','')::uuid, tg_table_name, coalesce(v_row->>'id', v_row->>'day', v_row->>'weekday'), tg_op, v_old, v_new);
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array['partners','beneficiaries','collectes','collecte_items','stock_items','stock_movements','vehicles',
                            'profiles','exceptional_requests','checklist_templates','checklist_overrides','documents','partner_users','cities']
  loop
    execute format('drop trigger if exists audit_%1$s on public.%1$s', t);
    execute format('create trigger audit_%1$s after insert or update or delete on public.%1$s for each row execute function public.log_change()', t);
  end loop;
end $$;

-- =====================================================================
-- 2) NOTIFICATIONS (dans l'application + base pour les emails)
-- =====================================================================
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  city_id uuid,
  type text not null check (type in ('request','planning','cancel','day_closed')),
  title text not null,
  body text,
  link text,
  key text,                                  -- clé de regroupement (évite 30 notifications pour un même planning)
  created_at timestamptz not null default now(),
  read_at timestamptz,
  emailed_at timestamptz
);
create index if not exists notifications_user on public.notifications (user_id, read_at, created_at desc);
alter table public.notifications enable row level security;
drop policy if exists notif_read on public.notifications;
create policy notif_read on public.notifications for select to authenticated using (user_id = auth.uid());
drop policy if exists notif_update on public.notifications;
create policy notif_update on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists notif_delete on public.notifications;
create policy notif_delete on public.notifications for delete to authenticated using (user_id = auth.uid());

-- Temps réel : la cloche se met à jour sans recharger la page
do $$ begin
  alter publication supabase_realtime add table public.notifications;
exception when duplicate_object then null; when undefined_object then null; end $$;

-- Qui reçoit les notifications « admin » d'une ville : admin principal + admins locaux de la ville
create or replace function public.admin_recipients(p_city uuid) returns setof uuid
  language sql stable security definer set search_path = public as $$
  select id from public.profiles
   where active and (role = 'admin_principal' or (role = 'admin_local' and city_id = p_city)) $$;

-- Ajoute une notification ; si une notification NON LUE avec la même clé existe déjà, elle est simplement rafraîchie
create or replace function public.notify(p_user uuid, p_city uuid, p_type text, p_title text, p_body text, p_link text, p_key text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_key is not null then
    update public.notifications set created_at = now(), body = p_body, title = p_title, emailed_at = emailed_at
     where user_id = p_user and key = p_key and read_at is null;
    if found then return; end if;
  end if;
  insert into public.notifications (user_id, city_id, type, title, body, link, key) values (p_user, p_city, p_type, p_title, p_body, p_link, p_key);
end $$;

-- a) Nouvelle demande d'un partenaire → admins
create or replace function public.trg_notify_request() returns trigger
  language plpgsql security definer set search_path = public as $$
declare v_city uuid; v_name text; u uuid;
begin
  select city_id, name into v_city, v_name from public.partners where id = new.partner_id;
  for u in select * from public.admin_recipients(v_city) loop
    perform public.notify(u, v_city, 'request', 'Nouvelle demande de collecte',
      coalesce(v_name,'Un partenaire') || ' — ' || to_char(new.wished_date, 'DD/MM') || coalesce(' à ' || to_char(new.wished_time, 'HH24:MI'), ''),
      '/planning', 'request:' || new.id);
  end loop;
  return null;
end $$;
drop trigger if exists notify_request on public.exceptional_requests;
create trigger notify_request after insert on public.exceptional_requests for each row execute function public.trg_notify_request();

-- b) Le planning est modifié par un admin → logisticiens de la ville ; annulation par le logisticien → admins
create or replace function public.trg_notify_collecte() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  r public.collectes%rowtype;
  v_name text;
  u uuid;
begin
  r := case when tg_op = 'DELETE' then old else new end;

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
drop trigger if exists notify_collecte on public.collectes;
create trigger notify_collecte after insert or update or delete on public.collectes for each row execute function public.trg_notify_collecte();

-- c) Journée clôturée → admins
create or replace function public.trg_notify_day_closed() returns trigger
  language plpgsql security definer set search_path = public as $$
declare v_name text; u uuid;
begin
  if new.closed_at is not null and old.closed_at is null then
    select coalesce(full_name, email, 'Le logisticien') into v_name from public.profiles where id = new.logisticien_id;
    for u in select * from public.admin_recipients(new.city_id) loop
      perform public.notify(u, new.city_id, 'day_closed', 'Journée clôturée', v_name || ' a clôturé la journée du ' || to_char(new.day, 'DD/MM') || '.', '/dashboard', 'closed:' || new.id);
    end loop;
  end if;
  return null;
end $$;
drop trigger if exists notify_day_closed on public.day_sessions;
create trigger notify_day_closed after update on public.day_sessions for each row execute function public.trg_notify_day_closed();

-- =====================================================================
-- 3) SAUVEGARDES : bucket privé (accessible uniquement avec la clé serveur)
-- =====================================================================
insert into storage.buckets (id, name, public) values ('backups', 'backups', false) on conflict (id) do nothing;

select 'ok' as resultat;
