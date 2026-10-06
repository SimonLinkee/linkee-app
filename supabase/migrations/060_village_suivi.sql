-- Linkee — migration 060 : Village associatif = outil de suivi des relations (reprise du tableau Excel)
-- À exécuter dans Supabase → SQL Editor → Run (rejouable sans risque). Nécessite la migration 015.
--
-- Une « association » du Village associatif peut maintenant être une association OU une institution, avec :
--   son ancrage (national / régional / local), le statut de la relation, le type de relation (informelle / convention),
--   ce qu'elle fait en distribution, la fréquence de venue, plusieurs contacts, une prochaine action avec sa date,
--   et le texte d'origine du tableau Excel (pour ne rien perdre à l'import).
-- Le domaine d'intervention reprend la colonne existante activity_type.
-- Les interventions planifiées (agenda « Prochaines interventions ») ont leur propre table.
-- Droits inchangés : lecture = équipe de la ville, écriture = Superadmin / Comptabilité / Responsable d'antenne (sa ville).

alter table public.associations add column if not exists kind text not null default 'association';
alter table public.associations add column if not exists ancrage text;
alter table public.associations add column if not exists relation_status text;
alter table public.associations add column if not exists relation_type text;
alter table public.associations add column if not exists distrib_actions text;
alter table public.associations add column if not exists frequency text;
alter table public.associations add column if not exists contacts jsonb not null default '[]'::jsonb;
alter table public.associations add column if not exists next_action text;
alter table public.associations add column if not exists next_action_date date;
alter table public.associations add column if not exists notes_raw text;
alter table public.associations add column if not exists import_batch text;

alter table public.associations drop constraint if exists associations_kind_check;
alter table public.associations add constraint associations_kind_check check (kind in ('association', 'institution'));
alter table public.associations drop constraint if exists associations_ancrage_check;
alter table public.associations add constraint associations_ancrage_check check (ancrage is null or ancrage in ('National', 'Régional', 'Local'));
alter table public.associations drop constraint if exists associations_relation_status_check;
alter table public.associations add constraint associations_relation_status_check
  check (relation_status is null or relation_status in ('bientot', 'en_attente', 'en_cours', 'termine'));
alter table public.associations drop constraint if exists associations_relation_type_check;
alter table public.associations add constraint associations_relation_type_check check (relation_type is null or relation_type in ('informelle', 'convention'));

-- Interventions planifiées : qui doit venir, quand, où (les interventions réalisées sont dans les distributions)
create table if not exists public.association_visits (
  id uuid primary key default gen_random_uuid(),
  association_id uuid not null references public.associations(id) on delete cascade,
  visit_date date not null,
  place text,
  status text not null default 'a_confirmer' check (status in ('a_confirmer', 'confirmee', 'realisee', 'annulee')),
  purpose text,
  created_at timestamptz not null default now()
);
create index if not exists association_visits_assoc on public.association_visits (association_id, visit_date);
create index if not exists association_visits_date on public.association_visits (visit_date);
alter table public.association_visits enable row level security;

drop policy if exists avisit_read on public.association_visits;
create policy avisit_read on public.association_visits for select to authenticated
  using (exists (select 1 from public.associations a where a.id = association_id and public.staff_in_city(a.city_id)));
drop policy if exists avisit_write on public.association_visits;
create policy avisit_write on public.association_visits for all to authenticated
  using (exists (select 1 from public.associations a where a.id = association_id and public.admin_in_city(a.city_id)))
  with check (exists (select 1 from public.associations a where a.id = association_id and public.admin_in_city(a.city_id)));

drop trigger if exists audit_association_visits on public.association_visits;
create trigger audit_association_visits after insert or update or delete on public.association_visits
  for each row execute function public.log_change();

select 'ok' as resultat;
