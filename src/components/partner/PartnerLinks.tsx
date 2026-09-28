"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { MAX_KG } from "@/lib/linker/gamification";
import { matchNearestOpenBeneficiary } from "@/lib/linker/matching";

const ORANGE = "#eb6834";
const fieldCls = "h-[46px] w-full rounded-[14px] border-2 border-[var(--border)] bg-[var(--input-bg)] px-3.5 text-[14px] font-medium text-[var(--navy)] outline-none focus:border-[var(--turquoise)]";
const labelCls = "mb-1.5 block text-[12px] font-bold text-[var(--navy)]";

type PartnerInfo = { city_id: string; address: string | null; allow_backpack: boolean; allow_car: boolean };
type LinkRow = { id: string; status: string; kg_estime: number; is_fresh: boolean; window_date: string; window_from: string; window_to: string; asso_confirmed: boolean; beneficiaries: { name: string } | { name: string }[] | null; linkers: { level: number; profiles: { full_name: string | null } | { full_name: string | null }[] | null } | { level: number; profiles: { full_name: string | null } | { full_name: string | null }[] | null }[] | null };

const STATUS_UI: Record<string, { l: string; bg: string; fg: string }> = {
  proposee: { l: "En attente d'un Linker", bg: "var(--track)", fg: "var(--slate)" },
  acceptee: { l: "Acceptée", bg: "rgba(42,120,214,.16)", fg: "#2a78d6" },
  collectee: { l: "Collectée", bg: "var(--warn-bg)", fg: "var(--warn)" },
  livree: { l: "Livrée", bg: "var(--good-bg)", fg: "var(--good)" },
  annulee: { l: "Annulée", bg: "var(--critical-bg)", fg: "var(--critical)" },
};
const first = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));
const fmtDay = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const nowHM = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };

