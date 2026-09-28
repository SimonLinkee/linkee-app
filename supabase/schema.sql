-- =====================================================================
-- Linkee — schéma Supabase v1 (tables, sécurité RLS, stockage)
-- À exécuter UNE FOIS dans Supabase → SQL Editor → New query → Run.
-- Le script est rejouable (idempotent) : tu peux le relancer sans casser l'existant.
-- =====================================================================

-- ---------- Rôles ----------
do $$ begin
  create type public.user_role as enum
    ('en_attente', 'admin_principal', 'admin_local', 'logisticien', 'partenaire', 'beneficiaire');
exception when duplicate_object then null; end $$;

-- ---------- Villes ----------
create table if not exists public.cities (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

-- ---------- Profils (1 ligne par compte de connexion) ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  phone text,
  avatar_url text,
  role public.user_role not null default 'en_attente',
  city_id uuid references public.cities(id),
  created_at timestamptz not null default now()
);

-- ---------- Partenaires (commerces qui donnent) ----------
create table if not exists public.partners (
  id uuid primary key default gen_random_uuid(),
  city_id uuid not null references public.cities(id),
  name text not null,
  site_label text,                              -- ex. "Croix-Rousse" si plusieurs sites
  category text,                                -- Boulangerie, Supermarché, Hôtel…
  address text,
  contacts jsonb not null default '[]',         -- [{type, nom, tel, mail}]
  access jsonb not null default '{}',           -- {digicode:true, quai:false…}
  access_note text,
  hours jsonb not null default '{}',            -- {lun:{open,close}|null …}
  denrees text[] not null default '{}',         -- 5 catégories de collecte
  logo_url text,
  photo_url text,
  admin_slot text,                              -- créneau habituel (défini par Linkee)
  admin_volume_range text,                      -- ex. "20/50kg"
  admin_comment text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Un compte partenaire peut donner accès à plusieurs sites
create table if not exists public.partner_users (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  partner_id uuid not null references public.partners(id) on delete cascade,
  primary key (profile_id, partner_id)
);

-- ---------- Bénéficiaires (associations qui reçoivent) ----------
create table if not exists public.beneficiaries (
  id uuid primary key default gen_random_uuid(),
  city_id uuid not null references public.cities(id),
  name text not null,
  address text,
  contacts jsonb not null default '[]',
  access_note text,
  allowed_types text[] not null default '{}',   -- catégories acceptées à la dépose
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------- Flotte ----------
create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  city_id uuid not null references public.cities(id),
  name text not null,
  plate text,
  assigned_to uuid references public.profiles(id),
  notes text,
  created_at timestamptz not null default now()
);

-- ---------- Arrêts de tournée / collectes ----------
create table if not exists public.collectes (
  id uuid primary key default gen_random_uuid(),
  city_id uuid not null references public.cities(id),
  kind text not null check (kind in ('partner','dropoff','stock','exceptionnel','demande_client')),
  partner_id uuid references public.partners(id),
  beneficiary_id uuid references public.beneficiaries(id),
  label text,                                   -- nom affiché si ni partenaire ni bénéficiaire
  scheduled_date date not null,
  scheduled_time time,
  sort_order int not null default 0,
  status text not null default 'todo' check (status in ('todo','collecte','annule','en_attente')),
  motif text,                                   -- motif d'annulation
  comment text,
  logisticien_id uuid references public.profiles(id),
  photos_count int not null default 0,
  done_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists collectes_city_date on public.collectes (city_id, scheduled_date);
create index if not exists collectes_partner on public.collectes (partner_id);

-- Lignes de poids saisies par le logisticien (source du dashboard et du bilan RSE)
create table if not exists public.collecte_items (
  id uuid primary key default gen_random_uuid(),
  collecte_id uuid not null references public.collectes(id) on delete cascade,
  denree text,                                  -- une des 5 catégories
  name text,                                    -- pour le stock (Riz, Eau…)
  kg numeric(10,2) not null check (kg >= 0),
  source_collecte_id uuid references public.collectes(id),  -- dépose : d'où vient le produit
  created_at timestamptz not null default now()
);
create index if not exists collecte_items_collecte on public.collecte_items (collecte_id);

-- ---------- Demandes exceptionnelles des partenaires ----------
create table if not exists public.exceptional_requests (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete cascade,
  wished_date date not null,
  wished_time time,
  denree text,
  volume_kg numeric(10,2),
  comment text,
  status text not null default 'en_attente' check (status in ('en_attente','validee','refusee')),
  created_at timestamptz not null default now()
);

-- ---------- Checklist de départ ----------
create table if not exists public.checklist_templates (
  city_id uuid not null references public.cities(id),
  weekday int not null check (weekday between 1 and 7),   -- 1 = lundi
  items jsonb not null default '[]',                       -- ["Vérifier le carburant", …]
  primary key (city_id, weekday)
);
create table if not exists public.checklist_overrides (
  city_id uuid not null references public.cities(id),
  day date not null,
  items jsonb not null default '[]',
  primary key (city_id, day)
);
create table if not exists public.day_sessions (
  id uuid primary key default gen_random_uuid(),
  city_id uuid not null references public.cities(id),
  logisticien_id uuid not null references public.profiles(id),
  day date not null,
  checklist_done jsonb not null default '[]',
  started_at timestamptz,
  closed_at timestamptz,
  unique (logisticien_id, day)
);

-- ---------- Stock ----------
create table if not exists public.stock_items (
  id uuid primary key default gen_random_uuid(),
  city_id uuid not null references public.cities(id),
  name text not null,
  category text,                                -- une des 5 catégories de collecte
  kg numeric(10,2) not null default 0,
  updated_at timestamptz not null default now()
);

-- ---------- Documents partagés (fichiers dans Storage, métadonnées ici) ----------
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete cascade,
  name text not null,
  storage_path text not null,
  size_bytes bigint,
  uploaded_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

-- =====================================================================
-- Fonctions utilitaires pour la sécurité (SECURITY DEFINER = évite les boucles RLS)
-- =====================================================================
create or replace function public.my_role() returns public.user_role
  language sql stable security definer set search_path = public as
  $$ select role from public.profiles where id = auth.uid() $$;

create or replace function public.my_city() returns uuid
  language sql stable security definer set search_path = public as
  $$ select city_id from public.profiles where id = auth.uid() $$;

create or replace function public.is_admin() returns boolean
  language sql stable security definer set search_path = public as
  $$ select coalesce(public.my_role() in ('admin_principal','admin_local'), false) $$;

-- Staff (admin ou logisticien) qui a accès à une ville
create or replace function public.staff_in_city(c uuid) returns boolean
  language sql stable security definer set search_path = public as
  $$ select case
       when public.my_role() = 'admin_principal' then true
       when public.my_role() in ('admin_local','logisticien') then public.my_city() = c
       else false end $$;

-- Admin qui a accès à une ville
create or replace function public.admin_in_city(c uuid) returns boolean
  language sql stable security definer set search_path = public as
  $$ select case
       when public.my_role() = 'admin_principal' then true
       when public.my_role() = 'admin_local' then public.my_city() = c
       else false end $$;

create or replace function public.owns_partner(p uuid) returns boolean
  language sql stable security definer set search_path = public as
  $$ select exists (select 1 from public.partner_users where profile_id = auth.uid() and partner_id = p) $$;

-- =====================================================================
-- Création automatique du profil à l'inscription d'un compte
-- (rôle "en_attente" : aucun accès aux données tant qu'un admin n'a pas défini le rôle)
-- =====================================================================
create or replace function public.handle_new_user() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Comptes déjà existants (ex. le tien) → profil créé maintenant
insert into public.profiles (id, email)
  select id, email from auth.users
  on conflict (id) do nothing;

-- =====================================================================
-- Garde-fous : personne ne peut se donner un rôle / une ville / des champs verrouillés
-- =====================================================================
create or replace function public.guard_profile_update() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  -- auth.uid() nul = exécuté depuis le SQL Editor / le serveur : autorisé
  if auth.uid() is not null and (new.role is distinct from old.role or new.city_id is distinct from old.city_id) then
    if not public.is_admin() then
      raise exception 'Modification du rôle ou de la ville réservée aux administrateurs';
    end if;
    if public.my_role() = 'admin_local' and (new.role = 'admin_principal' or old.role = 'admin_principal') then
      raise exception 'Seul un administrateur principal peut gérer ce rôle';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists guard_profile_update on public.profiles;
create trigger guard_profile_update before update on public.profiles
  for each row execute function public.guard_profile_update();

-- Un partenaire ne peut modifier que sa fiche, pas les champs "définis par Linkee"
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
       or new.active is distinct from old.active then
      raise exception 'Ces champs sont définis par Linkee';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists guard_partner_update on public.partners;
create trigger guard_partner_update before update on public.partners
  for each row execute function public.guard_partner_update();

-- =====================================================================
-- RLS : on active partout, puis on ouvre au strict nécessaire
-- =====================================================================
alter table public.cities enable row level security;
alter table public.profiles enable row level security;
alter table public.partners enable row level security;
alter table public.partner_users enable row level security;
alter table public.beneficiaries enable row level security;
alter table public.vehicles enable row level security;
alter table public.collectes enable row level security;
alter table public.collecte_items enable row level security;
alter table public.exceptional_requests enable row level security;
alter table public.checklist_templates enable row level security;
alter table public.checklist_overrides enable row level security;
alter table public.day_sessions enable row level security;
alter table public.stock_items enable row level security;
alter table public.documents enable row level security;

-- cities
drop policy if exists cities_read on public.cities;
create policy cities_read on public.cities for select to authenticated
  using (public.staff_in_city(id) or id = public.my_city());
drop policy if exists cities_write on public.cities;
create policy cities_write on public.cities for all to authenticated
  using (public.my_role() = 'admin_principal') with check (public.my_role() = 'admin_principal');

-- profiles
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid()
         or public.my_role() = 'admin_principal'
         or (public.my_role() = 'admin_local' and city_id = public.my_city()));
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()
         or public.my_role() = 'admin_principal'
         or (public.my_role() = 'admin_local' and city_id = public.my_city()))
  with check (id = auth.uid()
         or public.my_role() = 'admin_principal'
         or (public.my_role() = 'admin_local' and city_id = public.my_city()));

