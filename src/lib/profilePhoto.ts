"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { compressImage } from "@/lib/photos";

// Photo de profil personnelle (migration 048) : coffre privé "avatars", dossier <id du compte>/, chemin mémorisé
// dans profiles.photo_path. Réduite à 512 px (JPEG) avant l'envoi : quelques dizaines de Ko.

/** Ma photo de profil : lien d'affichage temporaire + envoi + retrait. `url` vaut null tant qu'il n'y en a pas. */
export function useMyPhoto() {
  const supabase = useMemo(() => createClient(), []);
  const [uid, setUid] = useState<string | null>(null);
  const [path, setPath] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user || !alive) return;
      setUid(data.user.id);
      supabase
        .from("profiles")
        .select("photo_path")
        .eq("id", data.user.id)
        .maybeSingle()
        .then(({ data: p }) => {
          if (!alive) return;
          const pp = (p as { photo_path?: string | null } | null)?.photo_path ?? null;
          setPath(pp);
          if (!pp) return setUrl(null);
          supabase.storage
            .from("avatars")
            .createSignedUrl(pp, 3600)
            .then(({ data: s }) => alive && setUrl(s?.signedUrl ?? null));
        });
    });
    return () => {
      alive = false;
    };
  }, [supabase, tick]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  const upload = useCallback(
    async (file: File) => {
      if (!uid) return;
      if (!file.type.startsWith("image/")) return setError("Choisis une image.");
      setBusy(true);
      setError(null);
      try {
        const blob = await compressImage(file, 512, 0.85);
        const newPath = `${uid}/avatar-${Date.now()}.jpg`;
        const up = await supabase.storage.from("avatars").upload(newPath, blob, { contentType: "image/jpeg" });
        if (up.error) throw new Error(up.error.message + " (la migration 048 est-elle passée ?)");
        const { error: e2 } = await supabase.from("profiles").update({ photo_path: newPath }).eq("id", uid);
        if (e2) {
          await supabase.storage.from("avatars").remove([newPath]);
          throw new Error(e2.message);
        }
        if (path) await supabase.storage.from("avatars").remove([path]);
        refresh();
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [supabase, uid, path, refresh],
  );

  const remove = useCallback(async () => {
    if (!uid || !path) return;
    setBusy(true);
    setError(null);
    const { error: e } = await supabase.from("profiles").update({ photo_path: null }).eq("id", uid);
    if (e) setError(e.message);
    else {
      await supabase.storage.from("avatars").remove([path]);
      refresh();
    }
    setBusy(false);
  }, [supabase, uid, path, refresh]);

  return { url, hasPhoto: !!path, busy, error, upload, remove };
}
