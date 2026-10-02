-- Linkee — migration 044 : base de données des reçus fiscaux (Cerfa) — sujet 2 du lot Cerfa
-- Circuit : soumise → validée → émise, ou refusée à l'étape de validation.
-- À exécuter dans Supabase → SQL Editor → Run (rejouable), APRÈS la migration 043.
--
-- Tout passe par trois fonctions (create_cerfa_request, review_cerfa_request, issue_cerfa_request) : les
-- clients n'ont AUCUN droit d'écriture direct sur ces tables, donc un partenaire ne peut pas se valider lui-même
-- une demande ni modifier son statut. Les règles de lecture n'appellent que des fonctions "security definer"
-- (jamais un sous-select direct sur une autre table à règles) pour éviter la boucle RLS du 01/10/2026.

-- 1) Demandes de Cerfa ------------------------------------------------------------------------------------------
create table if not exists public.cerfa_requests (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id),
  city_id uuid not null references public.cities(id),
  requested_by uuid references public.profiles(id),
  total_value numeric(12,2) not null check (total_value > 0),
  status text not null default 'soumise' check (status in ('soumise', 'validee', 'emise', 'refusee')),
  refusal_comment text,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  issued_by uuid references public.profiles(id),
  issued_at timestamptz,
  cerfa_path text,
  cerfa_name text,
  created_at timestamptz not null default now(),
  check (status <> 'refusee' or length(trim(coalesce(refusal_comment, ''))) > 0),
  check (status <> 'emise' or cerfa_path is not null)
);
create index if not exists cerfa_requests_status on public.cerfa_requests (status, created_at);
create index if not exists cerfa_requests_partner on public.cerfa_requests (partner_id);

-- 2) Documents d'une demande — un document ne peut servir que dans UNE demande active (soumise/validée/émise) ----
create table if not exists public.cerfa_request_documents (
  request_id uuid not null references public.cerfa_requests(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  active boolean not null default true,
  primary key (request_id, document_id)
);
create unique index if not exists cerfa_docs_one_active on public.cerfa_request_documents (document_id) where active;

-- Une demande refusée libère ses documents (ils redeviennent sélectionnables pour une nouvelle demande).
create or replace function public.trg_cerfa_release_docs() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status then
    update public.cerfa_request_documents set active = (new.status <> 'refusee') where request_id = new.id;
  end if;
  return new;
end $$;
drop trigger if exists cerfa_release_docs on public.cerfa_requests;
create trigger cerfa_release_docs after update of status on public.cerfa_requests
  for each row execute function public.trg_cerfa_release_docs();

-- Un document pris dans une demande active ne peut plus être supprimé du porte-documents.
create or replace function public.trg_guard_document_delete() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.cerfa_request_documents where document_id = old.id and active) then
    raise exception 'Ce document est utilisé dans une demande de Cerfa : il ne peut pas être supprimé.';
  end if;
  return old;
end $$;
drop trigger if exists guard_document_delete on public.documents;
create trigger guard_document_delete before delete on public.documents
  for each row execute function public.trg_guard_document_delete();

drop trigger if exists audit_cerfa on public.cerfa_requests;
create trigger audit_cerfa after insert or update or delete on public.cerfa_requests
  for each row execute function public.log_change();

-- 3) Règles de lecture (aucune règle d'écriture : tout passe par les fonctions ci-dessous) -------------------------
create or replace function public.can_see_cerfa_request(p_request uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.cerfa_requests r
    where r.id = p_request and (public.owns_partner(r.partner_id) or public.antenne_in_city(r.city_id))
  ) $$;

alter table public.cerfa_requests enable row level security;
alter table public.cerfa_request_documents enable row level security;

drop policy if exists cerfa_requests_read on public.cerfa_requests;
create policy cerfa_requests_read on public.cerfa_requests for select to authenticated
  using (public.owns_partner(partner_id) or public.antenne_in_city(city_id));

drop policy if exists cerfa_docs_read on public.cerfa_request_documents;
create policy cerfa_docs_read on public.cerfa_request_documents for select to authenticated
  using (public.can_see_cerfa_request(request_id));

-- 4) Fichier du Cerfa émis : coffre privé "cerfa", dossier <partner_id>/ ---------------------------------------------
insert into storage.buckets (id, name, public) values ('cerfa', 'cerfa', false) on conflict (id) do nothing;

create or replace function public.cerfa_path_visible(path text) returns boolean
  language sql stable security definer set search_path = public, storage as $$
  select exists (
    select 1 from public.partners p
    where p.id::text = (storage.foldername(path))[1]
      and (public.owns_partner(p.id) or public.antenne_in_city(p.city_id))
  ) $$;

drop policy if exists storage_cerfa_read on storage.objects;
create policy storage_cerfa_read on storage.objects for select to authenticated
  using (bucket_id = 'cerfa' and public.cerfa_path_visible(name));

drop policy if exists storage_cerfa_write on storage.objects;
create policy storage_cerfa_write on storage.objects for all to authenticated
  using (bucket_id = 'cerfa' and public.real_role() in ('comptabilite', 'admin_principal'))
  with check (bucket_id = 'cerfa' and public.real_role() in ('comptabilite', 'admin_principal'));

-- 5) Les notifications pourront porter le type « cerfa » (envoi branché au sujet 5) ----------------------------------
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('request', 'planning', 'cancel', 'day_closed', 'mission', 'link', 'cerfa'));

