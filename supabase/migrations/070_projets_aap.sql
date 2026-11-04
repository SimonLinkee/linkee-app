-- Linkee — migration 070 : « Projets » (suivi des appels à projets, AAP) + porte-documents
-- À exécuter dans Supabase → SQL Editor → Run (rejouable sans risque). Nécessite la migration 067 (fonctions de droits).
--
-- Une liste nationale (pas propre à une ville) : le champ « Antenne concernée » (Montpellier, Lyon, Les deux, Linkee France) sert de filtre.
-- Qui fait quoi :
--   modifier  = Superadmin et Comptabilité (comptes actifs)
--   lire      = Superadmin, Comptabilité, et le Responsable d'antenne pour les AAP de SA ville
--               (« Les deux » compte pour Montpellier et Lyon ; « Linkee France » reste réservé au Superadmin / Comptabilité)
-- Les règles sont appliquées par la base, y compris pour les fichiers du porte-documents (coffre privé « project-docs »).

create or replace function public.project_can_write() returns boolean
  language sql stable security definer set search_path = public as $$
  select coalesce(public.real_role()::text in ('admin_principal', 'comptabilite'), false)
     and coalesce((select p.active from public.profiles p where p.id = auth.uid()), false) $$;

create or replace function public.project_can_read(p_antenne text) returns boolean
  language sql stable security definer set search_path = public as $$
  select coalesce((select p.active from public.profiles p where p.id = auth.uid()), false)
     and (
       public.real_role()::text in ('admin_principal', 'comptabilite')
       or (
         public.real_role()::text = 'admin_local'
         and exists (
           select 1 from public.cities c
            where c.id = public.my_city()
              and (p_antenne = c.name or (p_antenne = 'Les deux' and c.name in ('Montpellier', 'Lyon')))
         )
       )
     ) $$;

revoke all on function public.project_can_write() from public;
revoke all on function public.project_can_read(text) from public;
grant execute on function public.project_can_write() to authenticated;
grant execute on function public.project_can_read(text) to authenticated;

create table if not exists public.aap_projects (
  id uuid primary key default gen_random_uuid(),
  -- identification
  name text not null check (length(trim(name)) > 0 and length(name) <= 200),
  funder text,
  funder_type text check (funder_type in ('public', 'prive', 'mecenat')),
  antenne text not null default 'Linkee France' check (antenne in ('Montpellier', 'Lyon', 'Les deux', 'Linkee France')),
  aap_url text,
  -- calendrier
  deadline date,
  response_date date,
  period text,
  -- argent
  max_amount numeric(12, 2),
  requested_amount numeric(12, 2),
  obtained_amount numeric(12, 2),
  cofunding text,
  -- suivi
  status text not null default 'repere' check (status in ('repere', 'etude', 'redaction', 'depose', 'accepte', 'refuse', 'abandon')),
  go_status text not null default 'a_decider' check (go_status in ('a_decider', 'go', 'no_go')),
  go_reason text,
  owner text,
  next_action text,
  next_action_date date,
  missing_docs text,
  -- dossiers
  application_url text,                 -- dossier de candidature (lien saisi dans la fiche)
  instruction_doc_id uuid,              -- dossier d'instruction (un document du porte-documents)
  -- après décision
  payment_info text,
  report_due text,
  report_date date,
  funder_contact text,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists aap_projects_deadline on public.aap_projects (deadline);
alter table public.aap_projects enable row level security;

drop policy if exists aap_read on public.aap_projects;
create policy aap_read on public.aap_projects for select to authenticated using (public.project_can_read(antenne));
drop policy if exists aap_insert on public.aap_projects;
create policy aap_insert on public.aap_projects for insert to authenticated with check (public.project_can_write());
drop policy if exists aap_update on public.aap_projects;
create policy aap_update on public.aap_projects for update to authenticated using (public.project_can_write()) with check (public.project_can_write());
drop policy if exists aap_delete on public.aap_projects;
create policy aap_delete on public.aap_projects for delete to authenticated using (public.project_can_write());

create table if not exists public.aap_documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.aap_projects(id) on delete cascade,
  name text not null,
  storage_path text not null unique,
  mime text,
  size_bytes bigint,
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists aap_documents_project on public.aap_documents (project_id, created_at);
alter table public.aap_documents enable row level security;

-- le dossier d'instruction pointe vers un document du porte-documents (si le document est supprimé, le choix s'efface)
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'aap_projects_instruction_fk') then
    alter table public.aap_projects
      add constraint aap_projects_instruction_fk foreign key (instruction_doc_id) references public.aap_documents(id) on delete set null;
  end if;
end $$;

create or replace function public.aap_doc_readable(p_project uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.aap_projects a where a.id = p_project and public.project_can_read(a.antenne)) $$;
revoke all on function public.aap_doc_readable(uuid) from public;
grant execute on function public.aap_doc_readable(uuid) to authenticated;

drop policy if exists aapdoc_read on public.aap_documents;
create policy aapdoc_read on public.aap_documents for select to authenticated using (public.aap_doc_readable(project_id));
drop policy if exists aapdoc_insert on public.aap_documents;
create policy aapdoc_insert on public.aap_documents for insert to authenticated with check (public.project_can_write());
drop policy if exists aapdoc_delete on public.aap_documents;
create policy aapdoc_delete on public.aap_documents for delete to authenticated using (public.project_can_write());

drop trigger if exists audit_aap_projects on public.aap_projects;
create trigger audit_aap_projects after insert or update or delete on public.aap_projects
  for each row execute function public.log_change();

-- Coffre de fichiers privé : <id de l'AAP>/<fichier>
insert into storage.buckets (id, name, public, file_size_limit)
values ('project-docs', 'project-docs', false, 20971520)
on conflict (id) do nothing;

create or replace function public.aap_path_readable(p_path text) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.aap_projects a
     where a.id::text = (storage.foldername(p_path))[1] and public.project_can_read(a.antenne)
  ) $$;
revoke all on function public.aap_path_readable(text) from public;
grant execute on function public.aap_path_readable(text) to authenticated;

drop policy if exists storage_aap_read on storage.objects;
create policy storage_aap_read on storage.objects for select to authenticated
  using (bucket_id = 'project-docs' and public.aap_path_readable(name));
drop policy if exists storage_aap_insert on storage.objects;
create policy storage_aap_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'project-docs' and public.project_can_write());
drop policy if exists storage_aap_delete on storage.objects;
create policy storage_aap_delete on storage.objects for delete to authenticated
  using (bucket_id = 'project-docs' and public.project_can_write());

select 'ok' as resultat;
