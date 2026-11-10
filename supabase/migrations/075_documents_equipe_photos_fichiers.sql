-- Linkee — migration 075 : photos de collecte et fichiers d'arrêt rangés dans le porte-documents du partenaire
-- À exécuter dans Supabase → SQL Editor → Run (rejouable sans risque). Nécessite les migrations 030, 044, 045, 074.
--
-- • Les photos prises par le logisticien (collectes.photo_paths) apparaissent dans « Mes documents » du partenaire,
--   catégorie « Mes photos de collecte », avec la date de la collecte. Pour une dépose chez une association : dans ses documents.
-- • Les fichiers joints à un arrêt depuis le Planning (collectes.team_files) apparaissent aussi dans « Mes documents »
--   (catégorie « Fichiers d'arrêt »). Les retirer de l'arrêt les retire des documents : pas de doublon.
-- • Ces documents sont réservés à l'ÉQUIPE (team_only) : le partenaire / l'association ne les voit pas, et ils ne comptent
--   ni dans les demandes de Cerfa ni dans les alertes de retard Cerfa.
-- • Les fichiers restent où ils sont (coffre « collecte-photos ») : le document pointe dessus, rien n'est copié.
-- • Tout se fait côté base (déclencheur) : plus rien à faire dans l'appli quand une photo ou un fichier est ajouté.
-- • À la fin, les photos déjà prises sont rangées d'un coup (rattrapage).

alter table public.documents add column if not exists category text;
alter table public.documents add column if not exists team_only boolean not null default false;
alter table public.documents add column if not exists bucket text not null default 'documents';
alter table public.documents add column if not exists doc_date date;
alter table public.documents drop constraint if exists documents_category_check;
alter table public.documents add constraint documents_category_check check (category is null or category in ('photo_collecte', 'fichier_arret'));
create index if not exists documents_collecte on public.documents (collecte_id) where collecte_id is not null;

-- ---------- visibilité : un document « équipe » n'est jamais lisible ni modifiable par le partenaire / l'association ----------
drop policy if exists docs_read on public.documents;
create policy docs_read on public.documents for select to authenticated
  using (
    (partner_id is not null and ((not team_only and public.owns_partner(partner_id)) or exists (select 1 from public.partners p where p.id = partner_id and public.staff_in_city(p.city_id))))
    or (beneficiary_id is not null and ((not team_only and public.owns_beneficiary(beneficiary_id)) or exists (select 1 from public.beneficiaries b where b.id = beneficiary_id and public.staff_in_city(b.city_id))))
  );
drop policy if exists docs_write on public.documents;
create policy docs_write on public.documents for all to authenticated
  using (
    (partner_id is not null and ((not team_only and public.owns_partner(partner_id)) or exists (select 1 from public.partners p where p.id = partner_id and public.admin_in_city(p.city_id))))
    or (beneficiary_id is not null and ((not team_only and public.owns_beneficiary(beneficiary_id)) or exists (select 1 from public.beneficiaries b where b.id = beneficiary_id and public.admin_in_city(b.city_id))))
  )
  with check (
    (partner_id is not null and ((not team_only and public.owns_partner(partner_id)) or exists (select 1 from public.partners p where p.id = partner_id and public.admin_in_city(p.city_id))))
    or (beneficiary_id is not null and ((not team_only and public.owns_beneficiary(beneficiary_id)) or exists (select 1 from public.beneficiaries b where b.id = beneficiary_id and public.admin_in_city(b.city_id))))
  );

-- ---------- Cerfa : les documents « équipe » ne comptent pas dans le retard (le reste de la fonction est inchangé) ----------
create or replace function public._cerfa_late()
returns table(partner_id uuid, partner_name text, city_id uuid, frequency text, period_start date, period_end date, due_date date, doc_count integer)
language sql stable security definer set search_path = public as $$
  with cfg as (
    select p.id, p.name, p.city_id, p.fiche->>'cerfaFrequency' as freq,
           case p.fiche->>'cerfaFrequency' when 'mensuel' then 1 when 'trimestriel' then 3 else 12 end as len
      from public.partners p
     where p.deleted_at is null and p.active and p.fiche->>'cerfaFrequency' in ('mensuel', 'trimestriel', 'annuel')
  ), cur as (
    select cfg.*, (case cfg.len when 1 then date_trunc('month', current_date) when 3 then date_trunc('quarter', current_date) else date_trunc('year', current_date) end)::date as s
      from cfg
  ), per as (
    select cur.*,
           case when current_date >= (cur.s - 1) + 15 then (cur.s - make_interval(months => cur.len))::date
                else (cur.s - make_interval(months => 2 * cur.len))::date end as p_start,
           case when current_date >= (cur.s - 1) + 15 then cur.s - 1
                else (cur.s - make_interval(months => cur.len))::date - 1 end as p_end
      from cur
  )
  select per.id, per.name, per.city_id, per.freq, per.p_start, per.p_end, per.p_end + 15, x.n
    from per
   cross join lateral (
     select count(*)::int as n from public.documents d
      where d.partner_id = per.id and not d.team_only and d.created_at >= per.p_start and d.created_at < per.p_end + 1
        and not exists (select 1 from public.cerfa_request_documents c where c.document_id = d.id and c.active)
   ) x
   where x.n > 0
     and not exists (select 1 from public.cerfa_requests r where r.partner_id = per.id and r.created_at >= per.p_start)
$$;
revoke all on function public._cerfa_late() from public;

-- ---------- synchronisation arrêt → porte-documents ----------
-- Range (ou met à jour / retire) les documents « photos » et « fichiers » d'UN arrêt. Rejouable : ne crée jamais de doublon.
create or replace function public.sync_collecte_documents(p_id uuid) returns void
  language plpgsql security definer set search_path = public as $$
declare c public.collectes%rowtype; p text; f jsonb; n int; d text;
begin
  select * into c from public.collectes where id = p_id;
  if not found then return; end if;
  -- l'arrêt n'a ni partenaire ni association : rien à ranger (stock, pause…) → on retire ce qui avait été rangé
  if c.partner_id is null and c.beneficiary_id is null then
    delete from public.documents where collecte_id = c.id and category in ('photo_collecte', 'fichier_arret');
    return;
  end if;
  d := to_char(c.scheduled_date, 'DD/MM/YYYY');

  -- photos prises par le logisticien
  delete from public.documents where collecte_id = c.id and category = 'photo_collecte' and not (storage_path = any(coalesce(c.photo_paths, '{}')));
  n := 0;
  foreach p in array coalesce(c.photo_paths, '{}') loop
    n := n + 1;
    if not exists (select 1 from public.documents x where x.collecte_id = c.id and x.category = 'photo_collecte' and x.storage_path = p) then
      insert into public.documents (partner_id, beneficiary_id, name, storage_path, bucket, size_bytes, source, category, team_only, collecte_id, doc_date)
      values (case when c.partner_id is not null then c.partner_id end, case when c.partner_id is null then c.beneficiary_id end,
              'Photo de collecte du ' || d || ' (' || n || ')' || coalesce(nullif(regexp_replace(p, '^.*(\.[A-Za-z0-9]{1,5})$', '\1'), p), '.jpg'),
              p, 'collecte-photos', null, 'admin', 'photo_collecte', true, c.id, c.scheduled_date);
    end if;
  end loop;

  -- fichiers joints par l'équipe
  delete from public.documents d2 where d2.collecte_id = c.id and d2.category = 'fichier_arret'
    and not exists (select 1 from jsonb_array_elements(c.team_files) e where e->>'path' = d2.storage_path);
  for f in select e from jsonb_array_elements(c.team_files) e loop
    if not exists (select 1 from public.documents x where x.collecte_id = c.id and x.category = 'fichier_arret' and x.storage_path = f->>'path') then
      insert into public.documents (partner_id, beneficiary_id, name, storage_path, bucket, size_bytes, source, category, team_only, collecte_id, doc_date)
      values (case when c.partner_id is not null then c.partner_id end, case when c.partner_id is null then c.beneficiary_id end,
              coalesce(nullif(f->>'name', ''), 'Fichier'), f->>'path', 'collecte-photos', nullif(f->>'size', '')::bigint, 'admin', 'fichier_arret', true, c.id, c.scheduled_date);
    end if;
  end loop;
end $$;
revoke all on function public.sync_collecte_documents(uuid) from public;

create or replace function public.trg_sync_collecte_documents() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  -- rien à faire pour un arrêt sans photo ni fichier qui n'en avait pas (cas de la génération du planning)
  if tg_op = 'INSERT' and coalesce(array_length(new.photo_paths, 1), 0) = 0 and new.team_files = '[]'::jsonb then return null; end if;
  if tg_op = 'UPDATE' and new.photo_paths is not distinct from old.photo_paths and new.team_files is not distinct from old.team_files
     and new.partner_id is not distinct from old.partner_id and new.beneficiary_id is not distinct from old.beneficiary_id
     and new.scheduled_date is not distinct from old.scheduled_date then return null; end if;
  perform public.sync_collecte_documents(new.id);
  return null;
end $$;
revoke all on function public.trg_sync_collecte_documents() from public;
drop trigger if exists collectes_sync_documents on public.collectes;
create trigger collectes_sync_documents after insert or update of photo_paths, team_files, partner_id, beneficiary_id, scheduled_date on public.collectes
  for each row execute function public.trg_sync_collecte_documents();

-- Un arrêt supprimé : ses fichiers joints quittent les documents ; ses photos restent (preuve de collecte, déjà datées).
create or replace function public.trg_collecte_files_cleanup() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  delete from public.documents where collecte_id = old.id and category = 'fichier_arret';
  return old;
end $$;
revoke all on function public.trg_collecte_files_cleanup() from public;
drop trigger if exists collectes_files_cleanup on public.collectes;
create trigger collectes_files_cleanup before delete on public.collectes for each row execute function public.trg_collecte_files_cleanup();

-- ---------- rattrapage : on range tout de suite les photos / fichiers déjà existants ----------
do $$
declare r record; n int := 0;
begin
  for r in select id from public.collectes where (coalesce(array_length(photo_paths, 1), 0) > 0 or jsonb_array_length(team_files) > 0)
                                           and (partner_id is not null or beneficiary_id is not null) loop
    perform public.sync_collecte_documents(r.id);
    n := n + 1;
  end loop;
  raise notice 'Arrêts rangés : %', n;
end $$;

select (select count(*) from public.documents where category = 'photo_collecte') as photos_rangees,
       (select count(*) from public.documents where category = 'fichier_arret') as fichiers_rangees;
