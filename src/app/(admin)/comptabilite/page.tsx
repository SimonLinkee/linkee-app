"use client";

/** Page d'accueil du rôle Comptabilité : suivi des reçus fiscaux (Cerfa). Le suivi lui-même (compteurs, file de
 * demandes, émission) arrive avec les sujets suivants du lot Cerfa — pour l'instant, la page confirme l'accès. */
export default function ComptabilitePage() {
  return (
    <div>
      <div className="mb-4">
        <h1 className="font-display text-[32px] leading-none font-black">Suivi des Cerfa</h1>
        <p className="mt-1 text-[13.5px] text-[var(--slate)]">Reçus fiscaux demandés par les partenaires donateurs : validation, émission et archivage.</p>
      </div>
      <div className="rounded-[18px] border border-dashed border-[var(--border)] bg-[var(--card)] px-6 py-10 text-center text-[13px] text-[var(--slate)]">
        Le suivi des demandes de Cerfa sera disponible ici très prochainement.
      </div>
    </div>
  );
}
