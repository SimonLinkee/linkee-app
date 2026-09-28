-- Linkee — migration 007 : photos (collectes, camion, tickets) et événements du véhicule
-- À exécuter dans Supabase → SQL Editor → Run (rejouable sans risque).

-- Photos prises par le logisticien à chaque arrêt (chemins dans le stockage privé « collecte-photos »)
alter table public.collectes add column if not exists photo_paths text[] not null default '{}';

-- Ce que le logisticien déclare sur le camion : tour photo du lundi, contrôles faits, tickets
create table if not exists public.vehicle_events (
  id uuid primary key default gen_random_uuid(),
  city_id uuid not null references public.cities(id),
  vehicle_id uuid references public.vehicles(id) on delete cascade,
  kind text not null check (kind in ('tour','check','receipt')),
  key text,                                 -- ex. "huile", "pneus", "rev1m" pour kind = check
  amount numeric(10,2),                     -- montant du ticket (kind = receipt)
  photos text[] not null default '{}',      -- chemins dans « collecte-photos »
  note text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists vehicle_events_vehicle on public.vehicle_events (vehicle_id, created_at desc);
alter table public.vehicle_events enable row level security;

drop policy if exists vev_read on public.vehicle_events;
create policy vev_read on public.vehicle_events for select to authenticated using (public.staff_in_city(city_id));
drop policy if exists vev_insert on public.vehicle_events;
create policy vev_insert on public.vehicle_events for insert to authenticated
  with check (public.staff_in_city(city_id) and created_by = auth.uid());
drop policy if exists vev_update_own on public.vehicle_events;
create policy vev_update_own on public.vehicle_events for update to authenticated
  using (created_by = auth.uid() or public.admin_in_city(city_id)) with check (created_by = auth.uid() or public.admin_in_city(city_id));
drop policy if exists vev_delete on public.vehicle_events;
create policy vev_delete on public.vehicle_events for delete to authenticated
  using (created_by = auth.uid() or public.admin_in_city(city_id));

select 'ok' as resultat;
