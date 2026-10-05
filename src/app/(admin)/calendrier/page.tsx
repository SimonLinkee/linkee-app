"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useCity, type City } from "@/components/admin/CityContext";
import { isSuper } from "@/lib/roles";

// Calendrier multi-villes + encart ACTU (news Linkee national). Migration 058.
// Lecture : équipe interne, toutes villes (vue nationale par défaut).
// Écriture : Superadmin, Comptabilité, Resp. RH → toutes les villes ; Resp. d'antenne et Resp. Distribution → leur ville.
// ACTU : publiées / épinglées / retirées par le Superadmin (et la Comptabilité, mêmes droits en base).

type CalEvent = {
  id: string;
  city_id: string;
  title: string;
  event_date: string;
  start_time: string | null;
  end_time: string | null;
  place: string | null;
  description: string | null;
};
type News = { id: string; title: string; body: string | null; pinned: boolean; published_on: string };
type Form = { id?: string; title: string; date: string; start: string; end: string; cityId: string; place: string; description: string };

const EV_COLS = "id,city_id,title,event_date,start_time,end_time,place,description";
const DOWS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const isoOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const hm = (t: string | null) => (t ? t.slice(0, 5) : "");
const fmtShort = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
const tint = (c: string, pct: number) => `color-mix(in srgb, ${c} ${pct}%, transparent)`;
const fieldCls = "w-full rounded-[10px] border-[1.5px] border-[var(--border)] bg-[var(--input-bg)] px-2.5 py-2 text-[13px] font-medium text-[var(--navy)] outline-none focus:border-[var(--turquoise)] disabled:opacity-70";
const labelCls = "mb-1 block text-[11.5px] font-semibold text-[var(--slate)]";
const btnCls = "rounded-[40px] border-[1.5px] border-[var(--border)] bg-[var(--card)] px-4 py-2 text-[12.5px] font-semibold text-[var(--navy)] hover:border-[var(--turquoise)]";
const priCls = "rounded-[40px] bg-[var(--navy-deep)] px-[17px] py-[9px] font-display text-[13.5px] font-bold text-[var(--panel-fg)] disabled:opacity-50";

