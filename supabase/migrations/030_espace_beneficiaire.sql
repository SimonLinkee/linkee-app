-- Linkee — migration 030 : espace bénéficiaire (compte rattaché à une association, dashboard, porte-documents)
-- Sur le même principe que l'espace partenaire. À exécuter dans Supabase → SQL Editor → Run (rejouable),
-- APRÈS la migration 029.

-- 1) Un compte bénéficiaire peut donner accès à plusieurs structures (mirroir de partner_users).
create table if not exists public.beneficiary_users (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  beneficiary_id uuid not null references public.beneficiaries(id) on delete cascade,
  primary key (profile_id, beneficiary_id)
);
alter table public.beneficiary_users enable row level security;
drop policy if exists beneficiary_users_read on public.beneficiary_users;
create policy beneficiary_users_read on public.beneficiary_users for select to authenticated
  using (profile_id = auth.uid()
         or exists (select 1 from public.beneficiaries b where b.id = beneficiary_id and public.admin_in_city(b.city_id)));
drop policy if exists beneficiary_users_write on public.beneficiary_users;
create policy beneficiary_users_write on public.beneficiary_users for all to authenticated
  using (exists (select 1 from public.beneficiaries b where b.id = beneficiary_id and public.admin_in_city(b.city_id)))
  with check (exists (select 1 from public.beneficiaries b where b.id = beneficiary_id and public.admin_in_city(b.city_id)));

create or replace function public.owns_beneficiary(b uuid) returns boolean
  language sql stable security definer set search_path = public as
  $$ select exists (select 1 from public.beneficiary_users where profile_id = auth.uid() and beneficiary_id = b) $$;

-- 2) "Mes documents" existait déjà pour les partenaires (table documents + bucket storage "documents") :
--    on la généralise pour qu'un document puisse aussi appartenir à un bénéficiaire.
alter table public.documents add column if not exists beneficiary_id uuid references public.beneficiaries(id) on delete cascade;
alter table public.documents alter column partner_id drop not null;
alter table public.documents drop constraint if exists documents_one_owner_check;
alter table public.documents add constraint documents_one_owner_check check ((partner_id is not null) <> (beneficiary_id is not null));
alter table public.documents drop constraint if exists documents_source_check;
alter table public.documents add constraint documents_source_check check (source in ('admin', 'partenaire', 'beneficiaire'));

drop policy if exists docs_read on public.documents;
create policy docs_read on public.documents for select to authenticated
  using (
    (partner_id is not null and (public.owns_partner(partner_id) or exists (select 1 from public.partners p where p.id = partner_id and public.staff_in_city(p.city_id))))
    or (beneficiary_id is not null and (public.owns_beneficiary(beneficiary_id) or exists (select 1 from public.beneficiaries b where b.id = beneficiary_id and public.staff_in_city(b.city_id))))
  );
drop policy if exists docs_write on public.documents;
create policy docs_write on public.documents for all to authenticated
  using (
    (partner_id is not null and (public.owns_partner(partner_id) or exists (select 1 from public.partners p where p.id = partner_id and public.admin_in_city(p.city_id))))
    or (beneficiary_id is not null and (public.owns_beneficiary(beneficiary_id) or exists (select 1 from public.beneficiaries b where b.id = beneficiary_id and public.admin_in_city(b.city_id))))
  )
  with check (
    (partner_id is not null and (public.owns_partner(partner_id) or exists (select 1 from public.partners p where p.id = partner_id and public.admin_in_city(p.city_id))))
    or (beneficiary_id is not null and (public.owns_beneficiary(beneficiary_id) or exists (select 1 from public.beneficiaries b where b.id = beneficiary_id and public.admin_in_city(b.city_id))))
  );

-- 3) Un compte bénéficiaire doit pouvoir lire sa propre fiche (lecture seule côté espace bénéficiaire).
drop policy if exists beneficiaries_read on public.beneficiaries;
create policy beneficiaries_read on public.beneficiaries for select to authenticated
  using (public.staff_in_city(city_id) or public.owns_beneficiary(id));

-- 4) Un compte bénéficiaire doit pouvoir lire ses propres livraisons (collectes de type "dropoff" le
--    concernant) pour l'onglet "Mes livraisons" de son espace.
drop policy if exists collectes_read on public.collectes;
create policy collectes_read on public.collectes for select to authenticated
  using (public.staff_in_city(city_id)
         or (partner_id is not null and public.owns_partner(partner_id))
         or (beneficiary_id is not null and public.owns_beneficiary(beneficiary_id)));
drop policy if exists items_read on public.collecte_items;
create policy items_read on public.collecte_items for select to authenticated
  using (exists (select 1 from public.collectes c where c.id = collecte_id
         and (public.staff_in_city(c.city_id)
              or (c.partner_id is not null and public.owns_partner(c.partner_id))
              or (c.beneficiary_id is not null and public.owns_beneficiary(c.beneficiary_id)))));

-- 5) "Demander une modification" (fiche en lecture seule côté espace bénéficiaire) : notifie les admins de
--    la ville, sur le même principe que les demandes de collecte exceptionnelle des partenaires.
create or replace function public.request_beneficiary_update(p_beneficiary_id uuid, p_message text) returns void
  language plpgsql security definer set search_path = public as $$
declare v_city uuid; v_name text; u uuid;
begin
  if not public.owns_beneficiary(p_beneficiary_id) then
    raise exception 'not allowed';
  end if;
  select city_id, name into v_city, v_name from public.beneficiaries where id = p_beneficiary_id;
  for u in select * from public.admin_recipients(v_city) loop
    perform public.notify(u, v_city, 'request', 'Demande de modification de fiche',
      coalesce(v_name, 'Une association') || ' — ' || left(coalesce(p_message, ''), 300),
      '/partenaires', 'benef-update:' || p_beneficiary_id || ':' || now()::text);
  end loop;
end $$;

-- 6) Stockage : dossier <beneficiary_id>/<fichier>, lisible/modifiable uniquement par les comptes rattachés
--    à cette structure (comme pour les partenaires) — une asso ne peut jamais voir les documents d'une autre.
create or replace function public.owns_beneficiary_path(path text) returns boolean
  language sql stable security definer set search_path = public, storage as
  $$ select exists (select 1 from public.beneficiary_users
                    where profile_id = auth.uid()
                      and beneficiary_id::text = (storage.foldername(path))[1]) $$;
drop policy if exists storage_beneficiary_files on storage.objects;
create policy storage_beneficiary_files on storage.objects for all to authenticated
  using (bucket_id = 'documents' and public.owns_beneficiary_path(name))
  with check (bucket_id = 'documents' and public.owns_beneficiary_path(name));

select 'ok' as resultat;
