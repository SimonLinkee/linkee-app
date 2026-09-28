"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useCity } from "@/components/admin/CityContext";
import { IMPORTANCE_COLOR, IMPORTANCE_LABEL, ImportanceDots, STATUS_LABEL, deadlineInfo, type MissionStatus } from "@/components/MissionBits";

type Mission = {
  id: string;
  title: string;
  comment: string | null;
  importance: number;
  deadline: string | null;
  assigned_to: string | null;
  status: MissionStatus;
  done_at: string | null;
  created_at: string;
};
type Person = { id: string; name: string; role: string };
type Draft = { id?: string; title: string; comment: string; importance: number; deadline: string; assigned_to: string };

const EMPTY: Draft = { title: "", comment: "", importance: 3, deadline: "", assigned_to: "" };
const ROLE_SHORT: Record<string, string> = { admin_principal: "Superadmin", admin_local: "Responsable d'antenne", logisticien: "Logisticien" };
const fieldCls = "w-full rounded-[11px] border-[1.5px] border-[var(--border)] bg-[var(--input-bg)] px-3 py-2.5 text-[13.5px] font-medium text-[var(--navy)] outline-none focus:border-[var(--turquoise)]";
const labelCls = "mb-1.5 block text-[11.5px] font-bold tracking-[0.03em] text-[var(--slate)] uppercase";
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export default function TodoPage() {
  const supabase = useMemo(() => createClient(), []);
  const { cityId, city } = useCity(); // the page remounts when the city changes
  const [missions, setMissions] = useState<Mission[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [me, setMe] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [show, setShow] = useState<"open" | "done" | "all">("open");
  const [who, setWho] = useState(""); // "" = everyone, "none" = unassigned, else profile id
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [err, setErr] = useState("");
  const [confirmDel, setConfirmDel] = useState<Mission | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(null), 3000);
  }

  async function load() {
    const { data: auth } = await supabase.auth.getUser();
    setMe(auth.user?.id ?? null);
    const [m, p] = await Promise.all([
      supabase.from("missions").select("id,title,comment,importance,deadline,assigned_to,status,done_at,created_at").eq("city_id", cityId ?? "").order("created_at", { ascending: false }),
      supabase.from("profiles").select("id,full_name,email,role,city_id").eq("active", true).in("role", ["admin_principal", "admin_local", "logisticien"]),
    ]);
    if (m.error) showToast("Chargement impossible : " + m.error.message + " (la migration 012 est-elle passée ?)");
    setMissions((m.data ?? []) as unknown as Mission[]);
    const staff = ((p.data ?? []) as unknown as { id: string; full_name: string | null; email: string | null; role: string; city_id: string | null }[])
      .filter((x) => x.role === "admin_principal" || x.city_id === cityId)
      .map((x) => ({ id: x.id, name: x.full_name || x.email || "Sans nom", role: x.role }));
    setPeople(staff);
    setLoading(false);
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const nameOf = (id: string | null) => people.find((p) => p.id === id)?.name ?? null;

  const visible = missions
    .filter((m) => (show === "all" ? true : show === "done" ? m.status === "fait" : m.status !== "fait"))
    .filter((m) => (who === "" ? true : who === "none" ? !m.assigned_to : m.assigned_to === who))
    .filter((m) => {
      const q = norm(search).trim();
      if (!q) return true;
      const hay = norm([m.title, m.comment ?? "", nameOf(m.assigned_to) ?? "non attribuee", STATUS_LABEL[m.status], IMPORTANCE_LABEL[m.importance], `${m.importance}/5`].join(" "));
      return q.split(/\s+/).every((w) => hay.includes(w));
    })
    .sort((a, b) => {
      if ((a.status === "fait") !== (b.status === "fait")) return a.status === "fait" ? 1 : -1;
      if (a.importance !== b.importance) return b.importance - a.importance;
      return (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999");
    });

  const openCount = missions.filter((m) => m.status !== "fait").length;
  const lateCount = missions.filter((m) => m.status !== "fait" && m.deadline && m.deadline < new Date().toISOString().slice(0, 10)).length;

  async function save() {
    if (!draft) return;
    if (!draft.title.trim()) return setErr("Donne un intitulé à la mission.");
    if (!cityId) return setErr("Aucune ville sélectionnée.");
    const row = { title: draft.title.trim(), comment: draft.comment.trim() || null, importance: draft.importance, deadline: draft.deadline || null, assigned_to: draft.assigned_to || null };
    const res = draft.id
      ? await supabase.from("missions").update(row).eq("id", draft.id)
      : await supabase.from("missions").insert({ ...row, city_id: cityId, created_by: me });
    if (res.error) return setErr(res.error.message);
    setDraft(null);
    setErr("");
    showToast(draft.id ? "Mission modifiée." : row.assigned_to ? "Mission créée — la personne a reçu une notification." : "Mission créée.");
    load();
  }

  async function setStatus(m: Mission, status: MissionStatus) {
    const { error } = await supabase.from("missions").update({ status, done_at: status === "fait" ? new Date().toISOString() : null }).eq("id", m.id);
    if (error) return showToast("Modification impossible : " + error.message);
    setMissions((prev) => prev.map((x) => (x.id === m.id ? { ...x, status, done_at: status === "fait" ? new Date().toISOString() : null } : x)));
  }

  async function remove() {
    if (!confirmDel) return;
    const { error } = await supabase.from("missions").delete().eq("id", confirmDel.id);
    if (error) showToast("Suppression impossible : " + error.message);
    else {
      setMissions((prev) => prev.filter((x) => x.id !== confirmDel.id));
      showToast("Mission supprimée.");
    }
    setConfirmDel(null);
  }

  return (
    <div className="max-w-[980px]">
      <div className="mb-[18px] flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-[32px] leading-none font-black">TODO</h1>
          <p className="text-[13.5px] text-[var(--slate)]">Les priorités du moment{city ? ` à ${city.name}` : ""} : qui fait quoi, pour quand, et avec quelle importance.</p>
        </div>
        <button type="button" onClick={() => { setDraft({ ...EMPTY }); setErr(""); }} className="flex items-center gap-1.5 rounded-[40px] bg-[var(--navy-deep)] px-[18px] py-2.5 font-display text-[13.5px] font-bold text-[var(--panel-fg)]">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="h-[15px] w-[15px]">
            <path d="M12 5 V19 M5 12 H19" />
          </svg>
          Nouvelle mission
        </button>
      </div>

      <div className="mb-4 flex flex-wrap gap-3">
        <div className="min-w-[130px] rounded-[14px] border border-[var(--border)] bg-[var(--card)] px-[18px] py-3 shadow-[var(--shadow)]">
          <span className="mb-1 block text-[10.5px] font-bold tracking-[0.03em] text-[var(--slate)] uppercase">Ouvertes</span>
          <span className="font-display text-[22px] font-black text-[var(--navy)]">{openCount}</span>
        </div>
        <div className="min-w-[130px] rounded-[14px] border border-[var(--border)] bg-[var(--card)] px-[18px] py-3 shadow-[var(--shadow)]">
          <span className="mb-1 block text-[10.5px] font-bold tracking-[0.03em] text-[var(--slate)] uppercase">En retard</span>
          <span className={`font-display text-[22px] font-black ${lateCount ? "text-[var(--critical)]" : "text-[var(--good)]"}`}>{lateCount}</span>
        </div>
      </div>

      <div className="mb-3.5 flex flex-wrap items-center gap-2.5">
        <div className="flex rounded-[40px] border border-[var(--border)] bg-[var(--card)] p-[3px] shadow-[var(--shadow)]">
          {(
            [
              ["open", "Ouvertes"],
              ["done", "Terminées"],
              ["all", "Toutes"],
            ] as const
          ).map(([k, l]) => (
            <button key={k} type="button" onClick={() => setShow(k)} className={`rounded-[40px] px-4 py-1.5 font-display text-[13px] font-bold ${show === k ? "bg-[var(--navy-deep)] text-[var(--panel-fg)]" : "text-[var(--slate)]"}`}>
              {l}
            </button>
          ))}
        </div>
        <select value={who} onChange={(e) => setWho(e.target.value)} className="rounded-[40px] border border-[var(--border)] bg-[var(--card)] px-3.5 py-2 text-[12.5px] font-semibold text-[var(--navy)]">
          <option value="">Tout le monde</option>
          {me && <option value={me}>Moi</option>}
          <option value="none">Non attribuées</option>
          {people.filter((p) => p.id !== me).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher une mission…" className="w-full max-w-[260px] rounded-[40px] border border-[var(--border)] bg-[var(--card)] px-4 py-2 text-[13px] text-[var(--navy)] outline-none focus:border-[var(--turquoise)]" />
      </div>

      <div className="flex flex-col gap-3">
        {loading && <p className="text-[13px] text-[var(--slate)]">Chargement…</p>}
        {!loading && visible.length === 0 && (
          <div className="rounded-[18px] border border-dashed border-[var(--border)] bg-[var(--card)] px-6 py-10 text-center text-[13px] text-[var(--slate)]">
            {missions.length === 0 ? "Aucune mission pour l'instant — clique sur « Nouvelle mission » pour poser la première priorité." : "Aucune mission ne correspond à ces filtres."}
          </div>
        )}
        {visible.map((m) => {
          const dl = deadlineInfo(m.deadline, m.status === "fait");
          const person = nameOf(m.assigned_to);
          const done = m.status === "fait";
          return (
            <div key={m.id} className={`overflow-hidden rounded-[18px] border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow)] ${done ? "opacity-65" : ""}`} style={{ borderLeft: `6px solid ${IMPORTANCE_COLOR[m.importance]}` }}>
              <div className="flex flex-wrap items-start gap-x-4 gap-y-2 px-5 py-4">
                <div className="min-w-[220px] flex-1">
                  <h3 className={`font-display text-[18px] leading-tight font-extrabold text-[var(--navy)] ${done ? "line-through" : ""}`}>{m.title}</h3>
                  {m.comment && <p className="mt-1 text-[13px] leading-[1.5] whitespace-pre-line text-[var(--slate)]">{m.comment}</p>}
                  <div className="mt-2.5 flex flex-wrap items-center gap-2.5">
                    <ImportanceDots level={m.importance} />
                    <span className="rounded-[40px] px-2.5 py-1 text-[11.5px] font-bold" style={{ background: dl.bg, color: dl.color }}>
                      {m.deadline ? "Deadline : " : ""}
                      {dl.text}
                    </span>
                    <span className="flex items-center gap-1.5 rounded-[40px] bg-[var(--track)] py-1 pr-3 pl-1 text-[11.5px] font-bold text-[var(--navy)]">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full font-display text-[10px] font-bold" style={{ background: person ? "var(--turquoise)" : "var(--border)", color: person ? "#04262e" : "var(--slate)" }}>
                        {person ? person.charAt(0).toUpperCase() : "?"}
                      </span>
                      {person ?? "Non attribuée"}
                    </span>
                  </div>
                </div>
                <div className="flex flex-none items-center gap-2">
                  <select value={m.status} onChange={(e) => setStatus(m, e.target.value as MissionStatus)} className="rounded-[10px] border-[1.5px] border-[var(--border)] bg-[var(--input-bg)] px-2.5 py-2 text-[12.5px] font-bold text-[var(--navy)]">
                    {(Object.keys(STATUS_LABEL) as MissionStatus[]).map((s) => (
                      <option key={s} value={s}>
                        {STATUS_LABEL[s]}
                      </option>
                    ))}
                  </select>
                  <button type="button" title="Modifier" onClick={() => { setDraft({ id: m.id, title: m.title, comment: m.comment ?? "", importance: m.importance, deadline: m.deadline ?? "", assigned_to: m.assigned_to ?? "" }); setErr(""); }} className="flex h-8 w-8 items-center justify-center rounded-full border-[1.5px] border-[var(--border)] bg-[var(--input-bg)] text-[var(--slate)] hover:border-[var(--turquoise)] hover:text-[var(--turquoise)]">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                      <path d="M4 20 L4.8 16.5 L16 5.3 C16.8 4.5,18 4.5,18.8 5.3 L18.7 5.2 C19.5 6,19.5 7.2,18.7 8 L7.5 19.2 Z M14 7 L17 10" />
                    </svg>
                  </button>
                  <button type="button" title="Supprimer" onClick={() => setConfirmDel(m)} className="flex h-8 w-8 items-center justify-center rounded-full border-[1.5px] border-[var(--border)] bg-[var(--input-bg)] text-[var(--slate)] hover:border-[var(--critical)] hover:bg-[var(--critical-bg)] hover:text-[var(--critical)]">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                      <path d="M4 7 H20 M9 7 V4 H15 V7 M6 7 L7 20 H17 L18 7" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {draft && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center overflow-y-auto bg-black/55 p-4" onClick={() => setDraft(null)}>
          <div className="w-full max-w-[520px] rounded-[20px] bg-[var(--card)] p-6 shadow-[var(--shadow)]" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-4 font-display text-[22px] font-black text-[var(--navy)]">{draft.id ? "Modifier la mission" : "Nouvelle mission"}</h3>
            <div className="mb-3.5">
              <label className={labelCls}>Intitulé</label>
              <input autoFocus className={fieldCls} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Ex : Inventaire du stock" />
            </div>
            <div className="mb-3.5">
              <label className={labelCls}>Commentaire</label>
              <textarea className={`${fieldCls} min-h-[90px] resize-y`} value={draft.comment} onChange={(e) => setDraft({ ...draft, comment: e.target.value })} placeholder="Ex : faire l'inventaire de chaque produit, ses quantités, nombre de colis et poids" />
            </div>
            <div className="mb-3.5">
              <label className={labelCls}>Niveau d&apos;importance</label>
              <div className="grid grid-cols-5 gap-1.5">
                {[1, 2, 3, 4, 5].map((n) => {
                  const on = draft.importance === n;
                  return (
                    <button key={n} type="button" onClick={() => setDraft({ ...draft, importance: n })} className="rounded-xl border-2 py-2 text-center" style={on ? { borderColor: IMPORTANCE_COLOR[n], background: IMPORTANCE_COLOR[n], color: "#fff" } : { borderColor: "var(--border)", background: "var(--input-bg)", color: "var(--navy)" }}>
                      <span className="block font-display text-[18px] leading-none font-black">{n}/5</span>
                      <span className="mt-0.5 block text-[10px] font-semibold">{IMPORTANCE_LABEL[n]}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="mb-3.5 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className={labelCls}>Deadline</label>
                <input type="date" className={fieldCls} value={draft.deadline} onChange={(e) => setDraft({ ...draft, deadline: e.target.value })} />
              </div>
              <div>
                <label className={labelCls}>Personne en charge</label>
                <select className={fieldCls} value={draft.assigned_to} onChange={(e) => setDraft({ ...draft, assigned_to: e.target.value })}>
                  <option value="">Non attribuée</option>
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — {ROLE_SHORT[p.role] ?? p.role}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {!people.some((p) => p.role === "logisticien") && (
              <p className="mb-3 rounded-xl bg-[var(--warn-bg)] px-3.5 py-2.5 text-[12px] font-semibold text-[var(--warn)]">
                Aucun logisticien n&apos;est rattaché à {city?.name ?? "cette ville"}. Les missions se confient aux personnes de la ville affichée dans le menu : change de ville en haut à gauche, ou rattache un compte à cette ville dans Villes &amp; comptes.
              </p>
            )}
            <p className="mb-3 text-[11.5px] text-[var(--slate)]">La personne choisie reçoit une notification. Un logisticien retrouve la mission dans le cadre « Mes missions » de son écran.</p>
            {err && <div className="mb-3 rounded-xl bg-[var(--critical-bg)] px-3.5 py-2.5 text-[12.5px] font-semibold text-[var(--critical)]">{err}</div>}
            <div className="flex gap-2.5">
              <button type="button" onClick={save} className="flex-1 rounded-[40px] bg-[var(--navy-deep)] px-4 py-3 font-display text-[14px] font-bold text-[var(--panel-fg)]">
                {draft.id ? "Enregistrer" : "Créer la mission"}
              </button>
              <button type="button" onClick={() => setDraft(null)} className="rounded-[40px] border-[1.5px] border-[var(--border)] px-5 py-3 font-display text-[14px] font-bold text-[var(--slate)]">
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDel && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/55 p-4" onClick={() => setConfirmDel(null)}>
          <div className="w-full max-w-[400px] rounded-[20px] bg-[var(--card)] p-6 shadow-[var(--shadow)]" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display text-[20px] font-black text-[var(--navy)]">Supprimer cette mission ?</h3>
            <p className="mt-2 text-[13.5px] text-[var(--slate)]">« {confirmDel.title} » disparaîtra aussi de l&apos;écran de la personne en charge. Si elle est simplement terminée, change plutôt son statut.</p>
            <div className="mt-5 flex gap-2.5">
              <button type="button" autoFocus onClick={() => setConfirmDel(null)} className="flex-1 rounded-[40px] border-[1.5px] border-[var(--border)] px-4 py-3 font-display text-[14px] font-bold text-[var(--navy)]">
                Annuler
              </button>
              <button type="button" onClick={remove} className="flex-1 rounded-[40px] bg-[var(--critical)] px-4 py-3 font-display text-[14px] font-bold text-white">
                Oui, supprimer
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="fixed bottom-[26px] left-1/2 z-[1100] max-w-[420px] -translate-x-1/2 rounded-[14px] bg-[var(--navy-deep)] px-[18px] py-3 text-center text-[13px] font-semibold text-[var(--panel-fg)] shadow-[var(--shadow)]">{toast}</div>}
    </div>
  );
}
