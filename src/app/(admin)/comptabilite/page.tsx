"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useCity } from "@/components/admin/CityContext";
import { isSuper } from "@/lib/roles";
import { openDocument } from "@/lib/documents";
import { CERFA_STATUS_LABEL, CERFA_STATUS_STYLE, fmtEuro, openCerfa, type CerfaStatus } from "@/lib/cerfa";

type Rel<T> = T | T[] | null;
type Row = {
  id: string;
  partner_id: string;
  city_id: string;
  total_value: number | string;
  status: CerfaStatus;
  refusal_comment: string | null;
  created_at: string;
  issued_at: string | null;
  cerfa_path: string | null;
  cerfa_name: string | null;
  partners: Rel<{ name: string }>;
  cities: Rel<{ name: string }>;
  cerfa_request_documents: { document_id: string; documents: Rel<{ name: string; storage_path: string }> }[] | null;
};
const SELECT = "id,partner_id,city_id,total_value,status,refusal_comment,created_at,issued_at,cerfa_path,cerfa_name,partners(name),cities(name),cerfa_request_documents(document_id,documents(name,storage_path))";

const first = <T,>(v: Rel<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);
const fmtDay = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

type StatusFilter = "actives" | "soumise" | "validee" | "emise" | "refusee" | "all";
const FILTERS: [StatusFilter, string][] = [
  ["actives", "En cours"],
  ["soumise", "À valider"],
  ["validee", "À traiter"],
  ["emise", "Émises"],
  ["refusee", "Refusées"],
  ["all", "Toutes"],
];