-- 6) Le partenaire peut modifier lui-même sa « fréquence d'émission Cerfa » (clé "cerfaFrequency" de sa fiche) :
--    même garde-fou qu'avant (migration 004), avec une clé éditable de plus.
create or replace function public.guard_partner_update() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.admin_in_city(old.city_id) then
    if new.city_id is distinct from old.city_id
       or new.name is distinct from old.name
       or new.category is distinct from old.category
       or new.admin_slot is distinct from old.admin_slot
       or new.admin_volume_range is distinct from old.admin_volume_range
       or new.admin_comment is distinct from old.admin_comment
       or new.active is distinct from old.active
       or (new.fiche - array['contacts','access','accessNote','hours','denrees','cerfaFrequency'])
          is distinct from (old.fiche - array['contacts','access','accessNote','hours','denrees','cerfaFrequency']) then
      raise exception 'Ces champs sont définis par Linkee';
    end if;
  end if;
  return new;
end $$;

-- 7) Fonctions du circuit ---------------------------------------------------------------------------------------
-- Le partenaire envoie sa demande (valeur du don obligatoire, au moins un document, aucun déjà pris ailleurs).
create or replace function public.create_cerfa_request(p_partner_id uuid, p_document_ids uuid[], p_total_value numeric)
returns public.cerfa_requests
language plpgsql security definer set search_path = public as $$
declare v_city uuid; v_ids uuid[]; v_row public.cerfa_requests%rowtype;
begin
  if auth.uid() is null then raise exception 'Non connecté.'; end if;
  if not public.owns_partner(p_partner_id) then raise exception 'Accès refusé.'; end if;
  if p_total_value is null or p_total_value <= 0 then raise exception 'La valeur totale du don est obligatoire.'; end if;
  select array(select distinct unnest(coalesce(p_document_ids, '{}'::uuid[]))) into v_ids;
  if coalesce(array_length(v_ids, 1), 0) = 0 then raise exception 'Sélectionnez au moins un document.'; end if;
  if (select count(*) from public.documents d where d.id = any(v_ids) and d.partner_id = p_partner_id) <> array_length(v_ids, 1) then
    raise exception 'Un des documents sélectionnés est invalide.';
  end if;
  if exists (select 1 from public.cerfa_request_documents x where x.document_id = any(v_ids) and x.active) then
    raise exception 'Un des documents est déjà utilisé dans une demande de Cerfa en cours ou émise.';
  end if;
  select city_id into v_city from public.partners where id = p_partner_id;
  insert into public.cerfa_requests (partner_id, city_id, requested_by, total_value)
    values (p_partner_id, v_city, auth.uid(), round(p_total_value, 2)) returning * into v_row;
  insert into public.cerfa_request_documents (request_id, document_id) select v_row.id, unnest(v_ids);
  return v_row;
end $$;

-- Le Responsable d'antenne (de la ville du partenaire) ou la Comptabilité / le Superadmin valide ou refuse.
create or replace function public.review_cerfa_request(p_id uuid, p_decision text, p_comment text default null)
returns public.cerfa_requests
language plpgsql security definer set search_path = public as $$
declare v_row public.cerfa_requests%rowtype;
begin
  if auth.uid() is null then raise exception 'Non connecté.'; end if;
  select * into v_row from public.cerfa_requests where id = p_id for update;
  if not found then raise exception 'Demande introuvable.'; end if;
  if public.my_role() not in ('admin_principal', 'admin_local') or not public.antenne_in_city(v_row.city_id) then
    raise exception 'Accès refusé.';
  end if;
  if v_row.status <> 'soumise' then raise exception 'Cette demande n''est plus à valider.'; end if;
  if p_decision not in ('validee', 'refusee') then raise exception 'Décision invalide.'; end if;
  if p_decision = 'refusee' and length(trim(coalesce(p_comment, ''))) = 0 then
    raise exception 'Un commentaire est obligatoire pour refuser une demande.';
  end if;
  update public.cerfa_requests
     set status = p_decision, reviewed_by = auth.uid(), reviewed_at = now(),
         refusal_comment = case when p_decision = 'refusee' then trim(p_comment) else null end
   where id = p_id returning * into v_row;
  return v_row;
end $$;

-- La Comptabilité téléverse le Cerfa (dans le coffre "cerfa", dossier <partner_id>/) : la demande passe à « émise ».
create or replace function public.issue_cerfa_request(p_id uuid, p_path text, p_name text default null)
returns public.cerfa_requests
language plpgsql security definer set search_path = public as $$
declare v_row public.cerfa_requests%rowtype;
begin
  if auth.uid() is null then raise exception 'Non connecté.'; end if;
  if public.real_role() not in ('comptabilite', 'admin_principal') then raise exception 'Accès refusé.'; end if;
  select * into v_row from public.cerfa_requests where id = p_id for update;
  if not found then raise exception 'Demande introuvable.'; end if;
  if v_row.status <> 'validee' then raise exception 'Seule une demande validée peut recevoir son Cerfa.'; end if;
  if p_path is null or left(p_path, length(v_row.partner_id::text) + 1) <> v_row.partner_id::text || '/' then
    raise exception 'Fichier invalide.';
  end if;
  update public.cerfa_requests
     set status = 'emise', cerfa_path = p_path, cerfa_name = p_name, issued_by = auth.uid(), issued_at = now()
   where id = p_id returning * into v_row;
  return v_row;
end $$;

revoke all on function public.create_cerfa_request(uuid, uuid[], numeric) from public;
revoke all on function public.review_cerfa_request(uuid, text, text) from public;
revoke all on function public.issue_cerfa_request(uuid, text, text) from public;
grant execute on function public.create_cerfa_request(uuid, uuid[], numeric) to authenticated;
grant execute on function public.review_cerfa_request(uuid, text, text) to authenticated;
grant execute on function public.issue_cerfa_request(uuid, text, text) to authenticated;

select 'ok' as resultat;
