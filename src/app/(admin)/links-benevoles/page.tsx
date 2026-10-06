"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useCity } from "@/components/admin/CityContext";
import BetaBadge from "@/components/BetaBadge";
import BetaNote from "@/components/BetaNote";
import CharSvg from "@/components/linker/CharSvg";
import { CH, characterSVG, type CharKey } from "@/lib/linker/characters";
import { computeOutfit, stageOf, type Mode, type StyleKey } from "@/lib/linker/gamification";
import { DEFAULT_EUR_PER_KG } from "@/lib/stats";
import { canAdminCity } from "@/lib/roles";

const ORANGE = "#eb6834";
type LinkerRow = { id: string; character: CharKey; level: number; mode: Mode; transport: "pied" | "velo"; radius_km: number; cold_ok: boolean; kg_saved: number; links_done: number; chosen: Record<number, StyleKey>; equipped: Record<number, number | "none">; profiles: { full_name: string | null; email: string | null; phone: string | null } | { full_name: string | null; email: string | null; phone: string | null }[] | null };
type LinkedProfile = { full_name: string | null; phone: string | null };
type LinkRow = { id: string; status: string; kg_estime: number; weight_actual: number | null; don_value: number | null; is_fresh: boolean; denree: string | null; window_date: string; window_from: string; window_to: string; is_demo: boolean; partners: { name: string } | { name: string }[] | null; beneficiaries: { name: string } | { name: string }[] | null; linkers: { character: CharKey; level: number; profiles: LinkedProfile | LinkedProfile[] | null } | { character: CharKey; level: number; profiles: LinkedProfile | LinkedProfile[] | null }[] | null };
type Partner = { id: string; name: string; address: string | null; allow_backpack: boolean; allow_car: boolean };

const STATUS_UI: Record<string, { l: string; bg: string; fg: string }> = {
  proposee: { l: "Proposée", bg: "var(--track)", fg: "var(--slate)" },
  acceptee: { l: "Acceptée", bg: "rgba(42,120,214,.16)", fg: "#2a78d6" },
  collectee: { l: "Collectée", bg: "var(--warn-bg)", fg: "var(--warn)" },
  livree: { l: "Livrée", bg: "var(--good-bg)", fg: "var(--good)" },
  annulee: { l: "Annulée", bg: "var(--critical-bg)", fg: "var(--critical)" },
};
const first = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));
const fmtDay = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short" });

