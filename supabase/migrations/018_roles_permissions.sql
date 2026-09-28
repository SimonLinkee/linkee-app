-- Linkee — migration 018 : les trois niveaux de rôles
--   Superadmin (admin_principal)            : tout, en lecture et en écriture
--   Responsable d'antenne (admin_local)     : Distribution et Stock en lecture/écriture, Planning en lecture seule
--   Resp. Distribution (resp_distribution)  : Distribution uniquement
-- À exécuter dans Supabase → SQL Editor → Run (rejouable), APRÈS la migration 017.

-- ---------- fonctions d'autorisation ----------
-- lecture dans une ville (les écrans sont masqués côté application selon le rôle)
create or replace function public.staff_in_city(c uuid) returns boolean
  language sql stable security definer set search_path = public as
  $$ select case
       when public.my_role() = 'admin_principal' then true
       when public.my_role() in ('admin_local','logisticien','resp_distribution') then public.my_city() = c
       else false end $$;

-- « admin » d'une ville = uniquement le Superadmin (toutes les anciennes écritures d'administration lui sont réservées)
create or replace function public.admin_in_city(c uuid) returns boolean
  language sql stable security definer set search_path = public as
  $$ select coalesce(public.my_role() = 'admin_principal', false) $$;

-- Distribution : Superadmin, Responsable d'antenne, Resp. Distribution (de la ville)
create or replace function public.dist_in_city(c uuid) returns boolean
  language sql stable security definer set search_path = public as
  $$ select case
       when public.my_role() = 'admin_principal' then true
       when public.my_role() in ('admin_local','resp_distribution') then public.my_city() = c
       else false end $$;

-- Stock : Superadmin et Responsable d'antenne (de la ville)
create or replace function public.stock_in_city(c uuid) returns boolean
  language sql stable security definer set search_path = public as
  $$ select case
       when public.my_role() = 'admin_principal' then true
       when public.my_role() = 'admin_local' then public.my_city() = c
       else false end $$;

-- Terrain : le logisticien remplit sa tournée (et le Superadmin)
create or replace function public.field_in_city(c uuid) returns boolean
  language sql stable security definer set search_path = public as
  $$ select case
       when public.my_role() = 'admin_principal' then true
       when public.my_role() = 'logisticien' then public.my_city() = c
       else false end $$;

-- Les alertes (demandes de collecte, annulations, journée clôturée) vont au Superadmin
create or replace function public.admin_recipients(p_city uuid) returns setof uuid
  language sql stable security definer set search_path = public as $$
  select id from public.profiles where active and role = 'admin_principal' $$;

-- ---------- comptes : seul le Superadmin gère rôles et villes ----------
create or replace function public.guard_profile_update() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and (new.role is distinct from old.role or new.city_id is distinct from old.city_id) then
    if public.my_role() is distinct from 'admin_principal' then
      raise exception 'Modification du rôle ou de la ville réservée au Superadmin';
    end if;
  end if;
  return new;
end $$;

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid() or public.my_role() = 'admin_principal')
  with check (id = auth.uid() or public.my_role() = 'admin_principal');

-- ---------- planning : lecture seule pour le Responsable d'antenne (sauf les mouvements de stock) ----------
drop policy if exists collectes_insert on public.collectes;
create policy collectes_insert on public.collectes for insert to authenticated
  with check (public.admin_in_city(city_id)
              or (public.my_role() = 'admin_local' and public.my_city() = city_id and kind in ('stock','dropoff')));
drop policy if exists collectes_update on public.collectes;
create policy collectes_update on public.collectes for update to authenticated
  using (public.field_in_city(city_id)
         or (public.my_role() = 'admin_local' and public.my_city() = city_id and kind in ('stock','dropoff')))
  with check (public.field_in_city(city_id)
         or (public.my_role() = 'admin_local' and public.my_city() = city_id and kind in ('stock','dropoff')));
drop policy if exists collectes_delete on public.collectes;
create policy collectes_delete on public.collectes for delete to authenticated
  using (public.admin_in_city(city_id)
         or (public.my_role() = 'admin_local' and public.my_city() = city_id and kind in ('stock','dropoff')));

drop policy if exists items_write on public.collecte_items;
create policy items_write on public.collecte_items for all to authenticated
  using (exists (select 1 from public.collectes c where c.id = collecte_id and public.field_in_city(c.city_id)))
  with check (exists (select 1 from public.collectes c where c.id = collecte_id and public.field_in_city(c.city_id)));

-- ---------- stock ----------
drop policy if exists stock_write on public.stock_items;
create policy stock_write on public.stock_items for all to authenticated
  using (public.stock_in_city(city_id)) with check (public.stock_in_city(city_id));
drop policy if exists mv_write on public.stock_movements;
create policy mv_write on public.stock_movements for all to authenticated
  using (public.stock_in_city(city_id)) with check (public.stock_in_city(city_id));

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
    if not (public.stock_in_city(s.city_id) or public.field_in_city(s.city_id)) then raise exception 'Accès refusé'; end if;
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

-- ---------- distribution ----------
drop policy if exists dist_write on public.distributions;
create policy dist_write on public.distributions for all to authenticated
  using (public.dist_in_city(city_id)) with check (public.dist_in_city(city_id));

drop policy if exists distl_write on public.distribution_lines;
create policy distl_write on public.distribution_lines for all to authenticated
  using (exists (select 1 from public.distributions d where d.id = distribution_id and public.dist_in_city(d.city_id)))
  with check (exists (select 1 from public.distributions d where d.id = distribution_id and public.dist_in_city(d.city_id)));

drop policy if exists dint_write on public.distribution_interventions;
create policy dint_write on public.distribution_interventions for all to authenticated
  using (exists (select 1 from public.distributions d where d.id = distribution_id and public.dist_in_city(d.city_id)))
  with check (exists (select 1 from public.distributions d where d.id = distribution_id and public.dist_in_city(d.city_id)));

drop policy if exists assoc_write on public.associations;
create policy assoc_write on public.associations for all to authenticated
  using (public.dist_in_city(city_id)) with check (public.dist_in_city(city_id));

drop policy if exists anote_write on public.association_notes;
create policy anote_write on public.association_notes for all to authenticated
  using (exists (select 1 from public.associations a where a.id = association_id and public.dist_in_city(a.city_id)))
  with check (exists (select 1 from public.associations a where a.id = association_id and public.dist_in_city(a.city_id)));

-- ---------- photos : le Resp. Distribution ne voit que les photos, pas les documents des partenaires ----------
drop policy if exists storage_staff_read on storage.objects;
create policy storage_staff_read on storage.objects for select to authenticated
  using ((bucket_id in ('documents','collecte-photos') and public.my_role() in ('admin_principal','admin_local','logisticien'))
         or (bucket_id = 'collecte-photos' and public.my_role() = 'resp_distribution'));
drop policy if exists storage_staff_photos on storage.objects;
create policy storage_staff_photos on storage.objects for insert to authenticated
  with check (bucket_id = 'collecte-photos' and public.my_role() in ('admin_principal','admin_local','logisticien','resp_distribution'));

select 'ok' as resultat;
