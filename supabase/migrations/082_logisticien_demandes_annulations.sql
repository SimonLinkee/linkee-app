-- Linkee — migration 082 : les logisticiens reçoivent aussi les demandes de collecte et les annulations sur le terrain
-- À exécuter dans Supabase → SQL Editor → Run (rejouable sans risque). Nécessite les migrations 008 et 056.
--
-- • « Nouvelle demande de collecte » (un partenaire demande une collecte) : en plus des admins, TOUS les logisticiens actifs de la ville.
-- • « Collecte annulée sur le terrain » : en plus des admins, les AUTRES logisticiens actifs de la ville (pas celui qui vient d'annuler).
-- Tout le reste est repris à l'identique (planning modifié par un admin → logisticiens, etc.).

create or replace function public.trg_notify_request() returns trigger
  language plpgsql security definer set search_path = public as $$
declare v_city uuid; v_name text; u uuid; v_body text;
begin
  select city_id, name into v_city, v_name from public.partners where id = new.partner_id;
  v_body := coalesce(v_name, 'Un partenaire') || ' — ' || to_char(new.wished_date, 'DD/MM') || coalesce(' à ' || to_char(new.wished_time, 'HH24:MI'), '');
  for u in select * from public.admin_recipients(v_city) loop
    perform public.notify(u, v_city, 'request', 'Nouvelle demande de collecte', v_body, '/planning', 'request:' || new.id);
  end loop;
  for u in select id from public.profiles where active and role = 'logisticien' and city_id = v_city loop
    perform public.notify(u, v_city, 'request', 'Nouvelle demande de collecte', v_body, '/journee', 'request:' || new.id);
  end loop;
  return null;
end $$;

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
        v_name || ' — ' || coalesce(nullif(new.motif, ''), 'sans motif'), '/planning', 'cancel:' || new.id);
    end loop;
    -- les autres logisticiens de la ville (pas celui qui vient d'annuler)
    for u in select id from public.profiles where active and role = 'logisticien' and city_id = new.city_id and id is distinct from auth.uid() loop
      perform public.notify(u, new.city_id, 'cancel', 'Collecte annulée sur le terrain',
        v_name || ' — ' || coalesce(nullif(new.motif, ''), 'sans motif'), '/journee', 'cancel:' || new.id);
    end loop;
  end if;
  return null;
end $$;

select 'ok' as resultat;
