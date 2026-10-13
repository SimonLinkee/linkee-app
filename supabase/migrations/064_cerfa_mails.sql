-- Linkee — migration 064 : historique des envois de Cerfa par mail
-- À exécuter dans Supabase → SQL Editor → Run (rejouable sans risque). Nécessite la migration 044.
--
-- Chaque envoi (manuel depuis la ligne du Cerfa, ou automatique à l'échéance) laisse une ligne : à qui, quand, par qui, résultat.
-- Personne n'écrit ici depuis le navigateur : seules les routes serveur (clé de service) enregistrent les envois.
-- Lecture : Superadmin, Comptabilité et Responsable d'antenne (pour les Cerfa de SA ville).

create table if not exists public.cerfa_mails (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.cerfa_requests(id) on delete cascade,
  to_email text not null,
  mode text not null check (mode in ('manuel', 'auto')),
  status text not null check (status in ('envoye', 'erreur')),
  error text,
  provider_id text,
  sent_by uuid references public.profiles(id) on delete set null,
  sent_at timestamptz not null default now()
);
create index if not exists cerfa_mails_request on public.cerfa_mails (request_id, sent_at desc);
alter table public.cerfa_mails enable row level security;

drop policy if exists cerfa_mails_read on public.cerfa_mails;
create policy cerfa_mails_read on public.cerfa_mails for select to authenticated
  using (exists (select 1 from public.cerfa_requests r where r.id = request_id and public.antenne_in_city(r.city_id)));

select 'ok' as resultat;