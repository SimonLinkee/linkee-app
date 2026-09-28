"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useLinker } from "@/components/linker/LinkerContext";
import { MAX_KG, typology, type Mode } from "@/lib/linker/gamification";

const DAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const SLOTS = [["Matin", "8–12h"], ["Midi", "12–17h"], ["Soir", "17–20h"]];
const fieldCls = "h-[52px] w-full rounded-[16px] border-2 border-[var(--border)] bg-[var(--input-bg)] px-4 text-[15px] font-medium text-[var(--navy)] outline-none focus:border-[var(--turquoise)]";
const labelCls = "mb-1.5 block text-[12.5px] font-bold text-[var(--navy)]";

export default function LinkerProfilPage() {
  const { ready, linker, availability, patchLinker } = useLinker();
  const [bienvenue, setBienvenue] = useState(false);
  const [avail, setAvail] = useState<Set<string>>(new Set());
  const [addr, setAddr] = useState("");
  const [saved, setSaved] = useState(false);
  const addrTimer = useRef<number | null>(null);

  useEffect(() => {
    setBienvenue(new URLSearchParams(window.location.search).get("bienvenue") === "1");
  }, []);
  useEffect(() => {
    if (ready) { setAvail(availability); setAddr(linker?.address_ref ?? ""); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  if (!ready || !linker) return <p className="py-10 text-center text-[14px] font-semibold text-[var(--slate)]">Chargement…</p>;

  const walk = linker.mode === "walk";
  const ty = typology(linker.mode, linker.radius_km);
  const flash = () => { setSaved(true); window.setTimeout(() => setSaved(false), 1400); };

  async function toggleSlot(day: number, slot: number) {
    const key = `${day}-${slot}`;
    const supabase = createClient();
    const on = avail.has(key);
    setAvail((prev) => { const n = new Set(prev); on ? n.delete(key) : n.add(key); return n; });
    if (on) await supabase.from("linker_availability").delete().eq("linker_id", linker!.id).eq("weekday", day).eq("slot", slot);
    else await supabase.from("linker_availability").insert({ linker_id: linker!.id, weekday: day, slot });
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
    if (addrTimer.current) window.clearTimeout(addrTimer.current);
    addrTimer.current = window.setTimeout(async () => {
      await patchLinker({ address_ref: v });
      flash();
    }, 700);
  }

  return (
    <div className="flex flex-col gap-3.5 pb-4">
      <h1 className="font-display text-[26px] leading-none font-black text-[var(--navy)]">Ton profil de Linker</h1>
      {bienvenue && <div className="rounded-[16px] bg-[var(--good-bg)] px-3.5 py-2.5 text-[13px] font-bold text-[var(--good)]">🎉 Bienvenue chez les Linkers ! Configure ton profil pour recevoir des Links compatibles.</div>}
      <div className={`text-[12px] font-bold text-[var(--good)] transition-opacity ${saved ? "opacity-100" : "opacity-0"}`}>Enregistré ✓</div>

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

      <label className={labelCls}>Mes disponibilités (chaque semaine)</label>
      <div className="grid grid-cols-[34px_repeat(3,1fr)] items-center gap-1.5 text-[11px] font-bold">
        <span />
        {SLOTS.map(([s, h]) => <span key={s} className="text-center text-[var(--slate)]">{s}<br /><span className="font-semibold">{h}</span></span>)}
        {DAYS.map((d, di) => (
          <Fragment key={di}>
            <span>{d}</span>
            {SLOTS.map((_, si) => {
              const on = avail.has(`${di}-${si}`);
              return <button key={si} type="button" onClick={() => toggleSlot(di, si)} className="h-9 rounded-[10px] border-2 text-[13px] font-black" style={{ borderColor: on ? "var(--turquoise)" : "var(--border)", background: on ? "var(--turquoise)" : "var(--card)", color: on ? "#04262e" : "var(--slate)" }}>{on ? "✓" : ""}</button>;
            })}
          </Fragment>
        ))}
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

      <label className={labelCls}>Adresse de référence <span className="font-semibold text-[var(--muted)]">(si la géoloc n&apos;est pas disponible)</span></label>
      <input className={fieldCls} value={addr} onChange={(e) => onAddr(e.target.value)} placeholder="14 rue de la République, Lyon" />
    </div>
  );
}
