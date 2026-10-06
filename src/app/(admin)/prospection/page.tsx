"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useCity } from "@/components/admin/CityContext";
import { canAdminCity } from "@/lib/roles";
import AddressSearch from "@/components/AddressSearch";

// Prospection : suivi des affaires en cours (CRM léger), propre à chaque ville. Migration 061.
// Une prospection réussie se transforme en fiche partenaire d'un clic.

type Contact = { nom: string; role: string; email: string; tel: string };
type Prospect = {
  id: string;
  name: string;
  status: string;
  priority: number | null;
  type: string | null;
  owner: string | null;
  address: string | null;
  postal_code: string | null;
  link_citoyen: boolean;
  collect_days: string | null;
  collect_slots: string | null;
  last_call: string | null;
  next_action: string | null;
  next_action_date: string | null;
  contacts: Contact[] | null;
  comment: string | null;
  partner_id: string | null;
};
type Note = { id: string; prospect_id: string; note_date: string; kind: "appel" | "mail" | "rencontre" | "autre"; body: string };

const COLS = "id,name,status,priority,type,owner,address,postal_code,link_citoyen,collect_days,collect_slots,last_call,next_action,next_action_date,contacts,comment,partner_id";
const STATUS: { k: string; label: string; bg: string; fg: string }[] = [
  { k: "a_contacter", label: "À contacter", bg: "var(--track)", fg: "var(--slate)" },
  { k: "contacte", label: "Contacté", bg: "rgba(42,120,214,0.14)", fg: "#2a78d6" },
  { k: "a_relancer", label: "À relancer", bg: "var(--warn-bg)", fg: "var(--warn)" },
  { k: "echanges", label: "Échanges en cours", bg: "rgba(124,92,217,0.16)", fg: "#7C5CD9" },
  { k: "test", label: "Test en cours", bg: "var(--good-bg)", fg: "var(--good)" },
  { k: "partenaire", label: "Partenaire", bg: "var(--good-bg)", fg: "var(--good)" },
  { k: "stand_by", label: "Stand-by", bg: "var(--track)", fg: "var(--slate)" },
  { k: "abandonne", label: "Abandonné", bg: "var(--critical-bg)", fg: "var(--critical)" },
];
const statusOf = (k: string) => STATUS.find((s) => s.k === k) ?? STATUS[0];
// les 4 compteurs du haut
const KPIS: { label: string; sub: string; keys: string[]; color: string }[] = [
  { label: "Partenariats en test", sub: "à suivre de près", keys: ["test"], color: "var(--good)" },
  { label: "Échanges en cours", sub: "discussions ouvertes", keys: ["echanges"], color: "#7C5CD9" },
  { label: "Contactés", sub: "1er contact ou à relancer", keys: ["contacte", "a_relancer"], color: "#2a78d6" },
  { label: "Abandonnés", sub: "refus ou sans suite", keys: ["abandonne"], color: "var(--critical)" },
];
const NOTE_KIND: Record<Note["kind"], string> = { appel: "Appel", mail: "Mail", rencontre: "Rencontre", autre: "Autre" };
const TYPES = ["Traiteur événementiel", "Agence événementielle", "Restauration collective / rapide", "Restauration", "Hôtel", "Hôtel / Restaurant / Café", "Lieu de réception", "Atelier cuisine", "Industriel", "Primeur", "Producteur agricole", "Métier de bouche", "Festival", "Association", "Non alimentaire"];
const STALE_DAYS = 30;

const isoOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const fmtShort = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "2-digit" });
const fmtDay = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
const fieldCls = "w-full rounded-[10px] border-[1.5px] border-[var(--border)] bg-[var(--input-bg)] px-2.5 py-2 text-[13px] font-medium text-[var(--navy)] outline-none focus:border-[var(--turquoise)] disabled:opacity-70";
const labelCls = "mb-1 block text-[11.5px] font-semibold text-[var(--slate)]";
const selCls = "rounded-[40px] border border-[var(--border)] bg-[var(--card)] px-3 py-[8px] text-[12.5px] font-semibold text-[var(--slate)]";
const ROW_GRID = "grid grid-cols-[minmax(0,1.6fr)_140px_60px_minmax(0,0.8fr)_minmax(0,0.9fr)_minmax(0,1.4fr)_22px] items-start gap-3";

