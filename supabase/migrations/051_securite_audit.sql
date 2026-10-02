-- Linkee — migration 051 : durcissement et corrections issus de l'audit interne du 2 octobre 2026
-- À exécuter dans Supabase → SQL Editor → Run (rejouable), APRÈS la migration 050.
--
--  1) Un compte désactivé n'a plus aucun accès à la base.
--  2) Seul le Superadmin active ou désactive un compte.
--  3) Le bénéficiaire peut enregistrer SA fiche en libre-service (jauge, contacts, créneaux, frais, logo) — avant,
--     la base refusait sans message d'erreur : l'écran affichait « enregistré » alors que rien n'était gardé.
--  4) Collecte bénévole : le partenaire active lui-même le « sac à dos » (25 kg maximum par Link, vérifié par la base) ;
--     la voiture et le mode « bénévole seulement » restent réservés à Linkee.
--  5) Partenaire : la demande de Link trouve enfin l'association la plus proche, et son historique de Links s'affiche
--     (avant, il ne pouvait lire ni les associations ni ses propres Links).
--  6) Linker spectateur : ses points, son level, ses kg et ses Links ne se modifient que par les boutons de l'appli.
--  7) Linker : avant d'accepter il voit adresses, créneau, poids, contraintes ; téléphones et codes d'accès
--     seulement une fois le Link accepté (et jusqu'à la collecte). Nouveau : « Je me désiste ».
--  8) Logisticien : il saisit sa tournée, il ne modifie plus le planning.
--  9) Villes, rattachement compte ↔ partenaire/bénéficiaire et journal d'audit : réservés au Superadmin.
--
-- Les actions « sensibles » restent possibles pour les fonctions de l'appli (accept_link, deliver_link…, qui s'exécutent
-- avec les droits de leur propriétaire) et pour le Superadmin ; elles sont refusées quand elles sont envoyées
-- directement depuis un navigateur (current_user = 'authenticated').

-- 1) Un compte désactivé n'a plus aucun accès ------------------------------------------------------------------------
create or replace function public.real_role() returns public.user_role
  language sql stable security definer set search_path = public as
  $$ select role from public.profiles where id = auth.uid() and coalesce(active, true) $$;

create or replace function public.my_role() returns public.user_role
  language sql stable security definer set search_path = public as
  $$ select case when role = 'comptabilite' then 'admin_principal'::public.user_role else role end
       from public.profiles where id = auth.uid() and coalesce(active, true) $$;

create or replace function public.owns_partner(p uuid) returns boolean
  language sql stable security definer set search_path = public as
  $$ select exists (select 1 from public.partner_users pu join public.profiles pr on pr.id = pu.profile_id
                     where pu.profile_id = auth.uid() and pu.partner_id = p and coalesce(pr.active, true)) $$;

create or replace function public.owns_beneficiary(b uuid) returns boolean
  language sql stable security definer set search_path = public as
  $$ select exists (select 1 from public.beneficiary_users bu join public.profiles pr on pr.id = bu.profile_id
                     where bu.profile_id = auth.uid() and bu.beneficiary_id = b and coalesce(pr.active, true)) $$;

-- 2) Seul le Superadmin active ou désactive un compte -----------------------------------------------------------------
create or replace function public.guard_profile_update() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and (new.role is distinct from old.role or new.city_id is distinct from old.city_id) then
    if auth.uid() = old.id and old.role = 'en_attente' and new.role = 'linker' and new.city_id is not null then
      null; -- auto-inscription Linker
    elsif public.real_role() is distinct from 'admin_principal' then
      raise exception 'Modification du rôle ou de la ville réservée au Superadmin';
    end if;
  end if;
  if auth.uid() is not null and new.active is distinct from old.active and public.real_role() is distinct from 'admin_principal' then
    raise exception 'Activation ou désactivation d''un compte réservée au Superadmin';
  end if;
  return new;
end $$;

-- 3) Bénéficiaire : enregistre SA fiche en libre-service (et seulement ces champs) -------------------------------------
drop policy if exists beneficiaries_owner_update on public.beneficiaries;
create policy beneficiaries_owner_update on public.beneficiaries for update to authenticated
  using (public.owns_beneficiary(id)) with check (public.owns_beneficiary(id));

