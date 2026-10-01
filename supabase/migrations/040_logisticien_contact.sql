-- Linkee — migration 040 : coordonnées du logisticien d'une ville (pour l'onglet "Nous contacter" des associations)
-- Même principe que "antenne_contact" (migration 025) : une fonction security definer, pour ne donner que
-- nom + téléphone, sans ouvrir l'accès à la table "profiles" en entier.
-- À exécuter dans Supabase → SQL Editor → Run (rejouable), APRÈS la migration 039.

create or replace function public.logisticien_contact(p_city_id uuid) returns table(full_name text, phone text)
language sql stable security definer set search_path = public as $$
  select full_name, phone from public.profiles
   where role = 'logisticien' and city_id = p_city_id and active
   order by full_name limit 1
$$;
revoke all on function public.logisticien_contact(uuid) from public;
grant execute on function public.logisticien_contact(uuid) to authenticated;

select 'ok' as resultat;
