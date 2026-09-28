"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { signedUrls, uploadPrivatePhoto } from "@/lib/photos";

/** Thumbnails of private photos plus an upload button (several photos at once). readOnly hides upload and removal. */
export default function PhotoStrip({ paths, folder, onChange, readOnly = false, accent = "#2a78d6", size = 88, label = "Ajouter des photos" }: { paths: string[]; folder?: string; onChange?: (paths: string[]) => void; readOnly?: boolean; accent?: string; size?: number; label?: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const key = paths.join("|");

  useEffect(() => {
    if (!paths.length) return setUrls({});
    let off = false;
    signedUrls(supabase, paths).then((list) => {
      if (!off) setUrls(Object.fromEntries(paths.map((p, i) => [p, list[i] ?? ""])));
    });
    return () => {
      off = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  async function add(files: File[]) {
    if (!folder || !onChange) return;
    setBusy(true);
    setErr(null);
    const added: string[] = [];
    for (const f of files) {
      try {
        added.push(await uploadPrivatePhoto(supabase, folder, f));
      } catch (e) {
        setErr((e as Error).message);
      }
    }
    if (added.length) onChange([...paths, ...added]);
    setBusy(false);
  }
  async function remove(p: string) {
    if (!onChange || !window.confirm("Retirer cette photo ?")) return;
    await supabase.storage.from("collecte-photos").remove([p]);
    onChange(paths.filter((x) => x !== p));
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {paths.map((p) => (
          <div key={p} className="relative flex-none" style={{ width: size, height: size }}>
            {urls[p] ? (
              <a href={urls[p]} target="_blank" rel="noopener noreferrer" title="Voir en grand">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={urls[p]} alt="" className="h-full w-full rounded-xl object-cover" />
              </a>
            ) : (
              <div className="h-full w-full rounded-xl bg-[var(--track)]" />
            )}
            {!readOnly && (
              <button type="button" onClick={() => remove(p)} aria-label="Retirer la photo" className="absolute -top-1.5 -right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--navy-deep)] text-[13px] leading-none text-[var(--panel-fg)] shadow">
                ×
              </button>
            )}
          </div>
        ))}
        {!readOnly && (
          <label className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed px-2 text-center text-[11.5px] font-semibold text-[var(--navy)] ${busy ? "opacity-50" : ""}`} style={{ width: size, height: size, borderColor: accent }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6" style={{ color: accent }}>
              <path d="M4 8 L7 4 H17 L20 8" />
              <rect x="3" y="8" width="18" height="12" rx="2" />
              <circle cx="12" cy="14" r="3.2" />
            </svg>
            {busy ? "Envoi…" : label}
            <input
              type="file"
              accept="image/*"
              multiple
              hidden
              disabled={busy}
              onChange={(e) => {
                const f = Array.from(e.target.files ?? []);
                e.target.value = "";
                if (f.length) void add(f);
              }}
            />
          </label>
        )}
        {readOnly && paths.length === 0 && <span className="text-[12px] text-[var(--slate)]">Aucune photo</span>}
      </div>
      {err && <p className="mt-1.5 text-[11.5px] font-semibold text-[var(--critical)]">{err}</p>}
    </div>
  );
}
