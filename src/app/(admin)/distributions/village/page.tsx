"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useCity } from "@/components/admin/CityContext";
import { canAdminCity } from "@/lib/roles";
import DistribTabs from "@/components/DistribTabs";
import PhotoStrip from "@/components/PhotoStrip";
import AddressSearch from "@/components/AddressSearch";

// Village associatif : outil de suivi des relations avec les associations et institutions qui interviennent sur les
// distributions (ou avec lesquelles on collabore). Migrations 015 (base) et 060 (suivi : statut, contacts, interventions
// planifiées). Deux vues : « Suivi des relations » (tableau + fiche en accordéon) et « Prochaines interventions » (agenda).

const ORANGE = "#eb6834";

type Contact = { nom: string; role: string; email: string; tel: string };
type Assoc = {
  id: string;
  name: string;
  kind: "association" | "institution";
  ancrage: string | null;
  relation_status: string | null;
  relation_type: string | null;
  activity_type: string | null;
  collab_type: string | null;
  description: string | null;
  distrib_actions: string | null;
  frequency: string | null;
  contacts: Contact[] | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  address: string | null;
  next_action: string | null;
  next_action_date: string | null;
  notes_raw: string | null;
  archived: boolean;
};
type Intervention = { association_id: string; comment: string | null; photo_paths: string[] | null; distributions: { event_date: string; beneficiary_id: string } | { event_date: string; beneficiary_id: string }[] | null };
type Note = { id: string; association_id: string; note_date: string; kind: "appel" | "reunion" | "mail" | "autre"; body: string };
type Visit = { id: string; association_id: string; visit_date: string; place: string | null; status: "a_confirmer" | "confirmee" | "realisee" | "annulee"; purpose: string | null };

const ASSOC_COLS = "id,name,kind,ancrage,relation_status,relation_type,activity_type,collab_type,description,distrib_actions,frequency,contacts,contact_name,contact_phone,contact_email,address,next_action,next_action_date,notes_raw,archived";

const STATUS: { k: string; label: string; bg: string; fg: string }[] = [
  { k: "en_cours", label: "En cours", bg: "var(--good-bg)", fg: "var(--good)" },
  { k: "en_attente", label: "En attente", bg: "var(--warn-bg)", fg: "var(--warn)" },
  { k: "bientot", label: "Bientôt", bg: "rgba(42,120,214,0.14)", fg: "#2a78d6" },
  { k: "termine", label: "Terminé", bg: "var(--track)", fg: "var(--slate)" },
];
const statusOf = (k: string | null) => STATUS.find((s) => s.k === k) ?? null;
const RELATION: Record<string, string> = { informelle: "Informelle", convention: "Convention signée" };
const ANCRAGES = ["Local", "Régional", "National"];
const VISIT_STATUS: Record<Visit["status"], { label: string; bg: string; fg: string }> = {
  a_confirmer: { label: "À confirmer", bg: "var(--warn-bg)", fg: "var(--warn)" },
  confirmee: { label: "Confirmée", bg: "var(--good-bg)", fg: "var(--good)" },
  realisee: { label: "Réalisée", bg: "var(--track)", fg: "var(--slate)" },
  annulee: { label: "Annulée", bg: "var(--critical-bg)", fg: "var(--critical)" },
};
const STALE_DAYS = 60; // « à relancer » : relation ouverte sans échange depuis plus de 60 jours
const ACTIVITIES = ["Santé / Addiction", "Accès aux droits", "Logement", "Culture", "Sport", "Santé mentale", "Mentorat / Insertion / Égalité des chances", "Lien et mixité sociale", "Aide alimentaire", "Éducation", "Environnement", "Aide aux étudiants", "Autres"];
const KIND_LABEL: Record<Note["kind"], string> = { appel: "Appel", reunion: "Réunion", mail: "Mail", autre: "Autre" };
const KIND_ICON: Record<Note["kind"], React.ReactNode> = {
  appel: <path d="M5 4 H9 L11 9 L8.5 10.5 A11 11 0 0 0 13.5 15.5 L15 13 L20 15 V19 A2 2 0 0 1 18 21 A16 16 0 0 1 3 6 A2 2 0 0 1 5 4 Z" />,
  reunion: <><circle cx="8" cy="8" r="2.6" /><circle cx="16.5" cy="9" r="2.2" /><path d="M3 19 C3.4 15.5 5.4 13.6 8 13.6 C10.6 13.6 12.6 15.5 13 19 M14.5 14 C15.4 13.5 16 13.4 16.5 13.4 C18.5 13.4 20 15 20.5 18.5" /></>,
  mail: <><rect x="3" y="5.5" width="18" height="13" rx="2" /><path d="M3.5 7 L12 13 L20.5 7" /></>,
  autre: <path d="M4 5 H20 V16 H10 L5.5 20 V16 H4 Z" />,
};

const isoOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const fmtDay = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
const fmtShort = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "2-digit" });
const fmtLong = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
const first = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));
const fieldCls = "w-full rounded-[10px] border-[1.5px] border-[var(--border)] bg-[var(--input-bg)] px-2.5 py-2 text-[13px] font-medium text-[var(--navy)] outline-none focus:border-[#eb6834]";
const labelCls = "mb-1 block text-[11.5px] font-semibold text-[var(--slate)]";
const selCls = "rounded-[40px] border border-[var(--border)] bg-[var(--card)] px-3 py-[8px] text-[12.5px] font-semibold text-[var(--slate)]";
const ROW_GRID = "grid grid-cols-[minmax(0,1.6fr)_110px_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.1fr)_22px] items-start gap-3";

