-- Linkee — migration 051 : durcissement issu de l'audit interne du 2 octobre 2026
-- À exécuter dans Supabase → SQL Editor → Run (rejouable). Aucune dépendance de migration autre que celles déjà passées.
--
-- Ce que ça corrige :
--  1) Un compte désactivé gardait tous ses accès à la base (la désactivation ne changeait que l'écran d'arrivée).
--  2) Chacun pouvait modifier lui-même son champ "actif" (se réactiver après une désactivation).
--  3) Le bénéficiaire ne pouvait PAS enregistrer sa fiche en libre-service (logo, jauge, contacts, créneaux…) : la
--     base refusait sans erreur visible, donc l'écran affichait "enregistré" alors que rien n'était gardé.
--  4) Un partenaire pouvait activer lui-même la collecte bénévole (benevole_only, allow_backpack, allow_car).
--  5) Un Linker pouvait modifier à la main ses points, son level, ses kg sauvés, et un Link qui lui est confié
--     (statut, poids, valeur du don), sans passer par les boutons "accepter / collecter / livrer".
--  6) Un logisticien pouvait modifier tout le planning de sa ville (date, partenaire, autre logisticien).
--  7) La Comptabilité pouvait créer / renommer / supprimer des villes (réservé au Superadmin, comme à l'écran).
--
-- Principe commun : les actions "sensibles" restent possibles pour les fonctions de l'appli (accept_link,
-- deliver_link…, qui s'exécutent avec les droits du propriétaire) et pour le Superadmin ; elles sont refusées
-- quand quelqu'un les envoie directement depuis son navigateur.

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

-- 2) Profil : activer / désactiver un compte est réservé au Superadmin ---------------------------------------------
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

-- 3) Bénéficiaire : peut enregistrer SA fiche en libre-service (et seulement ces champs) ----------------------------
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

-- 4) Partenaire : la collecte bénévole se règle côté Linkee ----------------------------------------------------------
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
       or new.allow_backpack is distinct from old.allow_backpack
       or new.allow_car is distinct from old.allow_car
       or (new.fiche - array['contacts','access','accessNote','hours','denrees','cerfaFrequency'])
          is distinct from (old.fiche - array['contacts','access','accessNote','hours','denrees','cerfaFrequency']) then
      raise exception 'Ces champs sont définis par Linkee';
    end if;
  end if;
  return new;
end $$;

-- 5) Linker : ses chiffres et ses Links ne se modifient que par les boutons de l'appli ------------------------------
--    (current_user = 'authenticated' : requête directe du navigateur ; les fonctions accept_link / mark_link_collected /
--     deliver_link s'exécutent avec les droits de leur propriétaire et ne sont donc pas bloquées)
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

-- 6) Logisticien : il saisit sa tournée (statut, motif, photos, poids), il ne réorganise pas le planning -----------
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

-- 7) Villes : réservées au vrai Superadmin (la Comptabilité garde tous ses droits sur les données) -----------------
drop policy if exists cities_write on public.cities;
create policy cities_write on public.cities for all to authenticated
  using (public.real_role() = 'admin_principal') with check (public.real_role() = 'admin_principal');

select 'ok' as resultat;