export default function CalendrierPage() {
  const supabase = useMemo(() => createClient(), []);
  const { role, cities, city } = useCity();
  const today = isoOf(new Date());

  // qui peut écrire où
  const national = isSuper(role) || role === "resp_rh";
  const writable: City[] = national ? cities : cities.filter((c) => c.id === city?.id);
  const canWrite = (cityId: string) => writable.some((c) => c.id === cityId);
  const canNews = isSuper(role);

  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [view, setView] = useState<"mois" | "liste">("mois");
  const [active, setActive] = useState<Set<string> | null>(null); // null = toutes les villes
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [upcoming, setUpcoming] = useState<CalEvent[]>([]);
  const [news, setNews] = useState<News[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);
  const [newsForm, setNewsForm] = useState<{ title: string; body: string; pinned: boolean } | null>(null);

  const cityById = useMemo(() => new Map(cities.map((c) => [c.id, c])), [cities]);
  const colorOf = (id: string) => cityById.get(id)?.color ?? "var(--slate)";
  const shownCity = (id: string) => !active || active.has(id);

  // grille du mois : du lundi de la 1re semaine au dimanche de la 6e
  const gridStart = useMemo(() => {
    const d = new Date(month);
    d.setDate(1 - ((month.getDay() + 6) % 7));
    return d;
  }, [month]);
  const gridDays = useMemo(
    () =>
      Array.from({ length: 42 }, (_, i) => {
        const d = new Date(gridStart);
        d.setDate(gridStart.getDate() + i);
        return d;
      }),
    [gridStart],
  );
  const from = isoOf(gridDays[0]);
  const to = isoOf(gridDays[41]);

  async function loadEvents() {
    const [m, u] = await Promise.all([
      supabase.from("calendar_events").select(EV_COLS).gte("event_date", from).lte("event_date", to).order("event_date").order("start_time", { nullsFirst: true }),
      supabase.from("calendar_events").select(EV_COLS).gte("event_date", today).order("event_date").order("start_time", { nullsFirst: true }).limit(60),
    ]);
    if (m.error) return setErr("Chargement impossible : " + m.error.message + " (la migration 058 est-elle passée ?)");
    setEvents((m.data ?? []) as CalEvent[]);
    setUpcoming((u.data ?? []) as CalEvent[]);
  }
  async function loadNews() {
    const { data, error } = await supabase.from("news").select("id,title,body,pinned,published_on").order("pinned", { ascending: false }).order("published_on", { ascending: false }).order("created_at", { ascending: false }).limit(3);
    if (!error) setNews((data ?? []) as News[]);
  }
  useEffect(() => {
    const t = window.setTimeout(() => void loadEvents(), 0); // chargement hors du rendu (règle react-hooks/set-state-in-effect)
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);
  useEffect(() => {
    const t = window.setTimeout(() => void loadNews(), 0);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visible = events.filter((e) => shownCity(e.city_id));
  const byDay = useMemo(() => {
    const m = new Map<string, CalEvent[]>();
    for (const e of visible) m.set(e.event_date, [...(m.get(e.event_date) ?? []), e]);
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, active]);
  const monthFrom = isoOf(month);
  const monthTo = isoOf(new Date(month.getFullYear(), month.getMonth() + 1, 0));
  const listRows = visible.filter((e) => e.event_date >= monthFrom && e.event_date <= monthTo);
  const nextRows = upcoming.filter((e) => shownCity(e.city_id)).slice(0, 6);

  /* ---------- filtres ville ---------- */
  function toggleCity(id: string) {
    setActive((prev) => {
      const next = new Set(prev ?? cities.map((c) => c.id));
      if (next.has(id)) next.delete(id);
      else next.add(id);
      if (next.size === 0 || next.size === cities.length) return null;
      return next;
    });
  }

  /* ---------- événement : créer / modifier / supprimer ---------- */
  function openNew(date?: string) {
    if (!writable.length) return;
    const defCity = writable.find((c) => c.id === city?.id)?.id ?? writable[0].id;
    setForm({ title: "", date: date ?? today, start: "10:00", end: "12:00", cityId: defCity, place: "", description: "" });
  }
  function openEvent(e: CalEvent) {
    setForm({ id: e.id, title: e.title, date: e.event_date, start: hm(e.start_time), end: hm(e.end_time), cityId: e.city_id, place: e.place ?? "", description: e.description ?? "" });
  }
  async function saveEvent() {
    if (!form || !form.title.trim() || !form.date || !canWrite(form.cityId)) return;
    if (form.start && form.end && form.end < form.start) return setErr("L'heure de fin est avant l'heure de début.");
    setBusy(true);
    const row = { city_id: form.cityId, title: form.title.trim(), event_date: form.date, start_time: form.start || null, end_time: form.end || null, place: form.place.trim() || null, description: form.description.trim() || null };
    let error;
    if (form.id) ({ error } = await supabase.from("calendar_events").update({ ...row, updated_at: new Date().toISOString() }).eq("id", form.id));
    else {
      const { data: auth } = await supabase.auth.getUser();
      ({ error } = await supabase.from("calendar_events").insert({ ...row, created_by: auth.user?.id ?? null }));
    }
    setBusy(false);
    if (error) return setErr("Enregistrement impossible : " + error.message);
    if (active && !active.has(form.cityId)) setActive(new Set([...active, form.cityId]));
    setForm(null);
    await loadEvents();
  }
  async function deleteEvent() {
    if (!form?.id || !window.confirm(`Supprimer l'événement « ${form.title} » ? Cette action est définitive.`)) return;
    setBusy(true);
    const { data, error } = await supabase.from("calendar_events").delete().eq("id", form.id).select("id");
    setBusy(false);
    if (error || !data?.length) return setErr("Suppression impossible : " + (error?.message ?? "droits insuffisants"));
    setForm(null);
    await loadEvents();
  }

  /* ---------- ACTU ---------- */
  async function publishNews() {
    if (!newsForm?.title.trim()) return;
    setBusy(true);
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase.from("news").insert({ title: newsForm.title.trim(), body: newsForm.body.trim() || null, pinned: newsForm.pinned, created_by: auth.user?.id ?? null });
    setBusy(false);
    if (error) return setErr("Publication impossible : " + error.message);
    setNewsForm(null);
    await loadNews();
  }
  async function togglePin(n: News) {
    const { error } = await supabase.from("news").update({ pinned: !n.pinned }).eq("id", n.id);
    if (error) return setErr(error.message);
    await loadNews();
  }
  async function removeNews(n: News) {
    if (!window.confirm(`Retirer l'actu « ${n.title} » ?`)) return;
    const { error } = await supabase.from("news").delete().eq("id", n.id);
    if (error) return setErr(error.message);
    await loadNews();
  }

  const formReadOnly = !!form && !canWrite(form.cityId);
  const monthLabel = month.toLocaleDateString("fr-FR", { month: "long", year: "numeric" }).replace(/^./, (m) => m.toUpperCase());

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[32px] leading-none font-black">Calendrier</h1>
          <p className="mt-1 text-[13.5px] text-[var(--slate)]">Les événements de toutes les antennes, au même endroit.</p>
        </div>
        {writable.length > 0 && (
          <button type="button" onClick={() => openNew()} className={priCls}>
            + Nouvel événement
          </button>
        )}
      </div>

      {err && (
        <div className="mb-3 flex items-start justify-between gap-3 rounded-xl bg-[var(--critical-bg)] px-3.5 py-2.5 text-[12.5px] font-semibold text-[var(--critical)]">
          <span>{err}</span>
          <button type="button" onClick={() => setErr(null)}>×</button>
        </div>
      )}

      {/* ---- ACTU ---- */}
      <section className="mb-4 rounded-[20px] border border-[var(--border)] bg-[var(--card)] p-5 shadow-[var(--shadow)]" style={{ borderTop: "4px solid var(--turquoise)" }}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-[19px] font-black text-[var(--navy)]">
            ACTU <span className="ml-1 font-sans text-[13px] font-medium text-[var(--slate)]">— les news de Linkee national</span>
          </h2>
          {canNews && !newsForm && (
            <button type="button" onClick={() => setNewsForm({ title: "", body: "", pinned: false })} className="rounded-[40px] bg-[var(--navy-deep)] px-3.5 py-1.5 text-[12px] font-bold text-[var(--panel-fg)]">
              + Publier une actu
            </button>
          )}
        </div>
        {newsForm && (
          <div className="mt-3 rounded-2xl border border-[var(--border)] bg-[var(--input-bg)] p-4">
            <label className={labelCls}>Titre</label>
            <input className={fieldCls} value={newsForm.title} onChange={(e) => setNewsForm({ ...newsForm, title: e.target.value })} placeholder="Ex : Nouvelle antenne à Toulouse" />
            <label className={`${labelCls} mt-2.5`}>Texte</label>
            <textarea className={fieldCls} rows={3} value={newsForm.body} onChange={(e) => setNewsForm({ ...newsForm, body: e.target.value })} />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <label className="flex items-center gap-2 text-[12.5px] font-semibold text-[var(--navy)]">
                <input type="checkbox" checked={newsForm.pinned} onChange={(e) => setNewsForm({ ...newsForm, pinned: e.target.checked })} className="h-4 w-4 accent-[var(--turquoise)]" />
                Épingler en premier
              </label>
              <div className="flex gap-2">
                <button type="button" onClick={() => setNewsForm(null)} className={btnCls}>Annuler</button>
                <button type="button" disabled={busy || !newsForm.title.trim()} onClick={publishNews} className={priCls}>Publier</button>
              </div>
            </div>
          </div>
        )}
        {news.length === 0 ? (
          <p className="mt-3 text-[13px] text-[var(--slate)]">Aucune actu pour l&apos;instant.</p>
        ) : (
          <div className="mt-3.5 grid grid-cols-1 gap-3 lg:grid-cols-3">
            {news.map((n) => (
              <div key={n.id} className="flex flex-col rounded-[14px] border border-[var(--border)] bg-[var(--input-bg)] px-3.5 py-3">
                <div className="text-[11.5px] font-semibold tracking-[0.03em] text-[var(--slate)] uppercase">
                  {fmtShort(n.published_on)}
                  {n.pinned && <span className="ml-1.5 rounded-[40px] bg-[var(--pink)] px-2 py-px text-[10.5px] font-extrabold text-[#001641]">ÉPINGLÉ</span>}
                </div>
                <b className="mt-1 mb-1 text-[14px] text-[var(--navy)]">{n.title}</b>
                {n.body && <p className="text-[12.5px] whitespace-pre-line text-[var(--slate)]">{n.body}</p>}
                {canNews && (
                  <div className="mt-auto flex gap-3 pt-2 text-[11.5px] font-semibold">
                    <button type="button" onClick={() => togglePin(n)} className="text-[var(--slate)] underline">{n.pinned ? "Désépingler" : "Épingler"}</button>
                    <button type="button" onClick={() => removeNews(n)} className="text-[var(--critical)] underline">Retirer</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ---- barre : mois, villes, vue ---- */}
      <div className="mb-3.5 flex flex-wrap items-center justify-between gap-3 rounded-[20px] border border-[var(--border)] bg-[var(--card)] px-4 py-3 shadow-[var(--shadow)]">
        <div className="flex items-center gap-2">
          <button type="button" aria-label="Mois précédent" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} className="h-8 w-8 rounded-full border-[1.5px] border-[var(--border)] text-[var(--navy)]">‹</button>
          <span className="min-w-[150px] text-center font-display text-[20px] font-black text-[var(--navy)]">{monthLabel}</span>
          <button type="button" aria-label="Mois suivant" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} className="h-8 w-8 rounded-full border-[1.5px] border-[var(--border)] text-[var(--navy)]">›</button>
          <button type="button" onClick={() => setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))} className="ml-1 rounded-[40px] border-[1.5px] border-[var(--border)] px-3 py-1 text-[12px] font-semibold text-[var(--navy)]">Aujourd&apos;hui</button>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" onClick={() => setActive(null)} className={`rounded-[40px] border-[1.5px] px-3 py-1.5 text-[12.5px] font-semibold ${!active ? "border-[var(--navy)] text-[var(--navy)]" : "border-[var(--border)] text-[var(--slate)]"}`}>
            Toutes les villes
          </button>
          {cities.map((c) => {
            const on = shownCity(c.id);
            return (
              <button
                key={c.id}
                type="button"
                title="Clic : afficher / masquer · double-clic : seulement cette ville"
                onClick={() => toggleCity(c.id)}
                onDoubleClick={() => setActive(new Set([c.id]))}
                className={`flex items-center gap-1.5 rounded-[40px] border-[1.5px] px-3 py-1.5 text-[12.5px] font-semibold text-[var(--navy)] select-none ${on ? "" : "opacity-45"}`}
                style={{ borderColor: on && active ? c.color : "var(--border)" }}
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: c.color }} />
                {c.name}
              </button>
            );
          })}
        </div>
        <div className="inline-flex rounded-[40px] bg-[var(--track)] p-[3px]">
          {(["mois", "liste"] as const).map((v) => (
            <button key={v} type="button" onClick={() => setView(v)} className={`rounded-[40px] px-3.5 py-1.5 text-[12.5px] font-semibold ${view === v ? "bg-[var(--card)] text-[var(--navy)] shadow-[var(--shadow)]" : "text-[var(--slate)]"}`}>
              {v === "mois" ? "Mois" : "Liste"}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3.5 xl:grid-cols-[minmax(0,1fr)_290px]">
        {view === "mois" ? (
          <div className="overflow-hidden rounded-[20px] border border-[var(--border)] bg-[var(--card)] p-2.5 shadow-[var(--shadow)]">
            <div className="grid grid-cols-7">
              {DOWS.map((d) => (
                <div key={d} className="px-2 py-1.5 text-[11.5px] font-bold text-[var(--slate)] uppercase">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {gridDays.map((d) => {
                const iso = isoOf(d);
                const evs = byDay.get(iso) ?? [];
                const out = d.getMonth() !== month.getMonth();
                return (
                  <div key={iso} onClick={() => openNew(iso)} className={`min-h-[104px] border-t border-[var(--border)] px-1.5 pt-1.5 pb-2 ${writable.length ? "cursor-pointer hover:bg-[var(--input-bg)]" : ""}`}>
                    <span className={`inline-block px-1 text-[12px] font-semibold ${iso === today ? "rounded-[40px] bg-[var(--turquoise)] px-2 text-[#001641]" : out ? "text-[var(--slate)] opacity-40" : "text-[var(--slate)]"}`}>{d.getDate()}</span>
                    {evs.slice(0, 3).map((e) => (
                      <button
                        key={e.id}
                        type="button"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          openEvent(e);
                        }}
                        title={`${e.title} — ${cityById.get(e.city_id)?.name ?? ""}`}
                        className="mt-[3px] block w-full truncate rounded-md border-l-[3px] px-1.5 py-0.5 text-left text-[11.5px] font-semibold text-[var(--navy)]"
                        style={{ borderColor: colorOf(e.city_id), background: tint(colorOf(e.city_id), 16) }}
                      >
                        {hm(e.start_time) && <span className="mr-1 opacity-75">{hm(e.start_time)}</span>}
                        {e.title}
                      </button>
                    ))}
                    {evs.length > 3 && (
                      <button
                        type="button"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          setView("liste");
                        }}
                        className="mt-[3px] px-1.5 text-[11px] font-semibold text-[var(--slate)]"
                      >
                        +{evs.length - 3} autre{evs.length - 3 > 1 ? "s" : ""}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="overflow-hidden rounded-[20px] border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow)]">
            {listRows.length === 0 && <p className="p-4 text-[13px] text-[var(--slate)]">Aucun événement ce mois-ci pour ces villes.</p>}
            {listRows.map((e, i) => {
              const d = new Date(e.event_date + "T00:00:00");
              const c = colorOf(e.city_id);
              return (
                <button key={e.id} type="button" onClick={() => openEvent(e)} className={`flex w-full items-start gap-3.5 px-4 py-3 text-left hover:bg-[var(--input-bg)] ${i ? "border-t border-[var(--border)]" : ""}`}>
                  <span className="w-[54px] flex-none text-center">
                    <span className="block font-display text-[22px] leading-none font-black text-[var(--navy)]">{d.getDate()}</span>
                    <span className="text-[11px] font-bold text-[var(--slate)] uppercase">{d.toLocaleDateString("fr-FR", { weekday: "short" })}</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-bold text-[var(--navy)]">{e.title}</span>
                    <span className="mt-0.5 block text-[12.5px] text-[var(--slate)]">
                      {[hm(e.start_time) && `${hm(e.start_time)}${hm(e.end_time) ? `–${hm(e.end_time)}` : ""}`, e.place].filter(Boolean).join(" · ") || "Horaire et lieu à préciser"}
                    </span>
                    <span className="mt-1.5 inline-flex items-center gap-1.5 rounded-[40px] px-2.5 py-px text-[11.5px] font-bold" style={{ color: c, background: tint(c, 14) }}>
                      <span className="h-2 w-2 rounded-full" style={{ background: c }} />
                      {cityById.get(e.city_id)?.name ?? "Ville"}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}

        <aside className="rounded-[20px] border border-[var(--border)] bg-[var(--card)] p-4 shadow-[var(--shadow)]">
          <h3 className="mb-2 font-display text-[15px] font-black text-[var(--navy)]">À venir</h3>
          {nextRows.length === 0 && <p className="text-[12.5px] text-[var(--slate)]">Rien de prévu pour ces villes.</p>}
          {nextRows.map((e, i) => (
            <button key={e.id} type="button" onClick={() => openEvent(e)} className={`flex w-full gap-2.5 py-2.5 text-left ${i ? "border-t border-[var(--border)]" : ""}`}>
              <span className="w-1 flex-none rounded" style={{ background: colorOf(e.city_id) }} />
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-bold text-[var(--navy)]">{e.title}</span>
                <span className="text-[12px] text-[var(--slate)]">
                  {fmtShort(e.event_date)}
                  {hm(e.start_time) ? ` · ${hm(e.start_time)}` : ""} · {cityById.get(e.city_id)?.name ?? ""}
                </span>
              </span>
            </button>
          ))}
        </aside>
      </div>

      {/* ---- fenêtre événement ---- */}
      {form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(0,10,30,0.45)] p-4" onClick={() => setForm(null)}>
          <div role="dialog" aria-modal="true" className="max-h-[92vh] w-full max-w-[520px] overflow-auto rounded-[20px] border border-[var(--border)] bg-[var(--card)] p-5 shadow-[var(--shadow)]" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-3 font-display text-[21px] font-black text-[var(--navy)]">{form.id ? (formReadOnly ? "Événement" : "Modifier l'événement") : "Nouvel événement"}</h3>
            <label className={labelCls}>Titre</label>
            <input autoFocus disabled={formReadOnly} className={fieldCls} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Ex : Distribution solidaire place de la Comédie" />
            <div className="mt-2.5 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <div>
                <label className={labelCls}>Date</label>
                <input type="date" disabled={formReadOnly} className={fieldCls} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
              </div>
              <div>
                <label className={labelCls}>Ville</label>
                <select disabled={formReadOnly || writable.length < 2} className={fieldCls} value={form.cityId} onChange={(e) => setForm({ ...form, cityId: e.target.value })}>
                  {(formReadOnly ? cities.filter((c) => c.id === form.cityId) : writable).map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Heure de début</label>
                <input type="time" disabled={formReadOnly} className={fieldCls} value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} />
              </div>
              <div>
                <label className={labelCls}>Heure de fin</label>
                <input type="time" disabled={formReadOnly} className={fieldCls} value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} />
              </div>
            </div>
            <label className={`${labelCls} mt-2.5`}>Lieu</label>
            <input disabled={formReadOnly} className={fieldCls} value={form.place} onChange={(e) => setForm({ ...form, place: e.target.value })} placeholder="Adresse ou nom du lieu" />
            <label className={`${labelCls} mt-2.5`}>Description</label>
            <textarea disabled={formReadOnly} rows={3} className={fieldCls} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Infos utiles, contact, matériel…" />
            {formReadOnly && <p className="mt-2.5 text-[12px] text-[var(--slate)]">Événement d&apos;une autre ville : tu peux le consulter, seule son antenne peut le modifier.</p>}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
              {form.id && !formReadOnly ? (
                <button type="button" disabled={busy} onClick={deleteEvent} className="rounded-[40px] border-[1.5px] border-[var(--border)] px-4 py-2 text-[12.5px] font-semibold text-[var(--critical)] hover:border-[var(--critical)] hover:bg-[var(--critical-bg)]">
                  Supprimer
                </button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <button type="button" onClick={() => setForm(null)} className={btnCls}>{formReadOnly ? "Fermer" : "Annuler"}</button>
                {!formReadOnly && (
                  <button type="button" disabled={busy || !form.title.trim() || !form.date} onClick={saveEvent} className={priCls}>
                    {busy ? "Enregistrement…" : "Enregistrer"}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
