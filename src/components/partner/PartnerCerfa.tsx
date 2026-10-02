"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import PartnerDocuments from "@/components/partner/PartnerDocuments";
import {
  CERFA_REQUEST_SELECT,
  CERFA_STATUS_LABEL,
  CERFA_STATUS_STYLE,
  cerfaDocNames,
  fmtEuro,
  openCerfa,
  type CerfaRequestRow,
  type CerfaStatus,
} from "@/lib/cerfa";

const fmtDay = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });

/** Onglet "Mes documents" d'un partenaire : le bloc "Mes Cerfa" (demande + historique) au-dessus du
 * porte-documents. Le partenaire coche des documents du porte-documents, saisit la valeur totale du don, puis
 * demande un Cerfa ; un Cerfa émis ne peut que se télécharger. */
export default function PartnerCerfa({ partnerId }: { partnerId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [requests, setRequests] = useState<CerfaRequestRow[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const fetchRequests = () => supabase.from("cerfa_requests").select(CERFA_REQUEST_SELECT).eq("partner_id", partnerId).order("created_at", { ascending: false });
  function apply({ data, error }: Awaited<ReturnType<typeof fetchRequests>>) {
    if (error) return setMsg({ ok: false, text: "Chargement des demandes impossible : " + error.message + " (la migration 044 est-elle passée ?)" });
    setRequests((data ?? []) as unknown as CerfaRequestRow[]);
  }
  useEffect(() => {
    fetchRequests().then(apply);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partnerId]);

  // un document pris dans une demande non refusée est verrouillé ("En demande" / "Cerfa émis")
  const locked = useMemo(() => {
    const out: Record<string, CerfaStatus> = {};
    for (const r of requests) for (const d of r.cerfa_request_documents ?? []) if (d.active) out[d.document_id] = r.status;
    return out;
  }, [requests]);
  const picked = selected.filter((id) => !locked[id]);
  const amount = Number(value.replace(",", "."));
  const canSubmit = !busy && picked.length > 0 && Number.isFinite(amount) && amount > 0;

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }
  async function submit() {
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.rpc("create_cerfa_request", { p_partner_id: partnerId, p_document_ids: picked, p_total_value: amount });
    setBusy(false);
    if (error) return setMsg({ ok: false, text: error.message });
    setSelected([]);
    setValue("");
    setMsg({ ok: true, text: "Demande envoyée. Elle sera examinée par votre responsable d'antenne puis traitée par la comptabilité." });
    apply(await fetchRequests());
  }

  return (
    <div>
      <div className="mb-4 rounded-[18px] border border-[var(--border)] bg-[var(--card)] px-[22px] py-5 shadow-[var(--shadow)]">
        <h3 className="mb-[3px] font-display text-base font-extrabold">Mes Cerfa</h3>
        <p className="mb-3.5 text-[11.5px] leading-[1.5] text-[var(--slate)]">
          Cochez dans la liste ci-dessous les documents qui justifient vos dons, indiquez la valeur totale du don, puis demandez votre reçu fiscal. Un document ne peut servir que dans une seule demande.
        </p>

        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[210px]">
            <label className="mb-1 block text-[11px] font-bold tracking-[0.03em] text-[var(--slate)] uppercase">Valeur totale du don (€) *</label>
            <input
              inputMode="decimal"
              placeholder="Ex : 1250"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="w-full rounded-[11px] border-[1.5px] border-[var(--border)] bg-[var(--input-bg)] px-3 py-2.5 text-[13.5px] font-semibold text-[var(--navy)] outline-none focus:border-[var(--turquoise)]"
            />
          </div>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={submit}
            className="rounded-[40px] bg-[var(--navy-deep)] px-5 py-2.5 font-display text-[13.5px] font-bold text-[var(--panel-fg)] disabled:opacity-50"
          >
            {busy ? "Envoi…" : "Demander un Cerfa"}
          </button>
          <span className="pb-2.5 text-[12px] font-semibold text-[var(--slate)]">
            {picked.length} document{picked.length > 1 ? "s" : ""} sélectionné{picked.length > 1 ? "s" : ""}
          </span>
        </div>

        {msg && (
          <div className={`mt-3 rounded-xl px-3.5 py-2.5 text-[12.5px] font-semibold ${msg.ok ? "bg-[var(--good-bg)] text-[var(--good)]" : "bg-[var(--critical-bg)] text-[var(--critical)]"}`}>{msg.text}</div>
        )}

        <h4 className="mt-5 mb-2 font-display text-[13.5px] font-extrabold">Historique de mes demandes</h4>
        {requests.length === 0 ? (
          <p className="text-[11.5px] text-[var(--slate)]">Aucune demande pour l&apos;instant.</p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {requests.map((r) => {
              const st = CERFA_STATUS_STYLE[r.status];
              const names = cerfaDocNames(r);
              return (
                <div key={r.id} className="rounded-xl border border-[var(--border)] bg-[var(--input-bg)] px-3.5 py-3">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="text-[13px] font-bold text-[var(--navy)]">{fmtEuro(r.total_value)}</span>
                    <span className="text-[11.5px] text-[var(--slate)]">demandé le {fmtDay(r.created_at)}</span>
                    <span className="flex-1" />
                    <span className="rounded-[40px] px-2.5 py-1 text-[10.5px] font-bold uppercase" style={{ background: st.bg, color: st.fg }}>{CERFA_STATUS_LABEL[r.status]}</span>
                  </div>
                  <div className="mt-1 truncate text-[11.5px] text-[var(--slate)]" title={names.join(", ")}>
                    {names.length} document{names.length > 1 ? "s" : ""} : {names.join(", ")}
                  </div>
                  {r.status === "refusee" && (
                    <div className="mt-2 rounded-lg bg-[var(--critical-bg)] px-3 py-2 text-[12px] text-[var(--critical)]">
                      <strong>Motif du refus :</strong> {r.refusal_comment}
                      <div className="mt-0.5 text-[11px] opacity-80">Les documents de cette demande sont de nouveau sélectionnables.</div>
                    </div>
                  )}
                  {r.status === "emise" && r.cerfa_path && (
                    <button
                      type="button"
                      onClick={() => openCerfa(supabase, r.cerfa_path!).catch((e) => setMsg({ ok: false, text: (e as Error).message }))}
                      className="mt-2 rounded-[40px] border-[1.5px] border-[var(--good)] px-3.5 py-1.5 text-[12px] font-bold text-[var(--good)] hover:bg-[var(--good-bg)]"
                    >
                      Télécharger le Cerfa{r.cerfa_name ? ` (${r.cerfa_name})` : ""}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <PartnerDocuments partnerId={partnerId} role="partenaire" cerfa={{ selected: picked, locked, onToggle: toggle }} />
    </div>
  );
}
