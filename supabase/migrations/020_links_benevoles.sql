-- Linkee — migration 020 : Links Bénévoles (Linkers, disponibilités, missions « Links »)
-- À exécuter dans Supabase → SQL Editor → Run (rejouable), APRÈS la migration 019 (qui ajoute le rôle 'linker').

-- 1) N'importe qui peut lire la liste des villes pour choisir la sienne à l'inscription Linker
--    (le formulaire d'inscription se remplit AVANT la création du compte : pas encore de session).
drop policy if exists cities_read_signup on public.cities;
create policy cities_read_signup on public.cities for select to anon, authenticated using (true);

-- 2) Un compte "en_attente" peut se déclarer lui-même Linker (bénévole) UNE fois, en choisissant sa ville.
--    Toute autre modification de rôle ou de ville reste réservée au Superadmin (comportement de la migration 018).
create or replace function public.guard_profile_update() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and (new.role is distinct from old.role or new.city_id is distinct from old.city_id) then
    if auth.uid() = old.id and old.role = 'en_attente' and new.role = 'linker' and new.city_id is not null then
      return new; -- auto-inscription Linker
    end if;
    if public.my_role() is distinct from 'admin_principal' then
      raise exception 'Modification du rôle ou de la ville réservée au Superadmin';
    end if;
  end if;
  return new;
end $$;

-- 3) Deux pictos sur la fiche partenaire : éligibilité aux collectes bénévoles
alter table public.partners add column if not exists allow_backpack boolean not null default false; -- 🎒
alter table public.partners add column if not exists allow_car boolean not null default false;       -- 🚗

-- 4) Fiche Linker (1 ligne par compte, personnage et progression)
create table if not exists public.linkers (
  id uuid primary key references public.profiles(id) on delete cascade,
  city_id uuid not null references public.cities(id),
  character text not null,
  chosen jsonb not null default '{}',      -- {"<level>": "<style>"} — style d'accessoire choisi à chaque level
  equipped jsonb not null default '{}',    -- {"<catégorie 0-9>": <level>|"none"} — ce qui est porté par catégorie
  cosmetics jsonb not null default '{}',   -- boutique à points : émoticône, fond, teinte
  mode text not null default 'walk' check (mode in ('walk','car')),
  radius_km numeric(5,1) not null default 4,
  cold_ok boolean not null default false,             -- 🧊 sac isotherme + pains de glace
  address_ref text,                                    -- utilisée quand la géoloc n'est pas disponible
  level int not null default 1 check (level between 1 and 50),
  points int not null default 0,
  kg_saved numeric(10,2) not null default 0,
  links_done int not null default 0,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.linkers enable row level security;
drop policy if exists linkers_read on public.linkers;
create policy linkers_read on public.linkers for select to authenticated
  using (id = auth.uid() or public.my_role() = 'admin_principal');
drop policy if exists linkers_insert on public.linkers;
create policy linkers_insert on public.linkers for insert to authenticated with check (id = auth.uid());
drop policy if exists linkers_update on public.linkers;
create policy linkers_update on public.linkers for update to authenticated
  using (id = auth.uid() or public.my_role() = 'admin_principal')
  with check (id = auth.uid() or public.my_role() = 'admin_principal');
drop policy if exists linkers_delete on public.linkers;
create policy linkers_delete on public.linkers for delete to authenticated using (public.my_role() = 'admin_principal');
drop trigger if exists audit_linkers on public.linkers;
create trigger audit_linkers after insert or update or delete on public.linkers for each row execute function public.log_change();

-- 5) Disponibilités récurrentes (7 jours × 3 créneaux)
create table if not exists public.linker_availability (
  linker_id uuid not null references public.linkers(id) on delete cascade,
  weekday int not null check (weekday between 0 and 6),   -- 0 = lundi … 6 = dimanche
  slot int not null check (slot between 0 and 2),         -- 0 matin, 1 midi, 2 soir
  primary key (linker_id, weekday, slot)
);
alter table public.linker_availability enable row level security;
drop policy if exists lavail_read on public.linker_availability;
create policy lavail_read on public.linker_availability for select to authenticated
  using (linker_id = auth.uid() or public.my_role() = 'admin_principal');
drop policy if exists lavail_write on public.linker_availability;
create policy lavail_write on public.linker_availability for all to authenticated
  using (linker_id = auth.uid() or public.my_role() = 'admin_principal')
  with check (linker_id = auth.uid() or public.my_role() = 'admin_principal');

