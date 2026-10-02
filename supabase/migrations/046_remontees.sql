-- Linkee — migration 046 : onglet « Remontées » (bugs, questions, suggestions) — sujet 1 : base de données
-- À exécuter dans Supabase → SQL Editor → Run (rejouable), APRÈS la migration 045.
--
-- Principe : chaque utilisateur ne voit que SES remontées, le Superadmin (vrai rôle admin_principal — pas la
-- Comptabilité, qui est un simple utilisateur ici) les voit toutes. Aucune écriture directe : tout passe par des
-- fonctions sécurisées (créer, répondre, changer le statut, marquer comme vu). Les règles de lecture n'appellent
-- que des fonctions "security definer" (pas de sous-select croisé entre tables à règles : voir la boucle du 01/10).

-- 1) Remontées -----------------------------------------------------------------------------------------------------
create table if not exists public.remontees (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  author_role text not null,
  city_id uuid references public.cities(id) on delete set null,
  type text not null check (type in ('bug', 'question', 'suggestion')),
  title text not null check (length(title) between 3 and 150),
  description text not null check (length(description) between 1 and 5000),
  status text not null default 'en_attente' check (status in ('en_attente', 'en_cours', 'traite')),
  page_path text,
  user_agent text,
  -- [{path, name, size}] — fichiers du coffre privé "remontees", dossier <auteur>/<remontée>/ (5 maximum)
  attachments jsonb not null default '[]',
  attachments_purged_at timestamptz,
  treated_at timestamptz,        -- date du passage en « Traité » (point de départ des 6 mois avant suppression des fichiers)
  super_seen_at timestamptz,     -- null = jamais ouverte par le Superadmin, ou nouvelle réponse de l'utilisateur à relire
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists remontees_author on public.remontees (author_id, created_at desc);
create index if not exists remontees_status on public.remontees (status, created_at desc);
create index if not exists remontees_unseen on public.remontees (created_at) where super_seen_at is null;

-- 2) Fil de discussion ---------------------------------------------------------------------------------------------
create table if not exists public.remontee_messages (
  id uuid primary key default gen_random_uuid(),
  remontee_id uuid not null references public.remontees(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  author_is_admin boolean not null default false,
  body text not null check (length(body) between 1 and 5000),
  created_at timestamptz not null default now()
);
create index if not exists remontee_messages_thread on public.remontee_messages (remontee_id, created_at);

-- 3) Règles de lecture (aucune règle d'écriture) -------------------------------------------------------------------
create or replace function public.can_see_remontee(p_id uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.remontees r
    where r.id = p_id and (r.author_id = auth.uid() or public.real_role() = 'admin_principal')
  ) $$;

alter table public.remontees enable row level security;
alter table public.remontee_messages enable row level security;

drop policy if exists remontees_read on public.remontees;
create policy remontees_read on public.remontees for select to authenticated
  using (author_id = auth.uid() or public.real_role() = 'admin_principal');

drop policy if exists remontee_messages_read on public.remontee_messages;
create policy remontee_messages_read on public.remontee_messages for select to authenticated
  using (public.can_see_remontee(remontee_id));

-- 4) Pièces jointes : coffre privé "remontees", dossier <id de l'utilisateur>/<id de la remontée>/ -------------------
--    5 Mo max par fichier, images et PDF uniquement (les images sont aussi compressées côté appli avant l'envoi).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('remontees', 'remontees', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'])
  on conflict (id) do update set file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];

drop policy if exists storage_remontees_read on storage.objects;
create policy storage_remontees_read on storage.objects for select to authenticated
  using (bucket_id = 'remontees' and ((storage.foldername(name))[1] = auth.uid()::text or public.real_role() = 'admin_principal'));

drop policy if exists storage_remontees_insert on storage.objects;
create policy storage_remontees_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'remontees' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists storage_remontees_delete on storage.objects;
create policy storage_remontees_delete on storage.objects for delete to authenticated
  using (bucket_id = 'remontees' and (storage.foldername(name))[1] = auth.uid()::text);

