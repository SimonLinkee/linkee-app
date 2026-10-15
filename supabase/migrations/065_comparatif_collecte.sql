-- Linkee — migration 065 : Comparatif « Collecté vs Distribué » sur la page d'une distribution
-- À exécuter dans Supabase → SQL Editor → Run (rejouable sans risque). Nécessite les migrations 014 et 020.
--
-- Qui peut quoi (appliqué par la base, pas seulement par l'écran) :
--   LIRE les collectes rattachées et les commentaires d'écart : Superadmin, Comptabilité, Responsable d'antenne (sa ville),
--     Responsable distribution (sa ville).
--   MODIFIER (rattacher / retirer une collecte, commenter un écart) : Superadmin, Comptabilité, Responsable d'antenne (sa ville).
--     Le Responsable distribution est en lecture seule.
--   Logisticien, Linkers, partenaires, bénéficiaires : aucun accès à ces deux tables.
--
-- Le lien collecte → distribution est dans une table à part (et non une colonne de « collectes ») : le logisticien lit ses
-- collectes pour faire sa tournée, mais ne doit pas lire à quelle distribution elles sont rattachées.

create or replace function public.can_read_comparatif(c uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select coalesce(case
    when public.my_role()::text = 'admin_principal' then true
    when public.my_role()::text in ('admin_local', 'resp_distribution') then public.my_city() = c
    else false end, false) $$;
revoke all on function public.can_read_comparatif(uuid) from public;
grant execute on function public.can_read_comparatif(uuid) to authenticated;

-- 1) Rattachement : une collecte (ou un Link bénévole livré) ne sert qu'à UNE distribution ----------------------------------
create table if not exists public.distribution_sources (
  id uuid primary key default gen_random_uuid(),
  distribution_id uuid not null references public.distributions(id) on delete cascade,
  collecte_id uuid references public.collectes(id) on delete cascade,
  link_id uuid references public.links(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  check ((collecte_id is not null)::int + (link_id is not null)::int = 1)
);
create unique index if not exists distribution_sources_collecte on public.distribution_sources (collecte_id) where collecte_id is not null;
create unique index if not exists distribution_sources_link on public.distribution_sources (link_id) where link_id is not null;
create index if not exists distribution_sources_dist on public.distribution_sources (distribution_id);
alter table public.distribution_sources enable row level security;

drop policy if exists dsrc_read on public.distribution_sources;
create policy dsrc_read on public.distribution_sources for select to authenticated
  using (exists (select 1 from public.distributions d where d.id = distribution_id and public.can_read_comparatif(d.city_id)));
drop policy if exists dsrc_write on public.distribution_sources;
create policy dsrc_write on public.distribution_sources for all to authenticated
  using (exists (select 1 from public.distributions d where d.id = distribution_id and public.admin_in_city(d.city_id)))
  with check (exists (select 1 from public.distributions d where d.id = distribution_id and public.admin_in_city(d.city_id)));

-- une collecte ne peut être rattachée qu'à une distribution de SA ville
create or replace function public.trg_dsrc_same_city() returns trigger
  language plpgsql security definer set search_path = public as $$
declare v_city uuid; v_src uuid;
begin
  select city_id into v_city from public.distributions where id = new.distribution_id;
  if new.collecte_id is not null then select city_id into v_src from public.collectes where id = new.collecte_id; end if;
  if new.link_id is not null then select city_id into v_src from public.links where id = new.link_id; end if;
  if v_src is distinct from v_city then raise exception 'Cette collecte n''appartient pas à la même antenne que la distribution.'; end if;
  return new;
end $$;
drop trigger if exists dsrc_same_city on public.distribution_sources;
create trigger dsrc_same_city before insert or update on public.distribution_sources
  for each row execute function public.trg_dsrc_same_city();

drop trigger if exists audit_distribution_sources on public.distribution_sources;
create trigger audit_distribution_sources after insert or update or delete on public.distribution_sources
  for each row execute function public.log_change();

-- 2) Commentaires d'écart, par catégorie ------------------------------------------------------------------------------------
create table if not exists public.distribution_gap_notes (
  distribution_id uuid not null references public.distributions(id) on delete cascade,
  category text not null,
  comment text not null check (length(trim(comment)) > 0),
  updated_by uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now(),
  primary key (distribution_id, category)
);
alter table public.distribution_gap_notes enable row level security;

drop policy if exists dgap_read on public.distribution_gap_notes;
create policy dgap_read on public.distribution_gap_notes for select to authenticated
  using (exists (select 1 from public.distributions d where d.id = distribution_id and public.can_read_comparatif(d.city_id)));
drop policy if exists dgap_write on public.distribution_gap_notes;
create policy dgap_write on public.distribution_gap_notes for all to authenticated
  using (exists (select 1 from public.distributions d where d.id = distribution_id and public.admin_in_city(d.city_id)))
  with check (exists (select 1 from public.distributions d where d.id = distribution_id and public.admin_in_city(d.city_id)));

drop trigger if exists audit_distribution_gap_notes on public.distribution_gap_notes;
create trigger audit_distribution_gap_notes after insert or update or delete on public.distribution_gap_notes
  for each row execute function public.log_change();

-- 3) Pré-remplissage automatique ---------------------------------------------------------------------------------------------
-- Toutes les collectes de l'antenne (partenaires, exceptionnelles, demandes) réalisées APRÈS la distribution précédente de l'antenne
-- (exclue, hors annulées) et jusqu'au jour de cette distribution inclus, plus les Links bénévoles livrés sur la même période.
-- Une collecte déjà rattachée à une autre distribution n'est pas reprise. Rejouable : ne fait qu'ajouter ce qui manque.
alter table public.distributions add column if not exists sources_prefilled_at timestamptz;