-- 6) Les Links : petites collectes proposées aux Linkers
create table if not exists public.links (
  id uuid primary key default gen_random_uuid(),
  city_id uuid not null references public.cities(id),
  partner_id uuid not null references public.partners(id),
  beneficiary_id uuid references public.beneficiaries(id),   -- association de destination (trouvée par le matching)
  status text not null default 'proposee' check (status in ('proposee','acceptee','collectee','livree','annulee')),
  kg_estime numeric(6,2) not null,
  is_fresh boolean not null default false,
  mode_required text not null default 'walk' check (mode_required in ('walk','car')),
  window_date date not null,
  window_from time not null,
  window_to time not null,
  linker_id uuid references public.linkers(id),
  weight_actual numeric(6,2),
  asso_confirmed boolean not null default false,               -- "Asso contactée, livraison OK"
  motif text,                                                   -- motif si annulée
  accepted_at timestamptz,
  collected_at timestamptz,
  delivered_at timestamptz,
  cancelled_at timestamptz,
  is_demo boolean not null default false,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists links_city_status on public.links (city_id, status);
create index if not exists links_linker on public.links (linker_id);
alter table public.links enable row level security;
-- un Linker voit ses propres Links, et les Links encore proposés (pour la carte) ; le Superadmin voit tout
drop policy if exists links_read on public.links;
create policy links_read on public.links for select to authenticated
  using (public.my_role() = 'admin_principal' or linker_id = auth.uid()
         or (status = 'proposee' and public.my_role() = 'linker' and city_id = (select city_id from public.linkers where id = auth.uid())));
drop policy if exists links_insert on public.links;
create policy links_insert on public.links for insert to authenticated with check (public.my_role() = 'admin_principal');
drop policy if exists links_update on public.links;
create policy links_update on public.links for update to authenticated
  using (public.my_role() = 'admin_principal' or linker_id = auth.uid())
  with check (public.my_role() = 'admin_principal' or linker_id = auth.uid());
drop policy if exists links_delete on public.links;
create policy links_delete on public.links for delete to authenticated using (public.my_role() = 'admin_principal');
drop trigger if exists audit_links on public.links;
create trigger audit_links after insert or update or delete on public.links for each row execute function public.log_change();

-- 7) Actions atomiques (évite les doubles-acceptations en cas de clic simultané de deux Linkers)
create or replace function public.accept_link(p_link_id uuid) returns public.links
language plpgsql security definer set search_path = public as $$
declare v_role public.user_role; v_row public.links%rowtype;
begin
  select role into v_role from public.profiles where id = auth.uid();
  if v_role is distinct from 'linker' then raise exception 'Réservé aux Linkers.'; end if;
  update public.links set status = 'acceptee', linker_id = auth.uid(), accepted_at = now()
    where id = p_link_id and status = 'proposee' and linker_id is null
    returning * into v_row;
  if v_row.id is null then raise exception 'Ce Link vient d''être pris par un autre Linker.'; end if;
  return v_row;
end $$;
revoke all on function public.accept_link(uuid) from public;
grant execute on function public.accept_link(uuid) to authenticated;

create or replace function public.mark_link_collected(p_link_id uuid) returns public.links
language plpgsql security definer set search_path = public as $$
declare v_row public.links%rowtype;
begin
  update public.links set status = 'collectee', collected_at = now()
    where id = p_link_id and linker_id = auth.uid() and status = 'acceptee'
    returning * into v_row;
  if v_row.id is null then raise exception 'Action impossible sur ce Link.'; end if;
  return v_row;
end $$;
revoke all on function public.mark_link_collected(uuid) from public;
grant execute on function public.mark_link_collected(uuid) to authenticated;

-- Livraison : clôture le Link ET fait gagner 1 level au Linker (1 Link livré = 1 level, plafonné à 50)
create or replace function public.deliver_link(p_link_id uuid, p_weight numeric) returns public.links
language plpgsql security definer set search_path = public as $$
declare v_row public.links%rowtype;
begin
  if p_weight is null or p_weight <= 0 then raise exception 'Poids invalide.'; end if;
  update public.links set status = 'livree', weight_actual = p_weight, delivered_at = now()
    where id = p_link_id and linker_id = auth.uid() and status = 'collectee'
    returning * into v_row;
  if v_row.id is null then raise exception 'Action impossible sur ce Link.'; end if;
  update public.linkers
     set level = least(50, level + 1),
         points = points + 30,
         kg_saved = round(kg_saved + p_weight, 2),
         links_done = links_done + 1
   where id = auth.uid();
  return v_row;
end $$;
revoke all on function public.deliver_link(uuid, numeric) from public;
grant execute on function public.deliver_link(uuid, numeric) to authenticated;

select 'ok' as resultat;
