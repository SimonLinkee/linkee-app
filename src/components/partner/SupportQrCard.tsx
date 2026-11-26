"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import SupportQrButtons from "@/components/partner/SupportQrButtons";

// Dans l'espace du partenaire : son support A4 avec QR code à afficher pour ses équipes (migration 086 : il lit son propre lien).
export default function SupportQrCard({ partnerId, name, logoUrl }: { partnerId: string; name: string; logoUrl?: string | null }) {
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
    <section className="mb-4 rounded-[18px] border border-[var(--border)] bg-[var(--card)] p-5 shadow-[var(--shadow)]">
      <h3 className="font-display text-[16px] font-extrabold text-[var(--navy)]">Votre support QR code</h3>
      <p className="mt-0.5 mb-3 text-[12.5px] leading-[1.5] text-[var(--slate)]">
        Une affiche à imprimer et à afficher pour vos équipes : en scannant le QR code, elles déclarent un don ou demandent une collecte, sans compte ni application.
      </p>
      <SupportQrButtons token={token} name={name} logoUrl={logoUrl} />
    </section>
  );
}
