import type { SupabaseClient } from "@supabase/supabase-js";
import { outboxList, outboxRemove, kvDel, type OutboxEntry } from "./idb";

// Envoi, au retour du réseau, des saisies faites hors ligne dans « Ma journée ». Principes :
//  • dans l'ordre où elles ont été faites ; on s'arrête au premier problème de réseau et on réessaie plus tard ;
//  • rien n'est jamais écrasé : si l'équipe a déjà renseigné l'arrêt entre-temps, la saisie du logisticien est écartée et signalée ;
//  • rejouable sans risque (photos « upsert », lignes de poids avec identifiant fixe) : un envoi interrompu peut être repris.

export const isNetworkError = (e: { message?: string } | null | undefined) =>
  !!e && /failed to fetch|networkerror|network request failed|load failed|fetch failed|internet|timeout/i.test(e.message ?? "");

export type FlushResult = { sent: number; conflicts: string[]; remaining: number; error?: string };

export async function flushOutbox(supabase: SupabaseClient, stopNames: Record<string, string> = {}): Promise<FlushResult> {
  const entries = await outboxList();
  let sent = 0;
  const conflicts: string[] = [];
  for (const e of entries) {
    try {
      const r = await sendEntry(supabase, e, stopNames);
      if (r === "network") return { sent, conflicts, remaining: entries.length - sent - conflicts.length };
      if (r.startsWith("conflict:")) conflicts.push(r.slice(9));
      else sent++;
      if (e.id != null) await outboxRemove(e.id);
    } catch (err) {
      return { sent, conflicts, remaining: entries.length - sent - conflicts.length, error: (err as Error).message };
    }
  }
  return { sent, conflicts, remaining: 0 };
}

async function sendEntry(supabase: SupabaseClient, e: OutboxEntry, names: Record<string, string>): Promise<"ok" | "network" | string> {
  const p = e.payload;
  if (e.kind === "day_start") {
    const { error } = await supabase.from("day_sessions").upsert(
      { city_id: p.cityId, logisticien_id: e.userId, day: p.day, checklist_done: p.checklistDone ?? [], started_at: p.startedAt, closed_at: null },
      { onConflict: "logisticien_id,day" },
    );
    if (isNetworkError(error)) return "network";
    if (error) throw new Error("Démarrage de journée : " + error.message);
    return "ok";
  }
  if (e.kind === "day_close") {
    const { error } = await supabase.from("day_sessions").update({ closed_at: p.closedAt }).eq("logisticien_id", e.userId).eq("day", p.day);
    if (isNetworkError(error)) return "network";
    if (error) throw new Error("Clôture de journée : " + error.message);
    return "ok";
  }
  // arrêt validé / annulé hors ligne
  const cur = await supabase.from("collectes").select("status").eq("id", p.stopId).maybeSingle();
  if (isNetworkError(cur.error)) return "network";
  if (cur.error) throw new Error(cur.error.message);
  // « resume » : l'arrêt avait déjà été enregistré en ligne, il ne reste que les poids à envoyer (pas de conflit possible)
  if (!p.resume && cur.data && cur.data.status !== "todo") return `conflict:${names[p.stopId] ?? "un arrêt"} (déjà renseigné par l'équipe)`;
  for (const b of e.blobs ?? []) {
    const up = await supabase.storage.from("collecte-photos").upload(b.path, b.blob, { contentType: "image/jpeg" });
    if (isNetworkError(up.error)) return "network";
    // une photo déjà arrivée (envoi interrompu puis repris) n'est pas une erreur
    if (up.error && !/exist|duplicate|409/i.test(up.error.message + String((up.error as { statusCode?: string }).statusCode ?? ""))) throw new Error("Photo : " + up.error.message);
  }
  if (!p.resume) {
    const upd = await supabase
      .from("collectes")
      .update({ status: p.status, motif: p.motif ?? null, photos_count: p.photosCount ?? 0, photo_paths: p.photoPaths ?? [], done_at: p.doneAt, logisticien_id: e.userId })
      .eq("id", p.stopId);
    if (isNetworkError(upd.error)) return "network";
    if (upd.error) throw new Error(upd.error.message);
  }
  if (p.status === "collecte" && Array.isArray(p.items) && p.items.length) {
    const ins = await supabase.from("collecte_items").upsert(p.items, { onConflict: "id", ignoreDuplicates: true });
    if (isNetworkError(ins.error)) return "network";
    if (ins.error) throw new Error("Poids : " + ins.error.message);
  }
  for (const path of p.photoPaths ?? []) await kvDel("photo:" + path);
  return "ok";
}
