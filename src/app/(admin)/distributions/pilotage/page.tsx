"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useCity } from "@/components/admin/CityContext";
import DistribTabs from "@/components/DistribTabs";

type DbLine = { category: string | null; weight_kg: number | string | null; distributed_kg: number | string | null; total_cost: number | string | null; loss_pct: number | string | null; returned_kg: number | string | null; redistributed_kg: number | string | null; don_pct: number | string | null };
type Dist = {
  id: string;
  beneficiary_id: string;
  event_date: string;
  registered: number | null;
  presence_rate: number | string;
  baskets: number | null;
  fl_target_kg: number | string | null;
  comment: string | null;
  distribution_lines: DbLine[] | null;
  distribution_interventions: { association_id: string }[] | null;
};
type Place = { id: string; name: string };
type Preset = "90" | "180" | "365" | "all" | "custom";

const n = (v: number | string | null | undefined) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};
const isoOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const fmt = (v: number, d = 0) => v.toLocaleString("fr-FR", { maximumFractionDigits: d });
const eur = (v: number) => v.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
const fmtDay = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "2-digit" });
const ORANGE = "#eb6834";
const CAT_COLOR: Record<string, string> = { "F&L": "var(--cat-2)", Boulang: "var(--cat-5)", Sec: "var(--cat-1)", Frais: "var(--cat-3)", "Plats préparés": "var(--cat-4)", Hygiène: "var(--client-req)", Autre: "var(--slate)" };

/** Numbers of one distribution, from its product lines. */
function figures(d: Dist) {
  const L = d.distribution_lines ?? [];
  const weight = L.reduce((a, l) => a + n(l.weight_kg), 0);
  const distributed = L.reduce((a, l) => a + n(l.distributed_kg), 0);
  const cost = L.reduce((a, l) => a + n(l.total_cost), 0);
  const lossKg = L.reduce((a, l) => a + (n(l.weight_kg) * n(l.loss_pct)) / 100, 0);
  const donKg = L.reduce((a, l) => a + (n(l.weight_kg) * n(l.don_pct)) / 100, 0);
  const returned = L.reduce((a, l) => a + n(l.returned_kg), 0);
  const redistributed = L.reduce((a, l) => a + n(l.redistributed_kg), 0);
  const byCat: Record<string, number> = {};
  for (const l of L) byCat[l.category || "Autre"] = (byCat[l.category || "Autre"] ?? 0) + n(l.distributed_kg);
  return { weight, distributed, cost, lossKg, donKg, returned, redistributed, byCat, fl: byCat["F&L"] ?? 0, baskets: n(d.baskets), registered: n(d.registered) };
}
type Fig = ReturnType<typeof figures>;

function sum(list: Dist[]) {
  const assoIds = new Map<string, number>();
  const t = { count: list.length, presences: 0, weight: 0, distributed: 0, cost: 0, lossKg: 0, donKg: 0, returned: 0, redistributed: 0, baskets: 0, registered: 0, fl: 0, byCat: {} as Record<string, number>, flTargetSum: 0, flTargetN: 0 };
  for (const d of list) {
    const f: Fig = figures(d);
    t.weight += f.weight;
    t.distributed += f.distributed;
    t.cost += f.cost;
    t.lossKg += f.lossKg;
    t.donKg += f.donKg;
    t.returned += f.returned;
    t.redistributed += f.redistributed;
    t.baskets += f.baskets;
    t.registered += f.registered;
    t.fl += f.fl;
    for (const iv of d.distribution_interventions ?? []) {
      t.presences++;
      assoIds.set(iv.association_id, (assoIds.get(iv.association_id) ?? 0) + 1);
    }
    for (const [k, v] of Object.entries(f.byCat)) t.byCat[k] = (t.byCat[k] ?? 0) + v;
    if (d.fl_target_kg != null) {
      t.flTargetSum += n(d.fl_target_kg);
      t.flTargetN++;
    }
  }
  return {
    ...t,
    assoIds,
    assoDistinct: assoIds.size,
    assoAvg: t.count ? t.presences / t.count : 0,
    avgBasket: t.baskets ? t.distributed / t.baskets : 0,
    costPer: t.baskets ? t.cost / t.baskets : 0,
    flPer: t.baskets ? t.fl / t.baskets : 0,
    flTarget: t.flTargetN ? t.flTargetSum / t.flTargetN : 0,
    lossPct: t.weight ? (t.lossKg / t.weight) * 100 : 0,
    donPct: t.weight ? (t.donKg / t.weight) * 100 : 0,
    presence: t.registered ? (t.baskets / t.registered) * 100 : 0,
  };
}

