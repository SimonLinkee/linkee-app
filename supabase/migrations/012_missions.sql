-- Linkee — migration 012 : onglet TODO (missions) et « Mes missions » du logisticien
-- À exécuter dans Supabase → SQL Editor → Run (rejouable sans risque).

create table if not exists public.missions (
  id uuid primary key default gen_random_uuid(),
  city_id uuid not null references public.cities(id),
  title text not null,
  comment text,
  importance int not null default 3 check (importance between 1 and 5),
  deadline date,
  assigned_to uuid references public.profiles(id) on delete set null,
  status text not null default 'a_faire' check (status in ('a_faire','en_cours','fait')),
  created_by uuid references public.profiles(id) on delete set null,
  done_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists missions_city on public.missions (city_id, status, deadline);
create index if not exists missions_assignee on public.missions (assigned_to, status);
alter table public.missions enable row level security;

-- les admins de la ville gèrent tout ; une personne ne voit et ne met à jour que SES missions
drop policy if exists missions_read on public.missions;
create policy missions_read on public.missions for select to authenticated
  using (public.admin_in_city(city_id) or assigned_to = auth.uid());
drop policy if exists missions_insert on public.missions;
create policy missions_insert on public.missions for insert to authenticated
  with check (public.admin_in_city(city_id));
drop policy if exists missions_update on public.missions;
create policy missions_update on public.missions for update to authenticated
  using (public.admin_in_city(city_id) or assigned_to = auth.uid())
  with check (public.admin_in_city(city_id) or assigned_to = auth.uid());
drop policy if exists missions_delete on public.missions;
create policy missions_delete on public.missions for delete to authenticated
  using (public.admin_in_city(city_id));

-- un logisticien peut seulement changer l'avancement de sa mission (statut / date de fin)
create or replace function public.guard_mission_update() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.admin_in_city(old.city_id) then
    if new.city_id is distinct from old.city_id or new.title is distinct from old.title or new.comment is distinct from old.comment
       or new.importance is distinct from old.importance or new.deadline is distinct from old.deadline
       or new.assigned_to is distinct from old.assigned_to or new.created_by is distinct from old.created_by then
      raise exception 'Tu peux seulement changer l''avancement de ta mission';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists guard_mission_update on public.missions;
create trigger guard_mission_update before update on public.missions for each row execute function public.guard_mission_update();

-- historique des modifications
drop trigger if exists audit_missions on public.missions;
create trigger audit_missions after insert or update or delete on public.missions for each row execute function public.log_change();

-- notifications : nouveau type « mission »
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in ('request','planning','cancel','day_closed','mission'));

create or replace function public.trg_notify_mission() returns trigger
  language plpgsql security definer set search_path = public as $$
declare v_role public.user_role; u uuid;
begin
  -- mission attribuée (ou réattribuée) → la personne concernée
  if new.assigned_to is not null and (tg_op = 'INSERT' or old.assigned_to is distinct from new.assigned_to) and new.assigned_to is distinct from auth.uid() then
    select role into v_role from public.profiles where id = new.assigned_to;
    perform public.notify(new.assigned_to, new.city_id, 'mission', 'Nouvelle mission : ' || new.title,
      coalesce('À faire avant le ' || to_char(new.deadline, 'DD/MM') || ' · ', '') || 'importance ' || new.importance || '/5',
      case when v_role = 'logisticien' then '/journee' else '/todo' end, 'mission:' || new.id);
  end if;
  -- mission terminée par la personne concernée → les admins
  if tg_op = 'UPDATE' and new.status = 'fait' and old.status is distinct from 'fait' and not public.is_admin() then
    for u in select * from public.admin_recipients(new.city_id) loop
      perform public.notify(u, new.city_id, 'mission', 'Mission terminée : ' || new.title,
        coalesce((select coalesce(full_name, email) from public.profiles where id = new.assigned_to), 'Quelqu''un') || ' a terminé cette mission.', '/todo', 'missiondone:' || new.id);
    end loop;
  end if;
  return null;
end $$;
drop trigger if exists notify_mission on public.missions;
create trigger notify_mission after insert or update on public.missions for each row execute function public.trg_notify_mission();

select 'ok' as resultat;