create or replace function public.prefill_distribution_sources(p_distribution uuid, p_force boolean default false)
returns integer
language plpgsql security definer set search_path = public as $$
declare d public.distributions%rowtype; v_prev date; v_n integer := 0; v_m integer := 0;
begin
  if auth.uid() is null then raise exception 'Non connecté.'; end if;
  select * into d from public.distributions where id = p_distribution for update;
  if not found then raise exception 'Distribution introuvable.'; end if;
  if not public.can_read_comparatif(d.city_id) then raise exception 'Accès refusé.'; end if;
  if p_force and not public.admin_in_city(d.city_id) then raise exception 'Seuls l''administrateur et le responsable d''antenne peuvent relancer le rattachement.'; end if;
  -- fait une fois (les retraits manuels sont ensuite respectés) ; pas avant le jour de la distribution
  if not p_force and (d.sources_prefilled_at is not null or d.event_date > current_date) then return 0; end if;

  select max(event_date) into v_prev from public.distributions
   where city_id = d.city_id and event_date < d.event_date and status <> 'annulee';

  insert into public.distribution_sources (distribution_id, collecte_id)
  select d.id, c.id from public.collectes c
   where c.city_id = d.city_id and c.source = 'planning' and c.status = 'collecte'
     and c.kind in ('partner', 'exceptionnel', 'demande_client')
     and c.scheduled_date <= d.event_date and (v_prev is null or c.scheduled_date > v_prev)
     and (v_prev is not null or c.scheduled_date >= d.event_date - 45)
     and not exists (select 1 from public.distribution_sources s where s.collecte_id = c.id)
  on conflict do nothing;
  get diagnostics v_n = row_count;

  insert into public.distribution_sources (distribution_id, link_id)
  select d.id, l.id from public.links l
   where l.city_id = d.city_id and l.status = 'livree'
     and l.window_date <= d.event_date and (v_prev is null or l.window_date > v_prev)
     and (v_prev is not null or l.window_date >= d.event_date - 45)
     and not exists (select 1 from public.distribution_sources s where s.link_id = l.id)
  on conflict do nothing;
  get diagnostics v_m = row_count;

  update public.distributions set sources_prefilled_at = now() where id = d.id;
  return v_n + v_m;
end $$;
revoke all on function public.prefill_distribution_sources(uuid, boolean) from public;
grant execute on function public.prefill_distribution_sources(uuid, boolean) to authenticated;

select 'ok' as resultat;
