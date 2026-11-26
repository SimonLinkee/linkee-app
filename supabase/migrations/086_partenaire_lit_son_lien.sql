-- Linkee — migration 086 : le partenaire peut lire SON propre lien de déclaration (pour télécharger son support QR code)
-- À exécuter dans Supabase → SQL Editor → Run (rejouable sans risque). Nécessite la migration 085.
--
-- Un compte partenaire ne voit que le lien des partenaires auxquels il est rattaché (table partner_users) ;
-- l'écriture (régénérer, mettre en pause) reste réservée à l'équipe de la ville.

drop policy if exists partner_links_own_read on public.partner_links;
create policy partner_links_own_read on public.partner_links for select to authenticated
  using (exists (select 1 from public.partner_users pu where pu.partner_id = partner_links.partner_id and pu.profile_id = auth.uid()));

select 'ok' as resultat;