export default function VillagePage() {
  const supabase = useMemo(() => createClient(), []);
  const pathname = usePathname();
  const { cityId, city, role } = useCity();
  const canEdit = canAdminCity(role);
  const [assocs, setAssocs] = useState<Assoc[]>([]);
  const [inters, setInters] = useState<Intervention[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [placeName, setPlaceName] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [view, setView] = useState<"suivi" | "agenda">("suivi");
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [fStatus, setFStatus] = useState("all");
  const [fKind, setFKind] = useState("");
  const [fDomain, setFDomain] = useState("");
  const [fAncrage, setFAncrage] = useState("");
  const [fRelation, setFRelation] = useState("");
  const [onlyRelance, setOnlyRelance] = useState(false);
  const [selId, setSelId] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [noteDate, setNoteDate] = useState(isoOf(new Date()));
  const [noteKind, setNoteKind] = useState<Note["kind"]>("appel");
  const [noteBody, setNoteBody] = useState("");
  const [agendaPlace, setAgendaPlace] = useState("");
  const [agendaAll, setAgendaAll] = useState(false);
  const [exporting, setExporting] = useState(false);
  const timers = useRef<Record<string, number>>({});
  const detailRef = useRef<HTMLDivElement>(null);
  const [nowMs] = useState(() => Date.now()); // figé au chargement de la page (évite un appel impur pendant l'affichage)
  const today = isoOf(new Date(nowMs));
  const standalone = !pathname.startsWith("/distributions");

  async function load() {
    if (!cityId) return;
    const [a, i, b, n, v] = await Promise.all([
      supabase.from("associations").select(ASSOC_COLS).eq("city_id", cityId).order("name"),
      supabase.from("distribution_interventions").select("association_id,comment,photo_paths,distributions!inner(event_date,beneficiary_id,city_id)").eq("distributions.city_id", cityId).limit(5000),
      supabase.from("beneficiaries").select("id,name").eq("city_id", cityId).is("deleted_at", null),
      supabase.from("association_notes").select("id,association_id,note_date,kind,body,associations!inner(city_id)").eq("associations.city_id", cityId).order("note_date", { ascending: false }).limit(10000),
      supabase.from("association_visits").select("id,association_id,visit_date,place,status,purpose,associations!inner(city_id)").eq("associations.city_id", cityId).order("visit_date").limit(10000),
    ]);
    if (a.error) setErr(a.error.message + " (les migrations 015 et 060 sont-elles passées ?)");
    setAssocs(((a.data ?? []) as unknown as Assoc[]).map((x) => ({ ...x, contacts: Array.isArray(x.contacts) ? x.contacts : [] })));
    setInters((i.data ?? []) as unknown as Intervention[]);
    setNotes(((n.data ?? []) as unknown as Note[]).map((x) => ({ id: x.id, association_id: x.association_id, note_date: x.note_date, kind: x.kind, body: x.body })));
    setVisits(((v.data ?? []) as unknown as Visit[]).map((x) => ({ id: x.id, association_id: x.association_id, visit_date: x.visit_date, place: x.place, status: x.status, purpose: x.purpose })));
    setPlaceName(new Map(((b.data ?? []) as { id: string; name: string }[]).map((x) => [x.id, x.name])));
    setLoading(false);
  }
  useEffect(() => {
    const t = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cityId]);

  /* ---------- chiffres par association ---------- */
  const stats = useMemo(() => {
    const m = new Map<string, { count: number; last: string | null }>();
    for (const iv of inters) {
      const d = first(iv.distributions)?.event_date;
      if (!d) continue;
      const cur = m.get(iv.association_id) ?? { count: 0, last: null };
      cur.count++;
      if (!cur.last || d > cur.last) cur.last = d;
      m.set(iv.association_id, cur);
    }
    return m;
  }, [inters]);
  const lastNote = useMemo(() => {
    const m = new Map<string, string>();
    for (const n of notes) if (!m.get(n.association_id) || n.note_date > m.get(n.association_id)!) m.set(n.association_id, n.note_date);
    return m;
  }, [notes]);
  const nextVisit = useMemo(() => {
    const m = new Map<string, Visit>();
    for (const v of visits) {
      if (v.visit_date < today || v.status === "annulee" || v.status === "realisee") continue;
      const cur = m.get(v.association_id);
      if (!cur || v.visit_date < cur.visit_date) m.set(v.association_id, v);
    }
    return m;
  }, [visits, today]);
  const daysSince = (iso: string) => Math.floor((nowMs - new Date(iso + "T00:00:00").getTime()) / 86400000);
  const needsFollowUp = (a: Assoc) => {
    if (a.archived) return false;
    const due = !!a.next_action_date && a.next_action_date <= today;
    const open = a.relation_status === "en_cours" || a.relation_status === "en_attente" || a.relation_status === "bientot";
    const ln = lastNote.get(a.id);
    const stale = open && !nextVisit.has(a.id) && (!ln || daysSince(ln) > STALE_DAYS);
    return due || stale;
  };

  /* ---------- filtres ---------- */
  const q = search.trim().toLowerCase();
  const pool = assocs.filter((a) => a.archived === showArchived);
  const domains = useMemo(() => Array.from(new Set(assocs.map((a) => a.activity_type).filter((x): x is string => !!x))).sort((a, b) => a.localeCompare(b)), [assocs]);
  const matches = (a: Assoc) => {
    if (fKind && a.kind !== fKind) return false;
    if (fDomain && a.activity_type !== fDomain) return false;
    if (fAncrage && a.ancrage !== fAncrage) return false;
    if (fRelation && a.relation_type !== fRelation) return false;
    if (onlyRelance && !needsFollowUp(a)) return false;
    if (q) {
      const hay = [a.name, a.activity_type, a.distrib_actions, a.contact_name, a.contact_email, ...(a.contacts ?? []).flatMap((c) => [c.nom, c.email, c.role]), a.notes_raw, ...notes.filter((n) => n.association_id === a.id).map((n) => n.body)].join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  };
  const afterFilters = pool.filter(matches); // avant le filtre de statut : sert aux compteurs
  const countOf = (k: string) => afterFilters.filter((a) => (k === "none" ? !a.relation_status : a.relation_status === k)).length;
  const list = afterFilters.filter((a) => fStatus === "all" || (fStatus === "none" ? !a.relation_status : a.relation_status === fStatus));
  const cur = assocs.find((a) => a.id === selId) ?? null;
  const nActive = assocs.filter((a) => !a.archived).length;
  const nRelance = pool.filter(needsFollowUp).length;

  const myInters = useMemo(
    () =>
      inters
        .filter((i) => i.association_id === selId)
        .map((i) => ({ date: first(i.distributions)?.event_date ?? "", place: placeName.get(first(i.distributions)?.beneficiary_id ?? "") ?? "Lieu", b: first(i.distributions)?.beneficiary_id ?? "", comment: i.comment ?? "", photos: i.photo_paths ?? [] }))
        .sort((a, b) => b.date.localeCompare(a.date)),
    [inters, selId, placeName],
  );
  const myNotes = useMemo(() => notes.filter((n) => n.association_id === selId).sort((a, b) => b.note_date.localeCompare(a.note_date)), [notes, selId]);
  const myVisits = useMemo(() => visits.filter((v) => v.association_id === selId).sort((a, b) => a.visit_date.localeCompare(b.visit_date)), [visits, selId]);

  /* ---------- modifications d'une fiche ---------- */
  function patch(id: string, p: Partial<Assoc>) {
    if (!canEdit) return;
    setAssocs((prev) => prev.map((a) => (a.id === id ? { ...a, ...p } : a)));
    window.clearTimeout(timers.current[id]);
    timers.current[id] = window.setTimeout(async () => {
      const { error } = await supabase.from("associations").update(p).eq("id", id);
      if (error) return setErr("Enregistrement impossible : " + error.message);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1500);
    }, 600);
  }
  function setContacts(a: Assoc, contacts: Contact[]) {
    const c0 = contacts[0];
    patch(a.id, { contacts, contact_name: c0?.nom || null, contact_email: c0?.email || null, contact_phone: c0?.tel || null });
  }
  async function create() {
    if (!cityId || !canEdit) return;
    const { data, error } = await supabase.from("associations").insert({ city_id: cityId, name: "Nouvelle association", relation_status: "bientot" }).select(ASSOC_COLS).single();
    if (error || !data) return setErr("Création impossible : " + (error?.message ?? "erreur"));
    setAssocs((prev) => [...prev, { ...(data as unknown as Assoc), contacts: [] }]);
    setShowArchived(false);
    setView("suivi");
    setFStatus("all");
    setSelId((data as { id: string }).id);
    window.setTimeout(() => detailRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 80);
  }
  async function toggleArchive(a: Assoc) {
    if (!a.archived && !window.confirm(`Archiver « ${a.name} » ? Elle ne sera plus proposée dans les distributions, mais son historique est conservé.`)) return;
    const { error } = await supabase.from("associations").update({ archived: !a.archived }).eq("id", a.id);
    if (error) return setErr(error.message);
    setAssocs((prev) => prev.map((x) => (x.id === a.id ? { ...x, archived: !a.archived } : x)));
    setSelId(null);
  }
  // Supprime définitivement l'association. Ses notes, ses interventions et ses visites partent avec (on delete cascade) :
  // le message le dit, et propose l'archivage pour garder l'historique.
  async function deleteAssoc(a: Assoc) {
    const nInter = stats.get(a.id)?.count ?? 0;
    const nNotes = notes.filter((n) => n.association_id === a.id).length;
    const nVisits = visits.filter((v) => v.association_id === a.id).length;
    const lies = [nInter ? `${nInter} intervention${nInter > 1 ? "s" : ""} sur les distributions (commentaires et photos compris)` : "", nNotes ? `${nNotes} note${nNotes > 1 ? "s" : ""} d'échange` : "", nVisits ? `${nVisits} intervention${nVisits > 1 ? "s" : ""} planifiée${nVisits > 1 ? "s" : ""}` : ""].filter(Boolean);
    const msg = lies.length
      ? `Supprimer « ${a.name} » ?\n\nSeront aussi supprimées : ${lies.join(", ")}.\nPour garder cet historique, utilise plutôt « Archiver ».\n\nCette action est définitive.`
      : `Supprimer « ${a.name} » ? Cette action est définitive.`;
    if (!window.confirm(msg)) return;
    window.clearTimeout(timers.current[a.id]); // pas d'enregistrement en attente sur une asso supprimée
    const { data, error } = await supabase.from("associations").delete().eq("id", a.id).select("id");
    if (error || !data?.length) return setErr("Suppression impossible : " + (error?.message ?? "la base l'a refusée (droits insuffisants ?)"));
    setAssocs((prev) => prev.filter((x) => x.id !== a.id));
    setInters((prev) => prev.filter((x) => x.association_id !== a.id));
    setNotes((prev) => prev.filter((x) => x.association_id !== a.id));
    setVisits((prev) => prev.filter((x) => x.association_id !== a.id));
    setSelId(null);
  }

  /* ---------- échanges ---------- */
  async function addNote(assocId: string) {
    if (!noteBody.trim()) return;
    const { data, error } = await supabase.from("association_notes").insert({ association_id: assocId, note_date: noteDate, kind: noteKind, body: noteBody.trim() }).select("id,association_id,note_date,kind,body").single();
    if (error || !data) return setErr("Note non enregistrée : " + (error?.message ?? "erreur"));
    setNotes((prev) => [data as Note, ...prev]);
    setNoteBody("");
  }
  async function delNote(id: string) {
    if (!window.confirm("Supprimer cette note ?")) return;
    const { error } = await supabase.from("association_notes").delete().eq("id", id);
    if (error) return setErr("Suppression impossible : " + error.message);
    setNotes((prev) => prev.filter((n) => n.id !== id));
  }

  /* ---------- interventions planifiées ---------- */
  async function addVisit(assocId: string, date?: string) {
    const { data, error } = await supabase.from("association_visits").insert({ association_id: assocId, visit_date: date ?? today, status: "a_confirmer" }).select("id,association_id,visit_date,place,status,purpose").single();
    if (error || !data) return setErr("Intervention non enregistrée : " + (error?.message ?? "erreur"));
    setVisits((prev) => [...prev, data as Visit]);
  }
  async function patchVisit(id: string, p: Partial<Visit>) {
    setVisits((prev) => prev.map((v) => (v.id === id ? { ...v, ...p } : v)));
    const { error } = await supabase.from("association_visits").update(p).eq("id", id);
    if (error) setErr("Enregistrement impossible : " + error.message);
  }
  async function delVisit(id: string) {
    if (!window.confirm("Supprimer cette intervention planifiée ?")) return;
    const { error } = await supabase.from("association_visits").delete().eq("id", id);
    if (error) return setErr("Suppression impossible : " + error.message);
    setVisits((prev) => prev.filter((v) => v.id !== id));
  }

  /* ---------- export Excel (la vue filtrée) ---------- */
  async function exportXlsx() {
    setExporting(true);
    try {
      const mod = await import("exceljs");
      const ExcelJS = mod.default ?? mod;
      const wb = new ExcelJS.Workbook();
      wb.creator = "Linkee";
      const head = (ws: import("exceljs").Worksheet) => {
        ws.getRow(1).font = { bold: true };
        ws.getRow(1).alignment = { vertical: "middle", wrapText: true };
        ws.views = [{ state: "frozen", ySplit: 1 }];
      };
      const ids = new Set(list.map((a) => a.id));
      const byId = new Map(assocs.map((a) => [a.id, a]));
      const ws1 = wb.addWorksheet("Suivi");
      ws1.columns = [
        { header: "Nom", key: "name", width: 34 }, { header: "Type", key: "kind", width: 14 }, { header: "Ancrage", key: "ancrage", width: 11 }, { header: "Statut", key: "status", width: 14 },
        { header: "Domaine d'intervention", key: "domain", width: 26 }, { header: "Type de relation", key: "rel", width: 18 }, { header: "Ce qu'ils font en distribution", key: "actions", width: 44 },
        { header: "Fréquence de venue", key: "freq", width: 30 }, { header: "Contacts", key: "contacts", width: 50 }, { header: "Dernier échange", key: "last", width: 15 },
        { header: "Prochaine action", key: "next", width: 34 }, { header: "Date de la prochaine action", key: "nextDate", width: 18 }, { header: "Prochaine intervention", key: "visit", width: 26 }, { header: "Interventions en distribution", key: "count", width: 14 },
      ];
      for (const a of list) {
        const v = nextVisit.get(a.id);
        ws1.addRow({
          name: a.name, kind: a.kind === "institution" ? "Institution" : "Association", ancrage: a.ancrage ?? "", status: statusOf(a.relation_status)?.label ?? "Sans statut", domain: a.activity_type ?? "",
          rel: a.relation_type ? RELATION[a.relation_type] : "", actions: a.distrib_actions ?? "", freq: a.frequency ?? "",
          contacts: (a.contacts ?? []).map((c) => [c.nom, c.role && `(${c.role})`, c.email, c.tel].filter(Boolean).join(" ")).join("\n"),
          last: lastNote.get(a.id) ? new Date(lastNote.get(a.id)! + "T00:00:00") : "", next: a.next_action ?? "", nextDate: a.next_action_date ? new Date(a.next_action_date + "T00:00:00") : "",
          visit: v ? `${fmtShort(v.visit_date)}${v.place ? " · " + v.place : ""} (${VISIT_STATUS[v.status].label.toLowerCase()})` : "", count: stats.get(a.id)?.count ?? 0,
        });
      }
      ws1.getColumn("last").numFmt = "dd/mm/yyyy";
      ws1.getColumn("nextDate").numFmt = "dd/mm/yyyy";
      ws1.eachRow((r) => (r.alignment = { vertical: "top", wrapText: true }));
      head(ws1);
      ws1.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 14 } };

      const ws2 = wb.addWorksheet("Échanges");
      ws2.columns = [{ header: "Structure", key: "a", width: 34 }, { header: "Date", key: "d", width: 13 }, { header: "Type", key: "k", width: 12 }, { header: "Note", key: "b", width: 110 }];
      for (const n of [...notes].filter((x) => ids.has(x.association_id)).sort((a, b) => (byId.get(a.association_id)?.name ?? "").localeCompare(byId.get(b.association_id)?.name ?? "") || b.note_date.localeCompare(a.note_date))) {
        ws2.addRow({ a: byId.get(n.association_id)?.name ?? "", d: new Date(n.note_date + "T00:00:00"), k: KIND_LABEL[n.kind], b: n.body });
      }
      ws2.getColumn("d").numFmt = "dd/mm/yyyy";
      ws2.eachRow((r) => (r.alignment = { vertical: "top", wrapText: true }));
      head(ws2);

      const ws3 = wb.addWorksheet("Interventions");
      ws3.columns = [{ header: "Structure", key: "a", width: 34 }, { header: "Date", key: "d", width: 13 }, { header: "Lieu", key: "p", width: 26 }, { header: "Statut", key: "s", width: 22 }, { header: "Objet / commentaire", key: "o", width: 80 }];
      const rowsI: { a: string; d: string; p: string; s: string; o: string }[] = [];
      for (const v of visits.filter((x) => ids.has(x.association_id))) rowsI.push({ a: byId.get(v.association_id)?.name ?? "", d: v.visit_date, p: v.place ?? "", s: VISIT_STATUS[v.status].label, o: v.purpose ?? "" });
      for (const iv of inters.filter((x) => ids.has(x.association_id))) {
        const dist = first(iv.distributions);
        if (dist) rowsI.push({ a: byId.get(iv.association_id)?.name ?? "", d: dist.event_date, p: placeName.get(dist.beneficiary_id) ?? "", s: "Présente en distribution", o: iv.comment ?? "" });
      }
      for (const r of rowsI.sort((x, y) => x.a.localeCompare(y.a) || y.d.localeCompare(x.d))) ws3.addRow({ ...r, d: new Date(r.d + "T00:00:00") });
      ws3.getColumn("d").numFmt = "dd/mm/yyyy";
      ws3.eachRow((r) => (r.alignment = { vertical: "top", wrapText: true }));
      head(ws3);

      const buf = await wb.xlsx.writeBuffer();
      const url = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `village-associatif-${(city?.name ?? "ville").toLowerCase()}-${today}.xlsx`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (e) {
      setErr("Export impossible : " + (e as Error).message);
    }
    setExporting(false);
  }

  /* ---------- agenda ---------- */
  const agendaRows = useMemo(() => {
    const limit = isoOf(new Date(nowMs + 30 * 86400000));
    return visits
      .filter((v) => v.visit_date >= today && v.status !== "annulee" && (agendaAll || v.visit_date <= limit) && (!agendaPlace || (v.place ?? "") === agendaPlace))
      .sort((a, b) => a.visit_date.localeCompare(b.visit_date));
  }, [visits, today, nowMs, agendaAll, agendaPlace]);
  const agendaPlaces = useMemo(() => Array.from(new Set(visits.map((v) => v.place).filter((p): p is string => !!p))).sort(), [visits]);
  const agendaByDay = useMemo(() => {
    const m = new Map<string, Visit[]>();
    for (const v of agendaRows) m.set(v.visit_date, [...(m.get(v.visit_date) ?? []), v]);
    return Array.from(m.entries());
  }, [agendaRows]);

  function openFiche(id: string) {
    setView("suivi");
    setFStatus("all");
    setShowArchived(false);
    setSearch("");
    setSelId(id);
    window.setTimeout(() => detailRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 120);
  }

  /* ---------- fiche (sous la ligne ouverte) ---------- */
  function fiche(a: Assoc) {
    const dis = !canEdit;
    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-[20px] border border-[var(--border)] bg-[var(--card)] p-5 shadow-[var(--shadow)]" style={{ borderTop: `4px solid ${ORANGE}` }}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <input disabled={dis} value={a.name} onChange={(e) => patch(a.id, { name: e.target.value })} className="w-full rounded-lg border-b-[1.5px] border-transparent bg-transparent px-1 py-0.5 font-display text-[27px] font-black text-[var(--navy)] outline-none hover:border-b-[#eb6834] focus:border-b-[#eb6834] focus:bg-[var(--input-bg)]" />
              <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-[var(--slate)]">
                {a.archived && <span className="rounded-[40px] bg-[var(--track)] px-2.5 py-0.5 font-bold">Archivée</span>}
                <span>{stats.get(a.id)?.count ?? 0} intervention{(stats.get(a.id)?.count ?? 0) > 1 ? "s" : ""} en distribution</span>
                <span className={`font-semibold text-[var(--good)] transition-opacity ${saved ? "opacity-100" : "opacity-0"}`}>Modifications enregistrées</span>
              </div>
            </div>
            {canEdit && (
              <div className="flex flex-none items-center gap-2">
                <button type="button" onClick={() => toggleArchive(a)} className="rounded-[40px] border-[1.5px] border-[var(--border)] px-4 py-2 text-[12.5px] font-semibold text-[var(--navy)] hover:border-[#eb6834]">{a.archived ? "Restaurer" : "Archiver"}</button>
                <button type="button" onClick={() => deleteAssoc(a)} className="rounded-[40px] border-[1.5px] border-[var(--border)] px-4 py-2 text-[12.5px] font-semibold text-[var(--critical)] hover:border-[var(--critical)] hover:bg-[var(--critical-bg)]">Supprimer</button>
              </div>
            )}
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className={labelCls}>Type de structure</label>
              <select disabled={dis} className={fieldCls} value={a.kind} onChange={(e) => patch(a.id, { kind: e.target.value as Assoc["kind"] })}>
                <option value="association">Association</option>
                <option value="institution">Institution</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Statut de la relation</label>
              <select disabled={dis} className={fieldCls} value={a.relation_status ?? ""} onChange={(e) => patch(a.id, { relation_status: e.target.value || null })}>
                <option value="">Sans statut</option>
                {STATUS.map((s) => <option key={s.k} value={s.k}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Type de relation</label>
              <select disabled={dis} className={fieldCls} value={a.relation_type ?? ""} onChange={(e) => patch(a.id, { relation_type: e.target.value || null })}>
                <option value="">À préciser</option>
                <option value="informelle">Informelle</option>
                <option value="convention">Convention signée</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Ancrage</label>
              <select disabled={dis} className={fieldCls} value={a.ancrage ?? ""} onChange={(e) => patch(a.id, { ancrage: e.target.value || null })}>
                <option value="">À préciser</option>
                {ANCRAGES.map((x) => <option key={x}>{x}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Domaine d&apos;intervention</label>
              <input disabled={dis} list="village-activities" className={fieldCls} value={a.activity_type ?? ""} onChange={(e) => patch(a.id, { activity_type: e.target.value })} placeholder="Ex : accès aux droits" />
            </div>
            <div>
              <label className={labelCls}>Fréquence de venue</label>
              <input disabled={dis} className={fieldCls} value={a.frequency ?? ""} onChange={(e) => patch(a.id, { frequency: e.target.value })} placeholder="Ex : 1 fois par mois" />
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <label className={labelCls}>Ce qu&apos;ils font en distribution</label>
              <textarea disabled={dis} className={`${fieldCls} min-h-[64px] resize-y`} value={a.distrib_actions ?? ""} onChange={(e) => patch(a.id, { distrib_actions: e.target.value })} placeholder="Ex : accueil et orientation juridique, flyers, dépistage…  (pré-remplit l'objet de l'intervention dans une distribution)" />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>Prochaine action</label>
              <input disabled={dis} className={fieldCls} value={a.next_action ?? ""} onChange={(e) => patch(a.id, { next_action: e.target.value })} placeholder="Ex : relancer par mail pour fixer une date" />
            </div>
            <div>
              <label className={labelCls}>Pour le</label>
              <input disabled={dis} type="date" className={fieldCls} value={a.next_action_date ?? ""} onChange={(e) => patch(a.id, { next_action_date: e.target.value || null })} />
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <label className={labelCls}>Adresse</label>
              <AddressSearch className={fieldCls} value={a.address ?? ""} onChange={(v) => patch(a.id, { address: v })} onPick={(hit) => patch(a.id, { address: hit.label })} />
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <label className={labelCls}>Description de l&apos;activité</label>
              <textarea disabled={dis} className={`${fieldCls} min-h-[64px] resize-y`} value={a.description ?? ""} onChange={(e) => patch(a.id, { description: e.target.value })} placeholder="Ce que fait la structure, ce qu'elle apporte aux distributions…" />
            </div>
          </div>

          {/* contacts */}
          <div className="mt-5">
            <div className="mb-1.5 flex items-center justify-between">
              <h4 className="text-[13.5px] font-semibold text-[var(--navy)]">Contacts</h4>
              {canEdit && <button type="button" onClick={() => setContacts(a, [...(a.contacts ?? []), { nom: "", role: "", email: "", tel: "" }])} className="text-[12.5px] font-semibold" style={{ color: ORANGE }}>+ Ajouter un contact</button>}
            </div>
            {(a.contacts ?? []).length === 0 && <p className="text-[12.5px] text-[var(--slate)]">Aucun contact renseigné.</p>}
            <div className="flex flex-col gap-2">
              {(a.contacts ?? []).map((c, i) => {
                const upd = (p: Partial<Contact>) => setContacts(a, (a.contacts ?? []).map((x, j) => (j === i ? { ...x, ...p } : x)));
                return (
                  <div key={i} className="grid grid-cols-1 items-center gap-2 rounded-xl bg-[var(--input-bg)] p-2 sm:grid-cols-[1fr_1fr_1.2fr_1fr_auto]">
                    <input disabled={dis} className={fieldCls} placeholder="Nom" value={c.nom} onChange={(e) => upd({ nom: e.target.value })} />
                    <input disabled={dis} className={fieldCls} placeholder="Fonction" value={c.role} onChange={(e) => upd({ role: e.target.value })} />
                    <input disabled={dis} className={fieldCls} placeholder="E-mail" value={c.email} onChange={(e) => upd({ email: e.target.value })} />
                    <input disabled={dis} className={fieldCls} placeholder="Téléphone" value={c.tel} onChange={(e) => upd({ tel: e.target.value })} />
                    {canEdit && <button type="button" onClick={() => setContacts(a, (a.contacts ?? []).filter((_, j) => j !== i))} aria-label="Retirer ce contact" className="h-8 w-8 rounded-full text-[var(--slate)] hover:bg-[var(--critical-bg)] hover:text-[var(--critical)]">×</button>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* interventions planifiées */}
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4" style={{ borderTop: "4px solid #2a78d6" }}>
          <div className="flex items-center justify-between">
            <h3 className="text-[14.5px] font-semibold text-[var(--navy)]">Interventions planifiées</h3>
            {canEdit && <button type="button" onClick={() => addVisit(a.id)} className="text-[12.5px] font-semibold text-[#2a78d6]">+ Planifier une intervention</button>}
          </div>
          <p className="mb-3 text-[11.5px] text-[var(--slate)]">Les dates à venir apparaissent dans « Prochaines interventions ».</p>
          {myVisits.length === 0 && <p className="text-[12.5px] text-[var(--slate)]">Aucune intervention planifiée.</p>}
          <div className="flex flex-col gap-2">
            {myVisits.map((v) => (
              <div key={v.id} className="grid grid-cols-1 items-center gap-2 rounded-xl bg-[var(--input-bg)] p-2 sm:grid-cols-[150px_1fr_150px_1.4fr_auto]">
                <input disabled={dis} type="date" className={fieldCls} value={v.visit_date} onChange={(e) => e.target.value && patchVisit(v.id, { visit_date: e.target.value })} />
                <input disabled={dis} className={fieldCls} placeholder="Lieu (ex : Richter)" defaultValue={v.place ?? ""} key={"p" + v.id + (v.place ?? "")} onBlur={(e) => e.target.value.trim() !== (v.place ?? "") && patchVisit(v.id, { place: e.target.value.trim() || null })} />
                <select disabled={dis} className={fieldCls} value={v.status} onChange={(e) => patchVisit(v.id, { status: e.target.value as Visit["status"] })}>
                  {(Object.keys(VISIT_STATUS) as Visit["status"][]).map((k) => <option key={k} value={k}>{VISIT_STATUS[k].label}</option>)}
                </select>
                <input disabled={dis} className={fieldCls} placeholder="Objet (facultatif)" defaultValue={v.purpose ?? ""} key={"o" + v.id + (v.purpose ?? "")} onBlur={(e) => e.target.value.trim() !== (v.purpose ?? "") && patchVisit(v.id, { purpose: e.target.value.trim() || null })} />
                {canEdit && <button type="button" onClick={() => delVisit(v.id)} aria-label="Supprimer" className="h-8 w-8 rounded-full text-[var(--slate)] hover:bg-[var(--critical-bg)] hover:text-[var(--critical)]">×</button>}
              </div>
            ))}
          </div>
        </div>

        {/* historique des échanges */}
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4" style={{ borderTop: "4px solid var(--client-req)" }}>
          <h3 className="text-[14.5px] font-semibold text-[var(--navy)]">Historique des échanges</h3>
          <p className="mb-3 text-[11.5px] text-[var(--slate)]">Garde le fil de la relation : appels, réunions, mails…</p>
          {canEdit && (
            <div className="mb-3 grid grid-cols-1 gap-2 rounded-xl bg-[var(--input-bg)] p-3 sm:grid-cols-[150px_140px_1fr_auto]">
              <input type="date" className={fieldCls} value={noteDate} onChange={(e) => setNoteDate(e.target.value)} />
              <select className={fieldCls} value={noteKind} onChange={(e) => setNoteKind(e.target.value as Note["kind"])}>
                {(Object.keys(KIND_LABEL) as Note["kind"][]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
              </select>
              <input className={fieldCls} value={noteBody} onChange={(e) => setNoteBody(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addNote(a.id)} placeholder="Ex : appelé pour confirmer sa venue du 12" />
              <button type="button" onClick={() => addNote(a.id)} className="rounded-[40px] px-4 py-2 text-[13px] font-bold text-white" style={{ background: "var(--client-req)" }}>Ajouter</button>
            </div>
          )}
          {myNotes.length === 0 && <p className="text-[12.5px] text-[var(--slate)]">Aucun échange noté pour l&apos;instant.</p>}
          <div className="flex flex-col">
            {myNotes.map((n) => (
              <div key={n.id} className="flex items-start gap-3 border-t border-[var(--border)] py-2.5 first:border-t-0">
                <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-[var(--client-req-bg)] text-[var(--client-req)]">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">{KIND_ICON[n.kind]}</svg>
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[11.5px] text-[var(--slate)]"><strong className="font-semibold text-[var(--navy)]">{KIND_LABEL[n.kind]}</strong> · {fmtDay(n.note_date)}</div>
                  <div className="text-[13px] whitespace-pre-wrap text-[var(--navy)]">{n.body}</div>
                </div>
                {canEdit && <button type="button" onClick={() => delNote(n.id)} title="Supprimer" className="h-7 w-7 flex-none rounded-full text-[var(--slate)] hover:bg-[var(--critical-bg)] hover:text-[var(--critical)]">×</button>}
              </div>
            ))}
          </div>
        </div>

        {/* interventions externes (distributions) */}
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4" style={{ borderTop: `4px solid ${ORANGE}` }}>
          <h3 className="text-[14.5px] font-semibold text-[var(--navy)]">Interventions en distribution</h3>
          <p className="mb-3 text-[11.5px] text-[var(--slate)]">Toutes les distributions où la structure était présente, avec l&apos;objet de son intervention et les photos.</p>
          {myInters.length === 0 && <p className="text-[12.5px] text-[var(--slate)]">Aucune intervention enregistrée. Dans une distribution, ajoute la structure dans « Village associatif ».</p>}
          <div className="flex flex-col gap-3">
            {myInters.map((iv, i) => (
              <div key={i} className="rounded-xl border border-[var(--border)] bg-[var(--input-bg)] p-3">
                <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[13px] font-semibold text-[var(--navy)]">{fmtDay(iv.date)} · {iv.place}</span>
                  <Link href={`/distributions?b=${iv.b}&date=${iv.date}`} className="text-[12px] font-semibold" style={{ color: ORANGE }}>Ouvrir la distribution →</Link>
                </div>
                <p className="mb-2 text-[12.5px] whitespace-pre-wrap text-[var(--slate)]">{iv.comment || "Pas de commentaire."}</p>
                {iv.photos.length > 0 && <PhotoStrip paths={iv.photos} readOnly size={72} />}
              </div>
            ))}
          </div>
        </div>

        {a.notes_raw && (
          <details className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
            <summary className="cursor-pointer text-[13px] font-semibold text-[var(--slate)]">Texte d&apos;origine du tableau Excel (conservé tel quel)</summary>
            <pre className="mt-2 text-[12px] whitespace-pre-wrap text-[var(--slate)]">{a.notes_raw}</pre>
          </details>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[32px] leading-none font-black">Village associatif</h1>
          <p className="mt-1 text-[13.5px] text-[var(--slate)]">Les associations et institutions qui interviennent sur nos distributions ou avec lesquelles on collabore — {city?.name ?? "la ville"}.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={exportXlsx} disabled={exporting || loading} className="rounded-[40px] border-[1.5px] border-[var(--border)] bg-[var(--card)] px-4 py-[8px] font-display text-[13.5px] font-bold text-[var(--navy)] hover:border-[#eb6834] disabled:opacity-50">
            {exporting ? "Export…" : "Exporter en Excel"}
          </button>
          {canEdit && (
            <button type="button" onClick={create} className="rounded-[40px] px-[17px] py-[9px] font-display text-[13.5px] font-bold text-white" style={{ background: ORANGE }}>
              + Ajouter
            </button>
          )}
        </div>
      </div>
      {!standalone && <DistribTabs />}
      <datalist id="village-activities">{ACTIVITIES.map((x) => <option key={x} value={x} />)}</datalist>

      {err && (
        <div className="mb-3 flex items-start justify-between gap-3 rounded-xl bg-[var(--critical-bg)] px-3.5 py-2.5 text-[12.5px] font-semibold text-[var(--critical)]">
          <span>{err}</span>
          <button type="button" onClick={() => setErr(null)}>×</button>
        </div>
      )}

      <div className="mb-3 inline-flex rounded-[40px] bg-[var(--track)] p-[3px]">
        {([["suivi", "Suivi des relations"], ["agenda", "Prochaines interventions"]] as const).map(([k, l]) => (
          <button key={k} type="button" onClick={() => setView(k)} className={`rounded-[40px] px-4 py-1.5 text-[12.5px] font-semibold ${view === k ? "bg-[var(--card)] text-[var(--navy)] shadow-[var(--shadow)]" : "text-[var(--slate)]"}`}>{l}</button>
        ))}
      </div>

      {view === "suivi" ? (
        <div className="rounded-[18px] border border-[var(--border)] bg-[var(--card)] p-3 shadow-[var(--shadow)]" style={{ borderTop: `4px solid ${ORANGE}` }}>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher une structure, un contact, une note…" className={`${fieldCls} mb-2.5`} />
          <div className="mb-2.5 flex flex-wrap items-center gap-1.5">
            {([["all", `Tous ${afterFilters.length}`], ...STATUS.map((s) => [s.k, `${s.label} ${countOf(s.k)}`]), ["none", `Sans statut ${countOf("none")}`]] as [string, string][]).map(([k, l]) => (
              <button key={k} type="button" onClick={() => setFStatus(k)} className={`rounded-[40px] border px-3 py-1 text-[12px] font-semibold whitespace-nowrap ${fStatus === k ? "border-[var(--navy-deep)] bg-[var(--navy-deep)] text-[var(--panel-fg)]" : "border-[var(--border)] text-[var(--slate)] hover:border-[#eb6834]"}`}>{l}</button>
            ))}
          </div>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <select className={selCls} value={fKind} onChange={(e) => setFKind(e.target.value)}><option value="">Tous types</option><option value="association">Associations</option><option value="institution">Institutions</option></select>
            <select className={selCls} value={fDomain} onChange={(e) => setFDomain(e.target.value)}><option value="">Tous domaines</option>{domains.map((d) => <option key={d}>{d}</option>)}</select>
            <select className={selCls} value={fAncrage} onChange={(e) => setFAncrage(e.target.value)}><option value="">Tout ancrage</option>{ANCRAGES.map((x) => <option key={x}>{x}</option>)}</select>
            <select className={selCls} value={fRelation} onChange={(e) => setFRelation(e.target.value)}><option value="">Toute relation</option><option value="convention">Convention signée</option><option value="informelle">Informelle</option></select>
            <label className="flex items-center gap-1.5 text-[12.5px] font-semibold text-[var(--slate)]">
              <input type="checkbox" checked={onlyRelance} onChange={(e) => setOnlyRelance(e.target.checked)} className="accent-[#eb6834]" />
              À relancer ({nRelance})
            </label>
            <button type="button" onClick={() => { setShowArchived((v) => !v); setSelId(null); }} className="ml-auto text-[12px] font-semibold text-[var(--slate)] underline">
              {showArchived ? `Voir les actives (${nActive})` : `Voir les archivées (${assocs.length - nActive})`}
            </button>
          </div>

          <div className={`${ROW_GRID} hidden border-b border-[var(--border)] px-3 pb-2 text-[11px] font-bold tracking-[0.03em] text-[var(--muted)] uppercase lg:grid`}>
            <span>Structure</span><span>Statut</span><span>Relation</span><span>Dernier échange</span><span>Prochaine intervention</span><span />
          </div>
          {loading && <p className="p-4 text-[13px] text-[var(--slate)]">Chargement…</p>}
          {!loading && list.length === 0 && <p className="p-4 text-[13px] text-[var(--slate)]">{assocs.length === 0 ? "Aucune structure pour l'instant. Clique sur « + Ajouter »." : "Aucune structure pour ces filtres."}</p>}
          {list.map((a) => {
            const on = a.id === selId;
            const st = statusOf(a.relation_status);
            const ln = lastNote.get(a.id);
            const nv = nextVisit.get(a.id);
            const relance = needsFollowUp(a);
            return (
              <div key={a.id} ref={on ? detailRef : undefined} className="scroll-mt-4 border-b border-[var(--border)] last:border-b-0">
                <button type="button" aria-expanded={on} onClick={() => { const opening = !on; setSelId(opening ? a.id : null); if (opening) window.setTimeout(() => detailRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 60); }} className={`${ROW_GRID} w-full px-3 py-2.5 text-left hover:bg-[var(--input-bg)] ${on ? "bg-[var(--track)]" : ""}`}>
                  <span className="min-w-0">
                    <span className="block truncate text-[13.5px] font-semibold text-[var(--navy)]">{a.name}</span>
                    <span className="block truncate text-[11.5px] text-[var(--slate)]">
                      <span className="mr-1 rounded border border-[var(--border)] px-1">{a.kind === "institution" ? "Institution" : "Association"}</span>
                      {a.ancrage && <span className="mr-1 rounded border border-[var(--border)] px-1">{a.ancrage}</span>}
                      {a.activity_type || "Domaine non précisé"}
                    </span>
                  </span>
                  <span>
                    <span className="inline-block rounded-[40px] px-2 py-0.5 text-[11px] font-bold" style={st ? { background: st.bg, color: st.fg } : { border: "1px dashed var(--border)", color: "var(--muted)" }}>{st?.label ?? "Sans statut"}</span>
                  </span>
                  <span className="text-[12.5px] text-[var(--navy)]">{a.relation_type ? RELATION[a.relation_type] : <span className="text-[var(--muted)]">—</span>}</span>
                  <span className="text-[12.5px] text-[var(--navy)]">
                    {ln ? fmtShort(ln) : <span className="text-[var(--muted)]">—</span>}
                    {relance && <span className="block text-[11px] font-semibold text-[var(--critical)]">À relancer</span>}
                  </span>
                  <span className="text-[12.5px] text-[var(--navy)]">
                    {nv ? (
                      <>
                        {fmtShort(nv.visit_date)}{nv.place ? ` · ${nv.place}` : ""}
                        {nv.status === "a_confirmer" && <span className="block text-[11px] font-semibold text-[var(--warn)]">à confirmer</span>}
                      </>
                    ) : a.next_action ? <span className="text-[var(--slate)]">{a.next_action}</span> : <span className="text-[var(--muted)]">—</span>}
                  </span>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className={`mt-1 h-4 w-4 flex-none text-[var(--slate)] transition-transform ${on ? "rotate-180" : ""}`} aria-hidden="true"><path d="M6 9 L12 15 L18 9" /></svg>
                </button>
                {on && cur && <div className="mt-1 mb-3 px-1 sm:px-3">{fiche(cur)}</div>}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-[18px] border border-[var(--border)] bg-[var(--card)] p-4 shadow-[var(--shadow)]" style={{ borderTop: "4px solid #2a78d6" }}>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <select className={selCls} value={agendaPlace} onChange={(e) => setAgendaPlace(e.target.value)}><option value="">Tous les lieux</option>{agendaPlaces.map((p) => <option key={p}>{p}</option>)}</select>
            <select className={selCls} value={agendaAll ? "all" : "30"} onChange={(e) => setAgendaAll(e.target.value === "all")}><option value="30">30 prochains jours</option><option value="all">Toutes les dates à venir</option></select>
            <span className="ml-auto text-[12px] text-[var(--slate)]">{agendaRows.length} intervention{agendaRows.length > 1 ? "s" : ""}</span>
          </div>
          {agendaByDay.length === 0 && <p className="py-6 text-center text-[13px] text-[var(--slate)]">Aucune intervention planifiée sur la période. Planifie-en depuis la fiche d&apos;une structure.</p>}
          {agendaByDay.map(([day, vs]) => (
            <div key={day}>
              <div className="mt-3 mb-1.5 text-[12.5px] font-semibold text-[var(--slate)] first-letter:uppercase">{fmtLong(day)}</div>
              {vs.map((v) => {
                const a = assocs.find((x) => x.id === v.association_id);
                if (!a) return null;
                const vs2 = VISIT_STATUS[v.status];
                return (
                  <div key={v.id} className="mb-1.5 flex flex-wrap items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--input-bg)] px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <button type="button" onClick={() => openFiche(a.id)} className="text-left text-[13.5px] font-semibold text-[var(--navy)] hover:underline">{a.name}</button>
                      <div className="text-[12px] text-[var(--slate)]">{[v.place, v.purpose || a.distrib_actions].filter(Boolean).join(" · ") || "Lieu et objet à préciser"}</div>
                    </div>
                    <span className="rounded-[40px] px-2.5 py-0.5 text-[11px] font-bold" style={{ background: vs2.bg, color: vs2.fg }}>{vs2.label}</span>
                    {canEdit && v.status === "a_confirmer" && <button type="button" onClick={() => patchVisit(v.id, { status: "confirmee" })} className="rounded-[40px] border-[1.5px] border-[var(--border)] px-3 py-1 text-[12px] font-semibold text-[var(--navy)] hover:border-[var(--good)]">Marquer confirmée</button>}
                    <button type="button" onClick={() => openFiche(a.id)} className="rounded-[40px] border-[1.5px] border-[var(--border)] px-3 py-1 text-[12px] font-semibold text-[var(--navy)] hover:border-[#eb6834]">Ouvrir la fiche</button>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
