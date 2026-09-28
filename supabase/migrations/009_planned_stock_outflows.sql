-- Linkee — migration 009 : sorties de stock planifiées
-- Une sortie de stock demandée par l'admin crée maintenant 2 arrêts dans le Planning (prise au dépôt + dépose chez le bénéficiaire).
-- Le stock est décompté quand le logisticien confirme avoir pris les colis.
-- À exécuter dans Supabase → SQL Editor → Run (rejouable sans risque).

alter table public.collectes add column if not exists planned_items jsonb;   -- [{id, name, category, colis, unites, kg}]

select 'ok' as resultat;
