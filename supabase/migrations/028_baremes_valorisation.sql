-- Linkee — migration 028 : barèmes par défaut par type de partenaire, valorisation "personnalisée"/défaut,
-- et prix figé sur chaque collecte au moment de la saisie (l'historique n'est plus jamais recalculé).
-- À exécuter dans Supabase → SQL Editor → Run (rejouable), APRÈS la migration 027.

-- 1) Barèmes par défaut : un jeu de sous-catégories (prix + poids moyen) par TYPE de partenaire (ex. "Boulangerie"),
--    géré côté admin et appliqué automatiquement à tous les partenaires de ce type.
create table if not exists public.category_baremes (
  id uuid primary key default gen_random_uuid(),
  partner_category text not null,                            -- ex. "Boulangerie" (partners.category)
  category text not null,                                    -- une des 5 grandes catégories (denrée)
  name text not null,
  unit text not null default 'kg' check (unit in ('kg', 'unite', 'litre')),
  unit_price numeric(10,2) not null,
  unit_weight_kg numeric(10,3),                               -- poids moyen d'une unité, requis si unit = 'unite'
  created_at timestamptz not null default now()
);
create index if not exists baremes_cat on public.category_baremes (partner_category);
alter table public.category_baremes drop constraint if exists baremes_unique_item;
alter table public.category_baremes add constraint baremes_unique_item unique (partner_category, category, name);
alter table public.category_baremes enable row level security;
drop policy if exists baremes_read on public.category_baremes;
create policy baremes_read on public.category_baremes for select to authenticated using (true);
drop policy if exists baremes_write on public.category_baremes;
create policy baremes_write on public.category_baremes for all to authenticated
  using (public.my_role() in ('admin_principal', 'admin_local'))
  with check (public.my_role() in ('admin_principal', 'admin_local'));
drop trigger if exists audit_category_baremes on public.category_baremes;
create trigger audit_category_baremes after insert or update or delete on public.category_baremes for each row execute function public.log_change();

-- 2) Sous-catégories d'un partenaire : peuvent maintenant surcharger un item de barème (barem_id) — une valeur
--    différente de celle du barème s'affiche comme "personnalisée" côté appli — ou être masquées pour ce
--    partenaire (hidden) sans toucher au barème partagé par les autres partenaires du même type.
alter table public.partner_subcategories add column if not exists barem_id uuid references public.category_baremes(id) on delete set null;
alter table public.partner_subcategories add column if not exists hidden boolean not null default false;

-- 3) Prix figé : la valeur en € de chaque ligne de poids est désormais enregistrée au moment de la saisie
--    (au lieu d'être recalculée en direct à partir du prix courant de la sous-catégorie). Une modification de
--    barème ou de sous-catégorie ne change donc plus la valeur des collectes déjà enregistrées.
alter table public.collecte_items add column if not exists value_snapshot numeric(10,2);

-- 4) Barème "Boulangerie" (premier type, les autres suivront) : Secs et Produits frais.
insert into public.category_baremes (partner_category, category, name, unit, unit_price, unit_weight_kg) values
  ('Boulangerie', 'Secs', 'Baguettes', 'unite', 0.95, 0.25),
  ('Boulangerie', 'Secs', 'Pains spéciaux', 'kg', 2.50, null),
  ('Boulangerie', 'Secs', 'Viennoiseries', 'unite', 1.10, 0.06),
  ('Boulangerie', 'Secs', 'Pâtisseries individuelles', 'unite', 2.50, 0.10),
  ('Boulangerie', 'Produits frais', 'Snacks (sandwichs, pizzas, etc.)', 'unite', 4.50, 0.25),
  ('Boulangerie', 'Produits frais', 'Entrées, soupes et salades', 'unite', 5.50, 0.30)
on conflict (partner_category, category, name) do nothing;

select 'ok' as resultat;
