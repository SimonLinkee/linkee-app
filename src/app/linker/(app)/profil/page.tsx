"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useLinker, type AvailWindow } from "@/components/linker/LinkerContext";
import { MAX_KG, typology, type Mode } from "@/lib/linker/gamification";
import AddressSearch, { type AddressHit } from "@/components/AddressSearch";

const DAYS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
const fieldCls = "h-[52px] w-full rounded-[16px] border-2 border-[var(--border)] bg-[var(--input-bg)] px-4 text-[15px] font-medium text-[var(--navy)] outline-none focus:border-[var(--turquoise)]";
const labelCls = "mb-1.5 block text-[12.5px] font-bold text-[var(--navy)]";
const selectCls = "h-11 flex-1 rounded-[13px] border-2 border-[var(--border)] bg-[var(--card)] px-2.5 text-[13.5px] font-bold text-[var(--navy)] outline-none focus:border-[var(--turquoise)]";
// options toutes les 30 min, 6h00 à 23h00 — largement de quoi couvrir n'importe quel créneau de collecte
const TIME_OPTIONS = Array.from({ length: 35 }, (_, i) => { const m = 360 + i * 30; return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`; });

export default function LinkerProfilPage() {
  const { ready, linker, availability, patchLinker, phone, patchPhone } = useLinker();
  const [bienvenue, setBienvenue] = useState(false);
  const [avail, setAvail] = useState<AvailWindow[]>([]);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [addr, setAddr] = useState("");
  const [addrVerified, setAddrVerified] = useState(false);
  const [tel, setTel] = useState("");
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState("");
  const addrTimer = useRef<number | null>(null);
  const telTimer = useRef<number | null>(null);

  useEffect(() => {
    setBienvenue(new URLSearchParams(window.location.search).get("bienvenue") === "1");
  }, []);
  useEffect(() => {
    if (ready) { setAvail(availability); setAddr(linker?.address_ref ?? ""); setAddrVerified(!!linker?.address_ref); setTel(phone); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  if (!ready || !linker) return <p className="py-10 text-center text-[14px] font-semibold text-[var(--slate)]">Chargement…</p>;

  const walk = linker.mode === "walk";
  const ty = typology(linker.mode, linker.radius_km);
  const flash = () => { setSaved(true); setErr(""); window.setTimeout(() => setSaved(false), 1400); };

  async function addWindow(day: number) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("linker_availability")
      .insert({ linker_id: linker!.id, weekday: day, start_time: "09:00", end_time: "12:00" })
      .select("id")
      .single();
    if (error || !data) return setErr("Créneau non ajouté : " + (error?.message ?? "erreur"));
    setAvail((prev) => [...prev, { id: data.id as string, weekday: day, start: "09:00", end: "12:00" }]);
    flash();
  }
  async function removeWindow(w: AvailWindow) {
    const prev = avail;
    setAvail((p) => p.filter((x) => x.id !== w.id));
    const supabase = createClient();
    const { error } = await supabase.from("linker_availability").delete().eq("id", w.id);
    if (error) { setAvail(prev); return setErr("Suppression impossible : " + error.message); }
    flash();
  }
  async function editWindow(w: AvailWindow, patch: Partial<Pick<AvailWindow, "start" | "end">>) {
    if (busyIds.has(w.id)) return;
    const next = { ...w, ...patch };
    if (next.end <= next.start) return; // le sélecteur de fin ne propose déjà que des heures après le début, garde-fou
    const prevAvail = avail;
    setAvail((p) => p.map((x) => (x.id === w.id ? next : x)));
    setBusyIds((p) => new Set(p).add(w.id));
    const supabase = createClient();
    const { error } = await supabase.from("linker_availability").update({ start_time: next.start, end_time: next.end }).eq("id", w.id);
    setBusyIds((p) => { const n = new Set(p); n.delete(w.id); return n; });
    if (error) { setAvail(prevAvail); return setErr("Créneau non enregistré : " + error.message); }
    flash();
  }
  async function setMode(m: Mode) {
    await patchLinker({ mode: m, radius_km: m === "car" ? Math.max(linker!.radius_km, 10) : Math.min(linker!.radius_km, 10) });
    flash();
  }
  async function setRadius(v: number) {
    await patchLinker({ radius_km: v });
  }
  async function toggleCold() {
    await patchLinker({ cold_ok: !linker!.cold_ok });
    flash();
  }
  function onAddr(v: string) {
    setAddr(v);
    setAddrVerified(false);
    if (addrTimer.current) window.clearTimeout(addrTimer.current);
    addrTimer.current = window.setTimeout(async () => {
      await patchLinker({ address_ref: v });
      flash();
    }, 700);
  }
  async function onAddrPick(hit: AddressHit) {
    if (addrTimer.current) window.clearTimeout(addrTimer.current);
    setAddr(hit.label);
    setAddrVerified(true);
    await patchLinker({ address_ref: hit.label });
    flash();
  }
  function onTel(v: string) {
    setTel(v);
    if (telTimer.current) window.clearTimeout(telTimer.current);
    telTimer.current = window.setTimeout(async () => {
      const { error } = await patchPhone(v);
      if (error) setErr("Téléphone non enregistré : " + error);
      else flash();
    }, 700);
  }

  return (
    <div className="flex flex-col gap-3.5 pb-4">
      <h1 className="font-display text-[26px] leading-none font-black text-[var(--navy)]">Ton profil de Linker</h1>
      {bienvenue && <div className="rounded-[16px] bg-[var(--good-bg)] px-3.5 py-2.5 text-[13px] font-bold text-[var(--good)]">🎉 Bienvenue chez les Linkers ! Configure ton profil pour recevoir des Links compatibles.</div>}
      <div className={`text-[12px] font-bold text-[var(--good)] transition-opacity ${saved ? "opacity-100" : "opacity-0"}`}>Enregistré ✓</div>
      {err && <div className="rounded-[14px] bg-[var(--critical-bg)] px-3.5 py-2.5 text-[12.5px] font-bold text-[var(--critical)]">{err}</div>}

      <div className="flex items-center gap-3 rounded-[18px] p-3.5" style={{ background: "linear-gradient(120deg,#fff3c4,#ffe0b0)" }}>
        <span className="text-[34px]">{ty.e}</span>
        <div>
          <div className="text-[10.5px] font-bold tracking-[0.05em] text-[var(--slate)] uppercase">Ta typologie</div>
          <div className="font-display text-[21px] font-black text-[var(--navy)]">{ty.t}</div>
          <div className="text-[11.5px] font-bold text-[var(--slate)]">Rayon de {linker.radius_km} km · {MAX_KG[linker.mode]} kg max</div>
        </div>
      </div>

      <label className={labelCls}>Mon mode de déplacement</label>
      <div className="flex gap-2.5">
        {(["walk", "car"] as Mode[]).map((m) => (
          <button key={m} type="button" onClick={() => setMode(m)} className="flex-1 rounded-[18px] border-[3px] p-3 text-center" style={{ borderColor: linker.mode === m ? "var(--turquoise)" : "var(--border)", background: linker.mode === m ? "#e3f6fa" : "var(--card)" }}>
            <div className="text-[26px]">{m === "walk" ? "🚶🚲" : "🚗"}</div>
            <div className="font-display text-[15px] font-extrabold text-[var(--navy)]">{m === "walk" ? "À pied / vélo" : "Voiture"}</div>
            <div className="text-[11px] font-bold text-[var(--slate)]">{MAX_KG[m]} kg max</div>
          </button>
        ))}
      </div>

      <label className={labelCls}>Mon rayon d&apos;intervention : <b style={{ color: "#eb6834" }}>{linker.radius_km} km</b></label>
      <input type="range" min={walk ? 1 : 5} max={walk ? 10 : 50} step={walk ? 1 : 5} value={linker.radius_km} onChange={(e) => setRadius(+e.target.value)} className="h-9 w-full accent-[#eb6834]" />
      <div className="-mt-2 flex justify-between text-[11px] font-bold text-[var(--muted)]"><span>{walk ? "1 km" : "5 km"}</span><span>{walk ? "10 km" : "50 km"}</span></div>

      <label className={labelCls}>Mes disponibilités <span className="font-semibold text-[var(--muted)]">(jusqu&apos;à 2 fenêtres par jour, à l&apos;heure que tu veux)</span></label>
      <div className="flex flex-col gap-2">
        {DAYS.map((d, di) => {
          const windows = avail.filter((w) => w.weekday === di);
          return (
            <div key={di} className="rounded-[16px] border-2 border-[var(--border)] bg-[var(--card)] p-2.5">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-[13px] font-bold text-[var(--navy)]">{d}</span>
                {windows.length < 2 && (
                  <button type="button" onClick={() => addWindow(di)} className="text-[11.5px] font-bold text-[var(--turquoise-d,#0a8a9c)]">+ Ajouter un créneau</button>
                )}
              </div>
              {windows.length === 0 ? (
                <p className="text-[11.5px] font-semibold text-[var(--muted)]">Indisponible</p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {windows.map((w) => (
                    <div key={w.id} className="flex items-center gap-1.5">
                      <select className={selectCls} value={w.start} onChange={(e) => editWindow(w, { start: e.target.value })}>
                        {TIME_OPTIONS.filter((t) => t < w.end).map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                      <span className="text-[12px] font-bold text-[var(--slate)]">à</span>
                      <select className={selectCls} value={w.end} onChange={(e) => editWindow(w, { end: e.target.value })}>
                        {TIME_OPTIONS.filter((t) => t > w.start).map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                      <button type="button" onClick={() => removeWindow(w)} aria-label="Retirer ce créneau" className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-[var(--input-bg)] text-[18px] text-[var(--slate)]">×</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-3 rounded-[18px] border border-[var(--border)] bg-[var(--card)] p-3">
        <span className="text-[28px]">🧊</span>
        <div className="flex-1">
          <div className="font-display text-[15px] font-extrabold text-[var(--navy)]">Collecte de frais</div>
          <div className="text-[11.5px] font-semibold text-[var(--slate)]">J&apos;ai un sac isotherme Linkee et des pains de glace.</div>
        </div>
        <button type="button" onClick={toggleCold} className="relative h-8 w-[52px] flex-none rounded-[40px]" style={{ background: linker.cold_ok ? "var(--good)" : "var(--border)" }}>
          <span className="absolute top-[3px] h-[26px] w-[26px] rounded-full bg-white transition-all" style={{ left: linker.cold_ok ? 23 : 3 }} />
        </button>
      </div>

      <label className={labelCls}>Téléphone <span className="font-semibold text-[var(--muted)]">(pour qu&apos;on puisse te joindre si besoin)</span></label>
      <input type="tel" className={fieldCls} value={tel} onChange={(e) => onTel(e.target.value)} placeholder="06 12 34 56 78" />

      <label className={labelCls}>Adresse de référence <span className="font-semibold text-[var(--muted)]">(si la géoloc n&apos;est pas disponible)</span></label>
      <AddressSearch className={fieldCls} value={addr} onChange={onAddr} onPick={onAddrPick} verified={addrVerified} placeholder="14 rue de la République, Lyon" />
      <p className="-mt-1 text-[11px] font-semibold text-[var(--muted)]">Choisis une suggestion dans la liste pour être sûr que l&apos;adresse est bien reconnue.</p>
    </div>
  );
}
