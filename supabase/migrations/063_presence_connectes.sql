-- Linkee — migration 063 : « qui est connecté » (pastilles en haut à droite), canaux de présence privés
-- À exécuter dans Supabase → SQL Editor → Run (rejouable sans risque).
--
-- Deux canaux de présence temps réel, jamais mélangés :
--   presence:team    → l'équipe : Superadmin, Comptabilité, Responsable d'antenne, Logisticien (comptes actifs)
--   presence:linkers → les Linkers bénévoles, entre eux
-- Les canaux sont PRIVÉS : sans ces règles, personne ne peut s'y connecter. Un Linker ne peut donc pas écouter le canal de l'équipe,
-- ni l'inverse. Rien n'est enregistré en base : la présence disparaît quand l'onglet se ferme.

create or replace function public.presence_team_member() returns boolean
  language sql stable security definer set search_path = public as $$
  select coalesce(public.real_role()::text in ('admin_principal', 'comptabilite', 'admin_local', 'logisticien'), false)
     and coalesce((select p.active from public.profiles p where p.id = auth.uid()), false) $$;

create or replace function public.presence_linker_member() returns boolean
  language sql stable security definer set search_path = public as $$
  select coalesce(public.real_role()::text = 'linker', false)
     and coalesce((select p.active from public.profiles p where p.id = auth.uid()), false) $$;

revoke all on function public.presence_team_member() from public;
revoke all on function public.presence_linker_member() from public;
grant execute on function public.presence_team_member() to authenticated;
grant execute on function public.presence_linker_member() to authenticated;

drop policy if exists presence_read on realtime.messages;
create policy presence_read on realtime.messages for select to authenticated
  using (
    realtime.messages.extension = 'presence'
    and ((realtime.topic() = 'presence:team' and public.presence_team_member())
      or (realtime.topic() = 'presence:linkers' and public.presence_linker_member()))
  );

drop policy if exists presence_write on realtime.messages;
create policy presence_write on realtime.messages for insert to authenticated
  with check (
    realtime.messages.extension = 'presence'
    and ((realtime.topic() = 'presence:team' and public.presence_team_member())
      or (realtime.topic() = 'presence:linkers' and public.presence_linker_member()))
  );

select 'ok' as resultat;
