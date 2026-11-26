"use client";

import { useState } from "react";

// Remet d'un coup tous les mots de passe des comptes partenaires de la ville au format « NomDuPartenaireLinkee2027 »
// et affiche la liste (partenaire, adresse, mot de passe) à transmettre.
export default function PartnerAccessBulk({ cityId, cityName }: { cityId: string | null; cityName: string }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ text: string; count: number; failed: string[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function run() {
    if (!cityId) return;
    if (!window.confirm(`Remettre les mots de passe de TOUS les comptes partenaires de ${cityName || "la ville"} au format « NomDuPartenaireLinkee2027 » ?\n\nLes anciens mots de passe ne marcheront plus : il faudra transmettre les nouveaux aux partenaires.`)) return;
    setBusy(true);
    setErr(null);
    setResult(null);
    const r = await fetch("/api/admin/partner-access", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ all: true, cityId }) }).catch(() => null);
    setBusy(false);
    const j = r ? await r.json().catch(() => ({})) : {};
    if (!r || !r.ok) return setErr(j.error ?? "Application impossible.");
    const done = j.done as { email: string; partner: string; password: string }[];
    setResult({ count: done.length, failed: j.failed ?? [], text: done.map((d) => [d.partner, d.email, d.password].join("\t")).join("\n") });
  }

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        disabled={busy || !cityId}
        onClick={() => void run()}
        className="rounded-[40px] border border-[var(--border)] bg-[var(--card)] px-3.5 py-[9px] text-[12.5px] font-semibold text-[var(--navy)] hover:border-[var(--turquoise)] disabled:opacity-60"
        title="Nom du partenaire + Linkee2027 pour tous les comptes partenaires de la ville"
      >
        {busy ? "Application…" : "Mots de passe partenaires"}
      </button>
      {err && <span className="text-[11.5px] font-semibold text-[var(--critical)]">{err}</span>}
      {result && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-[720px] rounded-[18px] bg-[var(--card)] p-5 shadow-[var(--shadow)]">
            <h3 className="font-display text-[17px] font-extrabold text-[var(--navy)]">
              {result.count} compte{result.count > 1 ? "s" : ""} mis à jour
            </h3>
            <p className="mt-0.5 mb-2 text-[12.5px] text-[var(--slate)]">
              Partenaire · adresse · mot de passe. Copie cette liste pour la transmettre ; tu retrouves chaque mot de passe dans la fiche du partenaire.
              {result.failed.length ? ` Échec pour : ${result.failed.join(", ")}.` : ""}
            </p>
            <textarea
              readOnly
              rows={Math.min(14, Math.max(4, result.count + 1))}
              value={result.text}
              className="w-full rounded-[11px] border-[1.5px] border-[var(--border)] bg-[var(--input-bg)] p-3 font-mono text-[12px] text-[var(--navy)]"
              onFocus={(e) => e.currentTarget.select()}
            />
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" onClick={() => void navigator.clipboard.writeText(result.text).catch(() => {})} className="rounded-[40px] border-[1.5px] border-[var(--border)] px-4 py-2 text-[12.5px] font-bold text-[var(--navy)]">
                Copier la liste
              </button>
              <button type="button" onClick={() => setResult(null)} className="rounded-[40px] bg-[var(--navy-deep)] px-5 py-2 text-[12.5px] font-bold text-[var(--panel-fg)]">
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
