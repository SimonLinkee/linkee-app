"use client";

import { useState, type ReactNode } from "react";

// Un bloc d'action de l'espace partenaire, dans le même esprit que « Déclarer un don » : un grand bandeau coloré (icône, titre, phrase),
// sur lequel on clique pour dérouler son contenu (ici le formulaire de demande exceptionnelle).
export default function BigBlock({ title, sub, icon, color, badge, defaultOpen = false, children }: { title: string; sub: string; icon: string; color: string; badge?: string; defaultOpen?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="mb-5 overflow-hidden rounded-[20px] border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow)]">
      <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="flex min-h-[84px] w-full items-center gap-4 px-6 py-4 text-left text-white hover:brightness-95" style={{ background: color }}>
        <span className="flex h-[52px] w-[52px] flex-none items-center justify-center rounded-full bg-white/25 text-[26px]">{icon}</span>
        <span className="flex-1">
          <strong className="block font-display text-[24px] leading-tight">{title}</strong>
          <span className="text-[13px] opacity-95">{sub}</span>
        </span>
        {badge && <span className="flex-none rounded-[40px] bg-white/90 px-3 py-1 text-[12px] font-bold" style={{ color }}>{badge}</span>}
        <span className={`text-[22px] transition-transform ${open ? "rotate-90" : ""}`} aria-hidden="true">→</span>
      </button>
      {open && <div className="px-5 py-5">{children}</div>}
    </section>
  );
}
