-- Linkee — migration 069 : correctif « Documents utiles » — l'ajout d'un document (fichier ou lien) était refusé
-- À exécuter dans Supabase → SQL Editor → Run (rejouable sans risque). Nécessite les migrations 067 et 068.
--
-- Cause : la règle de lecture appelait une fonction qui relit la table useful_docs ; au moment de l'ajout, la ligne toute neuve
-- n'était pas encore « visible » pour cette fonction, donc la base refusait la ligne renvoyée par l'ajout.
-- Correctif : la règle de lecture lit maintenant directement les colonnes de la ligne ; seule la recherche « suis-je destinataire ? »
-- passe par une petite fonction (elle lit la table des destinataires, une autre table, donc sans ce problème).
-- Les droits restent exactement les mêmes.

create or replace function public.useful_doc_is_recipient(p_doc uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.useful_doc_recipients r where r.doc_id = p_doc and r.user_id = auth.uid()) $$;
revoke all on function public.useful_doc_is_recipient(uuid) from public;
grant execute on function public.useful_doc_is_recipient(uuid) to authenticated;

drop policy if exists udocs_read on public.useful_docs;
create policy udocs_read on public.useful_docs for select to authenticated
  using (
    public.docs_member() and (
      owner_id = auth.uid()
      or (scope = 'shared' and (public.real_role()::text in ('admin_principal', 'comptabilite', 'resp_rh')
                                or cardinality(city_ids) = 0
                                or public.my_city() = any (city_ids)))
      or (scope = 'people' and public.useful_doc_is_recipient(id))
    )
  );

select 'ok' as resultat;