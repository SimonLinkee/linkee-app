-- Linkee — migration 033 : corrige un bug bloquant de Links Bénévoles
-- Un Linker ne pouvait jamais voir le nom/adresse du partenaire ni de l'association d'un Link (carte,
-- fiche détail) : les policies de lecture de "partners"/"beneficiaries" ne connaissaient pas le rôle
-- 'linker'. Conséquence : la carte des Links affichait toujours "Aucun Link ne correspond à ton profil",
-- même quand des Links existaient. Corrigé en ajoutant, comme pour "links_read", un droit de lecture pour
-- un Linker sur le partenaire/l'association d'un Link qui lui est assigné, ou d'un Link encore ouvert
-- ("proposee") dans sa ville.
-- Corrige aussi le cas où la case "L'association a confirmé" (avant acceptation) semblait se cocher côté
-- écran mais n'était jamais réellement enregistrée (la policy d'update de "links" exigeait déjà un Linker
-- assigné, alors qu'à ce stade aucun ne l'est encore).
-- À exécuter dans Supabase → SQL Editor → Run (rejouable), APRÈS la migration 032.

drop policy if exists partners_read on public.partners;
create policy partners_read on public.partners for select to authenticated
  using (
    public.staff_in_city(city_id) or public.owns_partner(id)
    or exists (
      select 1 from public.links l
      where l.partner_id = partners.id
        and (l.linker_id = auth.uid()
             or (l.status = 'proposee' and public.my_role() = 'linker' and l.city_id = (select city_id from public.linkers where id = auth.uid())))
    )
  );

drop policy if exists beneficiaries_read on public.beneficiaries;
create policy beneficiaries_read on public.beneficiaries for select to authenticated
  using (
    public.staff_in_city(city_id) or public.owns_beneficiary(id)
    or exists (
      select 1 from public.links l
      where l.beneficiary_id = beneficiaries.id
        and (l.linker_id = auth.uid()
             or (l.status = 'proposee' and public.my_role() = 'linker' and l.city_id = (select city_id from public.linkers where id = auth.uid())))
    )
  );

drop policy if exists links_update on public.links;
create policy links_update on public.links for update to authenticated
  using (
    public.my_role() = 'admin_principal' or public.staff_in_city(city_id) or linker_id = auth.uid()
    or (status = 'proposee' and public.my_role() = 'linker' and city_id = (select city_id from public.linkers where id = auth.uid()))
  )
  with check (
    public.my_role() = 'admin_principal' or public.staff_in_city(city_id) or linker_id = auth.uid()
    or (status = 'proposee' and public.my_role() = 'linker' and city_id = (select city_id from public.linkers where id = auth.uid()))
  );

-- La photo jointe à une demande de Link n'était lisible que par le partenaire lui-même (et le staff) —
-- jamais par le Linker qui doit pourtant voir ce qu'il va collecter.
drop policy if exists storage_partner_link_read on storage.objects;
create policy storage_partner_link_read on storage.objects for select to authenticated
  using (
    bucket_id = 'collecte-photos' and (storage.foldername(name))[1] = 'link-photos'
    and (
      public.owns_partner(((storage.foldername(name))[2])::uuid)
      or exists (
        select 1 from public.links l
        where l.partner_id = ((storage.foldername(name))[2])::uuid
          and (l.linker_id = auth.uid()
               or (l.status = 'proposee' and public.my_role() = 'linker' and l.city_id = (select city_id from public.linkers where id = auth.uid())))
      )
    )
  );

select 'ok' as resultat;
