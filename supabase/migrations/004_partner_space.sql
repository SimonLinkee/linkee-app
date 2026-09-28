-- Linkee — migration 004 : espace partenaire (sécurité de la fiche + fichiers)
-- À exécuter dans Supabase → SQL Editor → Run (rejouable sans risque).

-- 1) Un partenaire ne peut modifier dans sa fiche que : contacts, accès, horaires, denrées.
--    Tout le reste de la fiche (créneau, volume, commentaire Linkee, SIREN, historique…) reste réservé aux admins.
create or replace function public.guard_partner_update() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.admin_in_city(old.city_id) then
    if new.city_id is distinct from old.city_id
       or new.name is distinct from old.name
       or new.category is distinct from old.category
       or new.admin_slot is distinct from old.admin_slot
       or new.admin_volume_range is distinct from old.admin_volume_range
       or new.admin_comment is distinct from old.admin_comment
       or new.active is distinct from old.active
       or (new.fiche - array['contacts','access','accessNote','hours','denrees'])
          is distinct from (old.fiche - array['contacts','access','accessNote','hours','denrees']) then
      raise exception 'Ces champs sont définis par Linkee';
    end if;
  end if;
  return new;
end $$;

-- 2) Les admins peuvent aussi déposer logos et documents pour les partenaires de leur ville
create or replace function public.admin_owns_partner_path(path text) returns boolean
  language sql stable security definer set search_path = public, storage as
  $$ select exists (select 1 from public.partners p
                    where p.id::text = (storage.foldername(path))[1]
                      and public.admin_in_city(p.city_id)) $$;

drop policy if exists storage_admin_partner_files on storage.objects;
create policy storage_admin_partner_files on storage.objects for all to authenticated
  using (bucket_id in ('logos','documents') and public.admin_owns_partner_path(name))
  with check (bucket_id in ('logos','documents') and public.admin_owns_partner_path(name));

-- 3) Le logisticien peut lire les documents des partenaires de sa ville (déjà couvert), rien d'autre à faire.

select 'ok' as resultat;
