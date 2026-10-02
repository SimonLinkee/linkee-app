-- Linkee — migration 042 : nouveau rôle « Comptabilité » (suivi des reçus fiscaux Cerfa)
-- À exécuter SEULE, dans Supabase → SQL Editor → Run, AVANT la migration 043 : Postgres refuse d'utiliser une
-- valeur d'énumération dans la même transaction que celle qui l'a ajoutée (même contrainte que pour les
-- migrations 017 et 019).

alter type public.user_role add value if not exists 'comptabilite';

select 'ok' as resultat;