/** "Links Bénévoles" tab of the partner space: request a small volunteer collection (under 80 kg), see its status live. */
export default function PartnerLinks({ partnerId }: { partnerId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [info, setInfo] = useState<PartnerInfo | null>(null);
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState<string | null>(null);
  const [mode, setMode] = useState<"walk" | "car">("walk");
  const [kg, setKg] = useState("10");
  const [fresh, setFresh] = useState(false);
  const [date, setDate] = useState(todayIso());
  const [from, setFrom] = useState("17:30");
  const [to, setTo] = useState("19:00");

  async function load() {
    const [p, l] = await Promise.all([
      supabase.from("partners").select("city_id,address,allow_backpack,allow_car").eq("id", partnerId).maybeSingle(),
      supabase.from("links").select("id,status,kg_estime,is_fresh,window_date,window_from,window_to,asso_confirmed,beneficiaries(name),linkers(level,profiles(full_name))").eq("partner_id", partnerId).order("created_at", { ascending: false }).limit(30),
    ]);
    setInfo((p.data as PartnerInfo) ?? null);
    setLinks((l.data ?? []) as unknown as LinkRow[]);
    setLoading(false);
    if (p.data) setMode((p.data as PartnerInfo).allow_backpack ? "walk" : "car");
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partnerId]);

  if (loading) return <p className="text-[13px] text-[var(--slate)]">Chargement…</p>;
  if (!info) return <p className="text-[13px] text-[var(--slate)]">Fiche introuvable.</p>;

  const cap = MAX_KG[mode];
  const vol = Math.min(Number(kg) || 0, cap);
  const durMin = toMin(to) - toMin(from);
  const leadMin = date === todayIso() ? toMin(from) - nowHM() : 999;
  const conds: [string, boolean][] = [
    [`Volume ≤ ${cap} kg (${mode === "walk" ? "sac à dos 🎒" : "voiture 🚗"})`, vol > 0 && vol <= cap],
    ["Fenêtre d'au moins 1 heure", durMin >= 60],
    ["Au moins 30 min entre maintenant et le début de la fenêtre", leadMin >= 30],
    [mode === "walk" ? "Collecte en sac à dos activée sur ta fiche 🎒" : "Collecte en voiture activée sur ta fiche 🚗", mode === "walk" ? info.allow_backpack : info.allow_car],
  ];
  const okAll = conds.every(([, k]) => k);

  async function submit() {
    setMsg(null);
    setOk(null);
    if (!okAll) return setMsg("Corrige les conditions ci-dessous avant d'envoyer.");
    if (!info!.address) return setMsg("Ajoute d'abord ton adresse dans « Ma fiche ».");
    setBusy(true);
    const match = await matchNearestOpenBeneficiary(supabase, info!.city_id, info!.address, date);
    if (!match) {
      setBusy(false);
      return setMsg("Aucune association disponible sur ce créneau. Essaie une autre date ou un autre horaire.");
    }
    const { error } = await supabase.from("links").insert({
      city_id: info!.city_id, partner_id: partnerId, beneficiary_id: match.id, status: "proposee",
      kg_estime: vol, is_fresh: fresh, mode_required: mode, window_date: date, window_from: from + ":00", window_to: to + ":00",
    });
    setBusy(false);
    if (error) return setMsg("Envoi impossible : " + error.message + " (la migration 021 est-elle passée ?)");
    setOk(`Demande envoyée aux Linkers proches — destination : ${match.name} (${match.distanceKm} km).`);
    setKg("10");
    setFresh(false);
    await load();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-[18px] border border-[var(--border)] bg-[var(--card)] p-4" style={{ borderTop: `4px solid ${ORANGE}` }}>
        <h3 className="font-display text-[17px] font-extrabold text-[var(--navy)]">Demander un Link</h3>
        <p className="mt-0.5 mb-3 text-[12.5px] text-[var(--slate)]">
          Un petit volume à faire partir vite, sans attendre la tournée du logisticien ? Un bénévole (Linker) peut venir le chercher à pied, à vélo ou en voiture — jusqu&apos;à 80 kg.
        </p>

        {!info.allow_backpack && !info.allow_car && (
          <div className="mb-3 rounded-[14px] bg-[var(--warn-bg)] px-3.5 py-2.5 text-[12.5px] font-semibold text-[var(--navy)]">
            Aucune collecte bénévole n&apos;est encore activée sur ta fiche. Demande à ton contact Linkee d&apos;activer 🎒 et/ou 🚗.
          </div>
        )}

        <label className={labelCls}>Type de collecte</label>
        <div className="mb-3 flex gap-2.5">
          <button type="button" disabled={!info.allow_backpack} onClick={() => setMode("walk")} className="flex-1 rounded-[16px] border-2 p-2.5 text-center disabled:opacity-40" style={{ borderColor: mode === "walk" ? "var(--turquoise)" : "var(--border)", background: mode === "walk" ? "#e3f6fa" : "var(--card)" }}>
            <div className="text-[22px]">🎒</div>
            <div className="font-display text-[13.5px] font-extrabold text-[var(--navy)]">Sac à dos</div>
            <div className="text-[10.5px] font-bold text-[var(--slate)]">25 kg max</div>
          </button>
          <button type="button" disabled={!info.allow_car} onClick={() => setMode("car")} className="flex-1 rounded-[16px] border-2 p-2.5 text-center disabled:opacity-40" style={{ borderColor: mode === "car" ? "var(--turquoise)" : "var(--border)", background: mode === "car" ? "#e3f6fa" : "var(--card)" }}>
            <div className="text-[22px]">🚗</div>
            <div className="font-display text-[13.5px] font-extrabold text-[var(--navy)]">Voiture</div>
            <div className="text-[10.5px] font-bold text-[var(--slate)]">80 kg max</div>
          </button>
        </div>

        <label className={labelCls}>Volume estimé : <b style={{ color: ORANGE }}>{vol} kg</b></label>
        <input type="range" min={1} max={cap} value={vol} onChange={(e) => setKg(e.target.value)} className="mb-3 h-8 w-full accent-[#eb6834]" />

        <div className="mb-3 flex items-center gap-3 rounded-[14px] border border-[var(--border)] bg-[var(--input-bg)] px-3.5 py-2.5">
          <span className="text-[22px]">🧊</span>
          <span className="flex-1 text-[13px] font-bold text-[var(--navy)]">Produits frais ?</span>
          <button type="button" onClick={() => setFresh(!fresh)} className="relative h-7 w-[46px] flex-none rounded-[40px]" style={{ background: fresh ? "var(--turquoise)" : "var(--border)" }}>
            <span className="absolute top-[3px] h-[22px] w-[22px] rounded-full bg-white transition-all" style={{ left: fresh ? 20 : 3 }} />
          </button>
        </div>

        <label className={labelCls}>Fenêtre de collecte</label>
        <div className="mb-3 grid grid-cols-3 gap-2">
          <input type="date" className={fieldCls} value={date} onChange={(e) => setDate(e.target.value)} />
          <input type="time" className={fieldCls} value={from} onChange={(e) => setFrom(e.target.value)} />
          <input type="time" className={fieldCls} value={to} onChange={(e) => setTo(e.target.value)} />
        </div>

        <div className="mb-3 rounded-[14px] bg-[#f4f8ff] p-3">
          <div className="mb-1 text-[11px] font-bold tracking-[0.03em] text-[#2a78d6] uppercase">Conditions d&apos;éligibilité</div>
          {conds.map(([t, k]) => (
            <div key={t} className="py-0.5 text-[12.5px] font-semibold" style={{ color: k ? "var(--good)" : "var(--critical)" }}>
              {k ? "✔" : "✘"} <span style={{ color: "var(--navy)" }}>{t}</span>
            </div>
          ))}
        </div>

        {msg && <div className="mb-3 rounded-[14px] bg-[var(--critical-bg)] px-3.5 py-2.5 text-[12.5px] font-bold text-[var(--critical)]">{msg}</div>}
        {ok && <div className="mb-3 rounded-[14px] bg-[var(--good-bg)] px-3.5 py-2.5 text-[12.5px] font-bold text-[var(--good)]">📨 {ok}</div>}

        <button type="button" disabled={busy || !okAll} onClick={submit} className="flex min-h-[48px] w-full items-center justify-center rounded-[40px] font-display text-[15px] font-bold text-white disabled:opacity-45" style={{ background: "var(--navy-deep)" }}>
          {busy ? "Recherche de l'association la plus proche…" : "Envoyer la demande"}
        </button>
      </div>

      <div className="rounded-[18px] border border-[var(--border)] bg-[var(--card)] p-4">
        <h3 className="font-display text-[15px] font-extrabold text-[var(--navy)]">Historique de tes Links</h3>
        {links.length === 0 && <p className="mt-2 text-[12.5px] text-[var(--slate)]">Aucune demande pour l&apos;instant.</p>}
        <div className="mt-2 flex flex-col gap-2">
          {links.map((l) => {
            const linker = first(l.linkers);
            const st = STATUS_UI[l.status] ?? STATUS_UI.proposee;
            return (
              <div key={l.id} className="flex items-center gap-3 rounded-[14px] border border-[var(--border)] bg-[var(--input-bg)] px-3 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block text-[12.5px] font-bold text-[var(--navy)]">{fmtDay(l.window_date)} · {l.window_from.slice(0, 5)}–{l.window_to.slice(0, 5)} · {l.kg_estime} kg{l.is_fresh ? " · 🧊" : ""}</span>
                  <span className="block text-[11px] font-semibold text-[var(--slate)]">→ {first(l.beneficiaries)?.name ?? "—"}{linker ? ` · pris en charge par un Linker (niveau ${linker.level})` : ""}</span>
                </span>
                <span className="flex-none rounded-[40px] px-2.5 py-1 text-[10.5px] font-bold" style={{ background: st.bg, color: st.fg }}>{st.l}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
