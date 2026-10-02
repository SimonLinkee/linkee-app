"use client";

import { useRef, type ReactNode } from "react";

/** Pastille ronde : la photo si elle existe, sinon `fallback` (initiale, avatar…). Avec `onPick`, un appui ouvre
 * l'appareil photo / la galerie pour envoyer sa photo de profil (petit appareil photo en coin). */
export default function PhotoCircle({ url, fallback, size = 38, onPick, busy = false, label = "Changer ma photo" }: { url: string | null; fallback: ReactNode; size?: number; onPick?: (file: File) => void; busy?: boolean; label?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const body = url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" className="h-full w-full object-cover" />
  ) : (
    fallback
  );
  if (!onPick) {
    return (
      <span className="flex flex-none items-center justify-center overflow-hidden rounded-full" style={{ width: size, height: size }}>
        {body}
      </span>
    );
  }
  return (
    <span className="relative inline-flex flex-none">
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={busy}
        aria-label={label}
        title={label}
        className="flex items-center justify-center overflow-hidden rounded-full disabled:opacity-60"
        style={{ width: size, height: size }}
      >
        {body}
      </button>
      <span className="pointer-events-none absolute -right-0.5 -bottom-0.5 flex h-[18px] w-[18px] items-center justify-center rounded-full border-2 border-[var(--card)] bg-[var(--navy-deep)] text-[var(--panel-fg)]">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="h-[9px] w-[9px]">
          <path d="M4 8 L7 4 H17 L20 8" />
          <rect x="3" y="8" width="18" height="12" rx="2" />
          <circle cx="12" cy="14" r="3.2" />
        </svg>
      </span>
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) onPick(f);
        }}
      />
    </span>
  );
}
