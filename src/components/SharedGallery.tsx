"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { compressImage } from "@/lib/photos";
import { isSuper } from "@/lib/roles";
import { useCity } from "@/components/admin/CityContext";

// Galerie photos partagée (migration 059) : section repliable, photos libres de l'équipe, en carrousel de la plus
// récente à la plus ancienne, avec l'auteur et la date sous chaque photo. Seul l'auteur ou un admin peut supprimer.

type Photo = { id: string; path: string; author_id: string; author_name: string | null; created_at: string };

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });

export default function SharedGallery() {
  const supabase = useMemo(() => createClient(), []);
  const { role } = useCity();
  const [open, setOpen] = useState(false);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [me, setMe] = useState<{ id: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const track = useRef<HTMLDivElement>(null);
  const isAdmin = isSuper(role);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from("gallery_photos").select("id,path,author_id,author_name,created_at").order("created_at", { ascending: false }).limit(120);
    if (error) return setErr("Galerie indisponible : " + error.message + " (la migration 059 est-elle passée ?)");
    const list = (data ?? []) as Photo[];
    setPhotos(list);
    setCount(list.length);
    if (list.length) {
      const { data: signed } = await supabase.storage.from("gallery").createSignedUrls(list.map((p) => p.path), 3600);
      setUrls(Object.fromEntries(list.map((p, i) => [p.path, signed?.[i]?.signedUrl ?? ""])));
    }
  }, [supabase]);

  useEffect(() => {
    let off = false;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user || off) return;
      const { data: p } = await supabase.from("profiles").select("full_name,email").eq("id", auth.user.id).maybeSingle();
      if (off) return;
      setMe({ id: auth.user.id, name: (p?.full_name as string | null) || (p?.email as string | null)?.split("@")[0] || "Équipe Linkee" });
      void load();
    })();
    return () => {
      off = true;
    };
  }, [supabase, load]);

  async function add(files: File[]) {
    if (!me) return;
    setBusy(true);
    setErr(null);
    for (const f of files) {
      if (!f.type.startsWith("image/")) {
        setErr("Seules les images sont acceptées.");
        continue;
      }
      const blob = await compressImage(f);
      const path = `${me.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
      const up = await supabase.storage.from("gallery").upload(path, blob, { contentType: "image/jpeg" });
      if (up.error) {
        setErr("Envoi impossible : " + up.error.message);
        continue;
      }
      const ins = await supabase.from("gallery_photos").insert({ path, author_id: me.id, author_name: me.name });
      if (ins.error) {
        await supabase.storage.from("gallery").remove([path]); // pas de fichier orphelin
        setErr("Photo non enregistrée : " + ins.error.message);
      }
    }
    setBusy(false);
    await load();
    track.current?.scrollTo({ left: 0, behavior: "smooth" });
  }

  async function remove(p: Photo) {
    if (!window.confirm("Supprimer cette photo ?")) return;
    const { data, error } = await supabase.from("gallery_photos").delete().eq("id", p.id).select("id");
    if (error || !data?.length) return setErr("Suppression impossible : " + (error?.message ?? "seul l'auteur ou un admin peut la supprimer"));
    await supabase.storage.from("gallery").remove([p.path]);
    await load();
  }

  const scrollBy = (dir: 1 | -1) => track.current?.scrollBy({ left: dir * 280, behavior: "smooth" });

  return (
    <section className="mb-4 rounded-[20px] border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow)]" style={{ borderTop: "4px solid var(--pink)" }}>
      <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left">
        <span>
          <span className="font-display text-[19px] font-black text-[var(--navy)]">Galerie photos</span>
          <span className="ml-2 text-[13px] font-medium text-[var(--slate)]">{count === null ? "" : `${count} photo${count > 1 ? "s" : ""} — à partager librement`}</span>
        </span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className={`h-4 w-4 flex-none text-[var(--slate)] transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true">
          <path d="M6 9 L12 15 L18 9" />
        </svg>
      </button>

      {open && (
        <div className="border-t border-[var(--border)] px-5 pt-4 pb-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <label className={`inline-flex cursor-pointer items-center gap-2 rounded-[40px] bg-[var(--navy-deep)] px-4 py-2 font-display text-[13px] font-bold text-[var(--panel-fg)] ${busy ? "opacity-50" : ""}`}>
              {busy ? "Envoi…" : "+ Ajouter des photos"}
              <input
                type="file"
                accept="image/*"
                multiple
                hidden
                disabled={busy || !me}
                onChange={(e) => {
                  const f = Array.from(e.target.files ?? []);
                  e.target.value = "";
                  if (f.length) void add(f);
                }}
              />
            </label>
            {photos.length > 1 && (
              <div className="flex gap-1.5">
                <button type="button" aria-label="Photos plus récentes" onClick={() => scrollBy(-1)} className="h-8 w-8 rounded-full border-[1.5px] border-[var(--border)] text-[var(--navy)]">‹</button>
                <button type="button" aria-label="Photos plus anciennes" onClick={() => scrollBy(1)} className="h-8 w-8 rounded-full border-[1.5px] border-[var(--border)] text-[var(--navy)]">›</button>
              </div>
            )}
          </div>
          {err && (
            <div className="mb-3 flex items-start justify-between gap-3 rounded-xl bg-[var(--critical-bg)] px-3.5 py-2.5 text-[12.5px] font-semibold text-[var(--critical)]">
              <span>{err}</span>
              <button type="button" onClick={() => setErr(null)}>×</button>
            </div>
          )}
          {photos.length === 0 ? (
            <p className="rounded-xl border border-dashed border-[var(--border)] px-4 py-8 text-center text-[13px] text-[var(--slate)]">Aucune photo pour l&apos;instant. Ajoute la première : un stand, une équipe, une belle collecte.</p>
          ) : (
            <div ref={track} className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2">
              {photos.map((p) => {
                const canDelete = isAdmin || p.author_id === me?.id;
                return (
                  <figure key={p.id} className="relative w-[260px] flex-none snap-start">
                    {urls[p.path] ? (
                      <a href={urls[p.path]} target="_blank" rel="noopener noreferrer" title="Voir en grand">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={urls[p.path]} alt={`Photo de ${p.author_name ?? "l'équipe"}`} className="h-[200px] w-full rounded-[14px] object-cover" />
                      </a>
                    ) : (
                      <div className="h-[200px] w-full rounded-[14px] bg-[var(--track)]" />
                    )}
                    {canDelete && (
                      <button type="button" onClick={() => remove(p)} aria-label="Supprimer la photo" title="Supprimer" className="absolute top-2 right-2 flex h-7 w-7 items-center justify-center rounded-full bg-[var(--navy-deep)] text-[15px] leading-none text-[var(--panel-fg)] shadow">
                        ×
                      </button>
                    )}
                    <figcaption className="mt-1.5 px-0.5 text-[12px] text-[var(--slate)]">
                      <b className="font-semibold text-[var(--navy)]">{p.author_name || "Équipe Linkee"}</b> · {fmtDate(p.created_at)}
                    </figcaption>
                  </figure>
                );
              })}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
