"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Le lien de déclaration d'un partenaire (page publique /p/<jeton>, sans connexion) : à copier et à lui transmettre.
// Visible par le Superadmin et le Responsable d'antenne de la ville (la Comptabilité le voit sans pouvoir le changer).

type Link = { token: string; enabled: boolean };

export default function DeclareLinkBox({ partnerId, readOnly = false }: { partnerId: string; readOnly?: boolean }) {
  const supabase = useMemo(() => createClient(), []);
  const [link, setLink] = useState<Link | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "missing" | "error">("loading");
  const [copied, setCopied] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    let off = false;
    (async () => {
      const { data, error } = await supabase.from("partner_links").select("token,enabled").eq("partner_id", partnerId).maybeSingle();
      if (off) return;
      if (error) {
        setMsg(error.message + " (la migration 085 est-elle passée ?)");
        return setState("error");
      }
      if (data) {
        setLink(data as Link);
        return setState("ok");
      }
      if (readOnly) return setState("missing");
      // partenaire créé après la migration : son lien est créé à la première visite de sa fiche
      const ins = await supabase.from("partner_links").insert({ partner_id: partnerId }).select("token,enabled").maybeSingle();
      if (off) return;
      if (ins.error || !ins.data) {
        setMsg(ins.error?.message ?? "Lien non créé.");
        return setState("error");
      }
      setLink(ins.data as Link);
      setState("ok");
    })();
    return () => {
      off = true;
    };
  }, [supabase, partnerId, readOnly]);

  const url = link ? `${window.location.origin}/p/${link.token}` : "";

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt("Copie ce lien :", url);
    }
  }
  async function regenerate() {
    if (!window.confirm("Générer un nouveau lien ? L'ancien lien ne marchera plus : il faudra transmettre le nouveau au partenaire.")) return;
    const token = crypto.randomUUID().replace(/-/g, "");
    const { error } = await supabase.from("partner_links").update({ token }).eq("partner_id", partnerId);
    if (error) return setMsg(error.message);
    setLink((l) => (l ? { ...l, token } : l));
    setMsg("Nouveau lien généré.");
  }
  async function toggle(enabled: boolean) {
    const { error } = await supabase.from("partner_links").update({ enabled }).eq("partner_id", partnerId);
    if (error) return setMsg(error.message);
    setLink((l) => (l ? { ...l, enabled } : l));
    setMsg(enabled ? "Lien réactivé." : "Lien mis en pause : la page affiche « lien non valable ».");
  }

  return (
    <div className="mb-3 rounded-[14px] border-[1.5px] border-[var(--border)] bg-[var(--card)] p-3">
      <div className="mb-1.5 flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-bold text-[var(--navy)]">Lien de déclaration du partenaire</span>
        <span className="text-[11.5px] text-[var(--slate)]">Sans connexion : il y voit ses créneaux, demande une collecte exceptionnelle ou déclare un don.</span>
      </div>
      {state === "loading" && <p className="text-[12px] text-[var(--slate)]">Chargement…</p>}
      {state === "missing" && <p className="text-[12px] text-[var(--slate)]">Pas encore de lien pour ce partenaire.</p>}
      {state === "error" && <p className="text-[12px] font-semibold text-[var(--critical)]">{msg}</p>}
      {state === "ok" && link && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <code className={`min-w-[220px] flex-1 rounded-[10px] border border-[var(--border)] bg-[var(--input-bg)] px-3 py-2 text-[12px] break-all text-[var(--navy)] ${link.enabled ? "" : "opacity-50"}`}>{url}</code>
            <button type="button" onClick={() => void copy()} className="rounded-[40px] bg-[var(--navy-deep)] px-4 py-2 text-[12.5px] font-bold text-[var(--panel-fg)]">
              {copied ? "Lien copié ✔" : "Copier le lien"}
            </button>
            <a href={url} target="_blank" rel="noopener noreferrer" className="rounded-[40px] border-[1.5px] border-[var(--border)] px-3.5 py-2 text-[12.5px] font-bold text-[var(--navy)]">Ouvrir</a>
          </div>
          {!readOnly && (
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-1.5 text-[12.5px] font-semibold text-[var(--navy)]">
                <input type="checkbox" checked={link.enabled} onChange={(e) => void toggle(e.target.checked)} className="h-[15px] w-[15px] accent-[#0ca30c]" /> Lien actif
              </label>
              <button type="button" onClick={() => void regenerate()} className="text-[12px] font-bold text-[var(--slate)] underline">Générer un nouveau lien</button>
            </div>
          )}
          {msg && <p className="mt-1.5 text-[12px] text-[var(--slate)]">{msg}</p>}
        </>
      )}
    </div>
  );
}
