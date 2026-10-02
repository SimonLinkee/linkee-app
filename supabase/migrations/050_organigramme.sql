-- Linkee — migration 050 : Organigramme (trombinoscope des comptes par ville)
-- À exécuter dans Supabase → SQL Editor → Run (rejouable), APRÈS la migration 049 (jouée seule).
--
-- Principe : on n'élargit PAS les règles de lecture de la table des comptes. Trois fonctions "security definer" ne
-- renvoient que ce que l'organigramme montre, et seulement à l'équipe interne :
--   team_directory()     équipe (Superadmin, Comptabilité, Responsables d'antenne et de distribution, RH, logisticiens) :
--                        nom, rôle, ville, téléphone, e-mail, photo — toutes les villes
--   team_vehicles()      véhicules « En service » de toutes les antennes
--   linkers_directory()  Linkers : PRÉNOM et photo seulement — Superadmin / Comptabilité (toutes villes), Responsable
--                        d'antenne (sa ville uniquement). Ni téléphone, ni e-mail, ni adresse.
-- « Équipe interne » = Superadmin, Comptabilité, Responsable d'antenne, Resp. Distribution, Responsable RH.
-- Les logisticiens, Linkers, partenaires et associations n'y ont pas accès.

create or replace function public.is_team_viewer() returns boolean
  language sql stable security definer set search_path = public as
  $$ select coalesce(public.real_role() in ('admin_principal', 'comptabilite', 'admin_local', 'resp_distribution', 'resp_rh'), false) $$;

create or replace function public.team_directory()
returns table(id uuid, full_name text, role text, city_id uuid, phone text, email text, photo_path text)
language sql stable security definer set search_path = public as $$
  select p.id, p.full_name, p.role::text, p.city_id, p.phone, p.email, p.photo_path
    from public.profiles p
   where public.is_team_viewer() and p.active
     and p.role in ('admin_principal', 'comptabilite', 'admin_local', 'resp_distribution', 'logisticien', 'resp_rh')
   order by p.full_name $$;

create or replace function public.team_vehicles()
returns table(id uuid, city_id uuid, name text, plate text, vtype text, assigned_name text)
language sql stable security definer set search_path = public as $$
  select v.id, v.city_id, v.name, v.plate, coalesce(v.fiche->>'type', 'Véhicule'),
         nullif(split_part(coalesce(p.full_name, ''), ' ', 1), '')
    from public.vehicles v left join public.profiles p on p.id = v.assigned_to
   where public.is_team_viewer() and coalesce(v.fiche->>'statut', 'En service') = 'En service'
   order by v.name $$;

create or replace function public.linkers_directory()
returns table(id uuid, first_name text, city_id uuid, photo_path text)
language sql stable security definer set search_path = public as $$
  select p.id, split_part(coalesce(nullif(trim(p.full_name), ''), 'Linker'), ' ', 1), l.city_id, p.photo_path
    from public.linkers l join public.profiles p on p.id = l.id
   where p.active and p.role = 'linker'
     and (public.real_role() in ('admin_principal', 'comptabilite')
          or (public.real_role() = 'admin_local' and l.city_id = public.my_city()))
   order by 2 $$;

revoke all on function public.is_team_viewer() from public;
revoke all on function public.team_directory() from public;
revoke all on function public.team_vehicles() from public;
revoke all on function public.linkers_directory() from public;
grant execute on function public.is_team_viewer() to authenticated;
grant execute on function public.team_directory() to authenticated;
grant execute on function public.team_vehicles() to authenticated;
grant execute on function public.linkers_directory() to authenticated;

-- Photos de profil : l'équipe interne voit celles de l'équipe ; les Linkers : Superadmin / Comptabilité (toutes
-- villes) et Responsable d'antenne (sa ville) ; chacun voit toujours la sienne. (Remplace la règle de la migration 048.)
create or replace function public.can_see_avatar_path(path text) returns boolean
  language plpgsql stable security definer set search_path = public, storage as $$
declare v_uid uuid; v_role public.user_role; v_target public.user_role; v_tcity uuid;
begin
  begin v_uid := ((storage.foldername(path))[1])::uuid; exception when others then return false; end;
  if v_uid = auth.uid() then return true; end if;
  v_role := public.real_role();
  if v_role in ('admin_principal', 'comptabilite') then return true; end if;
  select role, city_id into v_target, v_tcity from public.profiles where id = v_uid;
  if v_target is null then return false; end if;
  if v_role in ('admin_local', 'resp_distribution', 'resp_rh') then
    if v_target in ('admin_principal', 'comptabilite', 'admin_local', 'resp_distribution', 'logisticien', 'resp_rh') then return true; end if;
    if v_role = 'admin_local' and v_target = 'linker' and v_tcity = public.my_city() then return true; end if;
  end if;
  return false;
end $$;

drop policy if exists storage_avatars_read on storage.objects;
create policy storage_avatars_read on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and public.can_see_avatar_path(name));

-- Comité d'administration : 7 places (nom + photo), modifiables par le Superadmin, lisibles par l'équipe interne.
create table if not exists public.board_members (
  slot int primary key check (slot between 1 and 7),
  name text not null check (length(trim(name)) > 0),
  photo_path text,
  updated_at timestamptz not null default now()
);
alter table public.board_members enable row level security;
drop policy if exists board_read on public.board_members;
create policy board_read on public.board_members for select to authenticated using (public.is_team_viewer());
drop policy if exists board_write on public.board_members;
create policy board_write on public.board_members for all to authenticated
  using (public.real_role() = 'admin_principal') with check (public.real_role() = 'admin_principal');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('board', 'board', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
  on conflict (id) do update set file_size_limit = 2097152, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];
drop policy if exists storage_board_read on storage.objects;
create policy storage_board_read on storage.objects for select to authenticated
  using (bucket_id = 'board' and public.is_team_viewer());
drop policy if exists storage_board_write on storage.objects;
create policy storage_board_write on storage.objects for all to authenticated
  using (bucket_id = 'board' and public.real_role() = 'admin_principal')
  with check (bucket_id = 'board' and public.real_role() = 'admin_principal');

select 'ok' as resultat;
