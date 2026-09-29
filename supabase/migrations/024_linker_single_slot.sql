-- Linkee — migration 024 : un seul créneau de disponibilité par jour (Disponible/Fermé), par défaut 8h-20h
-- À exécuter dans Supabase → SQL Editor → Run (rejouable), APRÈS la migration 023.

-- 1) Si des lignes en double existaient déjà pour un même jour (créées avant ce correctif), on ne garde que
--    la première avant de poser la contrainte d'unicité.
delete from public.linker_availability a using public.linker_availability b
  where a.linker_id = b.linker_id and a.weekday = b.weekday and a.id > b.id;

alter table public.linker_availability drop constraint if exists linker_availability_one_per_day;
alter table public.linker_availability add constraint linker_availability_one_per_day unique (linker_id, weekday);

-- 2) claim_linker sème désormais 7 lignes par défaut (tous les jours, 8h-20h) à l'inscription, pour que le
--    Linker soit tout de suite visible dans le matching sans avoir à toucher son profil.
create or replace function public.claim_linker(p_city_id uuid, p_character text, p_full_name text default null, p_phone text default null) returns public.linkers
language plpgsql security definer set search_path = public as $$
declare v_role public.user_role; v_row public.linkers%rowtype;
begin
  select role into v_role from public.profiles where id = auth.uid();
  if v_role is null then raise exception 'Compte introuvable.'; end if;
  if v_role not in ('en_attente', 'linker') then raise exception 'Ce compte a déjà un autre rôle.'; end if;
  update public.profiles
     set role = 'linker', city_id = p_city_id,
         full_name = coalesce(nullif(p_full_name, ''), full_name),
         phone = coalesce(nullif(p_phone, ''), phone)
   where id = auth.uid();
  insert into public.linkers (id, city_id, character)
    values (auth.uid(), p_city_id, p_character)
    on conflict (id) do update set city_id = excluded.city_id
    returning * into v_row;
  insert into public.linker_availability (linker_id, weekday, start_time, end_time)
    select auth.uid(), d, '08:00', '20:00' from generate_series(0, 6) as d
    on conflict (linker_id, weekday) do nothing;
  return v_row;
end $$;
revoke all on function public.claim_linker(uuid, text, text, text) from public;
grant execute on function public.claim_linker(uuid, text, text, text) to authenticated;

select 'ok' as resultat;
