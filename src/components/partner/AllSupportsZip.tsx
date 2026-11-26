"use client";

import { useMemo, useState } from "react";
import JSZip from "jszip";
import { createClient } from "@/lib/supabase/client";
import { canvasToPdf, downloadBlob, drawSupport, supportFileName } from "@/lib/supportQr";

// Un fichier ZIP avec le support A4 (PDF) de chaque partenaire actif de la ville, nommé d'après le partenaire
// (« Support QR - Boulangerie Les Délices.pdf ») : prêt à glisser dans un dossier (Canva, Drive…) ou à imprimer.
export default function AllSupportsZip({ cityName, partners }: { cityName: string; partners: { id: string; name: string; logoUrl?: string | null }[] }) {
  const supabase = useMemo(() => createClient(), []);
  const [state, setState] = useState<{ done: number; total: number } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function run() {
    setMsg(null);
    setState({ done: 0, total: partners.length });
    const { data, error } = await supabase.from("partner_links").select("partner_id,token,enabled").in("partner_id", partners.map((p) => p.id));
    if (error) {
      setState(null);
      return setMsg(error.message + " (la migration 085 est-elle passée ?)");
    }
    const tokens = new Map((data ?? []).filter((l) => l.enabled).map((l) => [l.partner_id as string, l.token as string]));
    const zip = new JSZip();
    const used = new Set<string>();
    let n = 0, skipped = 0;
    for (const p of partners) {
      const token = tokens.get(p.id);
      if (!token) {
        skipped++;
        setState({ done: ++n, total: partners.length });
        continue;
      }
      try {
        const canvas = await drawSupport({ url: `${window.location.origin}/p/${token}`, name: p.name, logoUrl: p.logoUrl });
        let file = supportFileName(p.name);
        if (used.has(file.toLowerCase())) file += ` (${p.id.slice(0, 4)})`; // deux partenaires du même nom
        used.add(file.toLowerCase());
        zip.file(`${file}.pdf`, await canvasToPdf(canvas));
      } catch {
        skipped++;
      }
      setState({ done: ++n, total: partners.length });
    }
    const blob = await zip.generateAsync({ type: "blob" });
    downloadBlob(blob, `Supports QR - ${cityName || "partenaires"}.zip`);
    setState(null);
    setMsg(skipped ? `${partners.length - skipped} supports créés, ${skipped} partenaires sans lien actif ignorés.` : `${partners.length} supports créés.`);
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={!!state || partners.length === 0}
        onClick={() => void run()}
        title="Télécharge le support QR code de tous les partenaires actifs de la ville, un PDF par partenaire"
        className="rounded-[40px] border border-[var(--border)] bg-[var(--card)] px-3.5 py-[9px] text-[12.5px] font-semibold text-[var(--navy)] hover:border-[var(--turquoise)] disabled:opacity-60"
      >
        {state ? `Création… ${state.done}/${state.total}` : "Tous les supports QR (ZIP)"}
      </button>
      {msg && <span className="text-[11.5px] text-[var(--slate)]">{msg}</span>}
    </div>
  );
}
