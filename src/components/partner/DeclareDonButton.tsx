"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Dans l'espace du partenaire : un gros bouton « Déclarer un don » qui ouvre son formulaire public de déclaration (/p/<jeton>#don).
export default function DeclareDonButton({ partnerId }: { partnerId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    let off = false;
    supabase
      .from("partner_links")
      .select("token,enabled")
      .eq("partner_id", partnerId)
      .maybeSingle()
      .then(({ data }) => !off && setToken(data && (data as { enabled: boolean }).enabled ? (data as { token: string }).token : null));
    return () => {
      off = true;
    };
  }, [supabase, partnerId]);

  if (!token) return null;
  return (
    <a
      href={`/p/${token}#don`}
      target="_blank"
      rel="noopener noreferrer"
      className="mb-5 flex min-h-[84px] items-center gap-4 rounded-[20px] bg-[#eb6834] px-6 py-4 text-white shadow-[0_10px_24px_-10px_rgba(235,104,52,0.8)] hover:brightness-95"
    >
      <span className="flex h-[52px] w-[52px] flex-none items-center justify-center rounded-full bg-white/25 text-[26px]">📦</span>
      <span className="flex-1">
        <strong className="block font-display text-[24px] leading-tight">Déclarer un don</strong>
        <span className="text-[13px] opacity-95">Types de produits, poids, valeur du don, bon de livraison : en une minute, sans compte.</span>
      </span>
      <span className="text-[26px]" aria-hidden="true">→</span>
    </a>
  );
}
