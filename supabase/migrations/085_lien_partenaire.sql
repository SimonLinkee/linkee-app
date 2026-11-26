-- Linkee — migration 085 : un lien de déclaration par partenaire (page publique, sans connexion)
-- À exécuter dans Supabase → SQL Editor → Run (rejouable sans risque). Nécessite les migrations 047 et 084.
--
-- • partner_links : le lien secret de chaque partenaire (jeton long et aléatoire) ; visible et modifiable seulement par
--   l'équipe qui pilote la ville du partenaire (Superadmin, Comptabilité en lecture, Responsable d'antenne).
--   Le jeton est volontairement dans une table à part : la table partners est lisible par d'autres rôles (Linkers, associations…).
-- • partner_declarations : ce que le partenaire déclare depuis son lien (lignes catégorie + kg, commentaire, fichiers joints).
--   Elle sert de pré-remplissage au logisticien, qui n'a plus qu'à revalider le contenu de la collecte.
--   L'écriture se fait par la page publique, côté serveur (clé de service) : aucune écriture directe n'est permise aux comptes.
-- • Les fichiers joints (bon de livraison, Excel…) vont dans le stockage privé « collecte-photos », dossier declarations/.

create table if not exists public.partner_links (
  partner_id uuid primary key references public.partners(id) on delete cascade,
  token text not null unique default replace(gen_random_uuid()::text, '-', ''),
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.partner_links enable row level security;

drop policy if exists partner_links_read on public.partner_links;
create policy partner_links_read on public.partner_links for select to authenticated
  using (exists (select 1 from public.partners p where p.id = partner_id
                 and (public.admin_in_city(p.city_id) or public.my_role() = 'comptabilite')));
drop policy if exists partner_links_write on public.partner_links;
create policy partner_links_write on public.partner_links for all to authenticated
  using (exists (select 1 from public.partners p where p.id = partner_id and public.admin_in_city(p.city_id)))
  with check (exists (select 1 from public.partners p where p.id = partner_id and public.admin_in_city(p.city_id)));

-- un lien pour chaque partenaire existant
insert into public.partner_links (partner_id)
  select id from public.partners on conflict (partner_id) do nothing;

create table if not exists public.partner_declarations (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete cascade,
  city_id uuid not null references public.cities(id),
  collecte_id uuid references public.collectes(id) on delete set null,   -- la collecte concernée (vide = autre date / dépôt direct)
  items jsonb not null default '[]',      -- [{ denree, kg, note? }]
  note text,
  contact text,
  files jsonb not null default '[]',      -- [{ path, name, size, mime, at }] dans « collecte-photos »
  created_at timestamptz not null default now()
);
create index if not exists partner_declarations_collecte on public.partner_declarations (collecte_id);
create index if not exists partner_declarations_partner on public.partner_declarations (partner_id, created_at desc);
alter table public.partner_declarations enable row level security;

drop policy if exists partner_declarations_read on public.partner_declarations;
create policy partner_declarations_read on public.partner_declarations for select to authenticated
  using (public.field_in_city(city_id) or public.my_role() = 'comptabilite'
         or exists (select 1 from public.partner_users pu where pu.partner_id = partner_declarations.partner_id and pu.profile_id = auth.uid()));
drop policy if exists partner_declarations_delete on public.partner_declarations;
create policy partner_declarations_delete on public.partner_declarations for delete to authenticated
  using (public.admin_in_city(city_id));

-- l'antenne est prévenue (cloche + téléphone) à chaque déclaration
create or replace function public.trg_notify_declaration() returns trigger
  language plpgsql security definer set search_path = public as $$
declare v_name text; u uuid; v_kg numeric;
begin
  select name into v_name from public.partners where id = new.partner_id;
  select coalesce(sum((i->>'kg')::numeric), 0) into v_kg from jsonb_array_elements(new.items) i;
  for u in select * from public.admin_recipients(new.city_id) loop
    perform public.notify(u, new.city_id, 'request', 'Don déclaré par un partenaire',
      coalesce(v_name, 'Un partenaire') || case when v_kg > 0 then ' — ' || round(v_kg, 1) || ' kg déclarés' else ' — fichier joint' end,
      '/planning', 'declaration:' || new.id);
  end loop;
  return null;
end $$;
drop trigger if exists notify_declaration on public.partner_declarations;
create trigger notify_declaration after insert on public.partner_declarations for each row execute function public.trg_notify_declaration();

select count(*) as liens_crees from public.partner_links;