export default function LinksBenevolesAdminPage() {
  const supabase = useMemo(() => createClient(), []);
  const { cityId, city, isAll } = useCity();
  const [linkers, setLinkers] = useState<LinkerRow[]>([]);
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [isSuperadmin, setIsSuperadmin] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;
      const { data } = await supabase.from("profiles").select("role").eq("id", auth.user.id).maybeSingle();
      setIsSuperadmin(canAdminCity(data?.role));
    })();
  }, [supabase]);

  async function load() {
    if (!cityId) return setLoading(false);
    setLoading(true);
    const [lk, lnk, pt] = await Promise.all([
      supabase.from("linkers").select("id,character,level,mode,transport,radius_km,cold_ok,kg_saved,links_done,chosen,equipped,profiles(full_name,email,phone)").eq("city_id", cityId).order("level", { ascending: false }),
      supabase.from("links").select("id,status,kg_estime,weight_actual,don_value,is_fresh,denree,window_date,window_from,window_to,is_demo,partners(name),beneficiaries(name),linkers(character,level,profiles(full_name,phone))").eq("city_id", cityId).order("created_at", { ascending: false }).limit(100),
      supabase.from("partners").select("id,name,address,allow_backpack,allow_car").eq("city_id", cityId).eq("active", true).is("deleted_at", null).order("name"),
    ]);
    if (lk.error) setMsg(lk.error.message + " (les migrations 019, 020 et 021 sont-elles passées ?)");
    setLinkers((lk.data ?? []) as unknown as LinkerRow[]);
    setLinks((lnk.data ?? []) as unknown as LinkRow[]);
    setPartners((pt.data ?? []) as Partner[]);
    setLoading(false);
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cityId]);

  async function toggleEligible(p: Partner, field: "allow_backpack" | "allow_car") {
    const next = !p[field];
    setPartners((prev) => prev.map((x) => (x.id === p.id ? { ...x, [field]: next } : x)));
    const { error } = await supabase.from("partners").update({ [field]: next }).eq("id", p.id);
    if (error) setMsg(error.message);
  }

  async function saveDonValue(id: string, raw: string) {
    const v = raw.trim() === "" ? null : Number(raw.replace(",", "."));
    if (v != null && !Number.isFinite(v)) return;
    setLinks((prev) => prev.map((l) => (l.id === id ? { ...l, don_value: v } : l)));
    const { error } = await supabase.from("links").update({ don_value: v }).eq("id", id);
    if (error) setMsg("Valeur du don non enregistrée : " + error.message);
  }

  if (isAll) return <p className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--card)] px-5 py-8 text-center text-[13px] text-[var(--slate)]">Choisis une ville pour voir ses Links Bénévoles.</p>;

  const donTotal = links
    .filter((l) => l.status === "livree")
    .reduce((s, l) => { const kg = Number(l.weight_actual ?? l.kg_estime) || 0; return s + (l.don_value != null ? Number(l.don_value) : kg * DEFAULT_EUR_PER_KG); }, 0);
  const kpis = [
    ["Linkers inscrits", String(linkers.length), "#0a1a3f"],
    ["Links en cours", String(links.filter((l) => !["livree", "annulee"].includes(l.status)).length), "#2a78d6"],
    ["Links livrés", String(links.filter((l) => l.status === "livree").length), "var(--good)"],
    ["kg sauvés (Links)", String(Math.round(linkers.reduce((s, l) => s + l.kg_saved, 0))), ORANGE],
    ["Valeur des dons (Links)", `${Math.round(donTotal)} €`, "var(--good)"],
  ];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2.5 font-display text-[32px] leading-none font-black">Link citoyen <BetaBadge label="Bêta test" /></h1>
          <p className="mt-1 text-[13.5px] text-[var(--slate)]">Petites collectes confiées à des bénévoles (Linkers) — {city?.name}.</p>
        </div>
      </div>

      <BetaNote href="/remontees" className="mb-4" />

      {msg && <div className="mb-3 rounded-xl bg-[var(--critical-bg)] px-3.5 py-2.5 text-[12.5px] font-semibold text-[var(--critical)]">{msg}</div>}

      <section className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        {kpis.map(([l, v, c]) => (
          <div key={l} className="rounded-[18px] border border-[var(--border)] bg-[var(--card)] p-4 shadow-[var(--shadow)]" style={{ borderTop: `4px solid ${c}` }}>
            <div className="text-[12px] font-semibold text-[var(--slate)]">{l}</div>
            <div className="font-display text-[26px] font-black text-[var(--navy)]">{v}</div>
          </div>
        ))}
      </section>

      {loading ? (
        <p className="text-[13px] text-[var(--slate)]">Chargement…</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_1.1fr]">
          <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-[var(--shadow)]">
            <h3 className="text-[14.5px] font-semibold text-[var(--navy)]">Linkers inscrits</h3>
            <p className="mb-3 text-[11.5px] text-[var(--slate)]">Personnage, level et rayon d&apos;intervention.</p>
            {linkers.length === 0 && <p className="text-[13px] text-[var(--slate)]">Aucun Linker pour l&apos;instant — partage le lien /linker.</p>}
            <div className="flex flex-col gap-2">
              {linkers.map((lk) => {
                const p = first(lk.profiles);
                const outfit = computeOutfit(lk.level, lk.chosen, lk.equipped, "cowboy");
                return (
                  <div key={lk.id} className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--input-bg)] px-3 py-2">
                    <span className="h-11 w-11 flex-none overflow-hidden">
                      <CharSvg html={characterSVG(lk.character, { stage: stageOf(lk.level), outfit, size: 44 })} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold text-[var(--navy)]">{p?.full_name || p?.email || "Linker"}</span>
                      <span className="block text-[11px] text-[var(--slate)]">Level {lk.level} · {lk.transport === "velo" ? "🚲 vélo" : "🚶 à pied"} · {lk.radius_km} km{lk.cold_ok ? " · 🧊" : ""}</span>
                      {p?.phone && <a href={`tel:${p.phone}`} className="mt-0.5 inline-block text-[11px] font-bold text-[#2a78d6]">📞 {p.phone}</a>}
                    </span>
                    <span className="flex-none text-right text-[11.5px] font-bold text-[var(--good)]">{lk.links_done} livré{lk.links_done > 1 ? "s" : ""}</span>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-[var(--shadow)]">
            <h3 className="text-[14.5px] font-semibold text-[var(--navy)]">Links</h3>
            <p className="mb-3 text-[11.5px] text-[var(--slate)]">Statut proposée → acceptée → collectée → livrée.</p>
            {links.length === 0 && <p className="text-[13px] text-[var(--slate)]">Aucun Link pour l&apos;instant.</p>}
            <div className="flex flex-col gap-2">
              {links.map((l) => {
                const linker = first(l.linkers);
                const st = STATUS_UI[l.status] ?? STATUS_UI.proposee;
                const kg = Number(l.weight_actual ?? l.kg_estime) || 0;
                const auto = Math.round(kg * DEFAULT_EUR_PER_KG * 100) / 100;
                return (
                  <div key={l.id} className="flex flex-col gap-2 rounded-xl border border-[var(--border)] bg-[var(--input-bg)] px-3 py-2">
                    <div className="flex items-center gap-3">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12.5px] font-semibold text-[var(--navy)]">{first(l.partners)?.name} → {first(l.beneficiaries)?.name ?? "—"}</span>
                        <span className="block text-[11px] text-[var(--slate)]">{fmtDay(l.window_date)} · {l.window_from.slice(0, 5)}–{l.window_to.slice(0, 5)} · {l.kg_estime} kg{l.denree ? ` · ${l.denree}` : ""}{l.is_fresh ? " · 🧊" : ""}{l.is_demo ? " · démo" : ""}</span>
                        {linker && (() => { const lp = first(linker.profiles); return lp?.phone ? <a href={`tel:${lp.phone}`} className="mt-0.5 inline-block text-[11px] font-bold text-[#2a78d6]">📞 {lp.full_name || "Linker"} · {lp.phone}</a> : null; })()}
                      </span>
                      {linker && (
                        <span className="h-8 w-8 flex-none overflow-hidden" title={`${CH[linker.character].n} niveau ${linker.level}`}>
                          <CharSvg html={characterSVG(linker.character, { stage: stageOf(linker.level), size: 30 })} />
                        </span>
                      )}
                      <span className="flex-none rounded-[40px] px-2 py-0.5 text-[10.5px] font-bold" style={{ background: st.bg, color: st.fg }}>{st.l}</span>
                    </div>
                    <label className="flex items-center gap-1.5 self-start text-[11px] font-semibold text-[var(--slate)]">
                      Valeur du don
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        defaultValue={l.don_value ?? ""}
                        onBlur={(e) => saveDonValue(l.id, e.target.value)}
                        placeholder={String(auto)}
                        className="h-7 w-[76px] rounded-[8px] border border-[var(--border)] bg-[var(--card)] px-1.5 text-[11.5px] font-bold text-[var(--navy)] outline-none focus:border-[var(--turquoise)]"
                      />
                      €{l.don_value == null && <span className="text-[10px] font-medium text-[var(--muted)]">(auto : {auto} €)</span>}
                    </label>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      )}

      <section className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-[var(--shadow)]">
        <h3 className="text-[14.5px] font-semibold text-[var(--navy)]">Éligibilité des partenaires</h3>
        <p className="mb-3 text-[11.5px] text-[var(--slate)]">
          Ces pictos s&apos;affichent à côté du nom du partenaire dans toute l&apos;appli.{!isSuperadmin && " Seul le Superadmin peut les modifier."}
        </p>
        <div className="flex flex-col gap-1.5">
          {partners.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-3 border-b border-[var(--border)] py-2 last:border-none">
              <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-[var(--navy)]">{p.name}</span>
              <button type="button" disabled={!isSuperadmin} onClick={() => toggleEligible(p, "allow_backpack")} className="rounded-[40px] border-[1.5px] px-3 py-1 text-[12px] font-bold disabled:opacity-70" style={{ borderColor: p.allow_backpack ? "var(--good)" : "var(--border)", background: p.allow_backpack ? "var(--good-bg)" : "transparent", color: p.allow_backpack ? "var(--good)" : "var(--slate)" }}>🎒 Sac à dos</button>
              <button type="button" disabled={!isSuperadmin} onClick={() => toggleEligible(p, "allow_car")} className="rounded-[40px] border-[1.5px] px-3 py-1 text-[12px] font-bold disabled:opacity-70" style={{ borderColor: p.allow_car ? "var(--good)" : "var(--border)", background: p.allow_car ? "var(--good-bg)" : "transparent", color: p.allow_car ? "var(--good)" : "var(--slate)" }}>🚗 Voiture</button>
            </div>
          ))}
          {partners.length === 0 && <p className="text-[13px] text-[var(--slate)]">Aucun partenaire actif dans cette ville.</p>}
        </div>
      </section>
    </div>
  );
}