create or replace function public.guard_beneficiary_update() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.admin_in_city(old.city_id) then
    if new.city_id is distinct from old.city_id
       or new.name is distinct from old.name
       or new.address is distinct from old.address
       or new.category is distinct from old.category
       or new.active is distinct from old.active
       or new.deleted_at is distinct from old.deleted_at
       or new.allowed_types is distinct from old.allowed_types
       or new.access_note is distinct from old.access_note
       or new.contacts is distinct from old.contacts
       or (new.fiche - array['beneficiaryCount', 'acceptsFresh', 'description', 'creneaux', 'contacts'])
          is distinct from (old.fiche - array['beneficiaryCount', 'acceptsFresh', 'description', 'creneaux', 'contacts']) then
      raise exception 'Ces champs sont définis par Linkee';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists guard_beneficiary_update on public.beneficiaries;
create trigger guard_beneficiary_update before update on public.beneficiaries
  for each row execute function public.guard_beneficiary_update();

-- 4) Partenaire : active lui-même le « sac à dos » (≤ 25 kg) ; voiture et « bénévole seulement » = Linkee ------------
create or replace function public.guard_partner_update() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.admin_in_city(old.city_id) then
    if new.city_id is distinct from old.city_id
       or new.name is distinct from old.name
       or new.category is distinct from old.category
       or new.admin_slot is distinct from old.admin_slot
       or new.admin_volume_range is distinct from old.admin_volume_range
       or new.admin_comment is distinct from old.admin_comment
       or new.active is distinct from old.active
       or new.deleted_at is distinct from old.deleted_at
       or new.benevole_only is distinct from old.benevole_only
       or new.allow_car is distinct from old.allow_car
       or (new.fiche - array['contacts','access','accessNote','hours','denrees','cerfaFrequency'])
          is distinct from (old.fiche - array['contacts','access','accessNote','hours','denrees','cerfaFrequency']) then
      raise exception 'Ces champs sont définis par Linkee';
    end if;
  end if;
  return new;
end $$;

-- Demande de Link par le partenaire : pour SON partenaire, activé « sac à dos », 25 kg maximum, créée « proposée »
drop policy if exists links_insert on public.links;
create policy links_insert on public.links for insert to authenticated
  with check (
    public.admin_in_city(city_id)
    or (public.my_role() = 'partenaire' and public.owns_partner(partner_id)
        and status = 'proposee' and linker_id is null and weight_actual is null and don_value is null
        and kg_estime > 0 and kg_estime <= 25
        and exists (select 1 from public.partners p
                     where p.id = partner_id and p.city_id = links.city_id and p.allow_backpack and p.deleted_at is null))
  );

-- 5) Partenaire : lit SES Links et la liste (réduite) des associations de sa ville -----------------------------------
drop policy if exists links_read on public.links;
create policy links_read on public.links for select to authenticated
  using (public.my_role() = 'admin_principal' or public.staff_in_city(city_id) or linker_id = auth.uid()
         or (status = 'proposee' and public.my_role() = 'linker' and city_id = (select city_id from public.linkers where id = auth.uid()))
         or (public.my_role() = 'partenaire' and public.owns_partner(partner_id)));

-- Un Link ne se modifie que par son Linker (ou le personnel) ; « l'association a confirmé » se coche après acceptation
drop policy if exists links_update on public.links;
create policy links_update on public.links for update to authenticated
  using (public.my_role() = 'admin_principal' or public.staff_in_city(city_id) or linker_id = auth.uid())
  with check (public.my_role() = 'admin_principal' or public.staff_in_city(city_id) or linker_id = auth.uid());

-- Associations d'une ville, version réduite (nom, adresse, horaires) pour trouver la plus proche — sans contacts
create or replace function public.match_beneficiaries(p_city uuid)
returns table(id uuid, name text, address text, active boolean, fiche jsonb)
language sql stable security definer set search_path = public as $$
  select b.id, b.name, b.address, b.active,
         jsonb_build_object('horaires', b.fiche->'horaires', 'hours', b.fiche->'hours')
    from public.beneficiaries b
   where b.city_id = p_city and b.active and b.deleted_at is null
     and (public.staff_in_city(p_city)
          or (public.my_role() = 'partenaire'
              and exists (select 1 from public.partner_users pu join public.partners pp on pp.id = pu.partner_id
                           where pu.profile_id = auth.uid() and pp.city_id = p_city)))
   order by b.name $$;

-- Historique des Links d'un partenaire, avec le nom de l'association de destination (sans ses contacts)
create or replace function public.partner_links(p_partner uuid)
returns table(id uuid, status text, kg_estime numeric, is_fresh boolean, window_date date, window_from time, window_to time,
              asso_confirmed boolean, beneficiary_name text, linker_level int)
