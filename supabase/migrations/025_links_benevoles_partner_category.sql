-- Linkee — migration 025 : partenaires "Éligible collecte bénévole", contenu enrichi des demandes de Link,
-- contact du Responsable d'antenne pour les partenaires qui ne peuvent plus faire de collecte exceptionnelle classique.
-- À exécuter dans Supabase → SQL Editor → Run (rejouable), APRÈS la migration 024.

-- 1) Catégorie à part : un partenaire "Éligible collecte bénévole" sort du planning pro classique et n'a plus
--    accès à la collecte exceptionnelle classique (il utilise les Links Bénévoles, ou une collecte "pro" planifiée
--    via la même demande, juste re-libellée côté appli).
alter table public.partners add column if not exists benevole_only boolean not null default false;

-- 2) Contenu des demandes de Link : produits (type de denrée) et photo(s), en plus du poids déjà présent.
alter table public.links add column if not exists denree text;
alter table public.links add column if not exists photo_paths text[] not null default '{}';

-- 3) Un partenaire doit pouvoir connaître le nom et le téléphone du Responsable d'antenne de sa ville (pour les
--    cas où il ne peut plus faire de collecte exceptionnelle classique) sans avoir accès au reste des profils.
create or replace function public.antenne_contact(p_city_id uuid) returns table(full_name text, phone text)
language sql stable security definer set search_path = public as $$
  select full_name, phone from public.profiles
   where role = 'admin_local' and city_id = p_city_id and active
   order by full_name limit 1
$$;
revoke all on function public.antenne_contact(uuid) from public;
grant execute on function public.antenne_contact(uuid) to authenticated;

-- 4) Un partenaire peut joindre une photo à sa demande de Link (dossier link-photos/<partner_id>/…), lisible
--    par lui-même et par le staff (déjà permis par la politique existante sur ce bucket).
drop policy if exists storage_partner_link_insert on storage.objects;
create policy storage_partner_link_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'collecte-photos' and (storage.foldername(name))[1] = 'link-photos'
              and public.owns_partner(((storage.foldername(name))[2])::uuid));
drop policy if exists storage_partner_link_read on storage.objects;
create policy storage_partner_link_read on storage.objects for select to authenticated
  using (bucket_id = 'collecte-photos' and (storage.foldername(name))[1] = 'link-photos'
         and public.owns_partner(((storage.foldername(name))[2])::uuid));

select 'ok' as resultat;