-- partners
drop policy if exists partners_read on public.partners;
create policy partners_read on public.partners for select to authenticated
  using (public.staff_in_city(city_id) or public.owns_partner(id));
drop policy if exists partners_insert on public.partners;
create policy partners_insert on public.partners for insert to authenticated
  with check (public.admin_in_city(city_id));
drop policy if exists partners_update on public.partners;
create policy partners_update on public.partners for update to authenticated
  using (public.admin_in_city(city_id) or public.owns_partner(id))
  with check (public.admin_in_city(city_id) or public.owns_partner(id));
drop policy if exists partners_delete on public.partners;
create policy partners_delete on public.partners for delete to authenticated
  using (public.admin_in_city(city_id));

-- partner_users
drop policy if exists partner_users_read on public.partner_users;
create policy partner_users_read on public.partner_users for select to authenticated
  using (profile_id = auth.uid()
         or exists (select 1 from public.partners p where p.id = partner_id and public.admin_in_city(p.city_id)));
drop policy if exists partner_users_write on public.partner_users;
create policy partner_users_write on public.partner_users for all to authenticated
  using (exists (select 1 from public.partners p where p.id = partner_id and public.admin_in_city(p.city_id)))
  with check (exists (select 1 from public.partners p where p.id = partner_id and public.admin_in_city(p.city_id)));

