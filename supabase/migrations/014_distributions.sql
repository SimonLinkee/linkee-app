-- Linkee — migration 014 : distributions Linkee (lieu, date, inscrits, paniers, produits distribués)
-- À exécuter dans Supabase → SQL Editor → Run (rejouable sans risque).

-- 1) Une distribution = un lieu (bénéficiaire « Distribution Linkee ») à une date
create table if not exists public.distributions (
  id uuid primary key default gen_random_uuid(),
  city_id uuid not null references public.cities(id),
  beneficiary_id uuid not null references public.beneficiaries(id) on delete cascade,
  event_date date not null,
  registered int,                                   -- nombre d'inscrits
  presence_rate numeric(5,2) not null default 80,   -- taux de présence estimé (%)
  baskets int,                                      -- nombre de paniers distribués
  fl_target_kg numeric(8,3),                        -- cible de fruits et légumes par personne (kg)
  status text not null default 'prevue' check (status in ('prevue','distribuee')),
  received_ok boolean not null default false,       -- « bien réceptionné »
  photo_paths text[] not null default '{}',         -- photo du colis (stockage privé « collecte-photos »)
  comment text,
  validated_by uuid references public.profiles(id) on delete set null,
  validated_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (beneficiary_id, event_date)
);
create index if not exists distributions_city_date on public.distributions (city_id, event_date desc);
alter table public.distributions enable row level security;

drop policy if exists dist_read on public.distributions;
create policy dist_read on public.distributions for select to authenticated using (public.staff_in_city(city_id));
drop policy if exists dist_write on public.distributions;
create policy dist_write on public.distributions for all to authenticated
  using (public.admin_in_city(city_id)) with check (public.admin_in_city(city_id));

drop trigger if exists audit_distributions on public.distributions;
create trigger audit_distributions after insert or update or delete on public.distributions
  for each row execute function public.log_change();

-- 2) Les lignes produits (une ligne par produit, comme dans le tableau de suivi)
create table if not exists public.distribution_lines (
  id uuid primary key default gen_random_uuid(),
  distribution_id uuid not null references public.distributions(id) on delete cascade,
  sort_order int not null default 0,
  category text,                  -- F&L, boulangerie, sec, frais, hygiène…
  product text,
  nb_colis numeric(10,2),
  colis_weight_kg numeric(10,3),  -- poids d'un colis
  weight_kg numeric(10,2),        -- poids total (colis × poids, modifiable)
  loss_pct numeric(6,2),          -- % de pertes
  returned_kg numeric(10,2),      -- retours
  redistributed_kg numeric(10,2), -- redonné
  distributed_kg numeric(10,2),   -- distribué
  price numeric(10,2),
  total_cost numeric(12,2),
  supplier text,
  don_pct numeric(6,2),           -- part de don (%)
  delivery_mode text,             -- collecte log, livraison sur site…
  eco_label text,
  geo_label text,
  categorisation text,
  source_collecte_id uuid references public.collectes(id) on delete set null
);
create index if not exists distribution_lines_dist on public.distribution_lines (distribution_id, sort_order);
alter table public.distribution_lines enable row level security;

drop policy if exists distl_read on public.distribution_lines;
create policy distl_read on public.distribution_lines for select to authenticated
  using (exists (select 1 from public.distributions d where d.id = distribution_id and public.staff_in_city(d.city_id)));
drop policy if exists distl_write on public.distribution_lines;
create policy distl_write on public.distribution_lines for all to authenticated
  using (exists (select 1 from public.distributions d where d.id = distribution_id and public.admin_in_city(d.city_id)))
  with check (exists (select 1 from public.distributions d where d.id = distribution_id and public.admin_in_city(d.city_id)));

drop trigger if exists audit_distribution_lines on public.distribution_lines;
create trigger audit_distribution_lines after insert or update or delete on public.distribution_lines
  for each row execute function public.log_change();

select 'ok' as resultat;
