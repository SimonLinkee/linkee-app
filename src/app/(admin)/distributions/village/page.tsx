"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useCity } from "@/components/admin/CityContext";
import DistribTabs from "@/components/DistribTabs";
import PhotoStrip from "@/components/PhotoStrip";
import AddressSearch from "@/components/AddressSearch";

const ORANGE = "#eb6834";

type Assoc = {
  id: string;
  name: string;
  activity_type: string | null;
  collab_type: string | null;
  description: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  address: string | null;
  archived: boolean;
};
type Intervention = { association_id: string; comment: string | null; photo_paths: string[] | null; distributions: { event_date: string; beneficiary_id: string } | { event_date: string; beneficiary_id: string }[] | null };
type Note = { id: string; note_date: string; kind: "appel" | "reunion" | "mail" | "autre"; body: string };

const ASSOC_COLS = "id,name,activity_type,collab_type,description,contact_name,contact_phone,contact_email,address,archived";
const COLLAB = ["Ponctuelle", "Régulière", "Partenariat", "Autre"];
const ACTIVITIES = ["Aide alimentaire", "Insertion", "Sport", "Culture", "Santé", "Éducation", "Environnement", "Aide aux étudiants", "Autre"];
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
const first = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));
const fieldCls = "w-full rounded-[10px] border-[1.5px] border-[var(--border)] bg-[var(--input-bg)] px-2.5 py-2 text-[13px] font-medium text-[var(--navy)] outline-none focus:border-[#eb6834]";
const labelCls = "mb-1 block text-[11.5px] font-semibold text-[var(--slate)]";

