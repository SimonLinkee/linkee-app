"use client";

import { useEffect, useState } from "react";
import SupportQrButtons from "@/components/partner/SupportQrButtons";

// Dans l'espace du partenaire (PC) : le bloc « Déclarer un don » — le gros bouton qui ouvre le formulaire, et juste en dessous
// le lien à partager et l'affiche A4 avec QR code (c'est le même sujet, donc le même bloc). Le lien est lu par le serveur.
export default function SupportQrCard({ partnerId, name, logoUrl }: { partnerId: string; name: string; logoUrl?: string | null }) {
  const [token, setToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let off = false;
    fetch(`/api/partner-link?partnerId=${partnerId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { token?: string; enabled?: boolean } | null) => !off && setToken(j?.token && j.enabled ? j.token : null))
      .catch(() => !off && setToken(null));
    return () => {
      off = true;
    };
  }, [partnerId]);

  if (!token) return null;
  const url = `${window.location.origin}/p/${token}`;
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt("Copiez ce lien :", url);
    }
  }
  return (
    <section className="mb-5 overflow-hidden rounded-[20px] border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow)]">
      <a href={`/p/${token}#don`} target="_blank" rel="noopener noreferrer" className="flex min-h-[84px] items-center gap-4 bg-[#eb6834] px-6 py-4 text-white hover:brightness-95">
        <span className="flex h-[52px] w-[52px] flex-none items-center justify-center rounded-full bg-white/25 text-[26px]">📦</span>
        <span className="flex-1">
          <strong className="block font-display text-[24px] leading-tight">Déclarer un don</strong>
          <span className="text-[13px] opacity-95">Types de produits, poids, valeur du don, bon de livraison : en une minute, sans compte.</span>
        </span>
        <span className="text-[26px]" aria-hidden="true">→</span>
      </a>
      <div className="px-5 py-4">
        <h3 className="font-display text-[16px] font-extrabold text-[var(--navy)]">Votre lien de déclaration</h3>
        <p className="mt-0.5 mb-3 text-[12.5px] leading-[1.5] text-[var(--slate)]">
          Vos équipes l&apos;ouvrent sans compte ni application pour déclarer un don ou demander une collecte. Partagez le lien, ou imprimez l&apos;affiche avec son QR code.
        </p>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <code className="min-w-[220px] flex-1 rounded-[10px] border border-[var(--border)] bg-[var(--input-bg)] px-3 py-2 text-[12px] break-all text-[var(--navy)]">{url}</code>
          <button type="button" onClick={() => void copy()} className="rounded-[40px] bg-[var(--navy-deep)] px-4 py-2 text-[12.5px] font-bold text-[var(--panel-fg)]">
            {copied ? "Lien copié ✔" : "Copier le lien"}
          </button>
        </div>
        <SupportQrButtons token={token} name={name} logoUrl={logoUrl} />
      </div>
    </section>
  );
}