-- beneficiaries
drop policy if exists beneficiaries_read on public.beneficiaries;
create policy beneficiaries_read on public.beneficiaries for select to authenticated
  using (public.staff_in_city(city_id));
drop policy if exists beneficiaries_write on public.beneficiaries;
create policy beneficiaries_write on public.beneficiaries for all to authenticated
  using (public.admin_in_city(city_id)) with check (public.admin_in_city(city_id));

-- vehicles
drop policy if exists vehicles_read on public.vehicles;
create policy vehicles_read on public.vehicles for select to authenticated
  using (public.staff_in_city(city_id));
drop policy if exists vehicles_write on public.vehicles;
create policy vehicles_write on public.vehicles for all to authenticated
  using (public.admin_in_city(city_id)) with check (public.admin_in_city(city_id));

-- collectes
drop policy if exists collectes_read on public.collectes;
create policy collectes_read on public.collectes for select to authenticated
  using (public.staff_in_city(city_id) or (partner_id is not null and public.owns_partner(partner_id)));
drop policy if exists collectes_insert on public.collectes;
create policy collectes_insert on public.collectes for insert to authenticated
  with check (public.admin_in_city(city_id));
drop policy if exists collectes_update on public.collectes;
create policy collectes_update on public.collectes for update to authenticated
  using (public.staff_in_city(city_id)) with check (public.staff_in_city(city_id));
drop policy if exists collectes_delete on public.collectes;
create policy collectes_delete on public.collectes for delete to authenticated
  using (public.admin_in_city(city_id));

