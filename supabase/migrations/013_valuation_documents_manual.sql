-- Linkee — migration 013 : valorisation RSE par sous-catégorie, documents enrichis, saisie manuelle de volumes
-- À exécuter dans Supabase → SQL Editor → Run (rejouable sans risque).

-- 1) Sous-catégories propres à chaque partenaire, avec une valeur unitaire en €
create table if not exists public.partner_subcategories (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete cascade,
  category text not null,                                    -- une des 5 grandes catégories
  name text not null,
  unit_price numeric(10,2),                                  -- € par unité ; vide = non valorisée (calcul par défaut)
  unit text not null default 'kg' check (unit in ('kg','unite','litre')),
  unit_weight_kg numeric(10,3),                              -- poids d'UNE unité en kg (utile si unit = 'unite')
  created_at timestamptz not null default now()
);
alter table public.partner_subcategories add column if not exists unit_weight_kg numeric(10,3);
create index if not exists psub_partner on public.partner_subcategories (partner_id);
alter table public.partner_subcategories enable row level security;

drop policy if exists psub_read on public.partner_subcategories;
create policy psub_read on public.partner_subcategories for select to authenticated
  using (public.owns_partner(partner_id)
         or exists (select 1 from public.partners p where p.id = partner_id and public.staff_in_city(p.city_id)));
drop policy if exists psub_write on public.partner_subcategories;
create policy psub_write on public.partner_subcategories for all to authenticated
  using (public.owns_partner(partner_id)
         or exists (select 1 from public.partners p where p.id = partner_id and public.admin_in_city(p.city_id)))
  with check (public.owns_partner(partner_id)
         or exists (select 1 from public.partners p where p.id = partner_id and public.admin_in_city(p.city_id)));

drop trigger if exists audit_partner_subcategories on public.partner_subcategories;
create trigger audit_partner_subcategories after insert or update or delete on public.partner_subcategories
  for each row execute function public.log_change();

-- 2) Chaque ligne de poids peut pointer vers une sous-catégorie, avec sa quantité dans l'unité choisie
alter table public.collecte_items add column if not exists subcategory_id uuid references public.partner_subcategories(id) on delete set null;
alter table public.collecte_items add column if not exists quantity numeric(12,3);
alter table public.collecte_items add column if not exists unit text;
alter table public.collecte_items drop constraint if exists collecte_items_unit_check;
alter table public.collecte_items add constraint collecte_items_unit_check check (unit is null or unit in ('kg','unite','litre'));

-- 3) Une collecte peut venir du planning ou d'une saisie manuelle de l'admin
alter table public.collectes add column if not exists source text not null default 'planning';
alter table public.collectes drop constraint if exists collectes_source_check;
alter table public.collectes add constraint collectes_source_check check (source in ('planning','manual'));

-- 4) Documents : qui les a déposés, et la collecte associée éventuelle
alter table public.documents add column if not exists collecte_id uuid references public.collectes(id) on delete set null;
alter table public.documents add column if not exists source text not null default 'admin';
alter table public.documents drop constraint if exists documents_source_check;
alter table public.documents add constraint documents_source_check check (source in ('admin','partenaire'));

-- 5) Une saisie manuelle ne prévient pas les logisticiens (ce n'est pas une modification de tournée)
create or replace function public.trg_notify_collecte() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  r public.collectes%rowtype;
  v_name text;
  u uuid;
begin
  r := case when tg_op = 'DELETE' then old else new end;
  if r.source = 'manual' then return null; end if;

  if public.is_admin() then
    if r.scheduled_date >= current_date then
      for u in select id from public.profiles where active and role = 'logisticien' and city_id = r.city_id loop
        perform public.notify(u, r.city_id, 'planning', 'Ton planning a été modifié',
          'Le planning du ' || to_char(r.scheduled_date, 'DD/MM') || ' vient d''être mis à jour par l''équipe.',
          '/journee', 'planning:' || r.scheduled_date);
      end loop;
    end if;
  elsif tg_op = 'UPDATE' and new.status = 'annule' and old.status is distinct from 'annule' then
    select coalesce((select name from public.partners where id = new.partner_id),
                    (select name from public.beneficiaries where id = new.beneficiary_id), new.label, 'Un arrêt') into v_name;
    for u in select * from public.admin_recipients(new.city_id) loop
      perform public.notify(u, new.city_id, 'cancel', 'Collecte annulée sur le terrain',
        v_name || ' — ' || coalesce(nullif(new.motif, ''), 'sans motif') , '/planning', 'cancel:' || new.id);
    end loop;
  end if;
  return null;
end $$;

select 'ok' as resultat;