export default function ProspectionPage() {
  const supabase = useMemo(() => createClient(), []);
  const { cityId, city, role, isAll } = useCity();
  const canEdit = canAdminCity(role);
  const [rows, setRows] = useState<Prospect[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [search, setSearch] = useState("");
  const [kpi, setKpi] = useState<number | null>(null);
  const [fStatus, setFStatus] = useState("");
  const [fType, setFType] = useState("");
  const [fOwner, setFOwner] = useState("");
  const [fPrio, setFPrio] = useState("");
  const [onlyRelance, setOnlyRelance] = useState(false);
  const [selId, setSelId] = useState<string | null>(null);
  const [noteDate, setNoteDate] = useState(isoOf(new Date()));
  const [noteKind, setNoteKind] = useState<Note["kind"]>("appel");
  const [noteBody, setNoteBody] = useState("");
  const [exporting, setExporting] = useState(false);
  const [nowMs] = useState(() => Date.now()); // figé au chargement (évite un appel impur pendant l'affichage)
  const today = isoOf(new Date(nowMs));
  const timers = useRef<Record<string, number>>({});
  const detailRef = useRef<HTMLDivElement>(null);

  async function load() {
    if (!cityId) return;
    const [p, n] = await Promise.all([
      supabase.from("prospects").select(COLS).eq("city_id", cityId).order("name"),
      supabase.from("prospect_notes").select("id,prospect_id,note_date,kind,body,prospects!inner(city_id)").eq("prospects.city_id", cityId).order("note_date", { ascending: false }).limit(10000),
    ]);
    if (p.error) setErr(p.error.message + " (la migration 061 est-elle passée ?)");
    setRows(((p.data ?? []) as unknown as Prospect[]).map((x) => ({ ...x, contacts: Array.isArray(x.contacts) ? x.contacts : [] })));
    setNotes(((n.data ?? []) as unknown as Note[]).map((x) => ({ id: x.id, prospect_id: x.prospect_id, note_date: x.note_date, kind: x.kind, body: x.body })));
    setLoading(false);
  }
  useEffect(() => {
    const t = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cityId]);

  const lastExchange = useMemo(() => {
    const m = new Map<string, string>();
    for (const n of notes) if (!m.get(n.prospect_id) || n.note_date > m.get(n.prospect_id)!) m.set(n.prospect_id, n.note_date);
    for (const r of rows) if (r.last_call && (!m.get(r.id) || r.last_call > m.get(r.id)!)) m.set(r.id, r.last_call);
    return m;
  }, [notes, rows]);
  const daysSince = (iso: string) => Math.floor((nowMs - new Date(iso + "T00:00:00").getTime()) / 86400000);
  // à relancer : une prochaine action échue, ou une affaire ouverte sans échange depuis plus de 30 jours
  const needsFollowUp = (r: Prospect) => {
    if (["partenaire", "abandonne", "stand_by"].includes(r.status)) return false;
    if (r.next_action_date && r.next_action_date <= today) return true;
    if (r.status === "a_contacter") return false;
    const l = lastExchange.get(r.id);
    return !l || daysSince(l) > STALE_DAYS;
  };

  const q = search.trim().toLowerCase();
  const owners = useMemo(() => Array.from(new Set(rows.flatMap((r) => (r.owner ?? "").split(/[,;]/).map((s) => s.trim()).filter(Boolean)))).sort(), [rows]);
  const typesUsed = useMemo(() => Array.from(new Set(rows.map((r) => r.type).filter((x): x is string => !!x))).sort(), [rows]);
  const list = rows.filter((r) => {
    if (kpi !== null && !KPIS[kpi].keys.includes(r.status)) return false;
    if (fStatus && r.status !== fStatus) return false;
    if (fType && r.type !== fType) return false;
    if (fOwner && !(r.owner ?? "").split(/[,;]/).map((s) => s.trim()).includes(fOwner)) return false;
    if (fPrio !== "" && String(r.priority ?? "") !== fPrio) return false;
    if (onlyRelance && !needsFollowUp(r)) return false;
    if (q) {
      const hay = [r.name, r.type, r.owner, r.comment, r.address, ...(r.contacts ?? []).flatMap((c) => [c.nom, c.email, c.tel]), ...notes.filter((n) => n.prospect_id === r.id).map((n) => n.body)].join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  const cur = rows.find((r) => r.id === selId) ?? null;
  const myNotes = useMemo(() => notes.filter((n) => n.prospect_id === selId).sort((a, b) => b.note_date.localeCompare(a.note_date)), [notes, selId]);
  const nRelance = rows.filter(needsFollowUp).length;

  function patch(id: string, p: Partial<Prospect>) {
    if (!canEdit) return;
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...p } : r)));
    window.clearTimeout(timers.current[id]);
    timers.current[id] = window.setTimeout(async () => {
      const { error } = await supabase.from("prospects").update({ ...p, updated_at: new Date().toISOString() }).eq("id", id);
      if (error) return setErr("Enregistrement impossible : " + error.message);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1500);
    }, 600);
  }
  async function create() {
    if (!cityId || !canEdit) return;
    const { data: auth } = await supabase.auth.getUser();
    const { data, error } = await supabase.from("prospects").insert({ city_id: cityId, name: "Nouvelle prospection", status: "a_contacter", priority: 2, created_by: auth.user?.id ?? null }).select(COLS).single();
    if (error || !data) return setErr("Création impossible : " + (error?.message ?? "erreur"));
    setRows((prev) => [...prev, { ...(data as unknown as Prospect), contacts: [] }]);
    setKpi(null);
    setFStatus("");
    setSearch("");
    setSelId((data as { id: string }).id);
    window.setTimeout(() => detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
  }
  async function remove(r: Prospect) {
    if (!window.confirm(`Supprimer « ${r.name} » et tout son suivi ? Cette action est définitive.\n\nPour garder une trace, passe plutôt la prospection en « Abandonné ».`)) return;
    window.clearTimeout(timers.current[r.id]);
    const { data, error } = await supabase.from("prospects").delete().eq("id", r.id).select("id");
    if (error || !data?.length) return setErr("Suppression impossible : " + (error?.message ?? "droits insuffisants"));
    setRows((prev) => prev.filter((x) => x.id !== r.id));
    setNotes((prev) => prev.filter((n) => n.prospect_id !== r.id));
    setSelId(null);
  }
  async function addNote(id: string) {
    if (!noteBody.trim()) return;
    const { data: auth } = await supabase.auth.getUser();
    const { data, error } = await supabase.from("prospect_notes").insert({ prospect_id: id, note_date: noteDate, kind: noteKind, body: noteBody.trim(), created_by: auth.user?.id ?? null }).select("id,prospect_id,note_date,kind,body").single();
    if (error || !data) return setErr("Note non enregistrée : " + (error?.message ?? "erreur"));
    setNotes((prev) => [data as Note, ...prev]);
    setNoteBody("");
  }
  async function delNote(id: string) {
    if (!window.confirm("Supprimer cette note ?")) return;
    const { error } = await supabase.from("prospect_notes").delete().eq("id", id);
    if (error) return setErr("Suppression impossible : " + error.message);
    setNotes((prev) => prev.filter((n) => n.id !== id));
  }
  // Transforme la prospection en fiche partenaire (nom, adresse, contacts repris) et la passe en « Partenaire »
  async function makePartner(r: Prospect) {
    if (!cityId || !window.confirm(`Créer la fiche partenaire « ${r.name} » à partir de cette prospection ?`)) return;
    const contacts = (r.contacts ?? []).filter((c) => c.nom || c.email || c.tel).map((c) => ({ type: c.role || "Contact", nom: c.nom, tel: c.tel, mail: c.email }));
    const { data, error } = await supabase
      .from("partners")
      .insert({ city_id: cityId, name: r.name, category: "Commerce", address: r.address ?? "", active: true, fiche: { contacts, antenne: city?.name ?? "" } })
      .select("id")
      .single();
    if (error || !data) return setErr("Création de la fiche partenaire impossible : " + (error?.message ?? "erreur"));
    const pid = (data as { id: string }).id;
    const { error: e2 } = await supabase.from("prospects").update({ partner_id: pid, status: "partenaire", updated_at: new Date().toISOString() }).eq("id", r.id);
    if (e2) return setErr("Fiche créée, mais la prospection n'a pas pu être liée : " + e2.message);
    setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, partner_id: pid, status: "partenaire" } : x)));
  }

  async function exportXlsx() {
    setExporting(true);
    try {
      const mod = await import("exceljs");
      const ExcelJS = mod.default ?? mod;
      const wb = new ExcelJS.Workbook();
      wb.creator = "Linkee";
      const ids = new Set(list.map((r) => r.id));
      const byId = new Map(rows.map((r) => [r.id, r]));
      const ws1 = wb.addWorksheet("Prospection");
      ws1.columns = [
        { header: "Nom", key: "name", width: 34 }, { header: "Statut", key: "status", width: 20 }, { header: "Priorité", key: "prio", width: 9 }, { header: "Type", key: "type", width: 28 },
        { header: "Responsable", key: "owner", width: 16 }, { header: "Dernier échange", key: "last", width: 15 }, { header: "Prochaine action", key: "next", width: 34 }, { header: "Date prochaine action", key: "nextDate", width: 18 },
        { header: "Contacts", key: "contacts", width: 50 }, { header: "Adresse", key: "addr", width: 40 }, { header: "Code postal", key: "cp", width: 11 }, { header: "Link citoyen", key: "lc", width: 11 },
        { header: "Jours de collecte", key: "days", width: 18 }, { header: "Créneaux", key: "slots", width: 18 }, { header: "Commentaire", key: "comment", width: 60 },
      ];
      for (const r of list) {
        ws1.addRow({
          name: r.name, status: statusOf(r.status).label, prio: r.priority ?? "", type: r.type ?? "", owner: r.owner ?? "", last: lastExchange.get(r.id) ? new Date(lastExchange.get(r.id)! + "T00:00:00") : "",
          next: r.next_action ?? "", nextDate: r.next_action_date ? new Date(r.next_action_date + "T00:00:00") : "",
          contacts: (r.contacts ?? []).map((c) => [c.nom, c.role && `(${c.role})`, c.email, c.tel].filter(Boolean).join(" ")).join("\n"),
          addr: r.address ?? "", cp: r.postal_code ?? "", lc: r.link_citoyen ? "Oui" : "", days: r.collect_days ?? "", slots: r.collect_slots ?? "", comment: r.comment ?? "",
        });
      }
      ws1.getColumn("last").numFmt = "dd/mm/yyyy";
      ws1.getColumn("nextDate").numFmt = "dd/mm/yyyy";
      ws1.getRow(1).font = { bold: true };
      ws1.views = [{ state: "frozen", ySplit: 1 }];
      ws1.eachRow((row) => (row.alignment = { vertical: "top", wrapText: true }));
      ws1.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 15 } };
      const ws2 = wb.addWorksheet("Échanges");
      ws2.columns = [{ header: "Nom", key: "a", width: 34 }, { header: "Date", key: "d", width: 13 }, { header: "Type", key: "k", width: 12 }, { header: "Note", key: "b", width: 110 }];
      for (const n of notes.filter((x) => ids.has(x.prospect_id)).sort((a, b) => (byId.get(a.prospect_id)?.name ?? "").localeCompare(byId.get(b.prospect_id)?.name ?? "") || b.note_date.localeCompare(a.note_date))) {
        ws2.addRow({ a: byId.get(n.prospect_id)?.name ?? "", d: new Date(n.note_date + "T00:00:00"), k: NOTE_KIND[n.kind], b: n.body });
      }
      ws2.getColumn("d").numFmt = "dd/mm/yyyy";
      ws2.getRow(1).font = { bold: true };
      ws2.views = [{ state: "frozen", ySplit: 1 }];
      ws2.eachRow((row) => (row.alignment = { vertical: "top", wrapText: true }));
      const buf = await wb.xlsx.writeBuffer();
      const url = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `prospection-${(city?.name ?? "ville").toLowerCase()}-${today}.xlsx`;
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (e) {
      setErr("Export impossible : " + (e as Error).message);
    }
    setExporting(false);
  }

  function fiche(r: Prospect) {
    const dis = !canEdit;
    const setContacts = (contacts: Contact[]) => patch(r.id, { contacts });
    return (
      <div className="rounded-[20px] border border-[var(--border)] bg-[var(--card)] p-5 shadow-[var(--shadow)]" style={{ borderTop: "4px solid var(--turquoise)" }}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <input disabled={dis} value={r.name} onChange={(e) => patch(r.id, { name: e.target.value })} className="w-full rounded-lg border-b-[1.5px] border-transparent bg-transparent px-1 py-0.5 font-display text-[27px] font-black text-[var(--navy)] outline-none hover:border-b-[var(--turquoise)] focus:border-b-[var(--turquoise)] focus:bg-[var(--input-bg)]" />
            <span className={`text-[12px] font-semibold text-[var(--good)] transition-opacity ${saved ? "opacity-100" : "opacity-0"}`}>Modifications enregistrées</span>
          </div>
          {canEdit && (
            <div className="flex flex-none flex-wrap items-center gap-2">
              {r.partner_id ? (
                <Link href="/partenaires" className="rounded-[40px] border-[1.5px] border-[var(--good)] px-4 py-2 text-[12.5px] font-semibold text-[var(--good)]">Voir dans Partenaires →</Link>
              ) : (
                <button type="button" onClick={() => makePartner(r)} className="rounded-[40px] bg-[var(--navy-deep)] px-4 py-2 text-[12.5px] font-bold text-[var(--panel-fg)]">Créer la fiche partenaire</button>
              )}
              <button type="button" onClick={() => remove(r)} className="rounded-[40px] border-[1.5px] border-[var(--border)] px-4 py-2 text-[12.5px] font-semibold text-[var(--critical)] hover:border-[var(--critical)] hover:bg-[var(--critical-bg)]">Supprimer</button>
            </div>
          )}
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className={labelCls}>Statut</label>
            <select disabled={dis} className={fieldCls} value={r.status} onChange={(e) => patch(r.id, { status: e.target.value })}>
              {STATUS.map((s) => <option key={s.k} value={s.k}>{s.label}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Priorité</label>
            <select disabled={dis} className={fieldCls} value={r.priority ?? ""} onChange={(e) => patch(r.id, { priority: e.target.value === "" ? null : Number(e.target.value) })}>
              <option value="">À définir</option>
              <option value="1">1 · prioritaire</option>
              <option value="2">2 · normale</option>
              <option value="3">3 · faible</option>
              <option value="0">0 · sans intérêt</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Type</label>
            <input disabled={dis} list="prospect-types" className={fieldCls} value={r.type ?? ""} onChange={(e) => patch(r.id, { type: e.target.value })} placeholder="Ex : traiteur événementiel" />
          </div>
          <div>
            <label className={labelCls}>Responsable</label>
            <input disabled={dis} className={fieldCls} value={r.owner ?? ""} onChange={(e) => patch(r.id, { owner: e.target.value })} placeholder="Ex : Alice" />
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <label className={labelCls}>Adresse</label>
            <AddressSearch className={fieldCls} value={r.address ?? ""} onChange={(v) => patch(r.id, { address: v })} onPick={(hit) => patch(r.id, { address: hit.label })} />
          </div>
          <div>
            <label className={labelCls}>Code postal</label>
            <input disabled={dis} className={fieldCls} value={r.postal_code ?? ""} onChange={(e) => patch(r.id, { postal_code: e.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>Prochaine action</label>
            <input disabled={dis} className={fieldCls} value={r.next_action ?? ""} onChange={(e) => patch(r.id, { next_action: e.target.value })} placeholder="Ex : rappeler pour fixer un test" />
          </div>
          <div>
            <label className={labelCls}>Pour le</label>
            <input disabled={dis} type="date" className={fieldCls} value={r.next_action_date ?? ""} onChange={(e) => patch(r.id, { next_action_date: e.target.value || null })} />
          </div>
          <div>
            <label className={labelCls}>Dernier appel</label>
            <input disabled={dis} type="date" className={fieldCls} value={r.last_call ?? ""} onChange={(e) => patch(r.id, { last_call: e.target.value || null })} />
          </div>
          <div>
            <label className={labelCls}>Jours de collecte</label>
            <input disabled={dis} className={fieldCls} value={r.collect_days ?? ""} onChange={(e) => patch(r.id, { collect_days: e.target.value })} placeholder="Ex : lundi, jeudi" />
          </div>
          <div>
            <label className={labelCls}>Créneaux</label>
            <input disabled={dis} className={fieldCls} value={r.collect_slots ?? ""} onChange={(e) => patch(r.id, { collect_slots: e.target.value })} placeholder="Ex : 14h-16h" />
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 pb-2 text-[13px] font-semibold text-[var(--navy)]">
              <input disabled={dis} type="checkbox" checked={r.link_citoyen} onChange={(e) => patch(r.id, { link_citoyen: e.target.checked })} className="h-4 w-4 accent-[var(--turquoise)]" />
              Éligible Link citoyen
            </label>
          </div>
          <div className="sm:col-span-2 lg:col-span-4">
            <label className={labelCls}>Commentaire</label>
            <textarea disabled={dis} className={`${fieldCls} min-h-[64px] resize-y`} value={r.comment ?? ""} onChange={(e) => patch(r.id, { comment: e.target.value })} placeholder="Contexte, besoins, points d'attention…" />
          </div>
        </div>

        <div className="mt-5">
          <div className="mb-1.5 flex items-center justify-between">
            <h4 className="text-[13.5px] font-semibold text-[var(--navy)]">Contacts</h4>
            {canEdit && <button type="button" onClick={() => setContacts([...(r.contacts ?? []), { nom: "", role: "", email: "", tel: "" }])} className="text-[12.5px] font-semibold text-[var(--turquoise)]">+ Ajouter un contact</button>}
          </div>
          {(r.contacts ?? []).length === 0 && <p className="text-[12.5px] text-[var(--slate)]">Aucun contact renseigné.</p>}
          <div className="flex flex-col gap-2">
            {(r.contacts ?? []).map((c, i) => {
              const upd = (p: Partial<Contact>) => setContacts((r.contacts ?? []).map((x, j) => (j === i ? { ...x, ...p } : x)));
              return (
                <div key={i} className="grid grid-cols-1 items-center gap-2 rounded-xl bg-[var(--input-bg)] p-2 sm:grid-cols-[1fr_1fr_1.2fr_1fr_auto]">
                  <input disabled={dis} className={fieldCls} placeholder="Nom" value={c.nom} onChange={(e) => upd({ nom: e.target.value })} />
                  <input disabled={dis} className={fieldCls} placeholder="Fonction" value={c.role} onChange={(e) => upd({ role: e.target.value })} />
                  <input disabled={dis} className={fieldCls} placeholder="E-mail" value={c.email} onChange={(e) => upd({ email: e.target.value })} />
                  <input disabled={dis} className={fieldCls} placeholder="Téléphone" value={c.tel} onChange={(e) => upd({ tel: e.target.value })} />
                  {canEdit && <button type="button" onClick={() => setContacts((r.contacts ?? []).filter((_, j) => j !== i))} aria-label="Retirer ce contact" className="h-8 w-8 rounded-full text-[var(--slate)] hover:bg-[var(--critical-bg)] hover:text-[var(--critical)]">×</button>}
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-5">
          <h4 className="text-[13.5px] font-semibold text-[var(--navy)]">Fil des échanges</h4>
          <p className="mb-2 text-[11.5px] text-[var(--slate)]">Appels, mails, rencontres : la date du dernier échange se met à jour toute seule.</p>
          {canEdit && (
            <div className="mb-3 grid grid-cols-1 gap-2 rounded-xl bg-[var(--input-bg)] p-3 sm:grid-cols-[150px_140px_1fr_auto]">
              <input type="date" className={fieldCls} value={noteDate} onChange={(e) => setNoteDate(e.target.value)} />
              <select className={fieldCls} value={noteKind} onChange={(e) => setNoteKind(e.target.value as Note["kind"])}>
                {(Object.keys(NOTE_KIND) as Note["kind"][]).map((k) => <option key={k} value={k}>{NOTE_KIND[k]}</option>)}
              </select>
              <input className={fieldCls} value={noteBody} onChange={(e) => setNoteBody(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addNote(r.id)} placeholder="Ex : appelé, très intéressé, rappeler le 12" />
              <button type="button" onClick={() => addNote(r.id)} className="rounded-[40px] bg-[var(--navy-deep)] px-4 py-2 text-[13px] font-bold text-[var(--panel-fg)]">Ajouter</button>
            </div>
          )}
          {myNotes.length === 0 && <p className="text-[12.5px] text-[var(--slate)]">Aucun échange noté pour l&apos;instant.</p>}
          <div className="flex flex-col">
            {myNotes.map((n) => (
              <div key={n.id} className="flex items-start gap-3 border-t border-[var(--border)] py-2.5 first:border-t-0">
                <div className="min-w-0 flex-1">
                  <div className="text-[11.5px] text-[var(--slate)]"><strong className="font-semibold text-[var(--navy)]">{NOTE_KIND[n.kind]}</strong> · {fmtDay(n.note_date)}</div>
                  <div className="text-[13px] whitespace-pre-wrap text-[var(--navy)]">{n.body}</div>
                </div>
                {canEdit && <button type="button" onClick={() => delNote(n.id)} title="Supprimer" className="h-7 w-7 flex-none rounded-full text-[var(--slate)] hover:bg-[var(--critical-bg)] hover:text-[var(--critical)]">×</button>}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (isAll) return <p className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--card)] px-5 py-8 text-center text-[13px] text-[var(--slate)]">Choisis une ville pour voir sa prospection : chaque ville a la sienne.</p>;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[32px] leading-none font-black">Prospection</h1>
          <p className="mt-1 text-[13.5px] text-[var(--slate)]">Le suivi des affaires en cours : qui on a contacté, où on en est, quoi relancer — {city?.name ?? "la ville"}.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={exportXlsx} disabled={exporting || loading} className="rounded-[40px] border-[1.5px] border-[var(--border)] bg-[var(--card)] px-4 py-[8px] font-display text-[13.5px] font-bold text-[var(--navy)] hover:border-[var(--turquoise)] disabled:opacity-50">{exporting ? "Export…" : "Exporter en Excel"}</button>
          {canEdit && <button type="button" onClick={create} className="rounded-[40px] bg-[var(--navy-deep)] px-[17px] py-[9px] font-display text-[13.5px] font-bold text-[var(--panel-fg)]">+ Ajouter une prospection</button>}
        </div>
      </div>
      <datalist id="prospect-types">{TYPES.map((t) => <option key={t} value={t} />)}</datalist>

      {err && (
        <div className="mb-3 flex items-start justify-between gap-3 rounded-xl bg-[var(--critical-bg)] px-3.5 py-2.5 text-[12.5px] font-semibold text-[var(--critical)]">
          <span>{err}</span>
          <button type="button" onClick={() => setErr(null)}>×</button>
        </div>
      )}

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {KPIS.map((k, i) => {
          const n = rows.filter((r) => k.keys.includes(r.status)).length;
          const on = kpi === i;
          return (
            <button key={k.label} type="button" onClick={() => { setKpi(on ? null : i); setFStatus(""); }} className={`rounded-2xl border bg-[var(--card)] px-[18px] py-3.5 text-left shadow-[var(--shadow)] ${on ? "border-[var(--navy-deep)]" : "border-[var(--border)]"}`} style={{ borderLeft: `4px solid ${k.color}` }}>
              <span className="block font-display text-[30px] leading-none font-black tabular-nums text-[var(--navy)]">{n}</span>
              <span className="mt-1 block text-[13px] font-bold text-[var(--navy)]">{k.label}</span>
              <span className="block text-[11.5px] text-[var(--slate)]">{k.sub}</span>
            </button>
          );
        })}
      </div>

      <div className="rounded-[18px] border border-[var(--border)] bg-[var(--card)] p-3 shadow-[var(--shadow)]">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher un nom, un contact, un commentaire…" className={`${fieldCls} mb-2.5`} />
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <select className={selCls} value={fStatus} onChange={(e) => { setFStatus(e.target.value); setKpi(null); }}>
            <option value="">Tous statuts</option>
            {STATUS.map((s) => <option key={s.k} value={s.k}>{s.label} ({rows.filter((r) => r.status === s.k).length})</option>)}
          </select>
          <select className={selCls} value={fType} onChange={(e) => setFType(e.target.value)}><option value="">Tous types</option>{typesUsed.map((t) => <option key={t}>{t}</option>)}</select>
          <select className={selCls} value={fOwner} onChange={(e) => setFOwner(e.target.value)}><option value="">Tous responsables</option>{owners.map((o) => <option key={o}>{o}</option>)}</select>
          <select className={selCls} value={fPrio} onChange={(e) => setFPrio(e.target.value)}><option value="">Toutes priorités</option><option value="1">Priorité 1</option><option value="2">Priorité 2</option><option value="3">Priorité 3</option><option value="0">Priorité 0</option></select>
          <label className="flex items-center gap-1.5 text-[12.5px] font-semibold text-[var(--slate)]">
            <input type="checkbox" checked={onlyRelance} onChange={(e) => setOnlyRelance(e.target.checked)} className="accent-[var(--turquoise)]" />
            À relancer ({nRelance})
          </label>
          <span className="ml-auto text-[12px] text-[var(--slate)]">{list.length} prospection{list.length > 1 ? "s" : ""}</span>
        </div>

        <div className={`${ROW_GRID} hidden border-b border-[var(--border)] px-3 pb-2 text-[11px] font-bold tracking-[0.03em] text-[var(--muted)] uppercase lg:grid`}>
          <span>Nom</span><span>Statut</span><span>Prio.</span><span>Responsable</span><span>Dernier échange</span><span>Contact · prochaine relance</span><span />
        </div>
        {loading && <p className="p-4 text-[13px] text-[var(--slate)]">Chargement…</p>}
        {!loading && list.length === 0 && <p className="p-4 text-[13px] text-[var(--slate)]">{rows.length === 0 ? "Aucune prospection pour l'instant. Clique sur « + Ajouter une prospection »." : "Aucune prospection pour ces filtres."}</p>}
        {list.map((r) => {
          const on = r.id === selId;
          const st = statusOf(r.status);
          const last = lastExchange.get(r.id);
          const c0 = (r.contacts ?? [])[0];
          const relance = needsFollowUp(r);
          return (
            <div key={r.id} ref={on ? detailRef : undefined} className="scroll-mt-4 border-b border-[var(--border)] last:border-b-0">
              <button type="button" aria-expanded={on} onClick={() => { const opening = !on; setSelId(opening ? r.id : null); if (opening) window.setTimeout(() => detailRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 60); }} className={`${ROW_GRID} w-full px-3 py-2.5 text-left hover:bg-[var(--input-bg)] ${on ? "bg-[var(--track)]" : ""}`}>
                <span className="min-w-0">
                  <span className="block truncate text-[13.5px] font-semibold text-[var(--navy)]">{r.name}</span>
                  <span className="block truncate text-[11.5px] text-[var(--slate)]">{r.type || "Type non précisé"}</span>
                </span>
                <span><span className="inline-block rounded-[40px] px-2 py-0.5 text-[11px] font-bold" style={{ background: st.bg, color: st.fg }}>{st.label}</span></span>
                <span className="text-[12.5px] font-bold text-[var(--navy)]">{r.priority === null ? <span className="font-normal text-[var(--muted)]">—</span> : `P${r.priority}`}</span>
                <span className="truncate text-[12.5px] text-[var(--navy)]">{r.owner || <span className="text-[var(--muted)]">—</span>}</span>
                <span className="text-[12.5px] text-[var(--navy)]">
                  {last ? fmtShort(last) : <span className="text-[var(--muted)]">—</span>}
                  {relance && <span className="block text-[11px] font-semibold text-[var(--critical)]">À relancer</span>}
                </span>
                <span className="min-w-0 text-[12.5px] text-[var(--navy)]">
                  <span className="block truncate">{c0 ? [c0.nom, c0.tel || c0.email].filter(Boolean).join(" · ") || "—" : <span className="text-[var(--muted)]">—</span>}</span>
                  {(r.next_action || r.next_action_date) && <span className="block truncate text-[11.5px] text-[var(--slate)]">{[r.next_action, r.next_action_date && fmtShort(r.next_action_date)].filter(Boolean).join(" · ")}</span>}
                </span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className={`mt-1 h-4 w-4 flex-none text-[var(--slate)] transition-transform ${on ? "rotate-180" : ""}`} aria-hidden="true"><path d="M6 9 L12 15 L18 9" /></svg>
              </button>
              {on && cur && <div className="mt-1 mb-3 px-1 sm:px-3">{fiche(cur)}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