export default function VillagePage() {
  const supabase = useMemo(() => createClient(), []);
  const { cityId, city } = useCity();
  const [assocs, setAssocs] = useState<Assoc[]>([]);
  const [inters, setInters] = useState<Intervention[]>([]);
  const [placeName, setPlaceName] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [selId, setSelId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [saved, setSaved] = useState(false);
  const [noteDate, setNoteDate] = useState(isoOf(new Date()));
  const [noteKind, setNoteKind] = useState<Note["kind"]>("appel");
  const [noteBody, setNoteBody] = useState("");
  const timers = useRef<Record<string, number>>({});
  const detailRef = useRef<HTMLDivElement>(null);

  async function load() {
    if (!cityId) return;
    const [a, i, b] = await Promise.all([
      supabase.from("associations").select(ASSOC_COLS).eq("city_id", cityId).order("name"),
      supabase.from("distribution_interventions").select("association_id,comment,photo_paths,distributions!inner(event_date,beneficiary_id,city_id)").eq("distributions.city_id", cityId).limit(5000),
      supabase.from("beneficiaries").select("id,name").eq("city_id", cityId),
    ]);
    if (a.error) setErr(a.error.message + " (la migration 015 est-elle passée ?)");
    setAssocs((a.data ?? []) as Assoc[]);
    setInters((i.data ?? []) as unknown as Intervention[]);
    setPlaceName(new Map(((b.data ?? []) as { id: string; name: string }[]).map((x) => [x.id, x.name])));
    setLoading(false);
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cityId]);

  useEffect(() => {
    if (!selId) return setNotes([]);
    supabase.from("association_notes").select("id,note_date,kind,body").eq("association_id", selId).order("note_date", { ascending: false }).order("created_at", { ascending: false }).then(({ data }) => setNotes((data ?? []) as Note[]));
  }, [supabase, selId]);

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

  const q = search.trim().toLowerCase();
  const list = assocs.filter((a) => a.archived === showArchived && (!q || [a.name, a.activity_type, a.contact_name, a.collab_type].some((x) => (x ?? "").toLowerCase().includes(q))));
  const cur = assocs.find((a) => a.id === selId) ?? null;
  const myInters = useMemo(
    () =>
      inters
        .filter((i) => i.association_id === selId)
        .map((i) => ({ date: first(i.distributions)?.event_date ?? "", place: placeName.get(first(i.distributions)?.beneficiary_id ?? "") ?? "Lieu", b: first(i.distributions)?.beneficiary_id ?? "", comment: i.comment ?? "", photos: i.photo_paths ?? [] }))
        .sort((a, b) => b.date.localeCompare(a.date)),
    [inters, selId, placeName],
  );

  function patch(id: string, p: Partial<Assoc>) {
    setAssocs((prev) => prev.map((a) => (a.id === id ? { ...a, ...p } : a)));
    window.clearTimeout(timers.current[id]);
    timers.current[id] = window.setTimeout(async () => {
      const { error } = await supabase.from("associations").update(p).eq("id", id);
      if (error) return setErr("Enregistrement impossible : " + error.message);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1500);
    }, 600);
  }
  async function create() {
    if (!cityId) return;
    const { data, error } = await supabase.from("associations").insert({ city_id: cityId, name: "Nouvelle association" }).select(ASSOC_COLS).single();
    if (error || !data) return setErr("Création impossible : " + (error?.message ?? "erreur"));
    setAssocs((prev) => [...prev, data as Assoc]);
    setShowArchived(false);
    setSelId((data as Assoc).id);
    window.setTimeout(() => detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  }
  async function toggleArchive(a: Assoc) {
    if (!a.archived && !window.confirm(`Archiver « ${a.name} » ? Elle ne sera plus proposée dans les distributions, mais son historique est conservé.`)) return;
    const { error } = await supabase.from("associations").update({ archived: !a.archived }).eq("id", a.id);
    if (error) return setErr(error.message);
    setAssocs((prev) => prev.map((x) => (x.id === a.id ? { ...x, archived: !a.archived } : x)));
    if (!a.archived) setSelId(null);
  }
  async function addNote() {
    if (!selId || !noteBody.trim()) return;
    const { data, error } = await supabase.from("association_notes").insert({ association_id: selId, note_date: noteDate, kind: noteKind, body: noteBody.trim() }).select("id,note_date,kind,body").single();
    if (error || !data) return setErr("Note non enregistrée : " + (error?.message ?? "erreur"));
    setNotes((prev) => [data as Note, ...prev].sort((a, b) => b.note_date.localeCompare(a.note_date)));
    setNoteBody("");
  }
  async function delNote(id: string) {
    if (!window.confirm("Supprimer cette note ?")) return;
    await supabase.from("association_notes").delete().eq("id", id);
    setNotes((prev) => prev.filter((n) => n.id !== id));
  }

  const nActive = assocs.filter((a) => !a.archived).length;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[32px] leading-none font-black">Village associatif</h1>
          <p className="mt-1 text-[13.5px] text-[var(--slate)]">Les associations qui interviennent sur nos distributions ou avec lesquelles on collabore — {city?.name ?? "la ville"}.</p>
        </div>
        <button type="button" onClick={create} className="rounded-[40px] px-[17px] py-[9px] font-display text-[13.5px] font-bold text-white" style={{ background: ORANGE }}>
          + Ajouter une association
        </button>
      </div>
      <DistribTabs />

      {err && (
        <div className="mb-3 flex items-start justify-between gap-3 rounded-xl bg-[var(--critical-bg)] px-3.5 py-2.5 text-[12.5px] font-semibold text-[var(--critical)]">
          <span>{err}</span>
          <button type="button" onClick={() => setErr(null)}>×</button>
        </div>
      )}

      <div className="grid grid-cols-1 items-start gap-[18px] xl:grid-cols-[400px_1fr]">
        {/* ---- listing ---- */}
        <div className="rounded-[18px] border border-[var(--border)] bg-[var(--card)] p-2.5 shadow-[var(--shadow)]" style={{ borderTop: `4px solid ${ORANGE}` }}>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher (nom, activité, contact…)" className={`${fieldCls} mb-2`} />
          <div className="mb-2 flex gap-1 rounded-[40px] bg-[var(--input-bg)] p-1">
            <button type="button" onClick={() => setShowArchived(false)} className={`flex-1 rounded-[40px] px-2 py-1.5 text-[12px] font-semibold ${!showArchived ? "bg-[var(--navy-deep)] text-[var(--panel-fg)]" : "text-[var(--slate)]"}`}>Actives ({nActive})</button>
            <button type="button" onClick={() => setShowArchived(true)} className={`flex-1 rounded-[40px] px-2 py-1.5 text-[12px] font-semibold ${showArchived ? "bg-[var(--navy-deep)] text-[var(--panel-fg)]" : "text-[var(--slate)]"}`}>Archivées ({assocs.length - nActive})</button>
          </div>
          <div className="max-h-[calc(100vh-300px)] overflow-y-auto">
            {loading && <p className="p-4 text-[13px] text-[var(--slate)]">Chargement…</p>}
            {!loading && list.length === 0 && <p className="p-4 text-[13px] text-[var(--slate)]">{showArchived ? "Aucune association archivée." : "Aucune association. Clique sur « Ajouter une association »."}</p>}
            {list.map((a) => {
              const s = stats.get(a.id);
              const on = a.id === selId;
              return (
                <button key={a.id} type="button" onClick={() => { setSelId(a.id); window.setTimeout(() => detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60); }} className={`mb-1 flex w-full items-start gap-3 rounded-xl border-[1.5px] px-3 py-2.5 text-left ${on ? "bg-[var(--track)]" : "border-transparent hover:bg-[var(--input-bg)]"}`} style={on ? { borderColor: ORANGE } : undefined}>
                  <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full font-display text-[15px] font-bold text-white" style={{ background: ORANGE }}>
                    {a.name.trim().charAt(0).toUpperCase() || "?"}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-semibold text-[var(--navy)]">{a.name}</span>
                    <span className="block truncate text-[11.5px] text-[var(--slate)]">{a.activity_type || "Activité non précisée"}</span>
                    <span className="block truncate text-[11.5px] text-[var(--slate)]">Contact : {a.contact_name || "—"}</span>
                    <span className="mt-0.5 block text-[11px] text-[var(--slate)]">Dernière intervention : <strong className="font-semibold text-[var(--navy)]">{s?.last ? fmtShort(s.last) : "aucune"}</strong></span>
                  </span>
                  {s && <span className="flex-none rounded-[40px] px-2 py-0.5 text-[11px] font-bold text-white" style={{ background: ORANGE }} title="Interventions">{s.count}</span>}
                </button>
              );
            })}
          </div>
        </div>

        {/* ---- fiche ---- */}
        <div ref={detailRef} className="scroll-mt-4 min-w-0">
          {!cur ? (
            <div className="flex flex-col items-center gap-3 rounded-[20px] border border-dashed border-[var(--border)] bg-[var(--card)] px-6 py-[70px] text-center text-[var(--slate)]">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl text-white" style={{ background: ORANGE }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className="h-8 w-8">{KIND_ICON.reunion}</svg>
              </span>
              <p className="text-[15px] font-semibold text-[var(--navy)]">Sélectionne une association</p>
              <p className="max-w-[380px] text-[13px]">Retrouve sa fiche, l&apos;historique de vos échanges et toutes ses interventions sur les distributions.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="rounded-[20px] border border-[var(--border)] bg-[var(--card)] p-5 shadow-[var(--shadow)]" style={{ borderTop: `4px solid ${ORANGE}` }}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <input value={cur.name} onChange={(e) => patch(cur.id, { name: e.target.value })} className="w-full rounded-lg border-b-[1.5px] border-transparent bg-transparent px-1 py-0.5 font-display text-[27px] font-black text-[var(--navy)] outline-none hover:border-b-[#eb6834] focus:border-b-[#eb6834] focus:bg-[var(--input-bg)]" />
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-[var(--slate)]">
                      {cur.archived && <span className="rounded-[40px] bg-[var(--track)] px-2.5 py-0.5 font-bold">Archivée</span>}
                      <span>{stats.get(cur.id)?.count ?? 0} intervention{(stats.get(cur.id)?.count ?? 0) > 1 ? "s" : ""}</span>
                      <span className={`font-semibold text-[var(--good)] transition-opacity ${saved ? "opacity-100" : "opacity-0"}`}>Modifications enregistrées</span>
                    </div>
                  </div>
                  <button type="button" onClick={() => toggleArchive(cur)} className="rounded-[40px] border-[1.5px] border-[var(--border)] px-4 py-2 text-[12.5px] font-semibold text-[var(--navy)] hover:border-[#eb6834]">
                    {cur.archived ? "Restaurer" : "Archiver"}
                  </button>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className={labelCls}>Type d&apos;activité</label>
                    <input list="village-activities" className={fieldCls} value={cur.activity_type ?? ""} onChange={(e) => patch(cur.id, { activity_type: e.target.value })} placeholder="Ex : aide aux étudiants" />
                    <datalist id="village-activities">{ACTIVITIES.map((x) => <option key={x} value={x} />)}</datalist>
                  </div>
                  <div>
                    <label className={labelCls}>Type de collaboration</label>
                    <select className={fieldCls} value={cur.collab_type ?? ""} onChange={(e) => patch(cur.id, { collab_type: e.target.value })}>
                      <option value="">À préciser</option>
                      {COLLAB.map((x) => <option key={x}>{x}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Contact référent</label>
                    <input className={fieldCls} value={cur.contact_name ?? ""} onChange={(e) => patch(cur.id, { contact_name: e.target.value })} placeholder="Prénom Nom" />
                  </div>
                  <div>
                    <label className={labelCls}>Téléphone</label>
                    <input className={fieldCls} value={cur.contact_phone ?? ""} onChange={(e) => patch(cur.id, { contact_phone: e.target.value })} />
                  </div>
                  <div>
                    <label className={labelCls}>E-mail</label>
                    <input type="email" className={fieldCls} value={cur.contact_email ?? ""} onChange={(e) => patch(cur.id, { contact_email: e.target.value })} />
                  </div>
                  <div>
                    <label className={labelCls}>Adresse</label>
                    <AddressSearch
                      className={fieldCls}
                      value={cur.address ?? ""}
                      onChange={(v) => patch(cur.id, { address: v })}
                      onPick={(hit) => patch(cur.id, { address: hit.label })}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className={labelCls}>Description de l&apos;activité</label>
                    <textarea className={`${fieldCls} min-h-[84px] resize-y`} value={cur.description ?? ""} onChange={(e) => patch(cur.id, { description: e.target.value })} placeholder="Ce que fait l'association, ce qu'elle apporte aux distributions…" />
                  </div>
                </div>
              </div>

              {/* exchanges log */}
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4" style={{ borderTop: "4px solid var(--client-req)" }}>
                <h3 className="text-[14.5px] font-semibold text-[var(--navy)]">Historique des échanges</h3>
                <p className="mb-3 text-[11.5px] text-[var(--slate)]">Garde le fil de la relation : appels, réunions, mails…</p>
                <div className="mb-3 grid grid-cols-1 gap-2 rounded-xl bg-[var(--input-bg)] p-3 sm:grid-cols-[150px_140px_1fr_auto]">
                  <input type="date" className={fieldCls} value={noteDate} onChange={(e) => setNoteDate(e.target.value)} />
                  <select className={fieldCls} value={noteKind} onChange={(e) => setNoteKind(e.target.value as Note["kind"])}>
                    {(Object.keys(KIND_LABEL) as Note["kind"][]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
                  </select>
                  <input className={fieldCls} value={noteBody} onChange={(e) => setNoteBody(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addNote()} placeholder="Ex : appelé pour confirmer sa venue du 12" />
                  <button type="button" onClick={addNote} className="rounded-[40px] px-4 py-2 text-[13px] font-bold text-white" style={{ background: "var(--client-req)" }}>Ajouter</button>
                </div>
                {notes.length === 0 && <p className="text-[12.5px] text-[var(--slate)]">Aucun échange noté pour l&apos;instant.</p>}
                <div className="flex flex-col">
                  {notes.map((n) => (
                    <div key={n.id} className="flex items-start gap-3 border-t border-[var(--border)] py-2.5 first:border-t-0">
                      <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-[var(--client-req-bg)] text-[var(--client-req)]">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">{KIND_ICON[n.kind]}</svg>
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-[11.5px] text-[var(--slate)]"><strong className="font-semibold text-[var(--navy)]">{KIND_LABEL[n.kind]}</strong> · {fmtDay(n.note_date)}</div>
                        <div className="text-[13px] whitespace-pre-wrap text-[var(--navy)]">{n.body}</div>
                      </div>
                      <button type="button" onClick={() => delNote(n.id)} title="Supprimer" className="h-7 w-7 flex-none rounded-full text-[var(--slate)] hover:bg-[var(--critical-bg)] hover:text-[var(--critical)]">×</button>
                    </div>
                  ))}
                </div>
              </div>

              {/* external interventions */}
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4" style={{ borderTop: `4px solid ${ORANGE}` }}>
                <h3 className="text-[14.5px] font-semibold text-[var(--navy)]">Interventions externes</h3>
                <p className="mb-3 text-[11.5px] text-[var(--slate)]">Toutes les distributions où l&apos;association était présente.</p>
                {myInters.length === 0 && <p className="text-[12.5px] text-[var(--slate)]">Aucune intervention enregistrée. Dans une distribution, coche l&apos;association dans « Associations présentes ».</p>}
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
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
