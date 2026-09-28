-- Linkee — migration 006 : stock détaillé, flotte, profil
-- À exécuter dans Supabase → SQL Editor → Run (rejouable sans risque).

-- ---------- Stock : produits avec colisage, dates, provenance ----------
alter table public.stock_items add column if not exists provenance text;
alter table public.stock_items add column if not exists grammage numeric(10,2) not null default 0;   -- grammes par unité
alter table public.stock_items add column if not exists colis int not null default 0;                -- nombre de colis
alter table public.stock_items add column if not exists upc int not null default 1;                  -- unités par colis
alter table public.stock_items add column if not exists ddm date;
alter table public.stock_items add column if not exists dlc date;

-- Historique des entrées / sorties
create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  city_id uuid not null references public.cities(id),
  type text not null check (type in ('sortie','entree')),
  day date not null default current_date,
  time time,
  destination text,
  items jsonb not null default '[]',      -- [{produit, colis, unites, kg}]
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
alter table public.stock_movements enable row level security;
drop policy if exists mv_read on public.stock_movements;
create policy mv_read on public.stock_movements for select to authenticated using (public.staff_in_city(city_id));
drop policy if exists mv_write on public.stock_movements;
create policy mv_write on public.stock_movements for all to authenticated
  using (public.admin_in_city(city_id)) with check (public.admin_in_city(city_id));

-- Sortie de stock atomique : utilisée par l'admin (écran Stock) et par le logisticien (arrêt « Dépôt stock »).
-- p_items = [{"id": "<uuid produit>", "colis": 3}, ...]
create or replace function public.take_stock(p_items jsonb, p_destination text, p_day date default current_date, p_time time default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  it jsonb;
  s public.stock_items%rowtype;
  n int;
  v_units int;
  v_kg numeric;
  out_items jsonb := '[]'::jsonb;
  total numeric := 0;
  v_city uuid;
begin
  if auth.uid() is null then raise exception 'Non connecté'; end if;
  for it in select * from jsonb_array_elements(p_items) loop
    select * into s from public.stock_items where id = (it->>'id')::uuid for update;
    if not found then raise exception 'Produit introuvable'; end if;
    if not public.staff_in_city(s.city_id) then raise exception 'Accès refusé'; end if;
    n := (it->>'colis')::int;
    if n is null or n < 1 then raise exception 'Quantité invalide'; end if;
    if n > s.colis then raise exception 'Il ne reste que % colis pour %', s.colis, s.name; end if;
    v_units := n * s.upc;
    v_kg := round(v_units * s.grammage / 1000.0, 2);
    update public.stock_items
       set colis = colis - n, kg = greatest(0, round(kg - v_kg, 2)), updated_at = now()
     where id = s.id;
    out_items := out_items || jsonb_build_array(jsonb_build_object('produit', s.name, 'colis', n, 'unites', v_units, 'kg', v_kg));
    total := total + v_kg;
    v_city := s.city_id;
  end loop;
  if v_city is null then raise exception 'Aucun produit sélectionné'; end if;
  insert into public.stock_movements (city_id, type, day, time, destination, items, created_by)
  values (v_city, 'sortie', p_day, p_time, p_destination, out_items, auth.uid());
  return jsonb_build_object('items', out_items, 'total_kg', total);
end $$;
revoke all on function public.take_stock(jsonb, text, date, time) from public;
grant execute on function public.take_stock(jsonb, text, date, time) to authenticated;

-- ---------- Flotte : fiche complète du véhicule ----------
alter table public.vehicles add column if not exists fiche jsonb not null default '{}';

-- ---------- Profil personnel ----------
alter table public.profiles add column if not exists avatar_key text;
alter table public.profiles add column if not exists anecdote text;

select 'ok' as resultat;
