-- Linkee — migration 058 : Calendrier multi-villes, encart ACTU (news Linkee national), annulation d'une distribution
-- À exécuter dans Supabase → SQL Editor → Run (rejouable sans risque).
--
-- Qui fait quoi :
--   Calendrier : lecture  = équipe interne (Superadmin, Comptabilité, Resp. d'antenne, Resp. Distribution, Resp. RH), toutes villes
--                écriture = Superadmin, Comptabilité, Resp. RH : toutes les villes ; Resp. d'antenne et Resp. Distribution : leur ville
--                Logisticien, partenaires, bénéficiaires et Linkers : aucun accès
--   ACTU       : lecture  = la même équipe interne ; écriture = Superadmin (et Comptabilité, qui a les mêmes droits en base)
--   Annulation d'une distribution : mêmes droits que la modification d'une distribution (dist_in_city)

-- Équipe interne qui voit le calendrier et les ACTU (my_role() renvoie déjà 'admin_principal' pour la Comptabilité)
create or replace function public.calendar_reader() returns boolean
  language sql stable security definer set search_path = public as
  $$ select coalesce(public.my_role()::text in ('admin_principal','admin_local','resp_distribution','resp_rh'), false) $$;

-- Peut créer / modifier / supprimer un événement de cette ville
create or replace function public.calendar_writer(c uuid) returns boolean
  language sql stable security definer set search_path = public as
  $$ select case
       when public.my_role()::text in ('admin_principal','resp_rh') then true
       when public.my_role()::text in ('admin_local','resp_distribution') then public.my_city() = c
       else false end $$;

revoke all on function public.calendar_reader() from public;
revoke all on function public.calendar_writer(uuid) from public;
grant execute on function public.calendar_reader() to authenticated;
grant execute on function public.calendar_writer(uuid) to authenticated;

-- 1) Événements du calendrier
create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  city_id uuid not null references public.cities(id) on delete cascade,
  title text not null check (length(trim(title)) > 0),
  event_date date not null,
  start_time time,
  end_time time,
  place text,
  description text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists calendar_events_date on public.calendar_events (event_date, city_id);
alter table public.calendar_events enable row level security;

drop policy if exists cal_read on public.calendar_events;
create policy cal_read on public.calendar_events for select to authenticated using (public.calendar_reader());
drop policy if exists cal_insert on public.calendar_events;
create policy cal_insert on public.calendar_events for insert to authenticated with check (public.calendar_writer(city_id));
drop policy if exists cal_update on public.calendar_events;
create policy cal_update on public.calendar_events for update to authenticated
  using (public.calendar_writer(city_id)) with check (public.calendar_writer(city_id));
drop policy if exists cal_delete on public.calendar_events;
create policy cal_delete on public.calendar_events for delete to authenticated using (public.calendar_writer(city_id));

drop trigger if exists audit_calendar_events on public.calendar_events;
create trigger audit_calendar_events after insert or update or delete on public.calendar_events
  for each row execute function public.log_change();

-- 2) ACTU — les news de Linkee national
create table if not exists public.news (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) > 0),
  body text,
  pinned boolean not null default false,
  published_on date not null default current_date,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists news_order on public.news (pinned desc, published_on desc, created_at desc);
alter table public.news enable row level security;

drop policy if exists news_read on public.news;
create policy news_read on public.news for select to authenticated using (public.calendar_reader());
drop policy if exists news_write on public.news;
create policy news_write on public.news for all to authenticated
  using (coalesce(public.my_role() = 'admin_principal', false)) with check (coalesce(public.my_role() = 'admin_principal', false));

drop trigger if exists audit_news on public.news;
create trigger audit_news after insert or update or delete on public.news
  for each row execute function public.log_change();

-- 3) Annulation d'une distribution (avec motif obligatoire)
alter table public.distributions drop constraint if exists distributions_status_check;
alter table public.distributions add constraint distributions_status_check check (status in ('prevue','distribuee','annulee'));
alter table public.distributions add column if not exists cancel_reason text;
alter table public.distributions add column if not exists cancelled_at timestamptz;
alter table public.distributions add column if not exists cancelled_by uuid references public.profiles(id) on delete set null;
alter table public.distributions drop constraint if exists distributions_cancel_reason_check;
alter table public.distributions add constraint distributions_cancel_reason_check
  check (status <> 'annulee' or length(trim(coalesce(cancel_reason, ''))) > 0);

select 'ok' as resultat;
