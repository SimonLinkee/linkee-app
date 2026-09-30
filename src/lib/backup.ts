import type { SupabaseClient } from "@supabase/supabase-js";

// Full JSON export of the business tables into the private "backups" storage bucket.
// Photos / documents / logos live in Supabase Storage and are NOT part of this export (the export lists their paths).

export const BACKUP_TABLES = [
  "cities", "profiles", "partners", "partner_users", "beneficiaries", "vehicles", "vehicle_events",
  "collectes", "collecte_items", "exceptional_requests", "checklist_templates", "checklist_overrides",
  "day_sessions", "stock_items", "stock_movements", "documents", "audit_log",
];

const KEEP_DAYS = 30;
const AUDIT_KEEP_DAYS = 400;
// Notifications sont éphémères (juste une cloche de suivi) : purge après 90 jours, lues ou non.
const NOTIFICATIONS_KEEP_DAYS = 90;
// day_sessions = justificatif des heures travaillées par le logisticien (checklist + horaires de la journée).
// Le code du travail ne fixe pas de durée précise pour ce type de justificatif, mais la pratique courante
// (alignée sur la conservation des bulletins de paie, Art. D3243-8) est de 5 ans — choisi par défaut ici en
// l'absence d'un avis juridique formel (décision Simon, 30/09/2026 : "fais ce qui te parait le mieux").
const DAY_SESSIONS_KEEP_DAYS = 1825;

async function fetchAll(admin: SupabaseClient, table: string) {
  const rows: unknown[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin.from(table).select("*").range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

export async function runBackup(admin: SupabaseClient) {
  const tables: Record<string, unknown[]> = {};
  const counts: Record<string, number> = {};
  for (const t of BACKUP_TABLES) {
    tables[t] = await fetchAll(admin, t);
    counts[t] = tables[t].length;
  }
  const now = new Date();
  const name = `linkee-${now.toISOString().slice(0, 16).replace(/[:T]/g, "-")}.json`;
  const body = JSON.stringify({ exported_at: now.toISOString(), counts, tables });
  const up = await admin.storage.from("backups").upload(name, new Blob([body], { type: "application/json" }), { contentType: "application/json", upsert: true });
  if (up.error) throw new Error(up.error.message);

  // retention: drop backups older than KEEP_DAYS (always keep the newest one) and prune very old audit rows
  const list = await admin.storage.from("backups").list("", { limit: 1000, sortBy: { column: "name", order: "asc" } });
  const cutoff = Date.now() - KEEP_DAYS * 86400000;
  const old = (list.data ?? []).filter((f) => f.created_at && new Date(f.created_at).getTime() < cutoff).map((f) => f.name);
  if (old.length && (list.data ?? []).length - old.length >= 1) await admin.storage.from("backups").remove(old);
  await admin.from("audit_log").delete().lt("at", new Date(Date.now() - AUDIT_KEEP_DAYS * 86400000).toISOString());
  await admin.from("notifications").delete().lt("created_at", new Date(Date.now() - NOTIFICATIONS_KEEP_DAYS * 86400000).toISOString());
  await admin.from("day_sessions").delete().lt("day", new Date(Date.now() - DAY_SESSIONS_KEEP_DAYS * 86400000).toISOString().slice(0, 10));

  return { name, size: body.length, counts };
}
