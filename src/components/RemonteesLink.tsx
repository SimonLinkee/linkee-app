"use client";

import Link from "next/link";
import { REMONTEE_COLOR, useRemonteeBadge } from "@/lib/remontees";

/** Petite pastille rose (nombre de réponses non lues) à glisser dans un onglet « Remontées ». */
export function RemonteeBadgePill() {
  const badge = useRemonteeBadge();
  if (badge <= 0) return null;
  return <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold text-white" style={{ background: REMONTEE_COLOR }}>{badge}</span>;
}

/** Bouton rose « Remontées » (avec pastille de réponses non lues) pour les écrans qui n'ont pas de barre d'onglets :
 * journée du logisticien, vue simplifiée partenaire, saisie mobile. */
export default function RemonteesLink({ className = "" }: { className?: string }) {
  const badge = useRemonteeBadge();
  return (
    <Link
      href="/remontees"
      className={`relative inline-flex min-h-[38px] items-center gap-1.5 rounded-[40px] px-3.5 py-1.5 text-[12.5px] font-bold text-white ${className}`}
      style={{ background: REMONTEE_COLOR }}
    >
      💬 Remontées
      {badge > 0 && <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-white px-1 text-[10px] font-bold" style={{ color: REMONTEE_COLOR }}>{badge}</span>}
    </Link>
  );
}