/** Small line chart: one point per distribution, optional second series and dotted target line. */
function Chart({ title, sub, points, color, unit, decimals = 0, color2, label2, target }: { title: string; sub?: string; points: { l: string; v: number; v2?: number }[]; color: string; unit: string; decimals?: number; color2?: string; label2?: string; target?: number }) {
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null);
  const W = 520;
  const H = 190;
  const pl = 40;
  const pr = 12;
  const pt = 12;
  const pb = 26;
  const pw = W - pl - pr;
  const ph = H - pt - pb;
  const all = [...points.map((p) => p.v), ...points.map((p) => p.v2 ?? 0), target ?? 0];
  const max = Math.max(...all, 1);
  const nice = max <= 1 ? Math.ceil(max * 10) / 10 : max <= 10 ? Math.ceil(max) : Math.ceil(max / 10) * 10;
  const step = pw / (points.length - 1 || 1);
  const xy = (v: number, i: number) => ({ x: pl + (points.length === 1 ? pw / 2 : i * step), y: pt + ph - (v / nice) * ph });
  const path = (get: (p: (typeof points)[number]) => number) => points.map((p, i) => xy(get(p), i)).map((p, i) => `${i ? "L" : "M"} ${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const labelEvery = Math.max(1, Math.ceil(points.length / 7));
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-[var(--shadow)]">
      <h3 className="text-[14.5px] font-semibold text-[var(--navy)]">{title}</h3>
      {sub && <p className="mb-2 text-[11.5px] text-[var(--slate)]">{sub}</p>}
      {points.length === 0 ? (
        <p className="py-10 text-center text-[13px] text-[var(--slate)]">Aucune distribution sur cette période.</p>
      ) : (
        <div className="relative">
          <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H}>
            {[0, 1, 2, 3].map((g) => {
              const y = pt + ph - (g / 3) * ph;
              return (
                <g key={g}>
                  <line x1={pl} y1={y} x2={W - pr} y2={y} stroke="var(--grid)" />
                  <text x={pl - 6} y={y + 4} fontSize={10.5} fill="var(--muted)" textAnchor="end">
                    {fmt((nice * g) / 3, nice <= 10 ? 1 : 0)}
                  </text>
                </g>
              );
            })}
            {target != null && target > 0 && (
              <line x1={pl} x2={W - pr} y1={xy(target, 0).y} y2={xy(target, 0).y} stroke="var(--good)" strokeDasharray="5 4" strokeWidth={1.5} />
            )}
            {color2 && <path d={path((p) => p.v2 ?? 0)} fill="none" stroke={color2} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" opacity={0.75} />}
            <path d={path((p) => p.v)} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
            {points.map((p, i) => {
              const a = xy(p.v, i);
              return (
                <g key={i}>
                  <circle cx={a.x} cy={a.y} r={3.5} fill="var(--card)" stroke={color} strokeWidth={2} />
                  <circle cx={a.x} cy={a.y} r={12} fill="transparent" className="cursor-pointer" onMouseEnter={() => setTip({ x: (a.x / W) * 100, y: (a.y / H) * 100, text: `${p.l} — ${fmt(p.v, decimals)} ${unit}${p.v2 != null && label2 ? ` · ${label2} ${fmt(p.v2, decimals)}` : ""}` })} onMouseLeave={() => setTip(null)} />
                  {i % labelEvery === 0 && (
                    <text x={a.x} y={H - 7} fontSize={10.5} fill="var(--muted)" textAnchor="middle">
                      {p.l}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
          {tip && (
            <div className="pointer-events-none absolute -translate-x-1/2 -translate-y-[125%] rounded-[9px] bg-[var(--navy-deep)] px-2.5 py-1.5 text-xs font-semibold whitespace-nowrap text-[var(--panel-fg)] shadow-[var(--shadow)]" style={{ left: `${tip.x}%`, top: `${tip.y}%` }}>
              {tip.text}
            </div>
          )}
        </div>
      )}
      {color2 && label2 && points.length > 0 && (
        <div className="mt-1 flex gap-4 text-[11.5px] text-[var(--slate)]">
          <span className="flex items-center gap-1.5"><span className="h-[3px] w-4 rounded" style={{ background: color }} />{title.split(" ")[0]}</span>
          <span className="flex items-center gap-1.5"><span className="h-[3px] w-4 rounded" style={{ background: color2 }} />{label2}</span>
        </div>
      )}
      {target != null && target > 0 && points.length > 0 && <div className="mt-1 text-[11.5px] text-[var(--good)]">Pointillés : cible {fmt(target, 1)} {unit}</div>}
    </div>
  );
}

export default function PilotagePage() {
  const supabase = useMemo(() => createClient(), []);
  const { cityId, city } = useCity();
  const [places, setPlaces] = useState<Place[]>([]);
  const [assocName, setAssocName] = useState<Map<string, string>>(new Map());
  const [dists, setDists] = useState<Dist[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [placeId, setPlaceId] = useState("");
  const [preset, setPreset] = useState<Preset>("180");
  const [from, setFrom] = useState(isoOf(new Date(Date.now() - 180 * 86400000)));
  const [to, setTo] = useState(isoOf(new Date()));

  useEffect(() => {
    if (!cityId) return;
    (async () => {
      const [b, d, a] = await Promise.all([
        supabase.from("beneficiaries").select("id,name,category,fiche").eq("city_id", cityId).order("name"),
        supabase
          .from("distributions")
          .select("id,beneficiary_id,event_date,registered,presence_rate,baskets,fl_target_kg,comment,distribution_lines(category,weight_kg,distributed_kg,total_cost,loss_pct,returned_kg,redistributed_kg,don_pct),distribution_interventions(association_id)")
          .eq("city_id", cityId)
          .eq("status", "distribuee")
          .order("event_date")
          .limit(3000),
        supabase.from("associations").select("id,name").eq("city_id", cityId),
      ]);
      setAssocName(new Map(((a.data ?? []) as { id: string; name: string }[]).map((x) => [x.id, x.name])));
      if (d.error) setErr(d.error.message + " (la migration 014 est-elle passée ?)");
      const all = (b.data ?? []) as { id: string; name: string; category: string | null; fiche: { pinned?: boolean } | null }[];
      setPlaces(all.filter((x) => x.category === "Distribution Linkee" || x.fiche?.pinned).map((x) => ({ id: x.id, name: x.name })));
      setDists((d.data ?? []) as unknown as Dist[]);
      setLoading(false);
    })();
  }, [supabase, cityId]);

  function choose(p: Preset) {
    setPreset(p);
    if (p === "all" || p === "custom") return;
    setFrom(isoOf(new Date(Date.now() - Number(p) * 86400000)));
    setTo(isoOf(new Date()));
  }

  const placeName = useMemo(() => new Map(places.map((p) => [p.id, p.name])), [places]);
  const list = dists.filter((d) => (!placeId || d.beneficiary_id === placeId) && (preset === "all" || (d.event_date >= from && d.event_date <= to)));
  const t = useMemo(() => sum(list), [list]);
  const sortedCats = Object.entries(t.byCat).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const totalCat = sortedCats.reduce((a, [, v]) => a + v, 0);

  // one point per distribution date (several places on the same day are merged when the whole city is shown)
  const points = useMemo(() => {
    const byDate = new Map<string, Dist[]>();
    for (const d of list) byDate.set(d.event_date, [...(byDate.get(d.event_date) ?? []), d]);
    return Array.from(byDate.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([date, ds]) => ({ date, l: fmtDay(date), s: sum(ds) }));
  }, [list]);

  const ranking = useMemo(() => Array.from(t.assoIds.entries()).sort((a, b) => b[1] - a[1]), [t]);

  const perPlace = useMemo(() => {
    const m = new Map<string, Dist[]>();
    for (const d of list) m.set(d.beneficiary_id, [...(m.get(d.beneficiary_id) ?? []), d]);
    return Array.from(m.entries()).map(([id, ds]) => ({ id, name: placeName.get(id) ?? "Lieu", s: sum(ds) })).sort((a, b) => b.s.baskets - a.s.baskets);
  }, [list, placeName]);

  const chip = (on: boolean) => `rounded-[40px] px-3.5 py-1.5 font-display text-[12.5px] font-bold ${on ? "bg-[var(--navy-deep)] text-[var(--panel-fg)]" : "text-[var(--slate)]"}`;

  return (
    <div>
      <h1 className="font-display text-[32px] leading-none font-black">Distributions Linkee</h1>
      <p className="mt-1 mb-4 text-[13.5px] text-[var(--slate)]">Pilotage et évolution — {city?.name ?? "la ville"}, à partir des distributions validées.</p>
      <DistribTabs />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <select value={placeId} onChange={(e) => setPlaceId(e.target.value)} className="min-w-[230px] rounded-[40px] border border-[var(--border)] bg-[var(--card)] px-4 py-2.5 text-[13px] font-semibold text-[var(--navy)]">
          <option value="">Toute la ville — tous les lieux</option>
          {places.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <div className="flex rounded-[40px] border border-[var(--border)] bg-[var(--card)] p-[3px]">
          {(
            [
              ["90", "3 mois"],
              ["180", "6 mois"],
              ["365", "12 mois"],
              ["all", "Tout"],
              ["custom", "Dates"],
            ] as [Preset, string][]
          ).map(([k, l]) => (
            <button key={k} type="button" onClick={() => choose(k)} className={chip(preset === k)}>{l}</button>
          ))}
        </div>
        {preset === "custom" && (
          <div className="flex items-center gap-1.5">
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-[10px] border border-[var(--border)] bg-[var(--card)] px-2.5 py-2 text-[12.5px]" />
            <span className="text-[12px] text-[var(--slate)]">→</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-[10px] border border-[var(--border)] bg-[var(--card)] px-2.5 py-2 text-[12.5px]" />
          </div>
        )}
      </div>

      {err && <div className="mb-3 rounded-xl bg-[var(--critical-bg)] px-4 py-3 text-[13px] font-semibold text-[var(--critical)]">Chargement impossible : {err}</div>}
      {loading ? (
        <p className="text-[13px] text-[var(--slate)]">Chargement…</p>
      ) : (
        <div className={`flex flex-col gap-4 ${list.length === 0 ? "" : ""}`}>
          {list.length === 0 && <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--card)] px-5 py-8 text-center text-[13px] text-[var(--slate)]">Aucune distribution validée sur cette période. Dans « Distributions », clique sur « Bien réceptionné et distribué » pour qu&apos;elle compte ici.</div>}

          <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            {(
              [
                ["Distributions", fmt(t.count), `${fmt(t.registered)} inscrits au total`, "#2a78d6"],
                ["Paniers distribués", fmt(t.baskets), t.registered ? `présence réelle ${fmt(t.presence)} %` : "présence non calculable", "var(--cat-3)"],
                ["Poids distribué", `${fmt(t.distributed, 1)} kg`, `${fmt(t.weight, 1)} kg reçus`, "var(--cat-4)"],
                ["Poids moyen du colis", t.avgBasket ? `${fmt(t.avgBasket, 2)} kg` : "—", "kg distribués par panier", "var(--cat-2)"],
                ["Coût par personne", t.costPer ? eur(t.costPer) : "—", `${eur(t.cost)} au total`, "var(--client-req)"],
                ["F&L par personne", t.flPer ? `${fmt(t.flPer, 2)} kg` : "—", t.flTarget ? `cible moyenne ${fmt(t.flTarget, 2)} kg` : `${fmt(t.fl, 1)} kg de F&L`, "var(--cat-3)"],
                ["Pertes", `${fmt(t.lossPct, 1)} %`, `${fmt(t.lossKg, 1)} kg perdus`, "var(--critical)"],
                ["Part de dons", t.donPct ? `${fmt(t.donPct)} %` : "—", `retours ${fmt(t.returned, 1)} kg · redonné ${fmt(t.redistributed, 1)} kg`, "var(--good)"],
                ["Associations présentes", fmt(t.presences), `${t.assoDistinct} association${t.assoDistinct > 1 ? "s" : ""} différente${t.assoDistinct > 1 ? "s" : ""}`, ORANGE],
                ["Associations par distribution", t.assoAvg ? fmt(t.assoAvg, 1) : "—", "moyenne sur la période", ORANGE],
              ] as [string, string, string, string][]
            ).map(([l, v, sub, col]) => (
              <div key={l} className="flex flex-col gap-1.5 rounded-[18px] border border-[var(--border)] bg-[var(--card)] p-4 shadow-[var(--shadow)]" style={{ borderTop: `4px solid ${col}` }}>
                <span className="text-[12px] font-semibold text-[var(--slate)]">{l}</span>
                <span className="font-display text-[26px] leading-none font-black text-[var(--navy)] tabular-nums">{v}</span>
                <span className="text-[11.5px] text-[var(--slate)]">{sub}</span>
              </div>
            ))}
          </section>

          <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <Chart title="Paniers distribués" sub="Comparés au nombre d'inscrits" points={points.map((p) => ({ l: p.l, v: p.s.baskets, v2: p.s.registered }))} color="#2a78d6" color2="var(--slate)" label2="Inscrits" unit="paniers" />
            <Chart title="Poids moyen du colis" sub="Kilos distribués par panier" points={points.map((p) => ({ l: p.l, v: p.s.avgBasket }))} color="var(--cat-2)" unit="kg" decimals={2} />
            <Chart title="Coût par personne" sub="Coût total des produits divisé par les paniers" points={points.map((p) => ({ l: p.l, v: p.s.costPer }))} color="var(--client-req)" unit="€" decimals={2} />
            <Chart title="Fruits et légumes par personne" sub="Réel, avec la cible en pointillés" points={points.map((p) => ({ l: p.l, v: p.s.flPer }))} color="var(--cat-3)" unit="kg" decimals={2} target={t.flTarget} />
            <Chart title="Pertes" sub="Part du poids reçu perdu" points={points.map((p) => ({ l: p.l, v: p.s.lossPct }))} color="var(--critical)" unit="%" decimals={1} />
            <Chart title="Associations présentes" sub="Nombre d&apos;associations du Village associatif à chaque distribution" points={points.map((p) => ({ l: p.l, v: p.s.presences }))} color={ORANGE} unit="assos" decimals={0} />
            <Chart title="Poids distribué" sub="Total de kilos distribués" points={points.map((p) => ({ l: p.l, v: p.s.distributed }))} color="var(--cat-4)" unit="kg" decimals={0} />
          </section>

          <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_1.3fr]">
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-[var(--shadow)]">
              <h3 className="text-[14.5px] font-semibold text-[var(--navy)]">Répartition par catégorie</h3>
              <p className="mb-3 text-[11.5px] text-[var(--slate)]">Part des kilos distribués sur la période</p>
              {sortedCats.length === 0 && <p className="text-[13px] text-[var(--slate)]">Aucune donnée.</p>}
              <div className="flex flex-col gap-3">
                {sortedCats.map(([cat, kg]) => {
                  const pct = totalCat ? Math.round((kg / totalCat) * 100) : 0;
                  return (
                    <div key={cat} className="grid grid-cols-[110px_1fr_92px] items-center gap-2.5">
                      <span className="text-[12.5px] font-semibold text-[var(--navy)]">{cat}</span>
                      <span className="h-3 overflow-hidden rounded-md bg-[var(--track)]">
                        <span className="block h-full rounded-md" style={{ width: `${pct}%`, background: CAT_COLOR[cat] ?? "var(--slate)" }} />
                      </span>
                      <span className="text-right text-[12px] font-semibold text-[var(--slate)] tabular-nums">{pct}% · {fmt(kg, 0)} kg</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-[var(--shadow)]">
              <h3 className="text-[14.5px] font-semibold text-[var(--navy)]">Comparaison par lieu</h3>
              <p className="mb-3 text-[11.5px] text-[var(--slate)]">{placeId ? "Un seul lieu sélectionné" : "Tous les lieux de la ville, classés par paniers distribués"}</p>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-left text-[12.5px]">
                  <thead>
                    <tr className="text-[11px] font-semibold text-[var(--slate)]">
                      <th className="py-1.5 pr-2">Lieu</th>
                      <th className="px-2 text-right">Distrib.</th>
                      <th className="px-2 text-right">Paniers</th>
                      <th className="px-2 text-right">Colis moyen</th>
                      <th className="px-2 text-right">Coût / pers.</th>
                      <th className="px-2 text-right">F&amp;L / pers.</th>
                      <th className="pl-2 text-right">Pertes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {perPlace.map((p) => (
                      <tr key={p.id} className="border-t border-[var(--border)]">
                        <td className="py-2 pr-2 font-semibold text-[var(--navy)]">{p.name}</td>
                        <td className="px-2 text-right tabular-nums">{p.s.count}</td>
                        <td className="px-2 text-right tabular-nums">{fmt(p.s.baskets)}</td>
                        <td className="px-2 text-right tabular-nums">{p.s.avgBasket ? `${fmt(p.s.avgBasket, 2)} kg` : "—"}</td>
                        <td className="px-2 text-right tabular-nums">{p.s.costPer ? eur(p.s.costPer) : "—"}</td>
                        <td className="px-2 text-right tabular-nums">{p.s.flPer ? `${fmt(p.s.flPer, 2)} kg` : "—"}</td>
                        <td className="pl-2 text-right tabular-nums">{fmt(p.s.lossPct, 1)} %</td>
                      </tr>
                    ))}
                    {perPlace.length === 0 && (
                      <tr>
                        <td colSpan={7} className="py-4 text-center text-[var(--slate)]">Aucune donnée.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-[var(--shadow)]" style={{ borderTop: `4px solid ${ORANGE}` }}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-[14.5px] font-semibold text-[var(--navy)]">Les associations les plus présentes</h3>
                <p className="text-[11.5px] text-[var(--slate)]">Nombre d&apos;interventions sur la période sélectionnée</p>
              </div>
              <Link href="/distributions/village" className="text-[12px] font-semibold" style={{ color: ORANGE }}>Ouvrir le Village associatif →</Link>
            </div>
            {ranking.length === 0 && <p className="text-[13px] text-[var(--slate)]">Aucune intervention d&apos;association sur cette période.</p>}
            <div className="flex flex-col gap-2.5">
              {ranking.slice(0, 10).map(([id, c], i) => (
                <div key={id} className="grid grid-cols-[26px_minmax(0,190px)_1fr_64px] items-center gap-2.5">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full font-display text-[12px] font-black text-white" style={{ background: i === 0 ? ORANGE : i < 3 ? "#f0925f" : "var(--slate)" }}>{i + 1}</span>
                  <span className="truncate text-[13px] font-semibold text-[var(--navy)]">{assocName.get(id) ?? "Association"}</span>
                  <span className="h-3 overflow-hidden rounded-md bg-[var(--track)]">
                    <span className="block h-full rounded-md" style={{ width: `${Math.round((c / ranking[0][1]) * 100)}%`, background: ORANGE }} />
                  </span>
                  <span className="text-right text-[12.5px] font-semibold text-[var(--slate)] tabular-nums">{c} fois</span>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-[var(--shadow)]">
            <h3 className="text-[14.5px] font-semibold text-[var(--navy)]">Historique et commentaires</h3>
            <p className="mb-3 text-[11.5px] text-[var(--slate)]">Clique sur une ligne pour ouvrir la distribution.</p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-[12.5px]">
                <thead>
                  <tr className="text-[11px] font-semibold text-[var(--slate)]">
                    <th className="py-1.5 pr-2">Date</th>
                    <th className="px-2">Lieu</th>
                    <th className="px-2 text-right">Inscrits</th>
                    <th className="px-2 text-right">Paniers</th>
                    <th className="px-2 text-right">Assos</th>
                    <th className="px-2 text-right">Colis moyen</th>
                    <th className="px-2 text-right">Coût / pers.</th>
                    <th className="pl-3">Commentaire</th>
                  </tr>
                </thead>
                <tbody>
                  {[...list].reverse().map((d) => {
                    const f = figures(d);
                    return (
                      <tr key={d.id} className="border-t border-[var(--border)] hover:bg-[var(--input-bg)]">
                        <td className="py-2 pr-2 whitespace-nowrap"><Link href={`/distributions?b=${d.beneficiary_id}&date=${d.event_date}`} className="font-semibold text-[#2a78d6]">{fmtDay(d.event_date)}</Link></td>
                        <td className="px-2 font-semibold text-[var(--navy)]">{placeName.get(d.beneficiary_id) ?? "Lieu"}</td>
                        <td className="px-2 text-right tabular-nums">{f.registered || "—"}</td>
                        <td className="px-2 text-right tabular-nums">{f.baskets || "—"}</td>
                        <td className="px-2 text-right tabular-nums">{(d.distribution_interventions ?? []).length || "—"}</td>
                        <td className="px-2 text-right tabular-nums">{f.baskets ? `${fmt(f.distributed / f.baskets, 2)} kg` : "—"}</td>
                        <td className="px-2 text-right tabular-nums">{f.baskets && f.cost ? eur(f.cost / f.baskets) : "—"}</td>
                        <td className="max-w-[320px] truncate pl-3 text-[var(--slate)]" title={d.comment ?? ""}>{d.comment || "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
