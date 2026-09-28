-- Linkee — migration 023 : téléphone des Linkers visible par le staff, disponibilités en fenêtres libres
-- À exécuter dans Supabase → SQL Editor → Run (rejouable), APRÈS la migration 022.
-- ATTENTION : la table linker_availability est recréée avec une autre forme (fenêtres libres au lieu de
-- créneaux fixes matin/midi/soir) — les quelques lignes qui auraient pu être enregistrées avant le correctif
-- du bug de sauvegarde sont donc reperdues (sans conséquence : ce bug empêchait justement qu'il y en ait).

-- 1) Le staff (Responsable d'antenne, Resp. Distribution, Logisticien) peut lire les profils de sa ville —
--    pour voir le téléphone d'un Linker qui prend en charge un Link et pouvoir l'appeler si besoin.
--    (Auparavant seuls le Superadmin et le Responsable d'antenne pouvaient lire les profils.)
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or public.staff_in_city(city_id));

-- 2) claim_linker : demande aussi le téléphone dès l'inscription, dans la même transaction que le reste.
drop function if exists public.claim_linker(uuid, text, text);
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
  return v_row;
end $$;
revoke all on function public.claim_linker(uuid, text, text, text) from public;
grant execute on function public.claim_linker(uuid, text, text, text) to authenticated;

-- 3) Disponibilités des Linkers : fenêtres horaires libres (jusqu'à 2 par jour, contrôlé côté appli),
--    remplace les créneaux fixes matin/midi/soir.
drop table if exists public.linker_availability;
create table public.linker_availability (
  id uuid primary key default gen_random_uuid(),
  linker_id uuid not null references public.linkers(id) on delete cascade,
  weekday int not null check (weekday between 0 and 6),   -- 0 = lundi … 6 = dimanche
  start_time time not null,
  end_time time not null,
  check (end_time > start_time)
);
create index if not exists lavail_linker on public.linker_availability (linker_id);
alter table public.linker_availability enable row level security;
drop policy if exists lavail_read on public.linker_availability;
create policy lavail_read on public.linker_availability for select to authenticated
  using (linker_id = auth.uid() or public.my_role() = 'admin_principal'
         or exists (select 1 from public.linkers l where l.id = linker_id and public.staff_in_city(l.city_id)));
drop policy if exists lavail_write on public.linker_availability;
create policy lavail_write on public.linker_availability for all to authenticated
  using (linker_id = auth.uid() or public.my_role() = 'admin_principal')
  with check (linker_id = auth.uid() or public.my_role() = 'admin_principal');

select 'ok' as resultat;
