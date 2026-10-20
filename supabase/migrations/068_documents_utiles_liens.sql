-- Linkee — migration 068 : « Documents utiles » accepte aussi un LIEN (Google Drive, Docs, Sheets…) à la place d'un fichier
-- À exécuter dans Supabase → SQL Editor → Run (rejouable sans risque). Nécessite la migration 067.
--
-- Un document est soit un fichier (coffre privé), soit un lien. Les règles de visibilité sont exactement les mêmes.
-- Attention : un lien Google Drive reste soumis aux droits de partage de Google (« toute personne disposant du lien »,
-- ou partage nominatif) : Linkee ne contrôle que qui voit le lien, pas l'accès au fichier chez Google.

alter table public.useful_docs alter column storage_path drop not null;
alter table public.useful_docs alter column file_name drop not null;
alter table public.useful_docs add column if not exists link_url text;

alter table public.useful_docs drop constraint if exists useful_docs_source_check;
alter table public.useful_docs add constraint useful_docs_source_check
  check ((storage_path is not null and link_url is null) or (storage_path is null and link_url is not null));
alter table public.useful_docs drop constraint if exists useful_docs_link_check;
alter table public.useful_docs add constraint useful_docs_link_check
  check (link_url is null or (link_url ~* '^https?://[^[:space:]]+$' and length(link_url) <= 600));

select 'ok' as resultat;