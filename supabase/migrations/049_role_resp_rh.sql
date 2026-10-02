-- Linkee — migration 049 : nouveau rôle « Responsable RH » (rôle national à part, pour l'organigramme)
-- À exécuter SEULE, dans Supabase → SQL Editor → Run, AVANT la migration 050 (Postgres refuse d'utiliser une valeur
-- d'énumération dans la même transaction que celle qui l'a ajoutée — comme pour les migrations 017, 019 et 042).

alter type public.user_role add value if not exists 'resp_rh';

select 'ok' as resultat;
