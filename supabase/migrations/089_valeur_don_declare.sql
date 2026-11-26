-- Linkee — migration 089 : le partenaire déclare aussi la VALEUR TOTALE de son don (€) depuis son lien
-- À exécuter dans Supabase → SQL Editor → Run (rejouable sans risque). Nécessite la migration 085.
--
-- La déclaration reste : types de produits + poids, puis (à la fin) la valeur totale du don en euros.
-- La valeur déclarée est pré-remplie dans « Compléter les infos » du Planning et affichée au logisticien.

alter table public.partner_declarations add column if not exists value numeric(12,2) check (value is null or value >= 0);

create or replace function public.trg_notify_declaration() returns trigger
  language plpgsql security definer set search_path = public as $$
declare v_name text; u uuid; v_kg numeric;
begin
  select name into v_name from public.partners where id = new.partner_id;
  select coalesce(sum((i->>'kg')::numeric), 0) into v_kg from jsonb_array_elements(new.items) i;
  for u in select * from public.admin_recipients(new.city_id) loop
    perform public.notify(u, new.city_id, 'request', 'Don déclaré par un partenaire',
      coalesce(v_name, 'Un partenaire')
        || case when v_kg > 0 then ' — ' || round(v_kg, 1) || ' kg déclarés' else ' — fichier joint' end
        || case when new.value is not null and new.value > 0 then ' · valeur ' || round(new.value, 2) || ' €' else '' end,
      '/planning', 'declaration:' || new.id);
  end loop;
  return null;
end $$;

select 'ok' as resultat;
