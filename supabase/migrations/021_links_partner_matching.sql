-- Linkee — migration 021 : demande de Link par le partenaire, matching, accès du Responsable d'antenne, notifications
-- À exécuter dans Supabase → SQL Editor → Run (rejouable), APRÈS la migration 020.

-- 1) Un partenaire peut créer un Link pour lui-même (formulaire "Demander un Link" dans son espace),
--    le Superadmin garde tous les droits, et le Responsable d'antenne (staff de la ville) peut désormais LIRE
--    les Linkers et les Links de sa ville (l'onglet Links Bénévoles n'est plus réservé au Superadmin).
drop policy if exists linkers_read on public.linkers;
create policy linkers_read on public.linkers for select to authenticated
  using (id = auth.uid() or public.my_role() = 'admin_principal' or public.staff_in_city(city_id));

drop policy if exists links_read on public.links;
create policy links_read on public.links for select to authenticated
  using (public.my_role() = 'admin_principal' or public.staff_in_city(city_id) or linker_id = auth.uid()
         or (status = 'proposee' and public.my_role() = 'linker' and city_id = (select city_id from public.linkers where id = auth.uid())));

drop policy if exists links_insert on public.links;
create policy links_insert on public.links for insert to authenticated
  with check (public.my_role() = 'admin_principal' or (public.my_role() = 'partenaire' and public.owns_partner(partner_id)));

-- 2) Notifications : nouveau type « link »
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in ('request','planning','cancel','day_closed','mission','link'));

-- 3) Un nouveau Link proposé prévient le Superadmin et le·s Responsable·s d'antenne de la ville
create or replace function public.trg_notify_link() returns trigger
  language plpgsql security definer set search_path = public as $$
declare v_partner text; v_asso text; u uuid;
begin
  if tg_op = 'INSERT' and new.status = 'proposee' then
    select name into v_partner from public.partners where id = new.partner_id;
    for u in select id from public.profiles where active and (role = 'admin_principal' or (role = 'admin_local' and city_id = new.city_id)) loop
      perform public.notify(u, new.city_id, 'link', 'Nouveau Link bénévole',
        coalesce(v_partner, 'Un partenaire') || ' — ' || new.kg_estime || ' kg le ' || to_char(new.window_date, 'DD/MM'),
        '/links-benevoles', 'link:' || new.id);
    end loop;
    return null;
  end if;
  if tg_op = 'UPDATE' and new.status is distinct from old.status and new.status in ('acceptee', 'livree') then
    select name into v_asso from public.beneficiaries where id = new.beneficiary_id;
    for u in select pu.profile_id from public.partner_users pu where pu.partner_id = new.partner_id loop
      perform public.notify(u, new.city_id,
        'link',
        case when new.status = 'acceptee' then 'Un Linker a accepté ta demande' else 'Ton Link a été livré' end,
        case when new.status = 'acceptee' then 'Un bénévole va passer collecter tes invendus.'
             else coalesce(new.weight_actual::text || ' kg livrés à ' || coalesce(v_asso, 'l''association'), 'Livraison confirmée.') end,
        '/espace-partenaire', 'link:' || new.id || ':' || new.status);
    end loop;
  end if;
  return null;
end $$;
drop trigger if exists notify_link on public.links;
create trigger notify_link after insert or update on public.links for each row execute function public.trg_notify_link();

select 'ok' as resultat;
