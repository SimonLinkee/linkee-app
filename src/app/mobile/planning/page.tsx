"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useCity } from "@/components/admin/CityContext";
import AdminStopModal, { type AdminStop } from "@/components/planning/AdminStopModal";

type Rel = { name: string; category: string | null };
type Stop = {
  id: string;
  kind: string;
  partner_id: string | null;
  beneficiary_id: string | null;
  label: string | null;
  comment: string | null;
  status: string;
  scheduled_time: string | null;
  sort_order: number;
  partners: Rel | Rel[] | null;
  beneficiaries: Rel | Rel[] | null;
};
type Opt = { id: string; name: string };

const DENREES = ["Secs", "Fruits et légumes", "Produits frais", "Plats préparés", "Boulangerie"];
const KIND_LABEL: Record<string, string> = { partner: "Collecte", dropoff: "Dépose", stock: "Prise au stock", exceptionnel: "Collecte exceptionnelle", demande_client: "Demande partenaire" };
const KIND_COLOR: Record<string, string> = { partner: "#0a1a3f", dropoff: "#1a8f68", stock: "#b97600", exceptionnel: "#1f93a8", demande_client: "#7c5cd9" };
const isoOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const first = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));
const field = "h-[52px] w-full rounded-2xl border-2 border-[var(--border)] bg-[var(--input-bg)] px-4 text-[16px] font-medium text-[var(--navy)] outline-none focus:border-[var(--turquoise)]";
const label = "mb-1.5 block text-[13px] font-bold text-[var(--navy)]";

