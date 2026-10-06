-- Linkee — migration 061 : Prospection (suivi des affaires en cours, façon CRM léger), propre à chaque ville
-- À exécuter dans Supabase → SQL Editor → Run (rejouable sans risque). Nécessite la migration 060 (fonctions de droits).
--
-- Qui fait quoi : lecture et écriture = Superadmin, Comptabilité et Responsable d'antenne (pour SA ville uniquement),
-- comme les fiches partenaires. Les autres rôles n'y ont aucun accès.

create table if not exists public.prospects (
  id uuid primary key default gen_random_uuid(),
  city_id uuid not null references public.cities(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  status text not null default 'a_contacter'
    check (status in ('a_contacter', 'contacte', 'a_relancer', 'echanges', 'test', 'partenaire', 'stand_by', 'abandonne')),
  priority smallint check (priority between 0 and 3),   -- 1 = prioritaire … 3 = faible, 0 = à définir
  type text,                                            -- traiteur, hôtel, restauration collective…
  owner text,                                           -- responsable(s) côté Linkee
  address text,
  postal_code text,
  link_citoyen boolean not null default false,          -- éligible à la collecte bénévole
  collect_days text,
  collect_slots text,
  last_call date,
  next_action text,
  next_action_date date,
  contacts jsonb not null default '[]'::jsonb,          -- [{ nom, role, email, tel }]
  comment text,
  partner_id uuid references public.partners(id) on delete set null,  -- fiche partenaire créée à partir de la prospection
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists prospects_city on public.prospects (city_id, status);
alter table public.prospects enable row level security;

drop policy if exists prospects_rw on public.prospects;
create policy prospects_rw on public.prospects for all to authenticated
  using (public.admin_in_city(city_id)) with check (public.admin_in_city(city_id));

create table if not exists public.prospect_notes (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references public.prospects(id) on delete cascade,
  note_date date not null default current_date,
  kind text not null default 'autre' check (kind in ('appel', 'mail', 'rencontre', 'autre')),
  body text not null check (length(trim(body)) > 0),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists prospect_notes_prospect on public.prospect_notes (prospect_id, note_date desc);
alter table public.prospect_notes enable row level security;

drop policy if exists prospect_notes_rw on public.prospect_notes;
create policy prospect_notes_rw on public.prospect_notes for all to authenticated
  using (exists (select 1 from public.prospects p where p.id = prospect_id and public.admin_in_city(p.city_id)))
  with check (exists (select 1 from public.prospects p where p.id = prospect_id and public.admin_in_city(p.city_id)));

drop trigger if exists audit_prospects on public.prospects;
create trigger audit_prospects after insert or update or delete on public.prospects
  for each row execute function public.log_change();

select 'ok' as resultat;
