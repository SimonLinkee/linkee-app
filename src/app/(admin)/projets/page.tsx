"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import { useCity } from "@/components/admin/CityContext";
import { isSuper } from "@/lib/roles";

// Projets : suivi des appels à projets (AAP), liste nationale. Migration 070.
// Tableau de suivi (5 colonnes + boutons de dossier) ; un clic sur une ligne ouvre la fiche complète et le porte-documents.
// Modifier : Superadmin et Comptabilité. Le Responsable d'antenne lit les AAP de sa ville (la base le garantit).

type Aap = {
  id: string;
  name: string;
  funder: string | null;
  funder_type: "public" | "prive" | "mecenat" | null;
  antenne: string;
  aap_url: string | null;
  deadline: string | null;
  response_date: string | null;
  period: string | null;
  max_amount: number | null;
  requested_amount: number | null;
  obtained_amount: number | null;
  cofunding: string | null;
  status: string;
  go_status: "a_decider" | "go" | "no_go";
  go_reason: string | null;
  owner: string | null;
  next_action: string | null;
  next_action_date: string | null;
  missing_docs: string | null;
  application_url: string | null;
  instruction_doc_id: string | null;
  payment_info: string | null;
  report_due: string | null;
  report_date: string | null;
  funder_contact: string | null;
  notes: string | null;
};
type Doc = { id: string; project_id: string; name: string; storage_path: string; size_bytes: number | null; created_at: string };

const COLS = "id,name,funder,funder_type,antenne,aap_url,deadline,response_date,period,max_amount,requested_amount,obtained_amount,cofunding,status,go_status,go_reason,owner,next_action,next_action_date,missing_docs,application_url,instruction_doc_id,payment_info,report_due,report_date,funder_contact,notes";
const STATUS: { k: string; label: string; bg: string; fg: string }[] = [
  { k: "repere", label: "Repéré", bg: "var(--track)", fg: "var(--slate)" },
  { k: "etude", label: "À l'étude", bg: "rgba(42,120,214,0.14)", fg: "#2a78d6" },
  { k: "redaction", label: "En rédaction", bg: "rgba(124,92,217,0.16)", fg: "#7C5CD9" },
  { k: "depose", label: "Déposé", bg: "var(--warn-bg)", fg: "var(--warn)" },
  { k: "accepte", label: "Accepté", bg: "var(--good-bg)", fg: "var(--good)" },
  { k: "refuse", label: "Refusé", bg: "var(--critical-bg)", fg: "var(--critical)" },
  { k: "abandon", label: "Abandonné", bg: "var(--critical-bg)", fg: "var(--critical)" },
];
const statusOf = (k: string) => STATUS.find((s) => s.k === k) ?? STATUS[0];
const TYPES: { k: NonNullable<Aap["funder_type"]>; label: string }[] = [{ k: "public", label: "Public" }, { k: "prive", label: "Privé" }, { k: "mecenat", label: "Mécénat" }];
const ANTENNES = ["Montpellier", "Lyon", "Les deux", "Linkee France"];
const GO: { k: Aap["go_status"]; label: string }[] = [{ k: "a_decider", label: "À décider" }, { k: "go", label: "Go" }, { k: "no_go", label: "No go" }];
const OWNERS = ["Simon", "Martin", "Paco"];
const SOON_DAYS = 15;
const ROW_GRID = "grid grid-cols-[minmax(0,1.5fr)_130px_110px_150px_minmax(0,1.2fr)_210px] items-center gap-3";

const fieldCls = "w-full rounded-[10px] border-[1.5px] border-[var(--border)] bg-[var(--input-bg)] px-2.5 py-2 text-[13px] font-medium text-[var(--navy)] outline-none focus:border-[var(--turquoise)] disabled:opacity-70";
const labelCls = "mb-1 block text-[11.5px] font-semibold text-[var(--slate)]";
const selCls = "rounded-[40px] border border-[var(--border)] bg-[var(--card)] px-3 py-[8px] text-[12.5px] font-semibold text-[var(--slate)]";

const isoOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const fmtDate = (iso: string | null) => (iso ? new Date(iso + "T00:00:00").toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—");
const fmtEur = (n: number | null) => (n === null || n === undefined ? "—" : `${Number(n).toLocaleString("fr-FR", { maximumFractionDigits: 0 })} €`);
const fmtSize = (b: number | null) => (b === null ? "" : b > 1048576 ? `${(b / 1048576).toFixed(1).replace(".", ",")} Mo` : `${Math.max(1, Math.round(b / 1024))} Ko`);
function safeLink(raw: string | null): string | null {
  const t = (raw ?? "").trim();
  if (!t) return null;
  const withProto = /^https?:\/\//i.test(t) ? t : /^[\w-]+(\.[\w-]+)+/.test(t) ? `https://${t}` : "";
  try {
    const u = new URL(withProto);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}
const num = (v: string) => (v.trim() === "" ? null : Number(v));

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
      <h3 className="mb-3 text-[13.5px] font-bold text-[var(--navy)]">{title}</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>
    </section>
  );
}
function Field({ label, wide, children }: { label: string; wide?: boolean; children: ReactNode }) {
  return (
    <div className={wide ? "sm:col-span-2" : ""}>
      <label className={labelCls}>{label}</label>
      {children}
    </div>
  );
}

