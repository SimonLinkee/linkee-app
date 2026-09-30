-- Linkee — migration 035 : ferme la fuite "cities.depot_address" lisible sans compte
-- Repérée par la revue de sécurité externe du 30/09/2026 : la policy "cities_read_signup"
-- (migration 020) ouvre la lecture de la table "cities" à un appelant anonyme (nécessaire
-- pour que la page publique /linker et le formulaire d'inscription affichent la liste des
-- villes avant connexion). Une policy RLS filtre les LIGNES, pas les COLONNES : un appel
-- direct à l'API REST Supabase (hors de l'appli, avec juste la clé publique du bundle JS)
-- pouvait donc lire TOUTES les colonnes, y compris "depot_address" (adresse de l'entrepôt).
-- On restreint donc l'accès anonyme au niveau colonne avec un GRANT Postgres natif :
-- l'appli continue de fonctionner (elle ne demande déjà que id,name,color pour ces pages),
-- mais un appel "select=*" anonyme échoue désormais sur les colonnes non listées.
-- À exécuter dans Supabase → SQL Editor → Run (rejouable), APRÈS la migration 034.

revoke select on public.cities from anon;
grant select (id, name, color) on public.cities to anon;

select 'ok' as resultat;
