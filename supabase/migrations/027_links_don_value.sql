-- Linkee — migration 027 : valeur du don (€) éditable par Link, qui écrase le calcul automatique du bilan RSE
-- À exécuter dans Supabase → SQL Editor → Run (rejouable), APRÈS la migration 026.

-- null = valeur calculée automatiquement (kg × prix par défaut, comme avant) ; une valeur renseignée
-- écrase ce calcul, uniquement pour ce Link.
alter table public.links add column if not exists don_value numeric(10,2);

-- La saisie de la valeur du don doit être possible pour tout le staff de la ville (pas seulement le
-- Superadmin comme c'était le cas jusqu'ici pour les écritures sur "links").
drop policy if exists links_update on public.links;
create policy links_update on public.links for update to authenticated
  using (public.my_role() = 'admin_principal' or public.staff_in_city(city_id) or linker_id = auth.uid())
  with check (public.my_role() = 'admin_principal' or public.staff_in_city(city_id) or linker_id = auth.uid());

select 'ok' as resultat;