-- collecte_items (le logisticien saisit, l'admin peut corriger à tout moment)
drop policy if exists items_read on public.collecte_items;
create policy items_read on public.collecte_items for select to authenticated
  using (exists (select 1 from public.collectes c where c.id = collecte_id
         and (public.staff_in_city(c.city_id) or (c.partner_id is not null and public.owns_partner(c.partner_id)))));
drop policy if exists items_write on public.collecte_items;
create policy items_write on public.collecte_items for all to authenticated
  using (exists (select 1 from public.collectes c where c.id = collecte_id and public.staff_in_city(c.city_id)))
  with check (exists (select 1 from public.collectes c where c.id = collecte_id and public.staff_in_city(c.city_id)));

-- exceptional_requests
drop policy if exists requests_read on public.exceptional_requests;
create policy requests_read on public.exceptional_requests for select to authenticated
  using (public.owns_partner(partner_id)
         or exists (select 1 from public.partners p where p.id = partner_id and public.staff_in_city(p.city_id)));
drop policy if exists requests_insert on public.exceptional_requests;
create policy requests_insert on public.exceptional_requests for insert to authenticated
  with check (status = 'en_attente' and public.owns_partner(partner_id));
drop policy if exists requests_admin on public.exceptional_requests;
create policy requests_admin on public.exceptional_requests for update to authenticated
  using (exists (select 1 from public.partners p where p.id = partner_id and public.admin_in_city(p.city_id)))
  with check (exists (select 1 from public.partners p where p.id = partner_id and public.admin_in_city(p.city_id)));

-- checklist
drop policy if exists tpl_read on public.checklist_templates;
create policy tpl_read on public.checklist_templates for select to authenticated using (public.staff_in_city(city_id));
drop policy if exists tpl_write on public.checklist_templates;
create policy tpl_write on public.checklist_templates for all to authenticated
  using (public.admin_in_city(city_id)) with check (public.admin_in_city(city_id));
drop policy if exists ovr_read on public.checklist_overrides;
create policy ovr_read on public.checklist_overrides for select to authenticated using (public.staff_in_city(city_id));
drop policy if exists ovr_write on public.checklist_overrides;
create policy ovr_write on public.checklist_overrides for all to authenticated
  using (public.admin_in_city(city_id)) with check (public.admin_in_city(city_id));

-- day_sessions (le logisticien gère la sienne, l'admin lit tout)
drop policy if exists sessions_read on public.day_sessions;
create policy sessions_read on public.day_sessions for select to authenticated
  using (logisticien_id = auth.uid() or public.admin_in_city(city_id));
drop policy if exists sessions_write on public.day_sessions;
create policy sessions_write on public.day_sessions for all to authenticated
  using (logisticien_id = auth.uid() and public.staff_in_city(city_id))
  with check (logisticien_id = auth.uid() and public.staff_in_city(city_id));

-- stock
drop policy if exists stock_read on public.stock_items;
create policy stock_read on public.stock_items for select to authenticated using (public.staff_in_city(city_id));
drop policy if exists stock_write on public.stock_items;
create policy stock_write on public.stock_items for all to authenticated
  using (public.admin_in_city(city_id)) with check (public.admin_in_city(city_id));

-- documents
drop policy if exists docs_read on public.documents;
create policy docs_read on public.documents for select to authenticated
  using (public.owns_partner(partner_id)
         or exists (select 1 from public.partners p where p.id = partner_id and public.staff_in_city(p.city_id)));
drop policy if exists docs_write on public.documents;
create policy docs_write on public.documents for all to authenticated
  using (public.owns_partner(partner_id)
         or exists (select 1 from public.partners p where p.id = partner_id and public.admin_in_city(p.city_id)))
  with check (public.owns_partner(partner_id)
         or exists (select 1 from public.partners p where p.id = partner_id and public.admin_in_city(p.city_id)));

-- =====================================================================
-- Stockage de fichiers (logos publics ; documents et photos privés)
-- Chemin des fichiers : <partner_id>/<nom-du-fichier>
-- =====================================================================
insert into storage.buckets (id, name, public) values ('logos', 'logos', true) on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('documents', 'documents', false) on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('collecte-photos', 'collecte-photos', false) on conflict (id) do nothing;

create or replace function public.owns_partner_path(path text) returns boolean
  language sql stable security definer set search_path = public, storage as
  $$ select exists (select 1 from public.partner_users
                    where profile_id = auth.uid()
                      and partner_id::text = (storage.foldername(path))[1]) $$;

drop policy if exists storage_partner_files on storage.objects;
create policy storage_partner_files on storage.objects for all to authenticated
  using (bucket_id in ('logos','documents') and public.owns_partner_path(name))
  with check (bucket_id in ('logos','documents') and public.owns_partner_path(name));

drop policy if exists storage_staff_read on storage.objects;
create policy storage_staff_read on storage.objects for select to authenticated
  using (bucket_id in ('documents','collecte-photos') and public.my_role() in ('admin_principal','admin_local','logisticien'));

drop policy if exists storage_staff_photos on storage.objects;
create policy storage_staff_photos on storage.objects for insert to authenticated
  with check (bucket_id = 'collecte-photos' and public.my_role() in ('admin_principal','admin_local','logisticien'));

-- =====================================================================
-- Démarrage : ville par défaut + TOI en administrateur principal
-- =====================================================================
insert into public.cities (name) values ('Lyon') on conflict (name) do nothing;

update public.profiles
   set role = 'admin_principal',
       full_name = coalesce(full_name, 'Simon'),
       city_id = (select id from public.cities where name = 'Lyon')
 where email = 'honoreb.simon@gmail.com';

-- Vérification : doit afficher ta ligne avec role = admin_principal
select id, email, role, city_id from public.profiles;