language sql stable security definer set search_path = public as $$
  select l.id, l.status, l.kg_estime, l.is_fresh, l.window_date, l.window_from, l.window_to, l.asso_confirmed, b.name, k.level
    from public.links l
    left join public.beneficiaries b on b.id = l.beneficiary_id
    left join public.linkers k on k.id = l.linker_id
   where l.partner_id = p_partner and public.owns_partner(p_partner)
   order by l.created_at desc
   limit 30 $$;

-- 6) Linker spectateur ----------------------------------------------------------------------------------------------
create or replace function public.guard_links_linker() returns trigger
  language plpgsql set search_path = public as $$
begin
  if current_user = 'authenticated' and public.real_role() = 'linker' then
    if (to_jsonb(new) - 'asso_confirmed') is distinct from (to_jsonb(old) - 'asso_confirmed') then
      raise exception 'Utilise les boutons de l''appli pour accepter, collecter ou livrer un Link';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists a_guard_links_linker on public.links;
create trigger a_guard_links_linker before update on public.links
  for each row execute function public.guard_links_linker();

create or replace function public.guard_linkers_stats() returns trigger
  language plpgsql set search_path = public as $$
begin
  if current_user = 'authenticated' and public.real_role() = 'linker' then
    if new.points is distinct from old.points
       or new.level is distinct from old.level
       or new.kg_saved is distinct from old.kg_saved
       or new.links_done is distinct from old.links_done
       or new.is_demo is distinct from old.is_demo
       or new.city_id is distinct from old.city_id then
      raise exception 'Ces chiffres sont calculés par l''appli';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists a_guard_linkers_stats on public.linkers;
create trigger a_guard_linkers_stats before update on public.linkers
  for each row execute function public.guard_linkers_stats();

-- 7) Linker : adresses avant d'accepter, contacts après -------------------------------------------------------------
-- Le Linker ne lit plus directement les fiches des partenaires et des associations : tout passe par linker_links().
drop policy if exists partners_read on public.partners;
create policy partners_read on public.partners for select to authenticated
  using (public.staff_in_city(city_id) or (deleted_at is null and public.owns_partner(id)));

drop policy if exists beneficiaries_read on public.beneficiaries;
create policy beneficiaries_read on public.beneficiaries for select to authenticated
  using (public.staff_in_city(city_id) or (deleted_at is null and public.owns_beneficiary(id)));

-- Téléphones d'une liste de contacts (prénom/fonction + numéro, jamais l'e-mail)
create or replace function public.contacts_phones(j jsonb) returns jsonb
  language sql stable as $$
  select case when jsonb_typeof(j) = 'array'
              then coalesce((select jsonb_agg(jsonb_build_object('type', c->>'type', 'nom', c->>'nom', 'tel', c->>'tel'))
                               from jsonb_array_elements(j) c where coalesce(c->>'tel', '') <> ''), '[]'::jsonb)
              else '[]'::jsonb end $$;

-- Les Links visibles par le Linker connecté : ceux de sa ville encore proposés + les siens
create or replace function public.linker_links()
returns table(id uuid, status text, kg_estime numeric, is_fresh boolean, mode_required text, window_date date, window_from time,
              window_to time, asso_confirmed boolean, linker_id uuid, denree text, photo_paths text[],
              partner_name text, partner_address text, partner_allow_backpack boolean, partner_allow_car boolean, partner_access jsonb,
              beneficiary_name text, beneficiary_address text,
              partner_contacts jsonb, partner_access_note text, beneficiary_contacts jsonb, beneficiary_access_note text)
