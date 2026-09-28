-- Linkee — migration 022 : corrige la boucle accueil ⇄ inscription des Linkers
-- Cause : l'inscription faisait 2 requêtes séparées (profils puis linkers) ; si la 2e échouait, le compte se
-- retrouvait avec role='linker' mais sans fiche Linker, et /linker/inscription renvoyait aussitôt vers /linker/accueil
-- qui renvoyait vers /linker/inscription. Cette fonction fait les deux en une seule transaction (tout ou rien),
-- et peut aussi réparer un compte déjà coincé dans cet état (elle recrée la fiche manquante si besoin).
-- À exécuter dans Supabase → SQL Editor → Run (rejouable), APRÈS la migration 021.

create or replace function public.claim_linker(p_city_id uuid, p_character text, p_full_name text default null) returns public.linkers
language plpgsql security definer set search_path = public as $$
declare v_role public.user_role; v_row public.linkers%rowtype;
begin
  select role into v_role from public.profiles where id = auth.uid();
  if v_role is null then raise exception 'Compte introuvable.'; end if;
  if v_role not in ('en_attente', 'linker') then raise exception 'Ce compte a déjà un autre rôle.'; end if;
  update public.profiles
     set role = 'linker', city_id = p_city_id, full_name = coalesce(nullif(p_full_name, ''), full_name)
   where id = auth.uid();
  insert into public.linkers (id, city_id, character)
    values (auth.uid(), p_city_id, p_character)
    on conflict (id) do update set city_id = excluded.city_id
    returning * into v_row;
  return v_row;
end $$;
revoke all on function public.claim_linker(uuid, text, text) from public;
grant execute on function public.claim_linker(uuid, text, text) to authenticated;

select 'ok' as resultat;
