-- Linkee — migration 079 : envoyer une notification à une personne ou à toute une ville
-- À exécuter dans Supabase → SQL Editor → Run (rejouable sans risque). Nécessite les migrations 008, 018 et 046.
--
-- Qui peut envoyer : le Superadmin (n'importe quelle ville) et le Responsable d'antenne (SA ville seulement).
-- Destinataires : une personne précise, tous les logisticiens de la ville, toute l'équipe de la ville
--                 (logisticiens + responsables d'antenne + resp. distribution + le Superadmin, qui est membre de CHAQUE ville)
--                 ou tous les Linkers de la ville.
-- La notification apparaît dans la cloche du destinataire (type « message »), avec le nom de l'expéditeur.
-- L'expéditeur retrouve ses envois (colonne sent_by) dans la page « Notifier ».

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('request', 'planning', 'cancel', 'day_closed', 'mission', 'link', 'cerfa', 'remontee', 'message'));
alter table public.notifications add column if not exists sent_by uuid references public.profiles(id) on delete set null;
create index if not exists notifications_sent_by on public.notifications (sent_by, created_at desc) where sent_by is not null;

-- l'expéditeur relit ses envois (en plus de la lecture par chaque destinataire de SES notifications)
drop policy if exists notif_sent_read on public.notifications;
create policy notif_sent_read on public.notifications for select to authenticated using (sent_by = auth.uid());

create or replace function public.send_notification(p_city uuid, p_audience text, p_user uuid, p_title text, p_body text)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_role text := public.my_role()::text;
  v_name text;
  v_title text := left(trim(coalesce(p_title, '')), 90);
  v_body text := left(trim(coalesce(p_body, '')), 600);
  v_n int := 0;
  r record;
begin
  if auth.uid() is null or v_role not in ('admin_principal', 'admin_local') then
    raise exception 'Réservé au Superadmin et au Responsable d''antenne.';
  end if;
  if v_role = 'admin_local' and p_city is distinct from public.my_city() then
    raise exception 'Tu peux notifier uniquement les personnes de ta ville.';
  end if;
  if p_city is null then raise exception 'Choisis une ville.'; end if;
  if v_title = '' then raise exception 'Écris un titre.'; end if;
  if p_audience not in ('user', 'logisticiens', 'equipe', 'linkers') then raise exception 'Destinataires inconnus.'; end if;

  select coalesce(nullif(trim(full_name), ''), split_part(email, '@', 1)) into v_name from public.profiles where id = auth.uid();
  v_body := case when v_body = '' then 'Message de ' || coalesce(v_name, 'l''équipe') else v_body || E'\n— ' || coalesce(v_name, 'l''équipe') end;

  for r in
    select pr.id, pr.role::text as role
      from public.profiles pr
     where pr.active
       and (
            (p_audience = 'user' and pr.id = p_user and (v_role = 'admin_principal' or pr.city_id = p_city or pr.role::text = 'admin_principal'))
         or (p_audience = 'logisticiens' and pr.role::text = 'logisticien' and pr.city_id = p_city)
         or (p_audience = 'equipe' and pr.id <> auth.uid() and (pr.role::text = 'admin_principal' or (pr.role::text in ('logisticien', 'admin_local', 'resp_distribution') and pr.city_id = p_city)))
         or (p_audience = 'linkers' and exists (select 1 from public.linkers k where k.id = pr.id and k.city_id = p_city))
       )
  loop
    insert into public.notifications (user_id, city_id, type, title, body, link, key, sent_by)
    values (r.id, p_city, 'message', v_title, v_body,
            case r.role when 'logisticien' then '/journee' when 'linker' then '/linker' when 'admin_local' then '/dashboard' when 'resp_distribution' then '/distributions' else null end,
            null, auth.uid());
    v_n := v_n + 1;
  end loop;
  if v_n = 0 then raise exception 'Personne à notifier avec ce choix.'; end if;
  return v_n;
end $$;
revoke all on function public.send_notification(uuid, text, uuid, text, text) from public;
grant execute on function public.send_notification(uuid, text, uuid, text, text) to authenticated;

select 'ok' as resultat;
