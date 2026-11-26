"use client";

import { useState } from "react";
import { canvasToPdf, canvasToPng, downloadBlob, drawSupport, supportFileName } from "@/lib/supportQr";

// Boutons « Télécharger le support » : l'affiche A4 à imprimer et à afficher pour les équipes (un seul QR code vers le lien du partenaire).
export default function SupportQrButtons({ token, name, logoUrl }: { token: string; name: string; logoUrl?: string | null }) {
  const [busy, setBusy] = useState<"pdf" | "png" | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function download(kind: "pdf" | "png") {
    setBusy(kind);
    setErr(null);
    try {
      const canvas = await drawSupport({ url: `${window.location.origin}/p/${token}`, name, logoUrl });
      const blob = kind === "pdf" ? await canvasToPdf(canvas) : await canvasToPng(canvas);
      downloadBlob(blob, `${supportFileName(name)}.${kind}`);
    } catch (e) {
      setErr("Création du support impossible : " + (e as Error).message);
    }
    setBusy(null);
  }

  const btn = "rounded-[40px] border-[1.5px] border-[var(--border)] px-3.5 py-2 text-[12.5px] font-bold text-[var(--navy)] hover:border-[var(--turquoise)] disabled:opacity-60";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" disabled={!!busy} onClick={() => void download("pdf")} className={`${btn} !border-[var(--navy-deep)] !bg-[var(--navy-deep)] !text-[var(--panel-fg)]`}>
        {busy === "pdf" ? "Création…" : "Support A4 (PDF)"}
      </button>
      <button type="button" disabled={!!busy} onClick={() => void download("png")} className={btn}>
        {busy === "png" ? "Création…" : "Image (PNG)"}
      </button>
      {err && <span className="text-[12px] font-semibold text-[var(--critical)]">{err}</span>}
    </div>
  );
}