/** Superadmin mobile planning: no map. Reorder, remove, fill in a stop in place of the logisticien, add a one-off collection or a drop-off. */
export default function MobilePlanning() {
  const supabase = useMemo(() => createClient(), []);
  const { cityId } = useCity();
  const [day, setDay] = useState(isoOf(new Date()));
  const [stops, setStops] = useState<Stop[]>([]);
  const [loading, setLoading] = useState(true);
  const [partners, setPartners] = useState<Opt[]>([]);
  const [benefs, setBenefs] = useState<Opt[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [modal, setModal] = useState<{ stop: AdminStop; current: string; mode: "status" | "data" } | null>(null);
  const [panel, setPanel] = useState<"" | "exc" | "drop">("");
  const [xPartner, setXPartner] = useState("");
  const [xDate, setXDate] = useState(day);
  const [xTime, setXTime] = useState("");
  const [xDenree, setXDenree] = useState(DENREES[0]);
  const [xVolume, setXVolume] = useState("");
  const [xComment, setXComment] = useState("");
  const [dBenef, setDBenef] = useState("");

  async function load() {
    if (!cityId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("collectes")
      .select("id,kind,partner_id,beneficiary_id,label,comment,status,scheduled_time,sort_order,partners(name,category),beneficiaries(name,category)")
      .eq("city_id", cityId)
      .eq("scheduled_date", day)
      .eq("source", "planning")
      .order("sort_order")
      .order("created_at");
    if (error) setMsg(error.message);
    setStops((data ?? []) as unknown as Stop[]);
    setLoading(false);
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cityId, day]);

  useEffect(() => {
    if (!cityId) return;
    (async () => {
      const [p, b] = await Promise.all([
        supabase.from("partners").select("id,name").eq("city_id", cityId).eq("active", true).eq("benevole_only", false).order("name"),
        supabase.from("beneficiaries").select("id,name").eq("city_id", cityId).eq("active", true).order("name"),
      ]);
      setPartners((p.data ?? []) as Opt[]);
      setBenefs((b.data ?? []) as Opt[]);
    })();
  }, [supabase, cityId]);

  function shift(n: number) {
    const d = new Date(day + "T00:00:00");
    d.setDate(d.getDate() + n);
    setDay(isoOf(d));
  }
  const nameOf = (s: Stop) => first(s.partners)?.name ?? first(s.beneficiaries)?.name ?? s.label ?? "Point de tournée";

  async function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= stops.length) return;
    const times = stops.map((s) => s.scheduled_time); // the time slots stay in place, the stops swap positions
    const next = [...stops];
    [next[i], next[j]] = [next[j], next[i]];
    setStops(next.map((s, k) => ({ ...s, sort_order: k, scheduled_time: times[k] })));
    const res = await Promise.all(next.map((s, k) => supabase.from("collectes").update({ sort_order: k, scheduled_time: times[k] }).eq("id", s.id)));
    const bad = res.find((r) => r.error);
    if (bad?.error) {
      setMsg("Ordre non enregistré : " + bad.error.message);
      load();
    }
  }
  async function remove(s: Stop) {
    if (!window.confirm(`Retirer « ${nameOf(s)} » du planning ?`)) return;
    const { error } = await supabase.from("collectes").delete().eq("id", s.id);
    if (error) return setMsg("Suppression impossible : " + error.message);
    setStops((prev) => prev.filter((x) => x.id !== s.id));
  }

  async function addExceptional() {
    if (!cityId) return;
    if (!xPartner) return setMsg("Choisis un partenaire.");
    const sameDay = xDate === day;
    const { error } = await supabase.from("collectes").insert({
      city_id: cityId, kind: "exceptionnel", partner_id: xPartner, scheduled_date: xDate, scheduled_time: xTime || null,
      sort_order: sameDay ? stops.length : 99, status: "todo", comment: xComment.trim() || null, duration_min: 10, denree: xDenree, volume_kg: xVolume ? Number(xVolume) : null,
    });
    if (error) return setMsg("Ajout impossible : " + error.message);
    setPanel("");
    setXVolume("");
    setXComment("");
    setXTime("");
    if (sameDay) await load();
    else setDay(xDate);
  }
  async function addDropoff() {
    if (!cityId || !dBenef) return setMsg("Choisis un lieu de dépose.");
    const { error } = await supabase.from("collectes").insert({ city_id: cityId, kind: "dropoff", beneficiary_id: dBenef, scheduled_date: day, sort_order: stops.length, status: "todo", duration_min: 10 });
    if (error) return setMsg("Ajout impossible : " + error.message);
    setPanel("");
    setDBenef("");
    await load();
  }

  const dayLabel = new Date(day + "T00:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-[28px] leading-tight font-black text-[var(--navy)]">Planning</h1>
      <div className="flex items-center justify-between gap-2 rounded-2xl bg-[var(--card)] p-2 shadow-[var(--shadow)]">
        <button type="button" onClick={() => shift(-1)} aria-label="Jour précédent" className="flex h-[52px] w-[52px] items-center justify-center rounded-xl bg-[var(--input-bg)] text-[22px] font-bold text-[var(--navy)]">‹</button>
        <div className="text-center">
          <div className="font-display text-[19px] leading-tight font-extrabold text-[var(--navy)] capitalize">{dayLabel}</div>
          {day !== isoOf(new Date()) && <button type="button" onClick={() => setDay(isoOf(new Date()))} className="text-[12px] font-semibold text-[var(--turquoise)] underline">Revenir à aujourd&apos;hui</button>}
        </div>
        <button type="button" onClick={() => shift(1)} aria-label="Jour suivant" className="flex h-[52px] w-[52px] items-center justify-center rounded-xl bg-[var(--input-bg)] text-[22px] font-bold text-[var(--navy)]">›</button>
      </div>

      {msg && (
        <div className="flex items-start justify-between gap-3 rounded-xl bg-[var(--critical-bg)] px-3.5 py-2.5 text-[13px] font-semibold text-[var(--critical)]">
          <span>{msg}</span>
          <button type="button" onClick={() => setMsg(null)}>×</button>
        </div>
      )}

      {loading && <p className="py-6 text-center text-[14px] text-[var(--slate)]">Chargement…</p>}
      {!loading && stops.length === 0 && <p className="rounded-2xl border-2 border-dashed border-[var(--border)] px-4 py-8 text-center text-[14px] text-[var(--slate)]">Aucun arrêt ce jour-là.</p>}

      <div className="flex flex-col gap-3">
        {stops.map((s, i) => {
          const done = s.status === "collecte";
          const cancelled = s.status === "annule";
          const color = KIND_COLOR[s.kind] ?? "#0a1a3f";
          return (
            <div key={s.id} className={`rounded-[20px] border-2 bg-[var(--card)] p-3.5 shadow-[var(--shadow)] ${cancelled ? "opacity-60" : ""}`} style={{ borderColor: "var(--border)", borderLeft: `8px solid ${color}` }}>
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full font-display text-[16px] font-black text-white" style={{ background: color }}>{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className={`text-[18px] leading-tight font-bold text-[var(--navy)] ${cancelled ? "line-through" : ""}`}>{nameOf(s)}</div>
                  <div className="mt-0.5 text-[13px] text-[var(--slate)]">
                    {KIND_LABEL[s.kind] ?? s.kind}
                    {s.scheduled_time ? ` · ${s.scheduled_time.slice(0, 5)}` : ""}
                  </div>
                  {s.comment && <div className="mt-1 text-[12.5px] text-[var(--slate)] italic">{s.comment}</div>}
                </div>
                <span className="flex-none rounded-full px-2.5 py-1 text-[11.5px] font-bold" style={done ? { background: "var(--good-bg)", color: "var(--good)" } : cancelled ? { background: "var(--critical-bg)", color: "var(--critical)" } : { background: "var(--track)", color: "var(--slate)" }}>
                  {done ? "Réalisée" : cancelled ? "Annulée" : "À faire"}
                </span>
              </div>
              <div className={`mt-3 grid gap-2 ${s.kind === "stock" && done ? "grid-cols-1" : "grid-cols-2"}`}>
                {!(s.kind === "stock" && done) && (
                  <button type="button" onClick={() => setModal({ mode: "data", current: s.status, stop: { id: s.id, name: nameOf(s), kind: s.kind, partnerId: s.partner_id, cat: first(s.partners)?.category ?? first(s.beneficiaries)?.category ?? "" } })} className="h-[52px] rounded-xl bg-[var(--good)] text-[15px] font-bold text-white">Compléter les infos</button>
                )}
                <button type="button" onClick={() => setModal({ mode: "status", current: s.status, stop: { id: s.id, name: nameOf(s), kind: s.kind, partnerId: s.partner_id, cat: first(s.partners)?.category ?? first(s.beneficiaries)?.category ?? "" } })} className="h-[52px] rounded-xl border-2 border-[var(--navy-deep)] text-[15px] font-bold text-[var(--navy)]">Statut : {done ? "Réalisée" : cancelled ? "Annulée" : "À faire"} ▾</button>
              </div>
              {!done && (
                <div className="mt-2 grid grid-cols-3 gap-2">
                  <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Monter" className="h-[52px] rounded-xl bg-[var(--track)] text-[22px] font-bold text-[var(--navy)] disabled:opacity-30">↑</button>
                  <button type="button" onClick={() => move(i, 1)} disabled={i === stops.length - 1} aria-label="Descendre" className="h-[52px] rounded-xl bg-[var(--track)] text-[22px] font-bold text-[var(--navy)] disabled:opacity-30">↓</button>
                  <button type="button" onClick={() => remove(s)} aria-label="Retirer" className="h-[52px] rounded-xl bg-[var(--critical-bg)] text-[20px] font-bold text-[var(--critical)]">🗑</button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-2.5">
        <button type="button" onClick={() => { setPanel(panel === "exc" ? "" : "exc"); setXDate(day); }} className="h-[58px] rounded-2xl border-2 border-dashed border-[#1f93a8] font-display text-[18px] font-bold text-[#1f93a8]">+ Collecte exceptionnelle</button>
        {panel === "exc" && (
          <div className="flex flex-col gap-3 rounded-[20px] border-2 border-[#1f93a8] bg-[var(--card)] p-4">
            <div>
              <span className={label}>Partenaire</span>
              <select className={field} value={xPartner} onChange={(e) => setXPartner(e.target.value)}>
                <option value="">Choisir…</option>
                {partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className={label}>Date</span>
                <input type="date" className={field} value={xDate} onChange={(e) => setXDate(e.target.value)} />
              </div>
              <div>
                <span className={label}>Heure</span>
                <input type="time" className={field} value={xTime} onChange={(e) => setXTime(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className={label}>Denrée</span>
                <select className={field} value={xDenree} onChange={(e) => setXDenree(e.target.value)}>{DENREES.map((d) => <option key={d}>{d}</option>)}</select>
              </div>
              <div>
                <span className={label}>Volume (kg)</span>
                <input type="number" inputMode="decimal" className={field} value={xVolume} onChange={(e) => setXVolume(e.target.value)} placeholder="0" />
              </div>
            </div>
            <div>
              <span className={label}>Commentaire</span>
              <input className={field} value={xComment} onChange={(e) => setXComment(e.target.value)} />
            </div>
            <button type="button" onClick={addExceptional} className="h-14 rounded-2xl bg-[#1f93a8] font-display text-[18px] font-bold text-white">Ajouter au planning</button>
          </div>
        )}

        <button type="button" onClick={() => setPanel(panel === "drop" ? "" : "drop")} className="h-[58px] rounded-2xl border-2 border-dashed border-[#1a8f68] font-display text-[18px] font-bold text-[#1a8f68]">+ Lieu de dépose</button>
        {panel === "drop" && (
          <div className="flex flex-col gap-3 rounded-[20px] border-2 border-[#1a8f68] bg-[var(--card)] p-4">
            <div>
              <span className={label}>Où déposer ?</span>
              <select className={field} value={dBenef} onChange={(e) => setDBenef(e.target.value)}>
                <option value="">Choisir…</option>
                {benefs.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <button type="button" onClick={addDropoff} className="h-14 rounded-2xl bg-[#1a8f68] font-display text-[18px] font-bold text-white">Ajouter à la fin de la tournée</button>
          </div>
        )}
      </div>

      {modal && cityId && (
        <AdminStopModal
          stop={modal.stop}
          current={modal.current}
          mode={modal.mode}
          cityId={cityId}
          date={day}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            load();
          }}
        />
      )}
    </div>
  );
}
