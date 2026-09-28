-- Linkee — migration 019 : nouveau rôle « Linker » (bénévole des Links Bénévoles)
-- À exécuter SEUL dans Supabase → SQL Editor → Run, AVANT la migration 020 (Postgres impose d'ajouter une valeur
-- d'énumération dans une exécution séparée de celle qui l'utilise).
alter type public.user_role add value if not exists 'linker';

select 'ok' as resultat;
