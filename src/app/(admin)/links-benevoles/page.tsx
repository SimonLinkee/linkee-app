"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useCity } from "@/components/admin/CityContext";
import CharSvg from "@/components/linker/CharSvg";
import { CH, characterSVG, type CharKey } from "@/lib/linker/characters";
import { computeOutfit, stageOf, type Mode, type StyleKey } from "@/lib/linker/gamification";
import { matchNearestOpenBeneficiary } from "@/lib/linker/matching";

const ORANGE = "#eb6834";
type LinkerRow = { id: string; character: CharKey; level: number; mode: Mode; radius_km: number; cold_ok: boolean; kg_saved: number; links_done: number; chosen: Record<number, StyleKey>; equipped: Record<number, number | "none">; profiles: { full_name: string | null; email: string | null; phone: string | null } | { full_name: string | null; email: string | null; phone: string | null }[] | null };
type LinkedProfile = { full_name: string | null; phone: string | null };
type LinkRow = { id: string; status: string; kg_estime: number; is_fresh: boolean; window_date: string; window_from: string; window_to: string; is_demo: boolean; partners: { name: string } | { name: string }[] | null; beneficiaries: { name: string } | { name: string }[] | null; linkers: { character: CharKey; level: number; profiles: LinkedProfile | LinkedProfile[] | null } | { character: CharKey; level: number; profiles: LinkedProfile | LinkedProfile[] | null }[] | null };
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
  const [busy, setBusy] = useState(false);
  const [isSuperadmin, setIsSuperadmin] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;
      const { data } = await supabase.from("profiles").select("role").eq("id", auth.user.id).maybeSingle();
      setIsSuperadmin(data?.role === "admin_principal");
    })();
  }, [supabase]);

  async function load() {
    if (!cityId) return setLoading(false);
    setLoading(true);
    const [lk, lnk, pt] = await Promise.all([
      supabase.from("linkers").select("id,character,level,mode,radius_km,cold_ok,kg_saved,links_done,chosen,equipped,profiles(full_name,email,phone)").eq("city_id", cityId).order("level", { ascending: false }),
      supabase.from("links").select("id,status,kg_estime,is_fresh,window_date,window_from,window_to,is_demo,partners(name),beneficiaries(name),linkers(character,level,profiles(full_name,phone))").eq("city_id", cityId).order("created_at", { ascending: false }).limit(100),
      supabase.from("partners").select("id,name,address,allow_backpack,allow_car").eq("city_id", cityId).eq("active", true).order("name"),
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

  async function generateDemo() {
    if (!cityId || partners.length === 0) return setMsg("Il faut au moins un partenaire actif dans cette ville.");
    setBusy(true);
    setMsg(null);
    const eligible = partners.filter((p) => p.allow_backpack || p.allow_car);
    const pool = eligible.length ? eligible : partners.slice(0, 3);
    const today = new Date();
    const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const { data: auth } = await supabase.auth.getUser();
    if (!eligible.length) {
      // no partner has opted in yet: turn on 🎒 for the ones used, so the demo Links are actually visible to a Linker
      await Promise.all(pool.slice(0, 3).map((p) => supabase.from("partners").update({ allow_backpack: true }).eq("id", p.id)));
    }
    const chosen = pool.slice(0, 3);
    const rows = await Promise.all(
      chosen.map(async (p, i) => {
        const car = p.allow_car && (i === 2 || !p.allow_backpack);
        const kg = car ? [32, 55, 78][i % 3] : [6, 12, 21][i % 3];
        const match = p.address ? await matchNearestOpenBeneficiary(supabase, cityId, p.address, iso, "17:30", "19:00") : null;
        return {
          city_id: cityId, partner_id: p.id, beneficiary_id: match?.id ?? null,
          status: "proposee", kg_estime: kg, is_fresh: i % 2 === 0, mode_required: car ? "car" : "walk",
          window_date: iso, window_from: "17:30:00", window_to: "19:00:00", is_demo: true, created_by: auth.user?.id ?? null,
        };
      }),
    );
    const missing = rows.filter((r) => !r.beneficiary_id).length;
    const { error } = await supabase.from("links").insert(rows);
    setBusy(false);
    if (error) return setMsg("Génération impossible : " + error.message);
    if (missing) setMsg(`${missing} Link(s) créé(s) sans association trouvée à proximité (adresse non géolocalisable, ou aucune ouverte).`);
    await load();
  }
  async function clearDemo() {
    if (!cityId) return;
    setBusy(true);
    await supabase.from("links").delete().eq("city_id", cityId).eq("is_demo", true);
    setBusy(false);
    await load();
  }

  if (isAll) return <p className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--card)] px-5 py-8 text-center text-[13px] text-[var(--slate)]">Choisis une ville pour voir ses Links Bénévoles.</p>;

  const kpis = [
    ["Linkers inscrits", String(linkers.length), "#0a1a3f"],
    ["Links en cours", String(links.filter((l) => !["livree", "annulee"].includes(l.status)).length), "#2a78d6"],
    ["Links livrés", String(links.filter((l) => l.status === "livree").length), "var(--good)"],
    ["kg sauvés (Links)", String(Math.round(linkers.reduce((s, l) => s + l.kg_saved, 0))), ORANGE],
  ];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[32px] leading-none font-black">Links Bénévoles</h1>
          <p className="mt-1 text-[13.5px] text-[var(--slate)]">Petites collectes confiées à des bénévoles (Linkers) — {city?.name}.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/linker" target="_blank" className="flex items-center gap-1.5 rounded-[40px] border-[1.5px] px-4 py-[9px] font-display text-[13.5px] font-bold" style={{ borderColor: ORANGE, color: ORANGE }}>
            👀 Voir comme Linker
          </Link>
          {isSuperadmin && (
            <>
              <button type="button" disabled={busy} onClick={generateDemo} className="rounded-[40px] px-4 py-[9px] font-display text-[13.5px] font-bold text-white disabled:opacity-60" style={{ background: ORANGE }}>
                + Générer des Links de démo
              </button>
              <button type="button" disabled={busy} onClick={clearDemo} className="rounded-[40px] border-[1.5px] border-[var(--border)] px-4 py-[9px] font-display text-[13.5px] font-bold text-[var(--slate)] disabled:opacity-60">
                Supprimer les données de démo
              </button>
            </>
          )}
        </div>
      </div>

      {msg && <div className="mb-3 rounded-xl bg-[var(--critical-bg)] px-3.5 py-2.5 text-[12.5px] font-semibold text-[var(--critical)]">{msg}</div>}

      <section className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
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
                      <span className="block truncate text-[13px] font-semibold text-[var(--navy)]">{p?.full_name || p?.email || "Linker"} · {CH[lk.character].n}</span>
                      <span className="block text-[11px] text-[var(--slate)]">Level {lk.level} · {lk.mode === "walk" ? "🚶 à pied/vélo" : "🚗 voiture"} · {lk.radius_km} km{lk.cold_ok ? " · 🧊" : ""}</span>
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
            {links.length === 0 && <p className="text-[13px] text-[var(--slate)]">Aucun Link — génère des données de démo pour tester le parcours en direct.</p>}
            <div className="flex flex-col gap-2">
              {links.map((l) => {
                const linker = first(l.linkers);
                const st = STATUS_UI[l.status] ?? STATUS_UI.proposee;
                return (
                  <div key={l.id} className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--input-bg)] px-3 py-2">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] font-semibold text-[var(--navy)]">{first(l.partners)?.name} → {first(l.beneficiaries)?.name ?? "—"}</span>
                      <span className="block text-[11px] text-[var(--slate)]">{fmtDay(l.window_date)} · {l.window_from.slice(0, 5)}–{l.window_to.slice(0, 5)} · {l.kg_estime} kg{l.is_fresh ? " · 🧊" : ""}{l.is_demo ? " · démo" : ""}</span>
                      {linker && (() => { const lp = first(linker.profiles); return lp?.phone ? <a href={`tel:${lp.phone}`} className="mt-0.5 inline-block text-[11px] font-bold text-[#2a78d6]">📞 {lp.full_name || "Linker"} · {lp.phone}</a> : null; })()}
                    </span>
                    {linker && (
                      <span className="h-8 w-8 flex-none overflow-hidden" title={`${CH[linker.character].n} niveau ${linker.level}`}>
                        <CharSvg html={characterSVG(linker.character, { stage: stageOf(linker.level), size: 30 })} />
                      </span>
                    )}
                    <span className="flex-none rounded-[40px] px-2 py-0.5 text-[10.5px] font-bold" style={{ background: st.bg, color: st.fg }}>{st.l}</span>
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
