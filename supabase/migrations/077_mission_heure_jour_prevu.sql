-- Linkee — migration 077 : arrêt « Mission », heure d'arrivée fixée à la main, mission attribuée pour un jour précis
-- À exécuter dans Supabase → SQL Editor → Run (rejouable sans risque). Nécessite les migrations 012 et 032.
--
-- 1) Arrêt « Mission » dans le Planning : un nouveau type d'arrêt (kind = 'mission'), texte libre dans le commentaire de l'arrêt,
--    adresse facultative (collectes.address) : avec adresse le trajet est calculé, sans adresse il se prend sur place (comme la pause).
-- 2) Heure d'arrivée fixée à la main sur un arrêt (collectes.fixed_time) : les arrêts suivants se recalculent à partir d'elle.
--    Vide = heure calculée automatiquement, comme avant.
-- 3) Todo : « Jour prévu » (missions.planned_day). La mission attribuée à une personne apparaît dans SA journée ce jour-là.
--    Seuls les admins peuvent le modifier (la personne ne change que l'avancement), et la personne est prévenue du jour.

-- 1) arrêt Mission
alter table public.collectes drop constraint if exists collectes_kind_check;
alter table public.collectes add constraint collectes_kind_check
  check (kind in ('partner', 'dropoff', 'stock', 'exceptionnel', 'demande_client', 'pause', 'dechetterie', 'mission'));
alter table public.collectes add column if not exists address text;

-- 2) heure fixée à la main
alter table public.collectes add column if not exists fixed_time time;

-- 3) jour prévu d'une mission
alter table public.missions add column if not exists planned_day date;
create index if not exists missions_planned_day on public.missions (assigned_to, planned_day);

create or replace function public.guard_mission_update() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.admin_in_city(old.city_id) then
    if new.city_id is distinct from old.city_id or new.title is distinct from old.title or new.comment is distinct from old.comment
       or new.importance is distinct from old.importance or new.deadline is distinct from old.deadline
       or new.planned_day is distinct from old.planned_day
       or new.assigned_to is distinct from old.assigned_to or new.created_by is distinct from old.created_by then
      raise exception 'Tu peux seulement changer l''avancement de ta mission';
    end if;
  end if;
  return new;
end $$;

-- la notification annonce aussi le jour prévu, et repart si ce jour change
create or replace function public.trg_notify_mission() returns trigger
  language plpgsql security definer set search_path = public as $$
declare v_role public.user_role; u uuid;
begin
  if new.assigned_to is not null
     and (tg_op = 'INSERT' or old.assigned_to is distinct from new.assigned_to or old.planned_day is distinct from new.planned_day)
     and new.assigned_to is distinct from auth.uid() then
    select role into v_role from public.profiles where id = new.assigned_to;
    perform public.notify(new.assigned_to, new.city_id, 'mission', 'Nouvelle mission : ' || new.title,
      coalesce('Prévue le ' || to_char(new.planned_day, 'DD/MM') || ' · ', '')
      || coalesce('À faire avant le ' || to_char(new.deadline, 'DD/MM') || ' · ', '') || 'importance ' || new.importance || '/5',
      case when v_role = 'logisticien' then '/journee' else '/todo' end, 'mission:' || new.id || ':' || coalesce(new.planned_day::text, ''));
  end if;
  if tg_op = 'UPDATE' and new.status = 'fait' and old.status is distinct from 'fait' and not public.is_admin() then
    for u in select * from public.admin_recipients(new.city_id) loop
      perform public.notify(u, new.city_id, 'mission', 'Mission terminée : ' || new.title,
        coalesce((select coalesce(full_name, email) from public.profiles where id = new.assigned_to), 'Quelqu''un') || ' a terminé cette mission.', '/todo', 'missiondone:' || new.id);
    end loop;
  end if;
  return null;
end $$;

select 'ok' as resultat;
