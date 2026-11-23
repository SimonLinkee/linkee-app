-- Linkee — migration 083 : on peut répondre à une remontée « Traité »
-- À exécuter dans Supabase → SQL Editor → Run (rejouable sans risque). Nécessite la migration 046.
--
-- Avant : une fois la remontée « Traité », l'auteur ne pouvait plus répondre (« tu ne peux plus y répondre »).
-- Maintenant : s'il répond, la remontée est rouverte (statut « En attente de traitement », le délai de 6 mois avant
-- suppression des pièces jointes est annulé) et le Superadmin est prévenu qu'une remontée a été rouverte.
-- Tout le reste est repris à l'identique de la migration 046.

create or replace function public.post_remontee_message(p_remontee uuid, p_body text) returns public.remontee_messages
language plpgsql security definer set search_path = public as $$
declare v_r public.remontees%rowtype; v_super boolean; v_msg public.remontee_messages%rowtype; u uuid; v_reopen boolean;
begin
  if auth.uid() is null then raise exception 'Non connecté.'; end if;
  select * into v_r from public.remontees where id = p_remontee for update;
  if not found then raise exception 'Remontée introuvable.'; end if;
  v_super := public.real_role() = 'admin_principal';
  if not v_super and v_r.author_id <> auth.uid() then raise exception 'Accès refusé.'; end if;
  if length(trim(coalesce(p_body, ''))) < 1 then raise exception 'Écris un message.'; end if;
  v_reopen := not v_super and v_r.status = 'traite';

  insert into public.remontee_messages (remontee_id, author_id, author_is_admin, body)
    values (p_remontee, auth.uid(), v_super, trim(p_body)) returning * into v_msg;

  if v_super then
    update public.remontees set super_seen_at = coalesce(super_seen_at, now()), updated_at = now() where id = p_remontee;
    perform public.notify(v_r.author_id, v_r.city_id, 'remontee', 'Réponse à ta remontée', left(v_r.title, 80) || ' — ' || left(trim(p_body), 120), '/remontees', 'remontee:' || p_remontee);
  else
    update public.remontees
       set super_seen_at = null, updated_at = now(),
           status = case when v_reopen then 'en_attente' else status end,
           treated_at = case when v_reopen then null else treated_at end
     where id = p_remontee;
    for u in select id from public.profiles where active and role = 'admin_principal' loop
      perform public.notify(u, v_r.city_id, 'remontee',
        case when v_reopen then 'Remontée rouverte par une réponse' else 'Nouvelle réponse sur une remontée' end,
        left(v_r.title, 80) || ' — ' || left(trim(p_body), 120), '/remontees-app', 'remontee:' || p_remontee);
    end loop;
  end if;
  return v_msg;
end $$;

select 'ok' as resultat;