function Counter({ label, value, sub, onClick, active }: { label: string; value: number; sub: string; onClick?: () => void; active?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl border bg-[var(--card)] px-[18px] py-4 text-left shadow-[var(--shadow)] ${active ? "border-[var(--navy-deep)]" : "border-[var(--border)]"}`}
    >
      <span className="mb-1.5 block text-[11px] font-bold tracking-[0.03em] text-[var(--slate)] uppercase">{label}</span>
      <span className="font-display text-[28px] font-black tabular-nums">{value}</span>
      <div className="mt-1 text-[11.5px] text-[var(--slate)]">{sub}</div>
    </button>
  );
}

const selectCls = "rounded-[11px] border-[1.5px] border-[var(--border)] bg-[var(--card)] px-3 py-2 text-[12.5px] font-semibold text-[var(--navy)] outline-none focus:border-[var(--turquoise)]";

/** Accueil de la Comptabilité (et file "à valider" du Responsable d'antenne) : les demandes de Cerfa fonctionnent
 * comme des tickets — compteurs, file filtrable, validation / refus avec commentaire, téléversement du Cerfa. */
export default function ComptabilitePage() {
  const supabase = useMemo(() => createClient(), []);
  const { ready, role } = useCity();
  const canIssue = isSuper(role);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [status, setStatus] = useState<StatusFilter>("actives");
  const [cityId, setCityId] = useState("");
  const [partnerId, setPartnerId] = useState("");
  const [refusing, setRefusing] = useState<{ id: string; comment: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const uploadFor = useRef<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const fetchRows = () => supabase.from("cerfa_requests").select(SELECT).order("created_at", { ascending: false }).limit(2000);
  function apply({ data, error }: Awaited<ReturnType<typeof fetchRows>>) {
    if (error) setMsg({ ok: false, text: "Chargement impossible : " + error.message + " (la migration 044 est-elle passée ?)" });
    else setRows((data ?? []) as unknown as Row[]);
    setLoading(false);
  }
  useEffect(() => {
    fetchRows().then(apply);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
  const toValidate = rows.filter((r) => r.status === "soumise").length;
  const toProcess = rows.filter((r) => r.status === "validee").length;
  const issuedThisMonth = rows.filter((r) => r.status === "emise" && (r.issued_at ?? "") >= monthStart).length;

  const cities = useMemo(() => Array.from(new Map(rows.map((r) => [r.city_id, first(r.cities)?.name ?? "Ville"])).entries()).sort((a, b) => a[1].localeCompare(b[1])), [rows]);
  const partners = useMemo(
    () => Array.from(new Map(rows.filter((r) => !cityId || r.city_id === cityId).map((r) => [r.partner_id, first(r.partners)?.name ?? "Partenaire"])).entries()).sort((a, b) => norm(a[1]).localeCompare(norm(b[1]))),
    [rows, cityId],
  );

  const visible = rows
    .filter((r) => (status === "all" ? true : status === "actives" ? r.status === "soumise" || r.status === "validee" : r.status === status))
    .filter((r) => !cityId || r.city_id === cityId)
    .filter((r) => !partnerId || r.partner_id === partnerId)
    .sort((a, b) => {
      const aa = a.status === "soumise" || a.status === "validee";
      const bb = b.status === "soumise" || b.status === "validee";
      if (aa !== bb) return aa ? -1 : 1; // en cours d'abord, la plus ancienne en premier ; le reste du plus récent au plus ancien
      return aa ? a.created_at.localeCompare(b.created_at) : b.created_at.localeCompare(a.created_at);
    });
  const lastIssued = rows.filter((r) => r.status === "emise").sort((a, b) => (b.issued_at ?? "").localeCompare(a.issued_at ?? "")).slice(0, 10);

  async function review(id: string, decision: "validee" | "refusee", comment?: string) {
    setBusyId(id);
    setMsg(null);
    const { error } = await supabase.rpc("review_cerfa_request", { p_id: id, p_decision: decision, p_comment: comment ?? null });
    setBusyId(null);
    if (error) return setMsg({ ok: false, text: error.message });
    setRefusing(null);
    setMsg({ ok: true, text: decision === "validee" ? "Demande validée : elle est maintenant à traiter par la comptabilité." : "Demande refusée : le partenaire verra votre commentaire." });
    apply(await fetchRows());
  }

  async function issue(row: Row, file: File) {
    if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") return setMsg({ ok: false, text: "Le Cerfa doit être un fichier PDF." });
    if (file.size > 15 * 1024 * 1024) return setMsg({ ok: false, text: "Fichier trop lourd (15 Mo maximum)." });
    setBusyId(row.id);
    setMsg(null);
    const path = `${row.partner_id}/${row.id}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const up = await supabase.storage.from("cerfa").upload(path, file, { contentType: "application/pdf" });
    if (up.error) {
      setBusyId(null);
      return setMsg({ ok: false, text: "Envoi du fichier impossible : " + up.error.message });
    }
    const { error } = await supabase.rpc("issue_cerfa_request", { p_id: row.id, p_path: path, p_name: file.name });
    setBusyId(null);
    if (error) {
      await supabase.storage.from("cerfa").remove([path]);
      return setMsg({ ok: false, text: error.message });
    }
    setMsg({ ok: true, text: "Cerfa téléversé : le partenaire le retrouve dans « Mes Cerfa »." });
    apply(await fetchRows());
  }

  const fail = (e: unknown) => setMsg({ ok: false, text: (e as Error).message });

  if (!ready) return <div className="py-10 text-center text-[13px] text-[var(--slate)]">Chargement…</div>;

  return (
    <div>
      <div className="mb-4">
        <h1 className="font-display text-[32px] leading-none font-black">{canIssue ? "Suivi des Cerfa" : "Cerfa à valider"}</h1>
        <p className="mt-1 text-[13.5px] text-[var(--slate)]">
          {canIssue ? "Reçus fiscaux demandés par les partenaires donateurs : validation, émission et archivage." : "Valide ou refuse les demandes de reçu fiscal des partenaires de ton antenne."}
        </p>
      </div>

      <div className={`mb-5 grid grid-cols-1 gap-3.5 sm:grid-cols-2 ${canIssue ? "lg:grid-cols-3" : "lg:grid-cols-2"}`}>
        <Counter label="À valider" value={toValidate} sub="en attente du responsable d'antenne" onClick={() => setStatus("soumise")} active={status === "soumise"} />
        {canIssue && <Counter label="À traiter" value={toProcess} sub="validées, Cerfa à émettre" onClick={() => setStatus("validee")} active={status === "validee"} />}
        <Counter label="Émis ce mois-ci" value={issuedThisMonth} sub="Cerfa téléversés" onClick={() => setStatus("emise")} active={status === "emise"} />
      </div>

      <div className="mb-3.5 flex flex-wrap items-center gap-2.5">
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map(([k, l]) => (
            <button
              key={k}
              type="button"
              onClick={() => setStatus(k)}
              className="rounded-[40px] border-[1.5px] px-3.5 py-1.5 text-[12.5px] font-bold whitespace-nowrap"
              style={{ borderColor: status === k ? "var(--navy-deep)" : "var(--border)", background: status === k ? "var(--navy-deep)" : "var(--card)", color: status === k ? "var(--panel-fg)" : "var(--slate)" }}
            >
              {l}
            </button>
          ))}
        </div>
        <span className="flex-1" />
        {cities.length > 1 && (
          <select className={selectCls} value={cityId} onChange={(e) => { setCityId(e.target.value); setPartnerId(""); }}>
            <option value="">Toutes les antennes</option>
            {cities.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        )}
        <select className={selectCls} value={partnerId} onChange={(e) => setPartnerId(e.target.value)}>
          <option value="">Tous les partenaires</option>
          {partners.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
      </div>

      {msg && <div className={`mb-3.5 rounded-xl px-3.5 py-2.5 text-[12.5px] font-semibold ${msg.ok ? "bg-[var(--good-bg)] text-[var(--good)]" : "bg-[var(--critical-bg)] text-[var(--critical)]"}`}>{msg.text}</div>}

      <input
        ref={fileInput}
        type="file"
        accept=".pdf,application/pdf"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          const row = rows.find((r) => r.id === uploadFor.current);
          if (f && row) issue(row, f);
        }}
      />

      {loading ? (
        <p className="py-8 text-center text-[13px] text-[var(--slate)]">Chargement…</p>
      ) : visible.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--card)] px-4 py-8 text-center text-[13px] text-[var(--slate)]">Aucune demande pour ces filtres.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {visible.map((r) => {
            const st = CERFA_STATUS_STYLE[r.status];
            const docs = (r.cerfa_request_documents ?? []).map((d) => first(d.documents)).filter((d): d is { name: string; storage_path: string } => !!d);
            const busy = busyId === r.id;
            return (
              <div key={r.id} className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-[var(--shadow)]" style={{ borderLeft: `4px solid ${st.fg}` }}>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <span className="font-display text-[16px] font-black text-[var(--navy)]">{first(r.partners)?.name ?? "Partenaire"}</span>
                  <span className="text-[12px] font-semibold text-[var(--slate)]">{first(r.cities)?.name ?? ""}</span>
                  <span className="text-[12px] text-[var(--slate)]">demandé le {fmtDay(r.created_at)}</span>
                  <span className="flex-1" />
                  <span className="font-display text-[16px] font-black text-[var(--navy)]">{fmtEuro(r.total_value)}</span>
                  <span className="rounded-[40px] px-2.5 py-1 text-[10.5px] font-bold uppercase" style={{ background: st.bg, color: st.fg }}>{CERFA_STATUS_LABEL[r.status]}</span>
                </div>

                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {docs.map((d, i) => (
                    <button key={i} type="button" onClick={() => openDocument(supabase, d.storage_path).catch(fail)} title="Consulter / télécharger" className="max-w-[260px] truncate rounded-[40px] border-[1.5px] border-[var(--border)] bg-[var(--input-bg)] px-3 py-1 text-[11.5px] font-semibold text-[var(--navy)] hover:border-[var(--turquoise)] hover:text-[var(--turquoise)]">
                      📎 {d.name}
                    </button>
                  ))}
                </div>

                {r.status === "refusee" && r.refusal_comment && (
                  <div className="mt-2.5 rounded-lg bg-[var(--critical-bg)] px-3 py-2 text-[12px] text-[var(--critical)]"><strong>Motif du refus :</strong> {r.refusal_comment}</div>
                )}

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {r.status === "soumise" && (
                    <>
                      <button type="button" disabled={busy} onClick={() => review(r.id, "validee")} className="rounded-[40px] bg-[var(--navy-deep)] px-4 py-2 font-display text-[12.5px] font-bold text-[var(--panel-fg)] disabled:opacity-50">Valider</button>
                      <button type="button" disabled={busy} onClick={() => setRefusing(refusing?.id === r.id ? null : { id: r.id, comment: "" })} className="rounded-[40px] border-[1.5px] border-[var(--critical)] px-4 py-2 font-display text-[12.5px] font-bold text-[var(--critical)] disabled:opacity-50">Refuser</button>
                    </>
                  )}
                  {r.status === "validee" && canIssue && (
                    <button type="button" disabled={busy} onClick={() => { uploadFor.current = r.id; fileInput.current?.click(); }} className="rounded-[40px] bg-[var(--navy-deep)] px-4 py-2 font-display text-[12.5px] font-bold text-[var(--panel-fg)] disabled:opacity-50">
                      {busy ? "Envoi…" : "Téléverser le Cerfa"}
                    </button>
                  )}
                  {r.status === "validee" && !canIssue && <span className="text-[12px] text-[var(--slate)]">Validée — en attente d&apos;émission par la comptabilité.</span>}
                  {r.status === "emise" && r.cerfa_path && (
                    <button type="button" onClick={() => openCerfa(supabase, r.cerfa_path!).catch(fail)} className="rounded-[40px] border-[1.5px] border-[var(--good)] px-4 py-2 font-display text-[12.5px] font-bold text-[var(--good)] hover:bg-[var(--good-bg)]">Télécharger le Cerfa</button>
                  )}
                </div>

                {refusing?.id === r.id && (
                  <div className="mt-3 border-t border-dashed border-[var(--border)] pt-3">
                    <label className="mb-1 block text-[11px] font-bold tracking-[0.03em] text-[var(--slate)] uppercase">Motif du refus (obligatoire, visible par le partenaire)</label>
                    <textarea
                      rows={2}
                      value={refusing.comment}
                      onChange={(e) => setRefusing({ id: r.id, comment: e.target.value })}
                      className="w-full rounded-[13px] border-[1.5px] border-[var(--border)] bg-[var(--input-bg)] px-3.5 py-2.5 text-[13px] font-medium text-[var(--navy)] outline-none focus:border-[var(--turquoise)]"
                    />
                    <div className="mt-2 flex gap-2">
                      <button type="button" disabled={busy || !refusing.comment.trim()} onClick={() => review(r.id, "refusee", refusing.comment)} className="rounded-[40px] bg-[var(--critical)] px-4 py-2 font-display text-[12.5px] font-bold text-white disabled:opacity-50">Confirmer le refus</button>
                      <button type="button" onClick={() => setRefusing(null)} className="rounded-[40px] border-[1.5px] border-[var(--border)] px-4 py-2 font-display text-[12.5px] font-bold text-[var(--slate)]">Annuler</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-9 mb-3.5 flex items-center gap-3.5">
        <h2 className="font-display text-[20px] font-black whitespace-nowrap text-[var(--navy)]">Derniers Cerfa émis</h2>
        <span className="h-px flex-1 bg-[var(--border)]" />
      </div>
      {lastIssued.length === 0 ? (
        <p className="text-[12.5px] text-[var(--slate)]">Aucun Cerfa émis pour l&apos;instant.</p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)]">
          {lastIssued.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-[var(--border)] px-4 py-3 last:border-b-0">
              <span className="min-w-[160px] flex-1 text-[13px] font-bold text-[var(--navy)]">{first(r.partners)?.name ?? "Partenaire"}</span>
              <span className="text-[12px] text-[var(--slate)]">{first(r.cities)?.name ?? ""}</span>
              <span className="text-[12px] text-[var(--slate)]">émis le {r.issued_at ? fmtDay(r.issued_at) : "—"}</span>
              <span className="text-[13px] font-bold text-[var(--navy)]">{fmtEuro(r.total_value)}</span>
              {r.cerfa_path && (
                <button type="button" onClick={() => openCerfa(supabase, r.cerfa_path!).catch(fail)} className="rounded-[40px] border-[1.5px] border-[var(--good)] px-3.5 py-1.5 text-[12px] font-bold text-[var(--good)] hover:bg-[var(--good-bg)]">Télécharger</button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
