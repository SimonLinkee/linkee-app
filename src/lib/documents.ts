import type { SupabaseClient } from "@supabase/supabase-js";

// Shared by the partner fiche ("Mes documents"), the partner space and the manual volume entry.

export const DOC_ACCEPT = ".pdf,.xls,.xlsx,.csv,.png,.jpg,.jpeg,.gif,.webp,application/pdf,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,image/*";
export const DOC_MAX_BYTES = 15 * 1024 * 1024;

const ALLOWED_EXT = ["pdf", "xls", "xlsx", "csv", "png", "jpg", "jpeg", "gif", "webp"];
export const isAllowedDoc = (name: string) => ALLOWED_EXT.includes((name.split(".").pop() || "").toLowerCase());

export type DocRow = { id: string; partner_id: string; name: string; storage_path: string; size_bytes: number | null; created_at: string; source: "admin" | "partenaire"; collecte_id: string | null };
export const DOC_SELECT = "id,partner_id,name,storage_path,size_bytes,created_at,source,collecte_id";

export const fmtSize = (b: number | null) => (b == null ? "" : b < 1024 ? `${b} o` : b < 1024 * 1024 ? `${Math.round(b / 1024)} Ko` : `${(b / 1024 / 1024).toFixed(1)} Mo`);

/** Uploads one file to the private "documents" bucket and records it. Throws with a readable message. */
export async function uploadDocument(
  supabase: SupabaseClient,
  opts: { partnerId: string; file: File; source: "admin" | "partenaire"; userId: string | null; collecteId?: string | null },
): Promise<DocRow> {
  const { partnerId, file, source, userId, collecteId } = opts;
  if (!isAllowedDoc(file.name)) throw new Error(`${file.name} : format non accepté (PDF, Excel, CSV ou image).`);
  if (file.size > DOC_MAX_BYTES) throw new Error(`${file.name} : fichier trop lourd (15 Mo maximum).`);
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${partnerId}/${Date.now()}-${safe}`;
  const up = await supabase.storage.from("documents").upload(path, file, { contentType: file.type || undefined });
  if (up.error) throw new Error(`${file.name} : ${up.error.message}`);
  const { data, error } = await supabase
    .from("documents")
    .insert({ partner_id: partnerId, name: file.name, storage_path: path, size_bytes: file.size, uploaded_by: userId, source, collecte_id: collecteId ?? null })
    .select(DOC_SELECT)
    .single();
  if (error || !data) throw new Error(`${file.name} : ${error?.message ?? "erreur"} (la migration 013 est-elle passée ?)`);
  return data as DocRow;
}

export async function openDocument(supabase: SupabaseClient, path: string) {
  const { data, error } = await supabase.storage.from("documents").createSignedUrl(path, 120);
  if (error || !data) throw new Error(error?.message ?? "Ouverture impossible");
  window.open(data.signedUrl, "_blank", "noopener");
}
