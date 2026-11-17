import type { SupabaseClient } from "@supabase/supabase-js";

export type PlannedOut = { id: string; name: string; category: string; colis: number; unites: number; kg: number };

/** Planifie une sortie de stock dans le Planning d'un jour : un arrêt « prise au stock » + la dépose chez le destinataire.
 * Si ce destinataire a DÉJÀ une dépose prévue ce jour-là (par exemple une distribution générée automatiquement), on ne crée
 * PAS un deuxième arrêt : on ajoute seulement la prise au stock et on complète le commentaire de la dépose existante. */
export async function planStockOut(
  supabase: SupabaseClient,
  o: { cityId: string; day: string; time: string | null; destId: string | null; destName: string; planned: PlannedOut[]; summaryText: string },
): Promise<{ error: { message: string } | null; merged: boolean }> {
  const stockStop = {
    city_id: o.cityId, kind: "stock", label: `Sortie de stock — ${o.destName}`, scheduled_date: o.day, scheduled_time: o.time, sort_order: 98, status: "todo",
    duration_min: 15, planned_items: o.planned, comment: `À prendre au dépôt pour ${o.destName} : ${o.summaryText}`,
  };
  const note = `Livraison du stock : ${o.summaryText}`;
  if (o.destId) {
    const { data: existing } = await supabase
      .from("collectes")
      .select("id,comment")
      .eq("city_id", o.cityId)
      .eq("scheduled_date", o.day)
      .eq("kind", "dropoff")
      .eq("beneficiary_id", o.destId)
      .eq("source", "planning")
      .neq("status", "annule")
      .order("sort_order")
      .limit(1);
    const dep = (existing ?? [])[0] as { id: string; comment: string | null } | undefined;
    if (dep) {
      const ins = await supabase.from("collectes").insert(stockStop);
      if (ins.error) return { error: ins.error, merged: false };
      const upd = await supabase.from("collectes").update({ comment: dep.comment ? `${dep.comment} — ${note}` : note }).eq("id", dep.id);
      return { error: upd.error, merged: true };
    }
  }
  const { error } = await supabase.from("collectes").insert([
    stockStop,
    {
      city_id: o.cityId, kind: "dropoff", beneficiary_id: o.destId, label: o.destId ? null : o.destName, scheduled_date: o.day, scheduled_time: o.time, sort_order: 99, status: "todo",
      duration_min: 10, comment: note,
    },
  ]);
  return { error, merged: false };
}
