-- Linkee — migration 059 : entrées du calendrier avec lien + pictogramme de priorité, galerie photos partagée
-- À exécuter dans Supabase → SQL Editor → Run (rejouable sans risque). Nécessite la migration 058.
--
-- Qui fait quoi :
--   Calendrier (liens, pictogrammes) : mêmes droits que les événements (migration 058) — rien à changer côté règles.
--   Galerie photos : lecture = équipe interne (celle qui voit le calendrier : Superadmin, Comptabilité, Resp. d'antenne,
--                    Resp. Distribution, Resp. RH) ; ajout = la même équipe, au nom de soi-même ;
--                    suppression = l'auteur de la photo, ou le Superadmin / la Comptabilité.

-- 1) Une entrée du calendrier peut porter un lien cliquable et un pictogramme de priorité --------------------------------
alter table public.calendar_events add column if not exists link text;
alter table public.calendar_events add column if not exists icon text;

alter table public.calendar_events drop constraint if exists calendar_events_link_check;
alter table public.calendar_events add constraint calendar_events_link_check
  check (link is null or (link ~* '^https?://[^[:space:]]+$' and length(link) <= 600));

alter table public.calendar_events drop constraint if exists calendar_events_icon_check;
alter table public.calendar_events add constraint calendar_events_icon_check
  check (icon is null or icon in ('attention', 'drapeau', 'epingle', 'fait', 'info'));

-- 2) Galerie photos partagée ------------------------------------------------------------------------------------------
create table if not exists public.gallery_photos (
  id uuid primary key default gen_random_uuid(),
  path text not null unique,
  author_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  author_name text,
  created_at timestamptz not null default now()
);
create index if not exists gallery_photos_recent on public.gallery_photos (created_at desc);
alter table public.gallery_photos enable row level security;

drop policy if exists gallery_read on public.gallery_photos;
create policy gallery_read on public.gallery_photos for select to authenticated using (public.calendar_reader());

drop policy if exists gallery_insert on public.gallery_photos;
create policy gallery_insert on public.gallery_photos for insert to authenticated
  with check (public.calendar_reader() and author_id = auth.uid());

drop policy if exists gallery_delete on public.gallery_photos;
create policy gallery_delete on public.gallery_photos for delete to authenticated
  using (author_id = auth.uid() or coalesce(public.my_role()::text = 'admin_principal', false));

drop trigger if exists audit_gallery_photos on public.gallery_photos;
create trigger audit_gallery_photos after insert or delete on public.gallery_photos
  for each row execute function public.log_change();

-- 3) Coffre privé "gallery" : un dossier par auteur (<user_id>/fichier.jpg) --------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('gallery', 'gallery', false, 8388608, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists storage_gallery_read on storage.objects;
create policy storage_gallery_read on storage.objects for select to authenticated
  using (bucket_id = 'gallery' and public.calendar_reader());

drop policy if exists storage_gallery_insert on storage.objects;
create policy storage_gallery_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'gallery' and public.calendar_reader() and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists storage_gallery_delete on storage.objects;
create policy storage_gallery_delete on storage.objects for delete to authenticated
  using (bucket_id = 'gallery' and ((storage.foldername(name))[1] = auth.uid()::text or coalesce(public.my_role()::text = 'admin_principal', false)));

select 'ok' as resultat;