-- 5) Notifications de type « remontee » (cloche + badge sur l'onglet) ---------------------------------------------
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('request', 'planning', 'cancel', 'day_closed', 'mission', 'link', 'cerfa', 'remontee'));

-- 6) Fonctions ------------------------------------------------------------------------------------------------------
-- Créer une remontée. Les fichiers ont déjà été envoyés dans <auteur>/<id>/ (l'id est choisi par l'appli avant).
create or replace function public.create_remontee(
  p_id uuid, p_type text, p_title text, p_description text, p_page_path text, p_user_agent text, p_attachments jsonb default '[]'
) returns public.remontees
language plpgsql security definer set search_path = public as $$
declare
  v_role public.user_role; v_city uuid; v_att jsonb := '[]'; v_el jsonb; v_row public.remontees%rowtype; u uuid; v_label text;
begin
  if auth.uid() is null then raise exception 'Non connecté.'; end if;
  v_role := public.real_role();
  if v_role is null or v_role = 'en_attente' then raise exception 'Accès refusé.'; end if;
  if p_type not in ('bug', 'question', 'suggestion') then raise exception 'Type invalide.'; end if;
  if length(trim(coalesce(p_title, ''))) < 3 then raise exception 'Donne un titre à ta remontée (3 caractères minimum).'; end if;
  if length(trim(coalesce(p_description, ''))) < 1 then raise exception 'Décris ta remontée.'; end if;
  if length(trim(p_title)) > 150 then raise exception 'Titre trop long (150 caractères maximum).'; end if;
  if length(trim(p_description)) > 5000 then raise exception 'Description trop longue (5000 caractères maximum).'; end if;
  if jsonb_typeof(coalesce(p_attachments, '[]'::jsonb)) <> 'array' then raise exception 'Pièces jointes invalides.'; end if;
  if jsonb_array_length(coalesce(p_attachments, '[]'::jsonb)) > 5 then raise exception '5 pièces jointes maximum.'; end if;
  for v_el in select * from jsonb_array_elements(coalesce(p_attachments, '[]'::jsonb)) loop
    if left(coalesce(v_el->>'path', ''), length(auth.uid()::text || '/' || p_id::text) + 1) <> auth.uid()::text || '/' || p_id::text || '/' then
      raise exception 'Pièce jointe invalide.';
    end if;
    v_att := v_att || jsonb_build_array(jsonb_build_object('path', v_el->>'path', 'name', left(coalesce(v_el->>'name', 'fichier'), 200), 'size', coalesce((v_el->>'size')::bigint, 0)));
  end loop;

  -- antenne : celle du profil ; à défaut (partenaire / association) celle de sa structure
  select city_id into v_city from public.profiles where id = auth.uid();
  if v_city is null then
    select p.city_id into v_city from public.partner_users pu join public.partners p on p.id = pu.partner_id where pu.profile_id = auth.uid() limit 1;
  end if;
  if v_city is null then
    select b.city_id into v_city from public.beneficiary_users bu join public.beneficiaries b on b.id = bu.beneficiary_id where bu.profile_id = auth.uid() limit 1;
  end if;

  insert into public.remontees (id, author_id, author_role, city_id, type, title, description, page_path, user_agent, attachments)
    values (p_id, auth.uid(), v_role::text, v_city, p_type, trim(p_title), trim(p_description), left(p_page_path, 300), left(p_user_agent, 400), v_att)
    returning * into v_row;

  v_label := case p_type when 'bug' then 'Bug' when 'question' then 'Question' else 'Suggestion' end;
  for u in select id from public.profiles where active and role = 'admin_principal' loop
    perform public.notify(u, v_city, 'remontee', 'Nouvelle remontée (' || v_label || ')', left(trim(p_title), 120) || ' — ' || v_role::text, '/remontees-app', 'remontee:' || v_row.id);
  end loop;
  return v_row;
end $$;

