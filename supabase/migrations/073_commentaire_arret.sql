-- Linkee — migration 073 : commentaire d'équipe « à la volée » sur un arrêt du planning (visible tout de suite par le logisticien)
-- À exécuter dans Supabase → SQL Editor → Run (rejouable sans risque). Nécessite la migration 018 (admin_in_city).
--
-- • Le commentaire est rattaché à l'arrêt d'un jour précis (une ligne de collectes) : il ne se recopie pas sur les semaines suivantes
--   et n'écrase jamais la fiche du partenaire. Il reste affiché tant que l'équipe ne le retire pas.
-- • Qui peut l'écrire : Superadmin, Comptabilité et Responsable d'antenne (pour SA ville), depuis le Planning. Le logisticien le lit
--   (il peut déjà lire ses arrêts) mais la base refuse qu'il le modifie.

alter table public.collectes add column if not exists team_note text;
alter table public.collectes drop constraint if exists collectes_team_note_len;
alter table public.collectes add constraint collectes_team_note_len check (team_note is null or length(team_note) <= 200);
alter table public.collectes add column if not exists team_note_at timestamptz;                                   -- heure d'ajout (affichée au logisticien)
alter table public.collectes add column if not exists team_note_by uuid references public.profiles(id) on delete set null;

create or replace function public.trg_team_note() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if new.team_note is distinct from old.team_note then
    if auth.uid() is not null and not public.admin_in_city(new.city_id) then
      raise exception 'Seule l''équipe peut modifier ce commentaire';
    end if;
    if nullif(trim(coalesce(new.team_note, '')), '') is null then
      new.team_note := null; new.team_note_at := null; new.team_note_by := null;
    else
      new.team_note := trim(new.team_note); new.team_note_at := now(); new.team_note_by := auth.uid();
    end if;
  elsif new.team_note_at is distinct from old.team_note_at or new.team_note_by is distinct from old.team_note_by then
    new.team_note_at := old.team_note_at; new.team_note_by := old.team_note_by;   -- l'horodatage ne se modifie pas à la main
  end if;
  return new;
end $$;
drop trigger if exists collectes_team_note on public.collectes;
create trigger collectes_team_note before update on public.collectes for each row execute function public.trg_team_note();

select 'ok' as resultat;
