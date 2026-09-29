"use client";

import { useEffect, useRef, useState } from "react";
import { isValidSiren, lookupSiren, type SirenInfo } from "@/lib/siren";

const fieldCls = "w-full rounded-[10px] border-[1.5px] border-[var(--border)] bg-[var(--input-bg)] px-2.5 py-2 text-[13px] font-medium text-[var(--navy)] outline-none focus:border-[var(--turquoise)]";
const fmtDate = (iso: string | null) => (iso ? new Date(iso + "T00:00:00").toLocaleDateString("fr-FR") : null);

/** N° SIREN + infos comptables (raison sociale, SIRET, adresse du siège, forme juridique, NAF, date de création,
 * TVA intracommunautaire) allées chercher automatiquement via l'API publique du gouvernement dès que 9 chiffres
 * valides sont saisis. Affichage volontairement discret : ce sont des infos de référence pour la compta. */
export default function SirenField({
  siren,
  info,
  onSirenChange,
  onInfoChange,
}: {
  siren: string;
  info: SirenInfo | null | undefined;
  onSirenChange: (v: string) => void;
  onInfoChange: (info: SirenInfo | null) => void;
}) {
  const [loading, setLoading] = useState(false);
  const timer = useRef<number | null>(null);
  const lastFetched = useRef<string | null>(null);

  async function fetchNow(v: string) {
    setLoading(true);
    const result = await lookupSiren(v);
    lastFetched.current = v;
    onInfoChange(result);
    setLoading(false);
  }

  useEffect(() => {
    if (timer.current) window.clearTimeout(timer.current);
    if (!isValidSiren(siren)) return;
    if (lastFetched.current === siren) return; // déjà récupéré pour ce SIREN
    timer.current = window.setTimeout(() => fetchNow(siren), 500);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siren]);

  const invalid = siren.trim() !== "" && !isValidSiren(siren);

  return (
    <div>
      <div className="flex items-center gap-2">
        <input
          className={fieldCls}
          value={siren}
          onChange={(e) => onSirenChange(e.target.value.replace(/[^0-9]/g, "").slice(0, 9))}
          placeholder="9 chiffres"
          inputMode="numeric"
          style={invalid ? { borderColor: "var(--critical)" } : undefined}
        />
        <button
          type="button"
          disabled={!isValidSiren(siren) || loading}
          onClick={() => fetchNow(siren)}
          title="Relancer la recherche"
          className="flex-none rounded-[40px] border-[1.5px] border-[var(--border)] px-3 py-2 text-[11.5px] font-bold text-[var(--slate)] disabled:opacity-40 hover:border-[var(--turquoise)] hover:text-[var(--turquoise)]"
        >
          {loading ? "…" : "Actualiser"}
        </button>
      </div>
      {invalid && <p className="mt-1 text-[11px] font-semibold text-[var(--critical)]">Le SIREN doit comporter 9 chiffres.</p>}
      {!invalid && loading && <p className="mt-1 text-[11px] text-[var(--muted)]">Recherche…</p>}
      {!invalid && !loading && info?.notFound && <p className="mt-1 text-[11px] text-[var(--muted)]">SIREN introuvable</p>}
      {!invalid && !loading && info && !info.notFound && (
        <div className="mt-1 text-[10.5px] leading-[1.6] text-[var(--muted)]">
          {info.raisonSociale && <div>{info.raisonSociale}</div>}
          {info.siret && <div>SIRET siège : {info.siret}</div>}
          {info.adresseSiege && <div>{info.adresseSiege}</div>}
          {info.formeJuridique && <div>{info.formeJuridique}</div>}
          {info.codeNaf && <div>NAF {info.codeNaf}{info.libelleNaf ? ` — ${info.libelleNaf}` : ""}</div>}
          {info.dateCreation && <div>Créée le {fmtDate(info.dateCreation)}</div>}
          {info.tva && <div>TVA intracommunautaire : {info.tva}</div>}
        </div>
      )}
    </div>
  );
}
