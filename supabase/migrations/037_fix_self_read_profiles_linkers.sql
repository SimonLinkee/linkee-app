-- Linkee — migration 037 : corrige le blocage de connexion introduit par la migration 036
-- Symptôme signalé par Simon : même le Superadmin se voyait redirigé vers "Compte en attente" à la
-- connexion. Cause probable : l'exécution de la migration 036 a échoué en cours de route (le "drop policy"
-- a tourné mais pas le "create policy" qui suit), laissant la table "profiles" et/ou "linkers" SANS AUCUNE
-- règle de lecture active — avec RLS activé et zéro règle, Postgres refuse TOUT LE MONDE, y compris le
-- propriétaire de son propre compte. Au login, le code lit son propre profil pour connaître son rôle
-- (src/lib/supabase/middleware.ts) ; si cette lecture échoue, il atterrit sur "/en-attente" par défaut.
--
-- Cette migration sépare la lecture de "son propre compte" dans une règle à part, totalement indépendante
-- de la logique de visibilité pour l'équipe (migration 036) : même si cette dernière a un problème, se lire
-- soi-même continuera toujours de fonctionner. Sans risque à rejouer plusieurs fois.
-- À exécuter dans Supabase → SQL Editor → Run, APRÈS la migration 036 (ou à la place si 036 a échoué).

drop policy if exists profiles_read on public.profiles;
drop policy if exists profiles_read_self on public.profiles;
drop policy if exists profiles_read_staff on public.profiles;

create policy profiles_read_self on public.profiles for select to authenticated
  using (id = auth.uid());

create policy profiles_read_staff on public.profiles for select to authenticated
  using (
    (role <> 'linker' and public.staff_in_city(city_id))
    or (role = 'linker' and (
      public.antenne_in_city(city_id)
      or (
        public.my_role() = 'resp_distribution' and public.my_city() = city_id
        and exists (select 1 from public.links l where l.linker_id = profiles.id and l.status in ('acceptee', 'collectee'))
      )
    ))
  );

drop policy if exists linkers_read on public.linkers;
drop policy if exists linkers_read_self on public.linkers;
drop policy if exists linkers_read_staff on public.linkers;

create policy linkers_read_self on public.linkers for select to authenticated
  using (id = auth.uid());

create policy linkers_read_staff on public.linkers for select to authenticated
  using (
    public.antenne_in_city(city_id)
    or (
      public.my_role() = 'resp_distribution' and public.my_city() = city_id
      and exists (select 1 from public.links l where l.linker_id = linkers.id and l.status in ('acceptee', 'collectee'))
    )
  );

select 'ok' as resultat;
