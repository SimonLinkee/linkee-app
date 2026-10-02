-- Linkee — migration 043 : droits du rôle « Comptabilité » = mêmes droits que le Superadmin (données),
-- sauf la gestion des comptes (rôles, villes, activation) qui reste réservée au Superadmin.
-- À exécuter dans Supabase → SQL Editor → Run (rejouable), APRÈS la migration 042 (jouée seule).
--
-- Principe : my_role() (utilisée par toutes les règles d'accès) renvoie 'admin_principal' pour un compte
-- Comptabilité — il hérite donc automatiquement de toutes les règles du Superadmin, sans réécrire une à une
-- la quarantaine de règles existantes. real_role() renvoie le vrai rôle, pour les quelques endroits où la
-- différence compte (gestion des comptes ; règles Cerfa à venir).

create or replace function public.real_role() returns public.user_role
  language sql stable security definer set search_path = public as
  $$ select role from public.profiles where id = auth.uid() $$;

create or replace function public.my_role() returns public.user_role
  language sql stable security definer set search_path = public as
  $$ select case when role = 'comptabilite' then 'admin_principal'::public.user_role else role end
       from public.profiles where id = auth.uid() $$;

-- La gestion des comptes reste au vrai Superadmin : un compte Comptabilité ne peut ni se promouvoir, ni
-- changer le rôle/la ville/le statut d'un autre compte.
create or replace function public.guard_profile_update() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and (new.role is distinct from old.role or new.city_id is distinct from old.city_id) then
    if auth.uid() = old.id and old.role = 'en_attente' and new.role = 'linker' and new.city_id is not null then
      return new; -- auto-inscription Linker
    end if;
    if public.real_role() is distinct from 'admin_principal' then
      raise exception 'Modification du rôle ou de la ville réservée au Superadmin';
    end if;
  end if;
  return new;
end $$;

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid() or public.real_role() = 'admin_principal')
  with check (id = auth.uid() or public.real_role() = 'admin_principal');

select 'ok' as resultat;
