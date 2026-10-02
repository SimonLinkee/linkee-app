-- Linkee — migration 047 : le Responsable d'antenne pilote son antenne comme un admin
-- Décision de Simon (02/10/2026) : sur SA ville, le Responsable d'antenne peut tout faire comme le Superadmin
-- (planning, fiches partenaires et bénéficiaires, distribution, stock, flotte, TODO, Links Bénévoles, Cerfa…).
-- Seuls restent réservés au Superadmin : Villes & comptes (gestion des comptes, rôles, villes), Historique &
-- sauvegardes, et tout ce qui touche à une autre ville.
-- À exécuter dans Supabase → SQL Editor → Run (rejouable), APRÈS la migration 046.
--
-- admin_in_city() est la brique utilisée par la quarantaine de règles d'écriture (partenaires, bénéficiaires,
-- documents, flotte, missions/TODO, jours de tournée, valorisation…) : l'élargir ici suffit à les ouvrir, pour la
-- ville de l'intéressé·e uniquement, sans réécrire chaque règle.

create or replace function public.admin_in_city(c uuid) returns boolean
  language sql stable security definer set search_path = public as
  $$ select case
       when public.my_role() = 'admin_principal' then true
       when public.my_role() = 'admin_local' then public.my_city() = c
       else false end $$;

-- Terrain : le Responsable d'antenne peut aussi renseigner / corriger une tournée de sa ville (comme un admin).
create or replace function public.field_in_city(c uuid) returns boolean
  language sql stable security definer set search_path = public as
  $$ select case
       when public.my_role() = 'admin_principal' then true
       when public.my_role() = 'admin_local' then public.my_city() = c
       when public.my_role() = 'logisticien' then public.my_city() = c
       else false end $$;

-- Planning : plus de restriction aux seuls arrêts "stock" et "dépose" pour le Responsable d'antenne.
drop policy if exists collectes_insert on public.collectes;
create policy collectes_insert on public.collectes for insert to authenticated
  with check (public.admin_in_city(city_id));
drop policy if exists collectes_update on public.collectes;
create policy collectes_update on public.collectes for update to authenticated
  using (public.field_in_city(city_id) or public.admin_in_city(city_id))
  with check (public.field_in_city(city_id) or public.admin_in_city(city_id));
drop policy if exists collectes_delete on public.collectes;
create policy collectes_delete on public.collectes for delete to authenticated
  using (public.admin_in_city(city_id));

-- Les alertes (demandes de collecte, annulations, journée clôturée, missions…) vont au Superadmin ET au(x)
-- Responsable(s) d'antenne de la ville concernée (comportement d'origine, restreint par la migration 018).
create or replace function public.admin_recipients(p_city uuid) returns setof uuid
  language sql stable security definer set search_path = public as $$
  select id from public.profiles where active and (role = 'admin_principal' or (role = 'admin_local' and city_id = p_city)) $$;

-- Links Bénévoles : création et suppression d'un Link pour sa ville (la mise à jour l'autorisait déjà).
drop policy if exists links_insert on public.links;
create policy links_insert on public.links for insert to authenticated
  with check (public.admin_in_city(city_id) or (public.my_role() = 'partenaire' and public.owns_partner(partner_id)));
drop policy if exists links_delete on public.links;
create policy links_delete on public.links for delete to authenticated
  using (public.admin_in_city(city_id));

select 'ok' as resultat;
