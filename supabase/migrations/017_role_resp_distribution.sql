-- Linkee — migration 017 : nouveau rôle « Resp. Distribution »
-- À exécuter SEUL dans Supabase → SQL Editor → Run, AVANT la migration 018 (Postgres impose d'ajouter une valeur d'énumération dans une exécution séparée).
alter type public.user_role add value if not exists 'resp_distribution';

select 'ok' as resultat;
