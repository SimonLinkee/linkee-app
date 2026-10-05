-- Linkee — migration 054 : annuler un mouvement de stock depuis l'historique (retour à l'état d'avant)
-- À exécuter dans Supabase → SQL Editor → Run (rejouable sans risque).
--
-- • Annuler une SORTIE : les colis (et les kg) reviennent dans le stock.
-- • Annuler une ENTRÉE : les colis sont retirés du stock ; si le produit retombe à 0 colis, il est supprimé
--   (c'est l'entrée qui l'avait apporté). Refusé si une partie de l'entrée est déjà ressortie.
-- • Le mouvement disparaît de l'historique. Tout se fait d'un bloc : si un produit pose problème, rien ne change.
-- Le journal d'audit garde la trace de l'annulation (produits et mouvement).
--
-- Les mouvements enregistrent désormais l'identifiant du produit ('id' dans items) ; pour les anciens,
-- le produit est retrouvé par son nom dans la ville (refusé si le nom est introuvable ou en double).

-- 1) take_stock : identique à la migration 018, avec l'identifiant du produit dans chaque ligne du mouvement
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
    out_items := out_items || jsonb_build_array(jsonb_build_object('id', s.id, 'produit', s.name, 'colis', n, 'unites', v_units, 'kg', v_kg));
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

-- 2) Annulation d'un mouvement (Superadmin, ou Responsable d'antenne pour sa ville)
create or replace function public.undo_stock_movement(p_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  m public.stock_movements%rowtype;
  it jsonb;
  s public.stock_items%rowtype;
  n int;
  v_kg numeric;
  v_id uuid;
  cnt int;
  removed int := 0;
begin
  if auth.uid() is null then raise exception 'Non connecté'; end if;
  select * into m from public.stock_movements where id = p_id for update;
  if not found then raise exception 'Mouvement introuvable (déjà annulé ?)'; end if;
  if not public.stock_in_city(m.city_id) then raise exception 'Accès refusé'; end if;

  for it in select * from jsonb_array_elements(m.items) loop
    n := coalesce((it->>'colis')::int, 0);
    v_kg := coalesce((it->>'kg')::numeric, 0);
    v_id := nullif(it->>'id', '')::uuid;
    if v_id is null then
      select count(*) into cnt from public.stock_items where city_id = m.city_id and name = it->>'produit';
      if cnt = 0 then raise exception 'Produit « % » introuvable dans le stock : annulation impossible', it->>'produit'; end if;
      if cnt > 1 then raise exception 'Plusieurs produits s''appellent « % » : annulation impossible automatiquement', it->>'produit'; end if;
      select id into v_id from public.stock_items where city_id = m.city_id and name = it->>'produit';
    end if;
    select * into s from public.stock_items where id = v_id and city_id = m.city_id for update;
    if not found then raise exception 'Produit « % » introuvable dans le stock : annulation impossible', it->>'produit'; end if;

    if m.type = 'sortie' then
      update public.stock_items set colis = colis + n, kg = round(kg + v_kg, 2), updated_at = now() where id = s.id;
    else
      if n > s.colis then
        raise exception 'Il ne reste que % colis de « % » : une partie de cette entrée est déjà sortie, annule d''abord la sortie', s.colis, s.name;
      end if;
      if s.colis - n = 0 then
        delete from public.stock_items where id = s.id;
        removed := removed + 1;
      else
        update public.stock_items set colis = colis - n, kg = greatest(0, round(kg - v_kg, 2)), updated_at = now() where id = s.id;
      end if;
    end if;
  end loop;

  delete from public.stock_movements where id = m.id;
  return jsonb_build_object('type', m.type, 'lines', jsonb_array_length(m.items), 'products_removed', removed);
end $$;
revoke all on function public.undo_stock_movement(uuid) from public;
grant execute on function public.undo_stock_movement(uuid) to authenticated;

select 'ok' as resultat;
