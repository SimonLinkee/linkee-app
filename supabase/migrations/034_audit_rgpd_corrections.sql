-- Linkee — migration 034 : corrections suite à l'audit RGPD / sécurité de fin septembre 2026
-- À exécuter dans Supabase → SQL Editor → Run (rejouable), APRÈS la migration 033.

-- 1) La photo de vitrine d'un partenaire ("partners.photo_url", utilisée par le logisticien pour reconnaître
--    l'adresse) passe du coffre PUBLIC "logos" à un dossier privé du coffre "collecte-photos" (déjà utilisé
--    pour les photos de terrain). Le logo de marque ("logo_url") reste dans "logos" — lui est légitimement
--    public (une marque, pas une donnée personnelle). Le partenaire garde le droit de lire/déposer sa propre
--    photo de site ; l'équipe la voit déjà via la policy storage_staff_read existante (coffre entier).
create or replace function public.owns_partner_photo_path(path text) returns boolean
  language sql stable security definer set search_path = public, storage as
  $$ select public.owns_partner((storage.foldername(path))[2]::uuid) $$;
drop policy if exists storage_partner_site_photo on storage.objects;
create policy storage_partner_site_photo on storage.objects for all to authenticated
  using (bucket_id = 'collecte-photos' and (storage.foldername(name))[1] = 'site-photos' and public.owns_partner_photo_path(name))
  with check (bucket_id = 'collecte-photos' and (storage.foldername(name))[1] = 'site-photos' and public.owns_partner_photo_path(name));

-- 2) Filet de sécurité au niveau base : une fiche "supprimée" (deleted_at renseigné) ne doit plus jamais être
--    lisible par son propre compte portail (partenaire/association) ni par un Linker, même si un futur écran
--    oubliait le filtre .is("deleted_at", null) côté application (comme c'est fait partout aujourd'hui).
--    L'équipe (staff_in_city) continue de tout voir, y compris supprimé — nécessaire pour l'historique des
--    anciennes collectes/distributions, qui référencent parfois une fiche depuis supprimée.
drop policy if exists partners_read on public.partners;
create policy partners_read on public.partners for select to authenticated
  using (
    public.staff_in_city(city_id)
    or (deleted_at is null and (
      public.owns_partner(id)
      or exists (
        select 1 from public.links l
        where l.partner_id = partners.id
          and (l.linker_id = auth.uid()
               or (l.status = 'proposee' and public.my_role() = 'linker' and l.city_id = (select city_id from public.linkers where id = auth.uid())))
      )
    ))
  );

drop policy if exists beneficiaries_read on public.beneficiaries;
create policy beneficiaries_read on public.beneficiaries for select to authenticated
  using (
    public.staff_in_city(city_id)
    or (deleted_at is null and (
      public.owns_beneficiary(id)
      or exists (
        select 1 from public.links l
        where l.beneficiary_id = beneficiaries.id
          and (l.linker_id = auth.uid()
               or (l.status = 'proposee' and public.my_role() = 'linker' and l.city_id = (select city_id from public.linkers where id = auth.uid())))
      )
    ))
  );

select 'ok' as resultat;
