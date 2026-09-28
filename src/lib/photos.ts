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
