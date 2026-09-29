"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useCity } from "@/components/admin/CityContext";
import CharSvg from "@/components/linker/CharSvg";
import { CH, characterSVG, type CharKey } from "@/lib/linker/characters";
import { stageOf } from "@/lib/linker/gamification";

type Profile = { full_name: string | null; phone: string | null };
type LinkRow = {
  id: string;
  status: string;
  kg_estime: number;
  is_fresh: boolean;
  denree: string | null;
  window_date: string;
  window_from: string;
  window_to: string;
  is_demo: boolean;
  partners: { name: string } | { name: string }[] | null;
  beneficiaries: { name: string } | { name: string }[] | null;
  linkers: { character: CharKey; level: number; profiles: Profile | Profile[] | null } | { character: CharKey; level: number; profiles: Profile | Profile[] | null }[] | null;
};

const STATUS_UI: Record<string, { l: string; bg: string; fg: string }> = {
  proposee: { l: "Proposée", bg: "var(--track)", fg: "var(--slate)" },
  acceptee: { l: "Acceptée", bg: "rgba(42,120,214,.16)", fg: "#2a78d6" },
  collectee: { l: "Collectée", bg: "var(--warn-bg)", fg: "var(--warn)" },
  livree: { l: "Livrée", bg: "var(--good-bg)", fg: "var(--good)" },
  annulee: { l: "Annulée", bg: "var(--critical-bg)", fg: "var(--critical)" },
};
const FILTERS = [
  ["tous", "Tous"],
  ["proposee", "Demandés"],
  ["encours", "En cours"],
  ["livree", "Livrés"],
] as const;
const first = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));
const fmtDay = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });

/** Visibilité mobile des Links Bénévoles (Superadmin, Responsable d'antenne, Resp. Distribution) : ce qui se
 * passe en ce moment côté collectes bénévoles, avec le téléphone du Linker dès qu'un Link est pris en charge —
 * pour pouvoir intervenir dans le réel (appeler le bénévole, relancer un partenaire…). */
export default function MobileLinksPage() {
  const supabase = useMemo(() => createClient(), []);
  const { ready, cityId, city, isAll } = useCity();
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<(typeof FILTERS)[number][0]>("tous");

  useEffect(() => {
    if (!ready || !cityId) { setLoading(false); return; }
    setLoading(true);
    supabase
      .from("links")
      .select("id,status,kg_estime,is_fresh,denree,window_date,window_from,window_to,is_demo,partners(name),beneficiaries(name),linkers(character,level,profiles(full_name,phone))")
      .eq("city_id", cityId)
      .order("created_at", { ascending: false })
      .limit(60)
      .then(({ data }) => {
        setLinks((data ?? []) as unknown as LinkRow[]);
        setLoading(false);
      });
  }, [supabase, ready, cityId]);

  const filtered = links.filter((l) => {
    if (filter === "tous") return true;
    if (filter === "encours") return l.status === "acceptee" || l.status === "collectee";
    return l.status === filter;
  });
  const enCours = links.filter((l) => l.status === "acceptee" || l.status === "collectee").length;
  const aujourdhui = links.filter((l) => l.status === "livree" && l.window_date === new Date().toISOString().slice(0, 10)).length;

  return (
    <div>
      <h1 className="mb-1 font-display text-[26px] leading-tight font-black text-[var(--navy)]">Links Bénévoles</h1>
      <p className="mb-4 text-[13px] text-[var(--slate)]">Petites collectes confiées à des bénévoles (Linkers) — {city?.name ?? ""}.</p>

      {isAll ? (
        <p className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--card)] px-4 py-8 text-center text-[13px] text-[var(--slate)]">Choisis une ville sur la version PC pour voir ses Links.</p>
      ) : loading ? (
        <p className="py-10 text-center text-[14px] text-[var(--slate)]">Chargement…</p>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3">
            <div className="rounded-[18px] border border-[var(--border)] bg-[var(--card)] p-3.5" style={{ borderTop: "4px solid #2a78d6" }}>
              <div className="text-[11.5px] font-semibold text-[var(--slate)]">En cours</div>
              <div className="font-display text-[24px] font-black text-[var(--navy)]">{enCours}</div>
            </div>
            <div className="rounded-[18px] border border-[var(--border)] bg-[var(--card)] p-3.5" style={{ borderTop: "4px solid var(--good)" }}>
              <div className="text-[11.5px] font-semibold text-[var(--slate)]">Livrés aujourd&apos;hui</div>
              <div className="font-display text-[24px] font-black text-[var(--navy)]">{aujourdhui}</div>
            </div>
          </div>

          <div className="mb-3 flex gap-1.5 overflow-x-auto">
            {FILTERS.map(([k, l]) => (
              <button
                key={k}
                type="button"
                onClick={() => setFilter(k)}
                className="flex-none rounded-[40px] border-[1.5px] px-3.5 py-1.5 text-[12.5px] font-bold whitespace-nowrap"
                style={{ borderColor: filter === k ? "var(--navy-deep)" : "var(--border)", background: filter === k ? "var(--navy-deep)" : "var(--card)", color: filter === k ? "var(--panel-fg)" : "var(--slate)" }}
              >
                {l}
              </button>
            ))}
          </div>

          {filtered.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--card)] px-4 py-8 text-center text-[13px] text-[var(--slate)]">Aucun Link pour ce filtre.</p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {filtered.map((l) => {
                const linker = first(l.linkers);
                const lp = linker ? first(linker.profiles) : null;
                const st = STATUS_UI[l.status] ?? STATUS_UI.proposee;
                return (
                  <div key={l.id} className="rounded-[18px] border border-[var(--border)] bg-[var(--card)] p-3.5">
                    <div className="flex items-start justify-between gap-2">
                      <span className="min-w-0 flex-1 text-[14px] font-bold text-[var(--navy)]">
                        {first(l.partners)?.name} → {first(l.beneficiaries)?.name ?? "—"}
                      </span>
                      <span className="flex-none rounded-[40px] px-2.5 py-1 text-[11px] font-bold" style={{ background: st.bg, color: st.fg }}>{st.l}</span>
                    </div>
                    <div className="mt-0.5 text-[12px] font-semibold text-[var(--slate)]">
                      {fmtDay(l.window_date)} · {l.window_from.slice(0, 5)}–{l.window_to.slice(0, 5)} · {l.kg_estime} kg{l.denree ? ` · ${l.denree}` : ""}{l.is_fresh ? " · 🧊" : ""}{l.is_demo ? " · démo" : ""}
                    </div>
                    {linker ? (
                      <div className="mt-2 flex items-center gap-2.5 rounded-[14px] bg-[var(--input-bg)] px-3 py-2">
                        <span className="h-9 w-9 flex-none overflow-hidden"><CharSvg html={characterSVG(linker.character, { stage: stageOf(linker.level), size: 34 })} /></span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[12.5px] font-bold text-[var(--navy)]">{lp?.full_name || CH[linker.character].n} · niveau {linker.level}</span>
                          {lp?.phone ? (
                            <a href={`tel:${lp.phone}`} className="block text-[12.5px] font-bold text-[#2a78d6]">📞 {lp.phone}</a>
                          ) : (
                            <span className="block text-[11.5px] font-semibold text-[var(--muted)]">Pas de téléphone renseigné</span>
                          )}
                        </span>
                      </div>
                    ) : (
                      <p className="mt-2 text-[12px] font-semibold text-[var(--muted)]">En attente d&apos;un Linker…</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
