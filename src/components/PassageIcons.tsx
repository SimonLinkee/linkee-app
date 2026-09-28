import type { ReactNode } from "react";

// "Checklist de passage" of a partner: things the logisticien must not forget when he goes there.
export type Passage = { key?: boolean; cold?: boolean; rotation?: boolean; rotationNote?: string };

export const PASSAGE_ITEMS = [
  { k: "key" as const, label: "Clé d'accès", hint: "À prendre avant de passer chez ce partenaire", checklist: "Prendre la clé d'accès", bg: "var(--warn-bg)", fg: "var(--warn)" },
  { k: "cold" as const, label: "Caisses isothermes et pains de glace", hint: "À charger dans le camion pour ce passage", checklist: "Charger caisses isothermes et pains de glace", bg: "var(--exc-accent-bg)", fg: "var(--exc-accent)" },
  { k: "rotation" as const, label: "Rotation des contenants", hint: "Récupérer les contenants vides / déposer les propres — précisez en commentaire", checklist: "Rotation des contenants", bg: "var(--good-bg)", fg: "var(--good)" },
];

const PATHS: Record<"key" | "cold" | "rotation", ReactNode> = {
  key: (
    <>
      <circle cx="8" cy="15" r="4" />
      <path d="M11 12 L20 3 M16 7 L19 10 M13.5 9.5 L16 12" />
    </>
  ),
  cold: (
    <>
      <path d="M12 2 V22 M4 7 L20 17 M20 7 L4 17" />
      <path d="M9.5 4 L12 6.5 L14.5 4 M9.5 20 L12 17.5 L14.5 20 M3 9.5 L6.5 10 L5.5 6.5 M21 14.5 L17.5 14 L18.5 17.5 M21 9.5 L17.5 10 L18.5 6.5 M3 14.5 L6.5 14 L5.5 17.5" />
    </>
  ),
  rotation: (
    <>
      <path d="M20 11 A8 8 0 0 0 5.5 7.5 L4 9 M4 5 V9 H8" />
      <path d="M4 13 A8 8 0 0 0 18.5 16.5 L20 15 M20 19 V15 H16" />
    </>
  ),
};

export function PassageIcon({ k, size = 16 }: { k: "key" | "cold" | "rotation"; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[k]}
    </svg>
  );
}

/** Small round icons shown right after a partner's name (planning, tour list). */
export function PassageBadges({ passage, size = 26 }: { passage?: Passage | null; size?: number }) {
  if (!passage) return null;
  return (
    <>
      {PASSAGE_ITEMS.filter((it) => passage[it.k]).map((it) => (
        <span
          key={it.k}
          title={it.k === "rotation" && passage.rotationNote ? `${it.label} — ${passage.rotationNote}` : it.label}
          className="inline-flex flex-none items-center justify-center rounded-full"
          style={{ width: size, height: size, background: it.bg, color: it.fg }}
        >
          <PassageIcon k={it.k} size={Math.round(size * 0.62)} />
        </span>
      ))}
    </>
  );
}