language sql stable security definer set search_path = public as $$
  select l.id, l.status, l.kg_estime, l.is_fresh, l.mode_required, l.window_date, l.window_from, l.window_to,
         l.asso_confirmed, l.linker_id, l.denree, l.photo_paths,
         p.name, p.address, p.allow_backpack, p.allow_car, coalesce(p.fiche->'access', p.access),
         b.name, b.address,
         case when l.linker_id = k.id and l.status in ('acceptee', 'collectee') then public.contacts_phones(coalesce(p.fiche->'contacts', p.contacts)) end,
         case when l.linker_id = k.id and l.status in ('acceptee', 'collectee') then coalesce(p.fiche->>'accessNote', p.access_note) end,
         case when l.linker_id = k.id and l.status in ('acceptee', 'collectee') then public.contacts_phones(coalesce(b.fiche->'contacts', b.contacts)) end,
         case when l.linker_id = k.id and l.status in ('acceptee', 'collectee') then coalesce(b.fiche->>'accessNote', b.access_note) end
    from public.linkers k
    join public.profiles pr on pr.id = k.id and pr.role = 'linker' and coalesce(pr.active, true)
    join public.links l on (l.linker_id = k.id or (l.status = 'proposee' and l.city_id = k.city_id))
    join public.partners p on p.id = l.partner_id and p.deleted_at is null
    left join public.beneficiaries b on b.id = l.beneficiary_id
   where k.id = auth.uid()
   order by l.window_date, l.window_from $$;

-- « Je me désiste » : le Link redevient proposé (avant la collecte seulement) et l'antenne est prévenue
create or replace function public.release_link(p_link_id uuid) returns public.links
language plpgsql security definer set search_path = public as $$
declare v_row public.links%rowtype; u uuid;
begin
  update public.links set status = 'proposee', linker_id = null, accepted_at = null, asso_confirmed = false
    where id = p_link_id and linker_id = auth.uid() and status = 'acceptee'
    returning * into v_row;
  if v_row.id is null then raise exception 'Action impossible sur ce Link.'; end if;
  for u in select * from public.admin_recipients(v_row.city_id) loop
    perform public.notify(u, v_row.city_id, 'link', 'Un Linker s''est désisté', 'Le Link est de nouveau proposé aux Linkers.',
                          '/links-benevoles', 'linkrelease:' || v_row.id || ':' || extract(epoch from now())::bigint);
  end loop;
  return v_row;
end $$;

revoke all on function public.match_beneficiaries(uuid) from public;
revoke all on function public.partner_links(uuid) from public;
revoke all on function public.contacts_phones(jsonb) from public;
revoke all on function public.linker_links() from public;
revoke all on function public.release_link(uuid) from public;
grant execute on function public.match_beneficiaries(uuid) to authenticated;
grant execute on function public.partner_links(uuid) to authenticated;
grant execute on function public.contacts_phones(jsonb) to authenticated;
grant execute on function public.linker_links() to authenticated;
grant execute on function public.release_link(uuid) to authenticated;

-- 8) Logisticien : il saisit sa tournée, il ne modifie plus le planning ---------------------------------------------
create or replace function public.guard_collectes_logisticien() returns trigger
  language plpgsql set search_path = public as $$
begin
  if current_user = 'authenticated' and public.real_role() = 'logisticien' then
    if new.city_id is distinct from old.city_id
       or new.kind is distinct from old.kind
       or new.partner_id is distinct from old.partner_id
       or new.beneficiary_id is distinct from old.beneficiary_id
       or new.scheduled_date is distinct from old.scheduled_date
       or new.scheduled_time is distinct from old.scheduled_time then
      raise exception 'Le planning est géré par le responsable d''antenne';
    end if;
    if old.logisticien_id is not null and old.logisticien_id is distinct from auth.uid() then
      raise exception 'Cette collecte est attribuée à un autre logisticien';
    end if;
    if new.logisticien_id is not null and new.logisticien_id is distinct from auth.uid() then
      raise exception 'Une collecte ne peut être attribuée qu''à soi-même';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists a_guard_collectes_logisticien on public.collectes;
create trigger a_guard_collectes_logisticien before update on public.collectes
  for each row execute function public.guard_collectes_logisticien();

-- 9) Réservé au Superadmin : villes, rattachement des comptes, journal d'audit ---------------------------------------
drop policy if exists cities_write on public.cities;
create policy cities_write on public.cities for all to authenticated
  using (public.real_role() = 'admin_principal') with check (public.real_role() = 'admin_principal');

drop policy if exists partner_users_write on public.partner_users;
create policy partner_users_write on public.partner_users for all to authenticated
  using (public.real_role() = 'admin_principal') with check (public.real_role() = 'admin_principal');

drop policy if exists beneficiary_users_write on public.beneficiary_users;
create policy beneficiary_users_write on public.beneficiary_users for all to authenticated
  using (public.real_role() = 'admin_principal') with check (public.real_role() = 'admin_principal');

drop policy if exists audit_read on public.audit_log;
create policy audit_read on public.audit_log for select to authenticated
  using (public.real_role() = 'admin_principal');

select 'ok' as resultat;
