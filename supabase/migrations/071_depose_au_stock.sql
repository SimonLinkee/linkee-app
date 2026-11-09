-- Linkee — migration 071 : « Dépose au stock » (le stock devient aussi un point de dépose dans la tournée)
-- À exécuter dans Supabase → SQL Editor → Run (rejouable sans risque). Nécessite les migrations 018 et 054.
--
-- • Un arrêt « Dépôt stock » du planning peut maintenant être une PRISE au stock (comportement d'avant, par défaut)
--   ou une DÉPOSE au stock (stock_direction = 'entree').
-- • À la validation d'une dépose, chaque produit déposé crée une ligne dans le stock (1 colis = le poids réel déposé,
--   sans date limite : l'admin la renseigne et découpe en colis ensuite) et une ENTRÉE dans l'historique du stock.
-- • Annuler une entrée (historique du Stock, ou arrêt remis « à faire » / « annulé » dans le planning) retire les lignes créées
--   et remet l'arrêt « à faire ». Refusé si une partie a déjà été ressortie (règle de la migration 054).

alter table public.collectes add column if not exists stock_direction text not null default 'sortie';
alter table public.collectes drop constraint if exists collectes_stock_direction_check;
alter table public.collectes add constraint collectes_stock_direction_check check (stock_direction in ('sortie', 'entree'));
alter table public.collectes add column if not exists stock_movement_id uuid;   -- entrée de stock créée par cette dépose

-- Entrée de stock atomique : p_items = [{"name": "Fruits et légumes", "category": "Fruits et légumes", "kg": 120.5, "provenance": "Atypique"}, ...]
create or replace function public.add_stock(p_city uuid, p_items jsonb, p_source text, p_day date default current_date)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  it jsonb;
  v_kg numeric;
  v_id uuid;
  v_name text;
  out_items jsonb := '[]'::jsonb;
  total numeric := 0;
  v_mv uuid;
begin
  if auth.uid() is null then raise exception 'Non connecté'; end if;
  if not (public.stock_in_city(p_city) or public.field_in_city(p_city)) then raise exception 'Accès refusé'; end if;
  for it in select * from jsonb_array_elements(p_items) loop
    v_kg := round(coalesce((it->>'kg')::numeric, 0), 2);
    if v_kg <= 0 then raise exception 'Poids invalide'; end if;
    v_name := coalesce(nullif(trim(it->>'name'), ''), nullif(trim(it->>'category'), ''), 'Produit déposé');
    insert into public.stock_items (city_id, name, category, provenance, grammage, colis, upc, kg, ddm, dlc, updated_at)
    values (p_city, v_name, nullif(trim(it->>'category'), ''), nullif(trim(it->>'provenance'), ''), round(v_kg * 1000, 2), 1, 1, v_kg, null, null, now())
    returning id into v_id;
    out_items := out_items || jsonb_build_array(jsonb_build_object('id', v_id, 'produit', v_name, 'colis', 1, 'unites', 1, 'kg', v_kg));
    total := total + v_kg;
  end loop;
  if jsonb_array_length(out_items) = 0 then raise exception 'Aucun produit déposé'; end if;
  insert into public.stock_movements (city_id, type, day, destination, items, created_by)
  values (p_city, 'entree', p_day, p_source, out_items, auth.uid())
  returning id into v_mv;
  return jsonb_build_object('movement_id', v_mv, 'items', out_items, 'total_kg', total);
end $$;
revoke all on function public.add_stock(uuid, jsonb, text, date) from public;
grant execute on function public.add_stock(uuid, jsonb, text, date) to authenticated;

-- Annulation d'un mouvement : identique à la migration 054, avec en plus la remise « à faire » de l'arrêt de dépose lié
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
  c record;
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

  -- l'arrêt « Dépose stock » qui avait créé cette entrée redevient « à faire » (ses lignes de produits sont effacées)
  for c in select id from public.collectes where stock_movement_id = m.id loop
    delete from public.collecte_items where collecte_id = c.id;
    update public.collectes
       set status = 'todo', motif = null, done_at = null, logisticien_id = null, photos_count = 0, photo_paths = '{}', stock_movement_id = null
     where id = c.id;
  end loop;

  delete from public.stock_movements where id = m.id;
  return jsonb_build_object('type', m.type, 'lines', jsonb_array_length(m.items), 'products_removed', removed);
end $$;
revoke all on function public.undo_stock_movement(uuid) from public;
grant execute on function public.undo_stock_movement(uuid) to authenticated;

select 'ok' as resultat;
