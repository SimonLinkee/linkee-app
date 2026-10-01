-- Linkee — migration 038 : corrige la boucle infinie introduite par les migrations 036/037
-- Cause exacte (confirmée par le message Postgres "infinite recursion detected in policy for relation
-- links") : la règle de lecture de "profiles"/"linkers" vérifie si un Linker a un Link en cours en
-- interrogeant DIRECTEMENT la table "links" ; or la règle de lecture de "links" interroge elle-même
-- directement "linkers" (pour un Linker qui regarde les Links encore ouverts de sa ville) — et ma nouvelle
-- règle de "linkers" interroge à nouveau "links". Boucle : profiles → links → linkers → links → … Postgres
-- refuse tout le monde par sécurité, y compris le Superadmin qui ne fait que lire son propre profil.
--
-- Le code évite ce piège partout ailleurs avec des fonctions "security definer" (staff_in_city, my_role…) :
-- une fonction security definer s'exécute avec les droits de son propriétaire et ne redéclenche donc PAS les
-- règles RLS de la table qu'elle interroge en interne, ce qui casse la boucle. On applique le même principe ici.
-- À exécuter dans Supabase → SQL Editor → Run (rejouable), APRÈS la migration 037.

create or replace function public.linker_has_active_link(p_linker_id uuid, p_city uuid) returns boolean
  language sql stable security definer set search_path = public as
  $$ select exists (
       select 1 from public.links l
       where l.linker_id = p_linker_id and l.city_id = p_city and l.status in ('acceptee', 'collectee')
     ) $$;

drop policy if exists profiles_read_staff on public.profiles;
create policy profiles_read_staff on public.profiles for select to authenticated
  using (
    (role <> 'linker' and public.staff_in_city(city_id))
    or (role = 'linker' and (
      public.antenne_in_city(city_id)
      or (public.my_role() = 'resp_distribution' and public.my_city() = city_id and public.linker_has_active_link(profiles.id, city_id))
    ))
  );

drop policy if exists linkers_read_staff on public.linkers;
create policy linkers_read_staff on public.linkers for select to authenticated
  using (
    public.antenne_in_city(city_id)
    or (public.my_role() = 'resp_distribution' and public.my_city() = city_id and public.linker_has_active_link(linkers.id, city_id))
  );

select 'ok' as resultat;
