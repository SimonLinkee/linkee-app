-- Linkee — migration 015 : Village associatif, interventions externes, photos de la distribution
-- À exécuter dans Supabase → SQL Editor → Run (rejouable sans risque). Nécessite la migration 014.

-- 1) Les associations du Village associatif (par ville)
create table if not exists public.associations (
  id uuid primary key default gen_random_uuid(),
  city_id uuid not null references public.cities(id),
  name text not null,
  activity_type text,                 -- type d'activité (ex. aide alimentaire, sport, insertion…)
  collab_type text,                   -- type de collaboration (ponctuelle, régulière, partenariat…)
  description text,                   -- description de l'activité
  contact_name text,                  -- contact référent
  contact_phone text,
  contact_email text,
  address text,
  archived boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists associations_city on public.associations (city_id, archived, name);
alter table public.associations enable row level security;
drop policy if exists assoc_read on public.associations;
create policy assoc_read on public.associations for select to authenticated using (public.staff_in_city(city_id));
drop policy if exists assoc_write on public.associations;
create policy assoc_write on public.associations for all to authenticated
  using (public.admin_in_city(city_id)) with check (public.admin_in_city(city_id));
drop trigger if exists audit_associations on public.associations;
create trigger audit_associations after insert or update or delete on public.associations
  for each row execute function public.log_change();

-- 2) Historique des échanges avec une association (notes datées : appel, réunion, mail…)
create table if not exists public.association_notes (
  id uuid primary key default gen_random_uuid(),
  association_id uuid not null references public.associations(id) on delete cascade,
  note_date date not null default current_date,
  kind text not null default 'autre' check (kind in ('appel','reunion','mail','autre')),
  body text not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists association_notes_assoc on public.association_notes (association_id, note_date desc);
alter table public.association_notes enable row level security;
drop policy if exists anote_read on public.association_notes;
create policy anote_read on public.association_notes for select to authenticated
  using (exists (select 1 from public.associations a where a.id = association_id and public.staff_in_city(a.city_id)));
drop policy if exists anote_write on public.association_notes;
create policy anote_write on public.association_notes for all to authenticated
  using (exists (select 1 from public.associations a where a.id = association_id and public.admin_in_city(a.city_id)))
  with check (exists (select 1 from public.associations a where a.id = association_id and public.admin_in_city(a.city_id)));

-- 3) Interventions externes : quelle association était présente à quelle distribution
create table if not exists public.distribution_interventions (
  id uuid primary key default gen_random_uuid(),
  distribution_id uuid not null references public.distributions(id) on delete cascade,
  association_id uuid not null references public.associations(id) on delete cascade,
  comment text,
  photo_paths text[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (distribution_id, association_id)
);
create index if not exists dist_interventions_assoc on public.distribution_interventions (association_id);
alter table public.distribution_interventions enable row level security;
drop policy if exists dint_read on public.distribution_interventions;
create policy dint_read on public.distribution_interventions for select to authenticated
  using (exists (select 1 from public.distributions d where d.id = distribution_id and public.staff_in_city(d.city_id)));
drop policy if exists dint_write on public.distribution_interventions;
create policy dint_write on public.distribution_interventions for all to authenticated
  using (exists (select 1 from public.distributions d where d.id = distribution_id and public.admin_in_city(d.city_id)))
  with check (exists (select 1 from public.distributions d where d.id = distribution_id and public.admin_in_city(d.city_id)));
drop trigger if exists audit_distribution_interventions on public.distribution_interventions;
create trigger audit_distribution_interventions after insert or update or delete on public.distribution_interventions
  for each row execute function public.log_change();

-- 4) « Photos de la distribution » (ambiance, stand, bénéficiaires, bénévoles), distinctes de « Photos du colis » (photo_paths)
alter table public.distributions add column if not exists event_photo_paths text[] not null default '{}';

select 'ok' as resultat;
