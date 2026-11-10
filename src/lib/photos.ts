import type { SupabaseClient } from "@supabase/supabase-js";

/** Shrinks a phone photo (often 5–10 MB) to a max side of 1600 px, JPEG 80 %, before uploading. */
export async function compressImage(file: File, maxSide = 1600, quality = 0.8): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    return blob ?? file;
  } catch {
    return file; // unsupported format: upload as is
  }
}

/** Uploads a photo to the private "collecte-photos" bucket. Returns the storage path, or throws. */
export async function uploadPrivatePhoto(supabase: SupabaseClient, folder: string, file: File): Promise<string> {
  const blob = await compressImage(file);
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  const { error } = await supabase.storage.from("collecte-photos").upload(path, blob, { contentType: "image/jpeg" });
  if (error) throw new Error(error.message);
  return path;
}

/** Temporary links (1 h) to look at private photos. */
export async function signedUrls(supabase: SupabaseClient, paths: string[]): Promise<string[]> {
  if (!paths.length) return [];
  const { data } = await supabase.storage.from("collecte-photos").createSignedUrls(paths, 3600);
  return paths.map((_, i) => data?.[i]?.signedUrl ?? ""); // same order as `paths`, "" when a link could not be made
}

export type TeamFile = { path: string; name: string; size: number; mime: string; at: string };
export const MAX_TEAM_FILE_BYTES = 20 * 1024 * 1024;

/** Uploads any file (PDF, Word, Excel, image…) as is to the private "collecte-photos" bucket. Returns its description, or throws. */
export async function uploadPrivateFile(supabase: SupabaseClient, folder: string, file: File): Promise<TeamFile> {
  if (file.size > MAX_TEAM_FILE_BYTES) throw new Error(`« ${file.name} » dépasse 20 Mo.`);
  const safe = file.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w.\-]+/g, "_").slice(-80);
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 6)}-${safe}`;
  const { error } = await supabase.storage.from("collecte-photos").upload(path, file, { contentType: file.type || undefined });
  if (error) throw new Error(error.message);
  return { path, name: file.name, size: file.size, mime: file.type || "", at: new Date().toISOString() };
}

/** Opens a private file in a new tab (temporary link, 5 min). Returns an error message, or null. */
export async function openPrivateFile(supabase: SupabaseClient, path: string): Promise<string | null> {
  const w = window.open("", "_blank");
  const { data, error } = await supabase.storage.from("collecte-photos").createSignedUrl(path, 300);
  if (error || !data) {
    w?.close();
    return error?.message ?? "fichier introuvable";
  }
  if (w) w.location.assign(data.signedUrl);
  else window.open(data.signedUrl, "_blank");
  return null;
}
