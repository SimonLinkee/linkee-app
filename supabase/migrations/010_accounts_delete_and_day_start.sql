-- Linkee — migration 010 : suppression de comptes + heure de début de journée
-- À exécuter dans Supabase → SQL Editor → Run (rejouable sans risque).

-- 1) Supprimer un compte ne doit pas casser l'historique : les références à la personne deviennent « vides » au lieu de bloquer.
--    (Un compte qui a des journées enregistrées ne peut pas être supprimé : il faut le désactiver, pour garder le temps de travail.)
alter table public.collectes drop constraint if exists collectes_logisticien_id_fkey;
alter table public.collectes add constraint collectes_logisticien_id_fkey foreign key (logisticien_id) references public.profiles(id) on delete set null;

alter table public.vehicles drop constraint if exists vehicles_assigned_to_fkey;
alter table public.vehicles add constraint vehicles_assigned_to_fkey foreign key (assigned_to) references public.profiles(id) on delete set null;

alter table public.vehicle_events drop constraint if exists vehicle_events_created_by_fkey;
alter table public.vehicle_events add constraint vehicle_events_created_by_fkey foreign key (created_by) references public.profiles(id) on delete set null;

alter table public.stock_movements drop constraint if exists stock_movements_created_by_fkey;
alter table public.stock_movements add constraint stock_movements_created_by_fkey foreign key (created_by) references public.profiles(id) on delete set null;

alter table public.documents drop constraint if exists documents_uploaded_by_fkey;
alter table public.documents add constraint documents_uploaded_by_fkey foreign key (uploaded_by) references public.profiles(id) on delete set null;

-- 2) Heure de début de journée, réglable par jour dans le Planning (09:00 par défaut)
create table if not exists public.day_settings (
  city_id uuid not null references public.cities(id),
  day date not null,
  start_min int not null default 540 check (start_min between 0 and 1439),   -- minutes depuis minuit (540 = 09:00)
  primary key (city_id, day)
);
alter table public.day_settings enable row level security;
drop policy if exists dset_read on public.day_settings;
create policy dset_read on public.day_settings for select to authenticated using (public.staff_in_city(city_id));
drop policy if exists dset_write on public.day_settings;
create policy dset_write on public.day_settings for all to authenticated
  using (public.admin_in_city(city_id)) with check (public.admin_in_city(city_id));

select 'ok' as resultat;
