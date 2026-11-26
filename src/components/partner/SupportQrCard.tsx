"use client";

import { useEffect, useState } from "react";
import SupportQrButtons from "@/components/partner/SupportQrButtons";

// Dans l'espace du partenaire : son support A4 avec QR code à afficher pour ses équipes (migration 086 : il lit son propre lien).
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
    <section className="mb-4 rounded-[18px] border border-[var(--border)] bg-[var(--card)] p-5 shadow-[var(--shadow)]">
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
    </section>
  );
}