-- Répondre dans le fil : l'auteur (tant que la remontée n'est pas « Traité ») ou le Superadmin.
create or replace function public.post_remontee_message(p_remontee uuid, p_body text) returns public.remontee_messages
language plpgsql security definer set search_path = public as $$
declare v_r public.remontees%rowtype; v_super boolean; v_msg public.remontee_messages%rowtype; u uuid;
begin
  if auth.uid() is null then raise exception 'Non connecté.'; end if;
  select * into v_r from public.remontees where id = p_remontee for update;
  if not found then raise exception 'Remontée introuvable.'; end if;
  v_super := public.real_role() = 'admin_principal';
  if not v_super and v_r.author_id <> auth.uid() then raise exception 'Accès refusé.'; end if;
  if length(trim(coalesce(p_body, ''))) < 1 then raise exception 'Écris un message.'; end if;
  if not v_super and v_r.status = 'traite' then raise exception 'Cette remontée est traitée : tu ne peux plus y répondre.'; end if;

  insert into public.remontee_messages (remontee_id, author_id, author_is_admin, body)
    values (p_remontee, auth.uid(), v_super, trim(p_body)) returning * into v_msg;

  if v_super then
    update public.remontees set super_seen_at = coalesce(super_seen_at, now()), updated_at = now() where id = p_remontee;
    perform public.notify(v_r.author_id, v_r.city_id, 'remontee', 'Réponse à ta remontée', left(v_r.title, 80) || ' — ' || left(trim(p_body), 120), '/remontees', 'remontee:' || p_remontee);
  else
    update public.remontees set super_seen_at = null, updated_at = now() where id = p_remontee;
    for u in select id from public.profiles where active and role = 'admin_principal' loop
      perform public.notify(u, v_r.city_id, 'remontee', 'Nouvelle réponse sur une remontée', left(v_r.title, 80) || ' — ' || left(trim(p_body), 120), '/remontees-app', 'remontee:' || p_remontee);
    end loop;
  end if;
  return v_msg;
end $$;

-- Changer le statut (Superadmin). « Traité » démarre le délai de 6 mois avant suppression des pièces jointes ;
-- rouvrir la remontée annule ce délai.
create or replace function public.set_remontee_status(p_id uuid, p_status text) returns public.remontees
language plpgsql security definer set search_path = public as $$
declare v_old public.remontees%rowtype; v_row public.remontees%rowtype;
begin
  if auth.uid() is null then raise exception 'Non connecté.'; end if;
  if public.real_role() is distinct from 'admin_principal' then raise exception 'Accès refusé.'; end if;
  if p_status not in ('en_attente', 'en_cours', 'traite') then raise exception 'Statut invalide.'; end if;
  select * into v_old from public.remontees where id = p_id for update;
  if not found then raise exception 'Remontée introuvable.'; end if;
  update public.remontees
     set status = p_status,
         treated_at = case when p_status = 'traite' then coalesce(treated_at, now()) else null end,
         super_seen_at = coalesce(super_seen_at, now()),
         updated_at = now()
   where id = p_id returning * into v_row;
  if v_old.status is distinct from p_status then
    perform public.notify(v_row.author_id, v_row.city_id, 'remontee',
      'Ta remontée est passée à « ' || case p_status when 'en_attente' then 'En attente de traitement' when 'en_cours' then 'En cours' else 'Traité' end || ' »',
      left(v_row.title, 120), '/remontees', 'remontee:' || p_id);
  end if;
  return v_row;
end $$;

-- Marquer comme vue (Superadmin ouvre la remontée) : fait baisser le compteur.
create or replace function public.mark_remontee_seen(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.real_role() is distinct from 'admin_principal' then raise exception 'Accès refusé.'; end if;
  update public.remontees set super_seen_at = now() where id = p_id and super_seen_at is null;
end $$;

revoke all on function public.create_remontee(uuid, text, text, text, text, text, jsonb) from public;
revoke all on function public.post_remontee_message(uuid, text) from public;
revoke all on function public.set_remontee_status(uuid, text) from public;
revoke all on function public.mark_remontee_seen(uuid) from public;
grant execute on function public.create_remontee(uuid, text, text, text, text, text, jsonb) to authenticated;
grant execute on function public.post_remontee_message(uuid, text) to authenticated;
grant execute on function public.set_remontee_status(uuid, text) to authenticated;
grant execute on function public.mark_remontee_seen(uuid) to authenticated;

select 'ok' as resultat;
