-- Linkee — migration 084 : la fiche d'identité de l'antenne (onglet « Mon antenne »)
-- À exécuter dans Supabase → SQL Editor → Run (rejouable sans risque). Nécessite les migrations 011, 047 et 072.
--
-- Chaque ville garde maintenant, en plus de l'adresse de l'entrepôt (cities.depot_address) et du stock (cities.stock_address) :
--   • office_address : adresse des bureaux ;
--   • phone / contact_email : contact de l'antenne ;
--   • tour_slots : jours et heures de tournée de l'antenne (même format que les créneaux des fiches : {"lun":[{"open":"09:00","close":"13:00"}], …}).
-- Le Responsable d'antenne peut modifier la fiche de SA ville (le Superadmin, celles de toutes les villes) par la fonction
-- ci-dessous : elle ne touche qu'à ces colonnes, jamais au nom ni à la couleur de la ville (réservés au Superadmin).
-- Les colonnes ajoutées ne sont pas lisibles sans compte (la lecture anonyme reste limitée à id, name, color — migration 035).

alter table public.cities add column if not exists office_address text;
alter table public.cities add column if not exists phone text;
alter table public.cities add column if not exists contact_email text;
alter table public.cities add column if not exists tour_slots jsonb not null default '{}'::jsonb;

create or replace function public.update_city_identity(
  p_city uuid, p_depot text, p_stock text, p_office text, p_phone text, p_email text, p_slots jsonb
) returns public.cities
language plpgsql security definer set search_path = public as $$
declare v_row public.cities%rowtype; v_slots jsonb;
begin
  if auth.uid() is null then raise exception 'Non connecté'; end if;
  if not public.admin_in_city(p_city) then raise exception 'Accès refusé'; end if;
  v_slots := case when p_slots is not null and jsonb_typeof(p_slots) = 'object' then p_slots else '{}'::jsonb end;
  update public.cities
     set depot_address = nullif(trim(coalesce(p_depot, '')), ''),
         stock_address = nullif(trim(coalesce(p_stock, '')), ''),
         office_address = nullif(trim(coalesce(p_office, '')), ''),
         phone = nullif(trim(coalesce(p_phone, '')), ''),
         contact_email = nullif(trim(coalesce(p_email, '')), ''),
         tour_slots = v_slots
   where id = p_city
   returning * into v_row;
  if not found then raise exception 'Ville introuvable'; end if;
  return v_row;
end $$;

revoke all on function public.update_city_identity(uuid, text, text, text, text, text, jsonb) from public;
grant execute on function public.update_city_identity(uuid, text, text, text, text, text, jsonb) to authenticated;

select 'ok' as resultat;
