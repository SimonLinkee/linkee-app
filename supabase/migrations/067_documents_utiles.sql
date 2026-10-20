-- Linkee — migration 067 : « Documents utiles » (porte-documents du Superadmin, de la Comptabilité, des Responsables d'antenne,
-- Resp. Distribution et Resp. RH)
-- À exécuter dans Supabase → SQL Editor → Run (rejouable sans risque).
--
-- Trois sortes de documents, toutes avec une brève description :
--   shared  = partagé par Linkee : publié par le Superadmin / la Comptabilité, pour toutes les villes ou pour certaines ;
--             lu par toute l'équipe concernée (Responsable d'antenne et Resp. Distribution : leur ville seulement)
--   private = personnel : visible par son auteur SEUL (pas même le Superadmin)
--   people  = envoyé à des personnes précises (Superadmin, Comptabilité, Resp. RH) : visible par l'expéditeur et ses destinataires
-- Les règles sont appliquées par la base, y compris pour les fichiers eux-mêmes (coffre privé « useful-docs »).

-- Qui a droit à cet espace : l'équipe interne concernée (comptes actifs)
create or replace function public.docs_member() returns boolean
  language sql stable security definer set search_path = public as $$
  select coalesce(public.real_role()::text in ('admin_principal', 'comptabilite', 'admin_local', 'resp_distribution', 'resp_rh'), false)
     and coalesce((select p.active from public.profiles p where p.id = auth.uid()), false) $$;
-- Qui publie pour tous : Superadmin et Comptabilité (my_role() renvoie admin_principal pour les deux)
create or replace function public.docs_publisher() returns boolean
  language sql stable security definer set search_path = public as $$
  select public.docs_member() and coalesce(public.my_role()::text = 'admin_principal', false) $$;
-- Qui peut envoyer à des personnes précises : les publieurs et la Resp. RH
create or replace function public.docs_sender() returns boolean
  language sql stable security definer set search_path = public as $$
  select public.docs_member() and coalesce(public.real_role()::text in ('admin_principal', 'comptabilite', 'resp_rh'), false) $$;
revoke all on function public.docs_member() from public;
revoke all on function public.docs_publisher() from public;
revoke all on function public.docs_sender() from public;
grant execute on function public.docs_member() to authenticated;
grant execute on function public.docs_publisher() to authenticated;
grant execute on function public.docs_sender() to authenticated;

create table if not exists public.useful_docs (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) > 0 and length(title) <= 160),
  description text not null check (length(trim(description)) > 0 and length(description) <= 200),
  rubric text not null default 'Autres'
    check (rubric in ('Procédures et consignes', 'Modèles et formulaires', 'Finances et comptabilité', 'Ressources humaines', 'Partenaires et communication', 'Juridique et assurance', 'Accueil et formation', 'Autres')),
  scope text not null check (scope in ('shared', 'private', 'people')),
  city_ids uuid[] not null default '{}',            -- documents partagés : villes concernées (vide = toutes les villes)
  storage_path text not null unique,
  file_name text not null,
  mime text,
  size_bytes bigint,
  owner_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  owner_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists useful_docs_scope on public.useful_docs (scope, created_at desc);
create index if not exists useful_docs_owner on public.useful_docs (owner_id);

