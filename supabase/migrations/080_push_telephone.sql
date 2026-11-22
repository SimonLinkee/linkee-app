-- Linkee — migration 080 : notifications sur le téléphone (pastille + bannière), même appli fermée
-- À exécuter dans Supabase → SQL Editor → Run (rejouable sans risque). Nécessite la migration 008 (notifications).
--
-- Fonctionnement : chaque téléphone qui accepte les notifications enregistre un « abonnement » (push_subscriptions).
-- À chaque nouvelle notification (n'importe quel type : planning, mission, message d'un admin…), un déclencheur appelle
-- le serveur de l'appli (/api/push/notify), qui envoie la bannière et la pastille aux téléphones de la personne.
--
-- ⚠ Deux réglages à faire UNE FOIS après cette migration (voir le bloc « RÉGLAGE » en bas de ce fichier) :
--   l'adresse du serveur et un mot de passe partagé, stockés dans la table app_config (illisible depuis l'appli).

-- 1) abonnements des téléphones
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;
drop policy if exists push_own on public.push_subscriptions;
create policy push_own on public.push_subscriptions for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 2) réglages serveur (adresse + mot de passe partagé) : aucune règle d'accès = illisible depuis l'appli
create table if not exists public.app_config (key text primary key, value text not null);
alter table public.app_config enable row level security;

-- 3) à chaque notification créée, on prévient le serveur (qui envoie la bannière) — sans jamais bloquer la notification elle-même
create extension if not exists pg_net with schema extensions;

create or replace function public.trg_push_notification() returns trigger
  language plpgsql security definer set search_path = public, extensions as $$
declare v_url text; v_secret text;
begin
  select value into v_url from public.app_config where key = 'push_url';
  select value into v_secret from public.app_config where key = 'push_secret';
  if v_url is null or v_secret is null then return null; end if; -- réglage pas encore fait : pas d'envoi sur téléphone
  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
    body := jsonb_build_object('id', new.id)
  );
  return null;
exception when others then
  return null;
end $$;
revoke all on function public.trg_push_notification() from public;
drop trigger if exists notifications_push on public.notifications;
create trigger notifications_push after insert on public.notifications for each row execute function public.trg_push_notification();

select 'ok' as resultat;

-- ───────────────────────────────────────── RÉGLAGE (à faire une fois, avec TES valeurs) ─────────────────────────────────────────
-- 1. Choisis un mot de passe long et aléatoire (ex. 40 caractères) et mets-le AUSSI dans Vercel : variable PUSH_WEBHOOK_SECRET.
-- 2. Exécute (en remplaçant les deux valeurs entre apostrophes) :
--
--   insert into public.app_config (key, value) values
--     ('push_url',    'https://VOTRE-DOMAINE-LINKEE/api/push/notify'),
--     ('push_secret', 'LE_MOT_DE_PASSE_CHOISI')
--   on conflict (key) do update set value = excluded.value;
--
-- Pour couper les notifications téléphone : delete from public.app_config where key in ('push_url', 'push_secret');
