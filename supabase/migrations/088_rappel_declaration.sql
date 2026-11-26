-- Linkee — migration 088 : mail « déclarez votre don » envoyé au partenaire 30 minutes avant sa collecte
-- À exécuter dans Supabase → SQL Editor → Run (rejouable sans risque). Nécessite la migration 085 (lien du partenaire).
--
-- Rien n'est envoyé tant que tu n'as pas fait le RÉGLAGE en bas de ce fichier ET coché, sur la fiche du partenaire,
-- « Envoyer automatiquement le mail de déclaration » (certains partenaires ne fonctionnent pas comme ça).
-- Un seul mail par collecte : cette table garde la trace de ce qui est parti.

create table if not exists public.declare_reminders (
  collecte_id uuid primary key references public.collectes(id) on delete cascade,
  partner_id uuid not null references public.partners(id) on delete cascade,
  to_email text not null,
  sent_at timestamptz not null default now()
);
alter table public.declare_reminders enable row level security;   -- aucune règle d'accès : illisible depuis l'appli, seul le serveur l'utilise

select 'ok' as resultat;

-- ───────────────────────────────────────── RÉGLAGE (à faire quand tu veux ACTIVER les mails, pas avant) ─────────────────────────────
-- Prérequis : l'envoi de mails est configuré dans Vercel (le même que pour les Cerfa) et le réglage des notifications téléphone
-- (migration 080, clé push_secret dans app_config) est fait.
--
-- 1. Interrupteur général (met 'off' pour couper tout de suite) :
--
--   insert into public.app_config (key, value) values ('declare_reminders', 'on')
--   on conflict (key) do update set value = excluded.value;
--
-- 2. Tâche planifiée toutes les 10 minutes (remplace VOTRE-DOMAINE-LINKEE) :
--
--   create extension if not exists pg_cron;
--   select cron.schedule('declare-reminders', '*/10 * * * *', $$
--     select net.http_get(
--       url := 'https://VOTRE-DOMAINE-LINKEE/api/cron/declare-reminders',
--       headers := jsonb_build_object('x-push-secret', (select value from public.app_config where key = 'push_secret'))
--     )
--   $$);
--
-- Pour arrêter complètement : select cron.unschedule('declare-reminders');
