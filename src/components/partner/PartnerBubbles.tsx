"use client";

import { createContext, type ReactNode } from "react";

// Nouvelle présentation de la fiche d'un partenaire (équipe) : fil d'Ariane, infos clés, puis des bulles (icône + titre + résumé).
// Un clic sur une bulle ouvre un volet à droite avec son paramétrage (les sections de la fiche, affichées à plat dans le volet).

/** Vrai quand les sections de la fiche sont affichées dans le volet : elles perdent leur en-tête d'accordéon. */
export const FlatCtx = createContext(false);

export type Bubble = { key: string; icon: string; title: string; summary: string; bg: string; warn?: boolean };
export type Fact = { label: string; value: string };

export function PartnerCrumb({ name, onBack, onPrev, onNext }: { name: string; onBack: () => void; onPrev: () => void; onNext: () => void }) {
  const btn = "rounded-[40px] border-[1.5px] border-[var(--border)] bg-[var(--card)] px-3.5 py-1.5 text-[13px] font-bold text-[var(--navy)] hover:border-[var(--turquoise)]";
  return (
    <div className="mb-3.5 flex flex-wrap items-center gap-2.5">
      <button type="button" onClick={onBack} className={btn}>← Partenaires</button>
      <span className="text-[var(--slate)]">/</span>
      <span className="text-[14px] font-bold text-[var(--navy)]">{name}</span>
      <span className="flex-1" />
      <button type="button" onClick={onPrev} title="Partenaire précédent" className={btn}>‹</button>
      <button type="button" onClick={onNext} title="Partenaire suivant" className={btn}>›</button>
    </div>
  );
}

export function PartnerFacts({ facts }: { facts: Fact[] }) {
  return (
    <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
      {facts.map((f) => (
        <div key={f.label} className="rounded-xl bg-[var(--input-bg)] px-3.5 py-2.5">
          <span className="block text-[10.5px] font-bold tracking-[0.06em] text-[var(--slate)] uppercase">{f.label}</span>
          <b className="block text-[13.5px] leading-snug text-[var(--navy)]">{f.value}</b>
        </div>
      ))}
    </div>
  );
}

export function BubbleGrid({ bubbles, onOpen }: { bubbles: Bubble[]; onOpen: (key: string) => void }) {
  return (
    <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      {bubbles.map((b) => (
        <button
          key={b.key}
          type="button"
          onClick={() => onOpen(b.key)}
          className="relative flex flex-col items-start gap-1.5 rounded-[16px] border-[1.5px] border-[var(--border)] bg-[var(--card)] p-3.5 text-left shadow-[var(--shadow)] transition-transform hover:-translate-y-px hover:border-[var(--turquoise)]"
        >
          <span className={`absolute top-3 right-3 h-2.5 w-2.5 rounded-full ${b.warn ? "bg-[#eda100]" : "bg-[#0ca30c]"}`} />
          <span className="flex h-[44px] w-[44px] items-center justify-center rounded-[14px] text-[22px]" style={{ background: b.bg }}>{b.icon}</span>
          <b className="text-[14.5px] text-[var(--navy)]">{b.title}</b>
          <span className="text-[12px] leading-snug text-[var(--slate)]">{b.summary}</span>
        </button>
      ))}
    </div>
  );
}

/** Le volet à droite : fond sombre cliquable pour fermer, titre, bouton fermer ; le contenu (les sections de la fiche) est passé en enfants. */
export function PartnerDrawer({ inline = false, open, icon, title, subtitle, saved, onClose, children }: { inline?: boolean; open: boolean; icon: string; title: string; subtitle: string; saved: boolean; onClose: () => void; children: ReactNode }) {
  if (inline) return <>{children}</>; // fiche d'un bénéficiaire : pas de volet, le contenu s'affiche à sa place
  if (!open) return null;
  return (
    <>
      <div className="fixed inset-0 z-[400] bg-[rgba(0,22,65,0.45)]" onClick={onClose} />
      <aside className="fixed top-0 right-0 bottom-0 z-[401] w-[min(580px,100vw)] overflow-y-auto border-l-[1.5px] border-[var(--border)] bg-[var(--card)] p-5 shadow-[-14px_0_34px_-14px_rgba(0,22,65,0.5)]" aria-label={title}>
        <div className="mb-3.5 flex items-center gap-3">
          <span className="flex h-[40px] w-[40px] flex-none items-center justify-center rounded-[13px] bg-[var(--input-bg)] text-[20px]">{icon}</span>
          <div className="min-w-0 flex-1">
            <h3 className="font-display text-[20px] font-black text-[var(--navy)]">{title}</h3>
            <div className="truncate text-[12px] text-[var(--slate)]">{subtitle}</div>
          </div>
          <button type="button" onClick={onClose} aria-label="Fermer" className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-[var(--input-bg)] text-[16px] text-[var(--navy)]">✕</button>
        </div>
        <div className={`mb-3 text-[11.5px] font-semibold text-[var(--good)] transition-opacity ${saved ? "opacity-100" : "opacity-0"}`}>✓ Modifications enregistrées</div>
        {children}
        <div className="mt-4 flex justify-end border-t border-[var(--border)] pt-3">
          <button type="button" onClick={onClose} className="rounded-[40px] bg-[var(--navy-deep)] px-5 py-2 font-display text-[13px] font-bold text-[var(--panel-fg)]">Fermer</button>
        </div>
      </aside>
    </>
  );
}
