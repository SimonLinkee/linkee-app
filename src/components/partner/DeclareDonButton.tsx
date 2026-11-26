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
      className="mb-4 flex min-h-[64px] items-center gap-3.5 rounded-[18px] bg-[var(--navy-deep)] px-5 py-3.5 text-[var(--panel-fg)] shadow-[var(--shadow)]"
    >
      <span className="flex h-[42px] w-[42px] flex-none items-center justify-center rounded-full bg-white/20 text-[21px]">📦</span>
      <span className="flex-1">
        <strong className="block font-display text-[17px]">Déclarer un don</strong>
        <span className="text-[12.5px] opacity-90">Types de produits, poids, valeur du don, bon de livraison : en une minute, sans compte.</span>
      </span>
      <span className="text-[20px]" aria-hidden="true">→</span>
    </a>
  );
}
