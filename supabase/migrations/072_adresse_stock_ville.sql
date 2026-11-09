-- Linkee — migration 072 : adresse du STOCK propre à chaque ville
-- À exécuter dans Supabase → SQL Editor → Run (rejouable sans risque).
--
-- • cities.depot_address reste l'adresse de DÉPART des tournées (entrepôt, loueur de camion…).
-- • cities.stock_address (nouveau) : adresse du stock, utilisée par les arrêts « Prise stock » et « Dépose stock ».
--   Vide = on prend l'adresse de départ (comportement d'avant : rien ne change pour les autres villes).
-- • Se règle dans « Villes et comptes » (Superadmin).

alter table public.cities add column if not exists stock_address text;

-- Marseille : le camion est loué (départ chez Olympique Location) ; le stock est ailleurs
update public.cities
   set stock_address = '10 Rue Vincent Leblanc, 13002 Marseille'
 where name = 'Marseille' and coalesce(stock_address, '') = '';

select name, depot_address, stock_address from public.cities order by name;
