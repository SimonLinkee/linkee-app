-- Linkee — migration 062 : le Responsable d'antenne attribue un Link proposé à un Linker précis
-- À exécuter dans Supabase → SQL Editor → Run (rejouable sans risque).
--
-- Attribution directe : le Link passe tout de suite à « acceptée » par ce Linker, qui est prévenu et garde la main
-- (« Je me désiste » le remet à disposition de tous, comme avant). Le partenaire est prévenu par la notification existante
-- (« Un Linker a accepté ta demande »).
-- Qui peut attribuer : Superadmin, Comptabilité, Responsable d'antenne (pour SA ville).

create or replace function public.assign_link(p_link_id uuid, p_linker_id uuid)
returns public.links
language plpgsql security definer set search_path = public as $$
declare v_link public.links%rowtype; v_partner text;
begin
  if auth.uid() is null then raise exception 'Non connecté.'; end if;
  select * into v_link from public.links where id = p_link_id for update;
  if not found then raise exception 'Link introuvable.'; end if;
  if not public.admin_in_city(v_link.city_id) then raise exception 'Accès refusé.'; end if;
  if v_link.status <> 'proposee' then raise exception 'Ce Link n''est plus proposé.'; end if;
  if not exists (
    select 1 from public.linkers k join public.profiles pr on pr.id = k.id
     where k.id = p_linker_id and k.city_id = v_link.city_id and pr.role = 'linker' and coalesce(pr.active, true)
  ) then raise exception 'Ce Linker est introuvable, désactivé ou d''une autre ville.'; end if;

  update public.links set linker_id = p_linker_id, status = 'acceptee', accepted_at = now()
   where id = p_link_id returning * into v_link;

  select name into v_partner from public.partners where id = v_link.partner_id;
  perform public.notify(p_linker_id, v_link.city_id, 'link', 'Un Link t''a été attribué',
    coalesce(v_partner, 'Un partenaire') || ' — ' || v_link.kg_estime || ' kg le ' || to_char(v_link.window_date, 'DD/MM'),
    '/linker/link/' || v_link.id, 'linkassign:' || v_link.id);
  return v_link;
end $$;

-- Retire l'attribution tant que la collecte n'a pas eu lieu : le Link redevient proposé à tous les Linkers
create or replace function public.unassign_link(p_link_id uuid)
returns public.links
language plpgsql security definer set search_path = public as $$
declare v_link public.links%rowtype; v_old uuid;
begin
  if auth.uid() is null then raise exception 'Non connecté.'; end if;
  select * into v_link from public.links where id = p_link_id for update;
  if not found then raise exception 'Link introuvable.'; end if;
  if not public.admin_in_city(v_link.city_id) then raise exception 'Accès refusé.'; end if;
  if v_link.status <> 'acceptee' then raise exception 'Seul un Link accepté, pas encore collecté, peut être retiré.'; end if;
  v_old := v_link.linker_id;
  update public.links set status = 'proposee', linker_id = null, accepted_at = null, asso_confirmed = false
   where id = p_link_id returning * into v_link;
  if v_old is not null then
    perform public.notify(v_old, v_link.city_id, 'link', 'Un Link ne t''est plus attribué',
      'Il est de nouveau proposé aux Linkers de la ville.', '/linker', 'linkunassign:' || v_link.id || ':' || extract(epoch from now())::bigint);
  end if;
  return v_link;
end $$;

revoke all on function public.assign_link(uuid, uuid) from public;
revoke all on function public.unassign_link(uuid) from public;
grant execute on function public.assign_link(uuid, uuid) to authenticated;
grant execute on function public.unassign_link(uuid) to authenticated;

select 'ok' as resultat;
