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

  return { name, size: body.length, counts };
}
