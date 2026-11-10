-- Linkee — migration 074 : fichiers joints à un arrêt du planning (PDF, Word, Excel, images…), ajoutés par l'équipe depuis le Planning
-- À exécuter dans Supabase → SQL Editor → Run (rejouable sans risque). Nécessite la migration 018 (admin_in_city).
--
-- • Les fichiers sont rangés dans le coffre privé « collecte-photos » (dossier <ville>/<arrêt>/files/…), comme les photos.
-- • La liste est dans collectes.team_files : [{ path, name, size, mime, at }]. Rattachée à l'arrêt d'un jour précis.
-- • Qui peut ajouter / retirer : Superadmin, Comptabilité et Responsable d'antenne (pour SA ville). Le logisticien les voit et les ouvre.

alter table public.collectes add column if not exists team_files jsonb not null default '[]'::jsonb;
alter table public.collectes drop constraint if exists collectes_team_files_check;
alter table public.collectes add constraint collectes_team_files_check check (jsonb_typeof(team_files) = 'array' and jsonb_array_length(team_files) <= 10);

create or replace function public.trg_team_files() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if new.team_files is distinct from old.team_files and auth.uid() is not null and not public.admin_in_city(new.city_id) then
    raise exception 'Seule l''équipe peut modifier les fichiers d''un arrêt';
  end if;
  return new;
end $$;
drop trigger if exists collectes_team_files on public.collectes;
create trigger collectes_team_files before update on public.collectes for each row execute function public.trg_team_files();

select 'ok' as resultat;
