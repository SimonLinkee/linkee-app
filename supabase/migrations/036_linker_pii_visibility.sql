-- Linkee — migration 036 : restreint qui voit les coordonnées des bénévoles Linkers (nom, tél., adresse)
-- Décision de Simon suite à l'audit RGPD du 30/09/2026 (section 01, "Un membre de l'équipe voit les
-- coordonnées de tous les comptes de sa ville") : seuls le Superadmin et le Responsable d'antenne doivent
-- pouvoir consulter librement la fiche complète d'un Linker (profil + adresse de référence).
-- Le Resp. Distribution garde un accès étroit et déjà volontaire (migration 023) : le nom et le téléphone
-- d'un Linker UNIQUEMENT quand celui-ci a un Link en cours (acceptée/collectée) dans sa ville, pour pouvoir
-- l'appeler pendant une mission réelle — c'est l'écran /mobile/links, qui reste inchangé fonctionnellement.
-- Le Logisticien n'a plus aucun accès : rien dans son espace (/journee) n'utilise les données Linker.
-- À exécuter dans Supabase → SQL Editor → Run (rejouable), APRÈS la migration 035.

create or replace function public.antenne_in_city(c uuid) returns boolean
  language sql stable security definer set search_path = public as
  $$ select case
       when public.my_role() = 'admin_principal' then true
       when public.my_role() = 'admin_local' then public.my_city() = c
       else false end $$;

drop policy if exists linkers_read on public.linkers;
create policy linkers_read on public.linkers for select to authenticated
  using (
    id = auth.uid()
    or public.antenne_in_city(city_id)
    or (
      public.my_role() = 'resp_distribution' and public.my_city() = city_id
      and exists (select 1 from public.links l where l.linker_id = linkers.id and l.status in ('acceptee', 'collectee'))
    )
  );

drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated
  using (
    id = auth.uid()
    or (role <> 'linker' and public.staff_in_city(city_id))
    or (role = 'linker' and (
      public.antenne_in_city(city_id)
      or (
        public.my_role() = 'resp_distribution' and public.my_city() = city_id
        and exists (select 1 from public.links l where l.linker_id = profiles.id and l.status in ('acceptee', 'collectee'))
      )
    ))
  );

select 'ok' as resultat;
