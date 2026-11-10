-- Linkee — migration 076 : un partenaire peut consulter les photos et les fichiers rattachés à SES collectes
-- À exécuter dans Supabase → SQL Editor → Run (rejouable). Même principe que la migration 039 (associations), à laquelle elle ressemble.
--
-- Les photos du logisticien et les fichiers joints par l'équipe sont dans le coffre privé « collecte-photos », sous
-- « <ville>/<id de la collecte>/… ». Jusqu'ici seule l'équipe (et l'association concernée, pour ses déposes) pouvait les lire.
-- Règle ajoutée : un compte partenaire lit les objets des collectes qui concernent SON partenaire — rien d'autre.
-- Le porte-documents « Mes documents » du partenaire, lui, ne change pas (les copies rangées par la 075 y restent réservées à l'équipe).

create or replace function public.owns_partner_collecte_photo_path(path text) returns boolean
  language sql stable security definer set search_path = public, storage as $$
  select exists (
    select 1 from public.collectes c
    where c.id::text = (storage.foldername(path))[2]
      and c.partner_id is not null
      and public.owns_partner(c.partner_id)
  ) $$;

drop policy if exists storage_partner_collecte_photos on storage.objects;
create policy storage_partner_collecte_photos on storage.objects for select to authenticated
  using (bucket_id = 'collecte-photos' and public.owns_partner_collecte_photo_path(name));

select 'ok' as resultat;