export default function ProjetsPage() {
  const supabase = useMemo(() => createClient(), []);
  const { role } = useCity();
  const canEdit = isSuper(role);
  const [rows, setRows] = useState<Aap[]>([]);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [fType, setFType] = useState("");
  const [fAntenne, setFAntenne] = useState("");
  const [sortKey, setSortKey] = useState<"name" | "deadline" | "requested_amount" | "status" | "next_action_date">("deadline");
  const [sortDir, setSortDir] = useState<1 | -1>(1);
  const [selId, setSelId] = useState<string | null>(null);
  const [nowMs] = useState(() => Date.now());
  const today = isoOf(new Date(nowMs));
  const timers = useRef<Record<string, number>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    const [p, d] = await Promise.all([
      supabase.from("aap_projects").select(COLS).order("deadline", { ascending: true, nullsFirst: false }),
      supabase.from("aap_documents").select("id,project_id,name,storage_path,size_bytes,created_at").order("created_at"),
    ]);
    if (p.error) setErr(p.error.message + " (la migration 070 est-elle passée ?)");
    setRows((p.data ?? []) as unknown as Aap[]);
    setDocs((d.data ?? []) as unknown as Doc[]);
    setLoading(false);
  }
  useEffect(() => {
    const t = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const closed = (r: Aap) => ["accepte", "refuse", "abandon"].includes(r.status);
  const group = (r: Aap) => (closed(r) ? 2 : r.status === "depose" ? 1 : 0);
  const daysTo = (iso: string) => Math.round((new Date(iso + "T00:00:00").getTime() - new Date(today + "T00:00:00").getTime()) / 86400000);
  const q = search.trim().toLowerCase();
  const list = rows
    .filter((r) => (!fStatus || r.status === fStatus) && (!fType || r.funder_type === fType) && (!fAntenne || r.antenne === fAntenne) && (!q || `${r.name} ${r.funder ?? ""}`.toLowerCase().includes(q)))
    .sort((a, b) => {
      if (group(a) !== group(b)) return group(a) - group(b);
      const val = (r: Aap): string | number | null => (sortKey === "status" ? STATUS.findIndex((s) => s.k === r.status) : sortKey === "name" ? r.name.toLowerCase() : r[sortKey]);
      const x = val(a), y = val(b);
      if (x === null || x === "") return 1;
      if (y === null || y === "") return -1;
      return (x > y ? 1 : x < y ? -1 : 0) * sortDir;
    });
  const active = rows.filter((r) => !closed(r));
  const nextDue = active.filter((r) => r.status !== "depose" && r.deadline && r.deadline >= today).sort((a, b) => (a.deadline! > b.deadline! ? 1 : -1))[0];
  const cur = rows.find((r) => r.id === selId) ?? null;
  const myDocs = docs.filter((d) => d.project_id === selId);
  const owners = Array.from(new Set([...OWNERS, ...rows.map((r) => r.owner ?? "").filter(Boolean)]));

  function sortBy(k: typeof sortKey) {
    if (sortKey === k) setSortDir((d) => (d === 1 ? -1 : 1));
    else {
      setSortKey(k);
      setSortDir(1);
    }
  }
  function patch(id: string, p: Partial<Aap>, immediate = false) {
    if (!canEdit) return;
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...p } : r)));
    window.clearTimeout(timers.current[id]);
    const run = async () => {
      const { error } = await supabase.from("aap_projects").update({ ...p, updated_at: new Date().toISOString() }).eq("id", id);
      if (error) return setErr("Enregistrement impossible : " + error.message);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1500);
    };
    if (immediate) void run();
    else timers.current[id] = window.setTimeout(run, 600);
  }
  async function create() {
    if (!canEdit) return;
    const { data: auth } = await supabase.auth.getUser();
    const { data, error } = await supabase.from("aap_projects").insert({ name: "Nouvel appel à projets", antenne: "Linkee France", created_by: auth.user?.id ?? null }).select(COLS).single();
    if (error || !data) return setErr("Création impossible : " + (error?.message ?? "erreur"));
    setRows((prev) => [...prev, data as unknown as Aap]);
    setFStatus("");
    setFType("");
    setFAntenne("");
    setSearch("");
    setSelId((data as { id: string }).id);
  }
  async function remove(r: Aap) {
    if (!window.confirm(`Supprimer « ${r.name} », sa fiche et ses documents ? Cette action est définitive.\n\nPour garder une trace, passe plutôt l'AAP en « Abandonné ».`)) return;
    window.clearTimeout(timers.current[r.id]);
    const paths = docs.filter((d) => d.project_id === r.id).map((d) => d.storage_path);
    const { data, error } = await supabase.from("aap_projects").delete().eq("id", r.id).select("id");
    if (error || !data?.length) return setErr("Suppression impossible : " + (error?.message ?? "droits insuffisants"));
    if (paths.length) await supabase.storage.from("project-docs").remove(paths);
    setRows((prev) => prev.filter((x) => x.id !== r.id));
    setDocs((prev) => prev.filter((d) => d.project_id !== r.id));
    setSelId(null);
  }
  async function openStored(path: string) {
    const w = window.open("", "_blank");
    const { data, error } = await supabase.storage.from("project-docs").createSignedUrl(path, 300);
    if (error || !data) {
      w?.close();
      return setErr("Ouverture impossible : " + (error?.message ?? "fichier introuvable"));
    }
    if (w) w.location.assign(data.signedUrl);
    else window.open(data.signedUrl, "_blank");
  }
  function openCandidature(r: Aap) {
    const u = safeLink(r.application_url);
    if (!u) return setErr("Le lien du dossier de candidature n'est pas valide.");
    window.open(u, "_blank", "noopener,noreferrer");
  }
  function openInstruction(r: Aap) {
    const d = docs.find((x) => x.id === r.instruction_doc_id);
    if (d) void openStored(d.storage_path);
  }
  async function upload(files: FileList | null, projectId: string) {
    if (!files?.length || !canEdit) return;
    setBusy(true);
    const { data: auth } = await supabase.auth.getUser();
    for (const file of Array.from(files)) {
      const path = `${projectId}/${Date.now()}-${file.name.replace(/[^\w.\-]+/g, "_")}`;
      const up = await supabase.storage.from("project-docs").upload(path, file, { contentType: file.type || undefined });
      if (up.error) {
        setErr("Envoi du fichier impossible : " + up.error.message);
        continue;
      }
      const ins = await supabase.from("aap_documents").insert({ project_id: projectId, name: file.name, storage_path: path, mime: file.type || null, size_bytes: file.size, uploaded_by: auth.user?.id ?? null }).select("id,project_id,name,storage_path,size_bytes,created_at").single();
      if (ins.error || !ins.data) {
        await supabase.storage.from("project-docs").remove([path]);
        setErr("Document non enregistré : " + (ins.error?.message ?? "erreur"));
        continue;
      }
      setDocs((prev) => [...prev, ins.data as unknown as Doc]);
    }
    if (fileRef.current) fileRef.current.value = "";
    setBusy(false);
  }
  async function removeDoc(d: Doc) {
    if (!window.confirm(`Supprimer le document « ${d.name} » ?`)) return;
    const { data, error } = await supabase.from("aap_documents").delete().eq("id", d.id).select("id");
    if (error || !data?.length) return setErr("Suppression impossible : " + (error?.message ?? "refusée par la base"));
    await supabase.storage.from("project-docs").remove([d.storage_path]);
    setDocs((prev) => prev.filter((x) => x.id !== d.id));
    setRows((prev) => prev.map((r) => (r.instruction_doc_id === d.id ? { ...r, instruction_doc_id: null } : r)));
  }

  const deadlineCell = (r: Aap) => {
    if (!r.deadline) return <span className="text-[var(--muted)]">—</span>;
    if (closed(r) || r.status === "depose") return <span className="text-[12.5px] text-[var(--navy)]">{fmtDate(r.deadline)}<span className="block text-[11px] text-[var(--slate)]">{r.status === "depose" ? "déposé" : "clos"}</span></span>;
    const n = daysTo(r.deadline);
    const cls = n < 0 ? "text-[var(--critical)]" : n <= SOON_DAYS ? "text-[var(--warn)]" : "text-[var(--navy)]";
    return <span className={`text-[12.5px] font-semibold ${cls}`}>{fmtDate(r.deadline)}<span className="block text-[11px] font-semibold">{n < 0 ? `dépassée de ${-n} j` : n === 0 ? "aujourd'hui" : `dans ${n} j`}</span></span>;
  };
  const th = (k: typeof sortKey, label: string) => (
    <button type="button" onClick={() => sortBy(k)} className="flex items-center gap-1 text-left text-[11px] font-bold tracking-[0.03em] text-[var(--muted)] uppercase hover:text-[var(--navy)]">
      {label}
      <span className="text-[10px]">{sortKey === k ? (sortDir === 1 ? "▲" : "▼") : ""}</span>
    </button>
  );

  function fiche(r: Aap) {
    const dis = !canEdit;
    const doc = (k: keyof Aap) => (r[k] as string | null) ?? "";
    const inp = (k: keyof Aap, ph?: string, type = "text") => (
      <input disabled={dis} type={type} className={fieldCls} value={doc(k)} placeholder={ph} onChange={(e) => patch(r.id, { [k]: type === "date" ? e.target.value || null : e.target.value } as Partial<Aap>)} />
    );
    const money = (k: "max_amount" | "requested_amount" | "obtained_amount") => (
      <input disabled={dis} type="number" min={0} className={fieldCls} value={r[k] ?? ""} onChange={(e) => patch(r.id, { [k]: num(e.target.value) } as Partial<Aap>)} />
    );
    return (
      <>
        <Section title="Identification">
          <Field label="Nom de l'AAP" wide>{inp("name")}</Field>
          <Field label="Financeur (fondation, collectivité, État, entreprise…)">{inp("funder")}</Field>
          <Field label="Type de financeur">
            <select disabled={dis} className={fieldCls} value={r.funder_type ?? ""} onChange={(e) => patch(r.id, { funder_type: (e.target.value || null) as Aap["funder_type"] }, true)}>
              <option value="">Non précisé</option>
              {TYPES.map((t) => <option key={t.k} value={t.k}>{t.label}</option>)}
            </select>
          </Field>
          <Field label="Antenne concernée">
            <select disabled={dis} className={fieldCls} value={r.antenne} onChange={(e) => patch(r.id, { antenne: e.target.value }, true)}>{ANTENNES.map((a) => <option key={a}>{a}</option>)}</select>
          </Field>
          <Field label="Lien vers la page de l'AAP">
            <div className="flex gap-2">
              {inp("aap_url", "https://…")}
              {safeLink(r.aap_url) && <a href={safeLink(r.aap_url)!} target="_blank" rel="noopener noreferrer" className="flex-none rounded-[10px] border-[1.5px] border-[var(--border)] px-3 py-2 text-[12.5px] font-semibold text-[var(--turquoise)]">Ouvrir</a>}
            </div>
          </Field>
        </Section>
        <Section title="Calendrier">
          <Field label="Date limite de dépôt">{inp("deadline", undefined, "date")}</Field>
          <Field label="Date de réponse attendue">{inp("response_date", undefined, "date")}</Field>
          <Field label="Période financée" wide>{inp("period", "Ex : 2027 ou sept. 2026 – août 2027")}</Field>
        </Section>
        <Section title="Argent">
          <Field label="Montant max possible (€)">{money("max_amount")}</Field>
          <Field label="Montant demandé (€)">{money("requested_amount")}</Field>
          <Field label="Montant obtenu (€)">{money("obtained_amount")}</Field>
          <Field label="Cofinancement exigé ? (oui ou non, avec le %)">{inp("cofunding", "Ex : oui, 20 %")}</Field>
        </Section>
        <Section title="Suivi">
          <Field label="Statut">
            <select disabled={dis} className={fieldCls} value={r.status} onChange={(e) => patch(r.id, { status: e.target.value }, true)}>{STATUS.map((s) => <option key={s.k} value={s.k}>{s.label}</option>)}</select>
          </Field>
          <Field label="Responsable">
            <input disabled={dis} list="aap-owners" className={fieldCls} value={doc("owner")} onChange={(e) => patch(r.id, { owner: e.target.value })} placeholder="Ex : Simon" />
          </Field>
          <Field label="Go / No go">
            <select disabled={dis} className={fieldCls} value={r.go_status} onChange={(e) => patch(r.id, { go_status: e.target.value as Aap["go_status"] }, true)}>{GO.map((g) => <option key={g.k} value={g.k}>{g.label}</option>)}</select>
          </Field>
          <Field label="Justification (éligibilité, effort vs montant)">{inp("go_reason")}</Field>
          <Field label="Prochaine action">{inp("next_action", "Ex : appeler la chargée de mission")}</Field>
          <Field label="Date de la prochaine action">{inp("next_action_date", undefined, "date")}</Field>
          <Field label="Pièces manquantes (statuts, bilan, RIB, budget prévisionnel…)" wide>
            <textarea disabled={dis} className={`${fieldCls} min-h-[56px] resize-y`} value={doc("missing_docs")} onChange={(e) => patch(r.id, { missing_docs: e.target.value })} />
          </Field>
        </Section>
        <Section title="Après décision">
          <Field label="Date de versement / échéancier" wide>{inp("payment_info")}</Field>
          <Field label="Bilan à rendre">{inp("report_due", "Ex : bilan d'utilisation des fonds")}</Field>
          <Field label="Date du bilan">{inp("report_date", undefined, "date")}</Field>
          <Field label="Contact chez le financeur" wide>{inp("funder_contact", "Nom, fonction, e-mail, téléphone")}</Field>
          <Field label="Notes / retours (motif de refus, conseils du chargé de mission)" wide>
            <textarea disabled={dis} className={`${fieldCls} min-h-[80px] resize-y`} value={doc("notes")} onChange={(e) => patch(r.id, { notes: e.target.value })} />
          </Field>
        </Section>
        <Section title="Dossiers de l'AAP">
          <Field label="Dossier de candidature (lien à coller ici)" wide>
            <div className="flex gap-2">
              {inp("application_url", "https://… (Drive, plateforme du financeur…)")}
              {safeLink(r.application_url) && <button type="button" onClick={() => openCandidature(r)} className="flex-none rounded-[10px] border-[1.5px] border-[var(--border)] px-3 py-2 text-[12.5px] font-semibold text-[var(--turquoise)]">Ouvrir</button>}
            </div>
          </Field>
          <Field label="Dossier d'instruction (à choisir parmi les documents ci-dessous)" wide>
            <select disabled={dis} className={fieldCls} value={r.instruction_doc_id ?? ""} onChange={(e) => patch(r.id, { instruction_doc_id: e.target.value || null }, true)}>
              <option value="">{myDocs.length ? "Aucun document choisi" : "Ajoutez d'abord un document ci-dessous"}</option>
              {myDocs.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </Field>
        </Section>
        <section className="mb-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
          <h3 className="mb-2 text-[13.5px] font-bold text-[var(--navy)]">Porte-documents</h3>
          {myDocs.length === 0 && <p className="text-[12.5px] text-[var(--slate)]">Aucun document pour ce dossier.</p>}
          {myDocs.map((d) => (
            <div key={d.id} className="flex items-center gap-2 border-t border-[var(--border)] py-2 first:border-t-0">
              <button type="button" onClick={() => openStored(d.storage_path)} className="min-w-0 flex-1 text-left">
                <span className="block truncate text-[13px] font-semibold text-[var(--navy)] hover:text-[var(--turquoise)]">{d.name}</span>
                <span className="block text-[11px] text-[var(--slate)]">{[fmtSize(d.size_bytes), `ajouté le ${fmtDate(d.created_at.slice(0, 10))}`].filter(Boolean).join(" · ")}</span>
              </button>
              {r.instruction_doc_id === d.id && <span className="flex-none rounded-[40px] bg-[var(--good-bg)] px-2 py-0.5 text-[11px] font-bold text-[var(--good)]">Dossier d&apos;instruction</span>}
              {canEdit && <button type="button" onClick={() => removeDoc(d)} title="Supprimer" className="h-7 w-7 flex-none rounded-full text-[var(--slate)] hover:bg-[var(--critical-bg)] hover:text-[var(--critical)]">×</button>}
            </div>
          ))}
          {canEdit && (
            <div className="mt-3">
              <input ref={fileRef} type="file" multiple hidden onChange={(e) => upload(e.target.files, r.id)} />
              <button type="button" disabled={busy} onClick={() => fileRef.current?.click()} className="rounded-[40px] border-[1.5px] border-[var(--border)] bg-[var(--card)] px-4 py-2 text-[13px] font-bold text-[var(--navy)] hover:border-[var(--turquoise)] disabled:opacity-50">{busy ? "Envoi…" : "+ Ajouter un document"}</button>
            </div>
          )}
        </section>
        {!canEdit && <p className="rounded-xl bg-[var(--track)] px-3 py-2 text-[12px] text-[var(--slate)]">Lecture seule : seuls le Superadmin et la Comptabilité modifient les AAP.</p>}
      </>
    );
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[32px] leading-none font-black">Projets</h1>
          <p className="mt-1 text-[13.5px] text-[var(--slate)]">Le suivi des appels à projets : où on en est, les échéances, les montants et la prochaine action de chaque dossier.</p>
        </div>
        {canEdit && <button type="button" onClick={create} className="rounded-[40px] bg-[var(--navy-deep)] px-[17px] py-[9px] font-display text-[13.5px] font-bold text-[var(--panel-fg)]">+ Nouvel AAP</button>}
      </div>
      <datalist id="aap-owners">{owners.map((o) => <option key={o} value={o} />)}</datalist>

      {err && (
        <div className="mb-3 flex items-start justify-between gap-3 rounded-xl bg-[var(--critical-bg)] px-3.5 py-2.5 text-[12.5px] font-semibold text-[var(--critical)]">
          <span>{err}</span>
          <button type="button" onClick={() => setErr(null)}>×</button>
        </div>
      )}

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Dossiers en cours", value: String(active.length), sub: "hors accepté, refusé, abandonné", color: "#7C5CD9" },
          { label: "Prochaine échéance", value: nextDue?.deadline ? `${daysTo(nextDue.deadline)} j` : "—", sub: nextDue ? nextDue.name : "aucune date à venir", color: "var(--warn)" },
          { label: "Montant demandé", value: fmtEur(active.reduce((s, r) => s + Number(r.requested_amount ?? 0), 0)), sub: "dossiers en cours", color: "#2a78d6" },
          { label: "Montant obtenu", value: fmtEur(rows.reduce((s, r) => s + Number(r.obtained_amount ?? 0), 0)), sub: "tous dossiers", color: "var(--good)" },
        ].map((k) => (
          <div key={k.label} className="rounded-2xl border border-[var(--border)] bg-[var(--card)] px-[18px] py-3.5 shadow-[var(--shadow)]" style={{ borderLeft: `4px solid ${k.color}` }}>
            <span className="block font-display text-[26px] leading-none font-black tabular-nums text-[var(--navy)]">{k.value}</span>
            <span className="mt-1 block text-[13px] font-bold text-[var(--navy)]">{k.label}</span>
            <span className="block truncate text-[11.5px] text-[var(--slate)]">{k.sub}</span>
          </div>
        ))}
      </div>

      <div className="rounded-[18px] border border-[var(--border)] bg-[var(--card)] p-3 shadow-[var(--shadow)]">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher un AAP ou un financeur" className={`${fieldCls} !w-auto min-w-[240px] flex-1`} />
          <select className={selCls} value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
            <option value="">Tous statuts</option>
            {STATUS.map((s) => <option key={s.k} value={s.k}>{s.label} ({rows.filter((r) => r.status === s.k).length})</option>)}
          </select>
          <select className={selCls} value={fType} onChange={(e) => setFType(e.target.value)}><option value="">Tous financeurs</option>{TYPES.map((t) => <option key={t.k} value={t.k}>{t.label}</option>)}</select>
          <select className={selCls} value={fAntenne} onChange={(e) => setFAntenne(e.target.value)}><option value="">Toutes antennes</option>{ANTENNES.map((a) => <option key={a}>{a}</option>)}</select>
          <span className="ml-auto text-[12px] text-[var(--slate)]">{list.length} AAP</span>
        </div>

        <div className="overflow-x-auto">
          <div className="min-w-[980px]">
            <div className={`${ROW_GRID} border-b border-[var(--border)] px-3 pb-2`}>
              {th("name", "AAP et financeur")}
              {th("deadline", "Date limite")}
              {th("requested_amount", "Demandé")}
              {th("status", "Statut")}
              {th("next_action_date", "Prochaine action")}
              <span className="text-[11px] font-bold tracking-[0.03em] text-[var(--muted)] uppercase">Dossiers</span>
            </div>
            {loading && <p className="p-4 text-[13px] text-[var(--slate)]">Chargement…</p>}
            {!loading && list.length === 0 && <p className="p-4 text-[13px] text-[var(--slate)]">{rows.length === 0 ? (canEdit ? "Aucun AAP pour l'instant. Clique sur « + Nouvel AAP »." : "Aucun AAP visible pour ta ville pour l'instant.") : "Aucun AAP pour ces filtres."}</p>}
            {list.map((r) => {
              const st = statusOf(r.status);
              const hasInstr = !!docs.find((d) => d.id === r.instruction_doc_id);
              const hasCand = !!safeLink(r.application_url);
              const late = r.next_action_date && !closed(r) && r.next_action_date < today;
              return (
                <div key={r.id} role="button" tabIndex={0} onClick={() => setSelId(r.id)} onKeyDown={(e) => e.key === "Enter" && setSelId(r.id)} className={`${ROW_GRID} cursor-pointer border-b border-[var(--border)] px-3 py-2.5 last:border-b-0 hover:bg-[var(--input-bg)]`}>
                  <span className="min-w-0">
                    <span className="block truncate text-[13.5px] font-semibold text-[var(--navy)]">{r.name}</span>
                    <span className="block truncate text-[11.5px] text-[var(--slate)]">{[r.funder, r.antenne].filter(Boolean).join(" · ")}</span>
                  </span>
                  <span>{deadlineCell(r)}</span>
                  <span className="text-[12.5px] font-semibold text-[var(--navy)]">{fmtEur(r.requested_amount)}</span>
                  <span onClick={(e) => e.stopPropagation()}>
                    {canEdit ? (
                      <select value={r.status} onChange={(e) => patch(r.id, { status: e.target.value }, true)} className="rounded-[40px] border-0 px-2.5 py-1.5 text-[12px] font-bold outline-none" style={{ background: st.bg, color: st.fg }}>
                        {STATUS.map((s) => <option key={s.k} value={s.k}>{s.label}</option>)}
                      </select>
                    ) : (
                      <span className="inline-block rounded-[40px] px-2.5 py-1 text-[11.5px] font-bold" style={{ background: st.bg, color: st.fg }}>{st.label}</span>
                    )}
                  </span>
                  <span className="min-w-0 text-[12.5px] text-[var(--navy)]">
                    {r.next_action || r.next_action_date ? (
                      <>
                        <span className="block truncate">{r.next_action || "—"}</span>
                        {r.next_action_date && <span className={`block text-[11.5px] ${late ? "font-semibold text-[var(--critical)]" : "text-[var(--slate)]"}`}>{fmtDate(r.next_action_date)}</span>}
                      </>
                    ) : (
                      <span className="text-[var(--muted)]">—</span>
                    )}
                  </span>
                  <span className="flex gap-1.5" onClick={(e) => e.stopPropagation()}>
                    <button type="button" disabled={!hasCand} onClick={() => openCandidature(r)} title={hasCand ? "Ouvrir le dossier de candidature" : "Aucun lien saisi dans la fiche"} className="rounded-[40px] border border-[var(--border)] px-2.5 py-1 text-[12px] font-semibold whitespace-nowrap text-[var(--navy)] hover:border-[var(--turquoise)] disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:border-[var(--border)]">Candidature ↗</button>
                    <button type="button" disabled={!hasInstr} onClick={() => openInstruction(r)} title={hasInstr ? "Ouvrir le dossier d'instruction" : "Aucun document choisi dans la fiche"} className="rounded-[40px] border border-[var(--border)] px-2.5 py-1 text-[12px] font-semibold whitespace-nowrap text-[var(--navy)] hover:border-[var(--turquoise)] disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:border-[var(--border)]">Instruction</button>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
        <p className="mt-2 px-1 text-[11.5px] text-[var(--slate)]">Tri par défaut : date limite, la plus proche en premier. Les dossiers déjà déposés, puis ceux acceptés, refusés ou abandonnés, passent en bas de liste.</p>
      </div>

      {cur && (
        <>
          <div className="fixed inset-0 z-[60] bg-black/35" onClick={() => setSelId(null)} />
          <aside className="fixed top-0 right-0 bottom-0 z-[61] flex w-full max-w-[660px] flex-col border-l border-[var(--border)] bg-[var(--cream)] shadow-2xl" aria-label="Fiche de suivi">
            <div className="flex items-start gap-3 border-b border-[var(--border)] bg-[var(--card)] px-5 py-3.5">
              <div className="min-w-0 flex-1">
                <h2 className="truncate font-display text-[20px] font-black text-[var(--navy)]">{cur.name}</h2>
                <p className="truncate text-[12px] text-[var(--slate)]">{[cur.funder, cur.antenne].filter(Boolean).join(" · ")}<span className={`ml-2 font-semibold text-[var(--good)] transition-opacity ${saved ? "opacity-100" : "opacity-0"}`}>Enregistré</span></p>
              </div>
              {canEdit && <button type="button" onClick={() => remove(cur)} className="flex-none rounded-[40px] border-[1.5px] border-[var(--border)] px-3.5 py-1.5 text-[12.5px] font-semibold text-[var(--critical)] hover:border-[var(--critical)] hover:bg-[var(--critical-bg)]">Supprimer</button>}
              <button type="button" onClick={() => setSelId(null)} aria-label="Fermer" className="h-8 w-8 flex-none rounded-full text-[18px] text-[var(--slate)] hover:bg-[var(--track)]">×</button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">{fiche(cur)}</div>
          </aside>
        </>
      )}
    </div>
  );
}