create table if not exists public.useful_doc_recipients (
  doc_id uuid not null references public.useful_docs(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (doc_id, user_id)
);
create index if not exists useful_doc_recipients_user on public.useful_doc_recipients (user_id);

-- Visibilité d'un document pour la personne connectée (une seule définition, utilisée par les tables ET par les fichiers)
create or replace function public.useful_doc_visible(p_id uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select public.docs_member() and exists (
    select 1 from public.useful_docs d
     where d.id = p_id
       and (
         d.owner_id = auth.uid()
         or (d.scope = 'shared' and (public.real_role()::text in ('admin_principal', 'comptabilite', 'resp_rh')
                                     or cardinality(d.city_ids) = 0
                                     or public.my_city() = any (d.city_ids)))
         or (d.scope = 'people' and exists (select 1 from public.useful_doc_recipients r where r.doc_id = d.id and r.user_id = auth.uid()))
       )
  ) $$;
create or replace function public.useful_doc_path_visible(p_path text) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.useful_docs d where d.storage_path = p_path and public.useful_doc_visible(d.id)) $$;
revoke all on function public.useful_doc_visible(uuid) from public;
revoke all on function public.useful_doc_path_visible(text) from public;
grant execute on function public.useful_doc_visible(uuid) to authenticated;
grant execute on function public.useful_doc_path_visible(text) to authenticated;

alter table public.useful_docs enable row level security;
alter table public.useful_doc_recipients enable row level security;

drop policy if exists udocs_read on public.useful_docs;
create policy udocs_read on public.useful_docs for select to authenticated using (public.useful_doc_visible(id));

drop policy if exists udocs_insert on public.useful_docs;
create policy udocs_insert on public.useful_docs for insert to authenticated
  with check (
    owner_id = auth.uid() and public.docs_member()
    and (  (scope = 'private' and cardinality(city_ids) = 0)
        or (scope = 'shared' and public.docs_publisher())
        or (scope = 'people' and public.docs_sender() and cardinality(city_ids) = 0))
  );

-- modifier : son propre document ; un document partagé peut aussi être corrigé par le Superadmin / la Comptabilité
drop policy if exists udocs_update on public.useful_docs;
create policy udocs_update on public.useful_docs for update to authenticated
  using (public.docs_member() and (owner_id = auth.uid() or (scope = 'shared' and public.docs_publisher())))
  with check (public.docs_member() and (owner_id = auth.uid() or (scope = 'shared' and public.docs_publisher())));

drop policy if exists udocs_delete on public.useful_docs;
create policy udocs_delete on public.useful_docs for delete to authenticated
  using (public.docs_member() and (owner_id = auth.uid() or (scope = 'shared' and public.docs_publisher())));

-- destinataires : les voit l'expéditeur et le destinataire ; seul l'expéditeur en ajoute ; chacun peut retirer le document de son espace
drop policy if exists urec_read on public.useful_doc_recipients;
create policy urec_read on public.useful_doc_recipients for select to authenticated
  using (public.docs_member() and (user_id = auth.uid() or exists (select 1 from public.useful_docs d where d.id = doc_id and d.owner_id = auth.uid())));
drop policy if exists urec_insert on public.useful_doc_recipients;
create policy urec_insert on public.useful_doc_recipients for insert to authenticated
  with check (public.docs_sender() and exists (select 1 from public.useful_docs d where d.id = doc_id and d.owner_id = auth.uid() and d.scope = 'people'));
drop policy if exists urec_delete on public.useful_doc_recipients;
create policy urec_delete on public.useful_doc_recipients for delete to authenticated
  using (public.docs_member() and (user_id = auth.uid() or exists (select 1 from public.useful_docs d where d.id = doc_id and d.owner_id = auth.uid())));

-- un destinataire doit être un membre actif de l'équipe concernée
create or replace function public.trg_urec_check() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.profiles p where p.id = new.user_id and p.active and p.role in ('admin_principal', 'comptabilite', 'admin_local', 'resp_distribution', 'resp_rh')) then
    raise exception 'Ce destinataire n''a pas accès aux documents utiles.';
  end if;
  return new;
end $$;
drop trigger if exists urec_check on public.useful_doc_recipients;
create trigger urec_check before insert on public.useful_doc_recipients for each row execute function public.trg_urec_check();

drop trigger if exists audit_useful_docs on public.useful_docs;
create trigger audit_useful_docs after insert or update or delete on public.useful_docs
  for each row execute function public.log_change();

-- annuaire pour choisir les destinataires (réservé à ceux qui peuvent envoyer) : nom, rôle, ville — rien d'autre
create or replace function public.docs_directory() returns table(id uuid, full_name text, role text, city_name text)
  language sql stable security definer set search_path = public as $$
  select p.id, coalesce(nullif(trim(p.full_name), ''), split_part(p.email, '@', 1)), p.role::text, c.name
    from public.profiles p left join public.cities c on c.id = p.city_id
   where public.docs_sender() and p.active and p.id <> auth.uid()
     and p.role in ('admin_principal', 'comptabilite', 'admin_local', 'resp_distribution', 'resp_rh')
   order by 2 $$;
revoke all on function public.docs_directory() from public;
grant execute on function public.docs_directory() to authenticated;

-- Coffre de fichiers privé : <id de l'auteur>/<fichier>
insert into storage.buckets (id, name, public, file_size_limit)
values ('useful-docs', 'useful-docs', false, 20971520)
on conflict (id) do nothing;

drop policy if exists storage_udocs_read on storage.objects;
create policy storage_udocs_read on storage.objects for select to authenticated
  using (bucket_id = 'useful-docs' and public.useful_doc_path_visible(name));
drop policy if exists storage_udocs_insert on storage.objects;
create policy storage_udocs_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'useful-docs' and public.docs_member() and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists storage_udocs_delete on storage.objects;
create policy storage_udocs_delete on storage.objects for delete to authenticated
  using (bucket_id = 'useful-docs' and public.docs_member()
         and ((storage.foldername(name))[1] = auth.uid()::text
              or (public.docs_publisher() and exists (select 1 from public.useful_docs d where d.storage_path = name and d.scope = 'shared'))));

select 'ok' as resultat;
