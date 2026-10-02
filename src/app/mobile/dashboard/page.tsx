"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useCity } from "@/components/admin/CityContext";
import EntityActivity from "@/components/admin/EntityActivity";
import { CAT_LABELS, STAT_SELECT, buildEvo, isoOf, summarize, type StatRow, type Summary } from "@/lib/stats";

type Preset = "semaine" | "mois" | "trimestre";
const PRESETS: [Preset, string][] = [["semaine", "Semaine"], ["mois", "Mois"], ["trimestre", "3 mois"]];
type Opt = { id: string; name: string };
type Depot = { count: number; kg: number; cats: { k: string; kg: number; pct: number }[] };
type LinkKpi = { count: number; kg: number };

const fmt = (n: number) => (Math.round(n * 10) / 10).toLocaleString("fr-FR");
const card = "rounded-[16px] border border-[var(--border)] bg-[var(--card)] px-3.5 py-3 shadow-[var(--shadow)]";
const selectCls = "w-full rounded-[12px] border-[1.5px] border-[var(--border)] bg-[var(--card)] px-3 py-2.5 text-[13.5px] font-semibold text-[var(--navy)] outline-none focus:border-[var(--turquoise)]";

function rangeOf(p: Preset) {
  const to = new Date();
  const from = new Date(to);
  if (p === "semaine") from.setDate(to.getDate() - ((to.getDay() + 6) % 7)); // lundi de cette semaine
  else if (p === "mois") from.setDate(1);
  else from.setDate(to.getDate() - 89);
  const days = Math.round((to.getTime() - from.getTime()) / 86400000) + 1;
  const prevTo = new Date(from);
  prevTo.setDate(from.getDate() - 1);
  const prevFrom = new Date(prevTo);
  prevFrom.setDate(prevTo.getDate() - (days - 1));
  return { from, to, prevFrom, prevTo };
}

function Tile({ label, value, sub, subColor }: { label: string; value: string; sub?: string; subColor?: string }) {
  return (
    <div className={card}>
      <span className="block text-[11px] font-semibold text-[var(--slate)]">{label}</span>
      <span className="mt-0.5 block font-display text-[24px] leading-tight font-black text-[var(--navy)] tabular-nums">{value}</span>
      {sub && <span className="block text-[11px]" style={{ color: subColor ?? "var(--slate)" }}>{sub}</span>}
    </div>
  );
}

function Bars({ data }: { data: { l: string; v: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.v));
  const W = 260, H = 64, gap = 4;
  const bw = Math.max(4, (W - gap * (data.length - 1)) / Math.max(1, data.length));
  return (
    <svg viewBox={`0 0 ${W} ${H + 14}`} className="w-full" role="img" aria-label="Volume collecté par jour">
      <title>Volume collecté par jour</title>
      {data.map((d, i) => {
        const h = Math.max(2, (d.v / max) * H);
        const x = i * (bw + gap);
        return (
          <g key={i}>
            <rect x={x} y={H - h} width={bw} height={h} rx={3} fill="var(--turquoise)" />
            {(data.length <= 8 || i % Math.ceil(data.length / 6) === 0) && <text x={x + bw / 2} y={H + 11} fontSize={8.5} textAnchor="middle" fill="var(--slate)">{d.l}</text>}
          </g>
        );
      })}
    </svg>
  );
}

/** Tableau de bord mobile allégé : 4 chiffres clés, volume par jour, 3 premières denrées ; on peut isoler un
 * partenaire ou un lieu de dépose (ses prochaines collectes / son historique passent en tête). Le détail (valeur du
 * don, CO₂, repas, motifs d'annulation) reste sur la version PC. */
export default function MobileDashboard() {
  const supabase = useMemo(() => createClient(), []);
  const { cityId } = useCity();
  const [preset, setPreset] = useState<Preset>("semaine");
  const [partners, setPartners] = useState<Opt[]>([]);
  const [places, setPlaces] = useState<Opt[]>([]);
  const [partnerId, setPartnerId] = useState("");
  const [placeId, setPlaceId] = useState("");
  const [cur, setCur] = useState<Summary | null>(null);
  const [prev, setPrev] = useState<Summary | null>(null);
  const [evo, setEvo] = useState<{ l: string; v: number }[]>([]);
  const [links, setLinks] = useState<LinkKpi>({ count: 0, kg: 0 });
  const [depot, setDepot] = useState<Depot>({ count: 0, kg: 0, cats: [] });
  const [allDenrees, setAllDenrees] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!cityId) return;
    supabase.from("partners").select("id,name").eq("city_id", cityId).is("deleted_at", null).order("name").then(({ data }) => setPartners((data ?? []) as Opt[]));
    supabase
      .from("beneficiaries")
      .select("id,name,category,fiche")
      .eq("city_id", cityId)
      .is("deleted_at", null)
      .order("name")
      .then(({ data }) => {
        const rows = (data ?? []) as { id: string; name: string; category: string | null; fiche: { pinned?: boolean } | null }[];
        setPlaces(rows.filter((b) => b.category === "Distribution Linkee" || b.fiche?.pinned).map((b) => ({ id: b.id, name: b.name })));
      });
  }, [supabase, cityId]);

  useEffect(() => {
    if (!cityId) return;
    let cancelled = false;
    const { from, to, prevFrom } = rangeOf(preset);
    const fk = isoOf(from), tk = isoOf(to), pk = isoOf(prevFrom);
    (async () => {
      setLoading(true);
      setError(null);
      let cq = supabase.from("collectes").select(STAT_SELECT).eq("city_id", cityId).gte("scheduled_date", pk).lte("scheduled_date", tk).limit(5000);
      if (partnerId) cq = cq.eq("partner_id", partnerId);
      let lq = supabase.from("links").select("status,kg_estime,weight_actual").eq("city_id", cityId).gte("window_date", fk).lte("window_date", tk);
      if (partnerId) lq = lq.eq("partner_id", partnerId);
      if (placeId) lq = lq.eq("beneficiary_id", placeId);
      let dq = supabase.from("distributions").select("status,distribution_lines(category,weight_kg)").eq("city_id", cityId).gte("event_date", fk).lte("event_date", tk);
      if (placeId) dq = dq.eq("beneficiary_id", placeId);
      const [c, l, d] = await Promise.all([placeId ? Promise.resolve({ data: [] as unknown[], error: null }) : cq, lq, dq]);
      if (cancelled) return;
      if (c.error) setError(c.error.message);
      const rows = (c.data ?? []) as unknown as StatRow[];
      setCur(summarize(rows.filter((r) => r.scheduled_date >= fk)));
      setPrev(summarize(rows.filter((r) => r.scheduled_date < fk)));
      setEvo(buildEvo(summarize(rows.filter((r) => r.scheduled_date >= fk)).byDay, from, to, 14));
      const lrows = ((l.data ?? []) as { status: string; kg_estime: number; weight_actual: number | null }[]).filter((x) => x.status !== "annulee");
      setLinks({ count: lrows.length, kg: lrows.filter((x) => x.status === "livree").reduce((s, x) => s + (Number(x.weight_actual ?? x.kg_estime) || 0), 0) });
      const drows = ((d.data ?? []) as { status: string; distribution_lines: { category: string | null; weight_kg: number | string | null }[] | null }[]).filter((x) => x.status === "distribuee");
      const byCat = new Map<string, number>();
      let kg = 0;
      for (const x of drows) for (const ln of x.distribution_lines ?? []) { const v = Number(ln.weight_kg) || 0; kg += v; byCat.set(ln.category || "Autre", (byCat.get(ln.category || "Autre") ?? 0) + v); }
      setDepot({ count: drows.length, kg, cats: Array.from(byCat.entries()).map(([k, v]) => ({ k, kg: v, pct: kg ? Math.round((v / kg) * 100) : 0 })).sort((a, b) => b.kg - a.kg) });
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, cityId, preset, partnerId, placeId]);

  const c = cur;
  const delta = prev && prev.volume > 0 && c ? Math.round(((c.volume - prev.volume) / prev.volume) * 100) : null;
  const denrees = c ? [...c.denrees].sort((a, b) => b.pct - a.pct).filter((x) => x.kg > 0) : [];
  const shown = allDenrees ? denrees : denrees.slice(0, 3);
  const placeMode = !!placeId;

  return (
    <div>
      <h1 className="mb-3 font-display text-[28px] leading-none font-black text-[var(--navy)]">Tableau de bord</h1>

      <div className="mb-3 flex rounded-[40px] border border-[var(--border)] bg-[var(--card)] p-[3px]">
        {PRESETS.map(([k, l]) => (
          <button key={k} type="button" onClick={() => setPreset(k)} className={`flex-1 rounded-[40px] py-2 font-display text-[13px] font-bold ${preset === k ? "bg-[var(--navy-deep)] text-[var(--panel-fg)]" : "text-[var(--slate)]"}`}>{l}</button>
        ))}
      </div>

      <div className="mb-3.5 grid grid-cols-2 gap-2">
        <select className={selectCls} value={partnerId} onChange={(e) => { setPartnerId(e.target.value); if (e.target.value) setPlaceId(""); }} aria-label="Isoler un partenaire">
          <option value="">Tous les partenaires</option>
          {partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select className={selectCls} value={placeId} onChange={(e) => { setPlaceId(e.target.value); if (e.target.value) setPartnerId(""); }} aria-label="Isoler un lieu de dépose">
          <option value="">Tous les lieux</option>
          {places.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {error && <div className="mb-3 rounded-xl bg-[var(--critical-bg)] px-3.5 py-2.5 text-[12.5px] font-semibold text-[var(--critical)]">Chargement impossible : {error}</div>}

      {(partnerId || placeId) && <EntityActivity key={partnerId || placeId} kind={partnerId ? "partner" : "beneficiary"} id={partnerId || placeId} />}

      <div className={loading ? "opacity-60 transition-opacity" : "transition-opacity"}>
        {placeMode ? (
          <div className="mb-3 grid grid-cols-2 gap-2">
            <Tile label="Volume reçu" value={`${fmt(depot.kg)} kg`} sub="distributions clôturées" />
            <Tile label="Distributions" value={String(depot.count)} sub="réalisées" />
            <Tile label="Links bénévoles" value={String(links.count)} sub="vers ce lieu" />
            <Tile label="kg sauvés (Links)" value={`${fmt(links.kg)} kg`} sub="livrés par les Linkers" />
          </div>
        ) : (
          <div className="mb-3 grid grid-cols-2 gap-2">
            <Tile label="Volume collecté" value={`${fmt(c?.volume ?? 0)} kg`} sub={delta === null ? "Pas de période précédente" : `${delta >= 0 ? "▲" : "▼"} ${Math.abs(delta)} % vs période préc.`} subColor={delta === null ? undefined : delta >= 0 ? "var(--good)" : "var(--critical)"} />
            <Tile label="Collectes" value={`${c?.ok ?? 0} / ${c?.collectes ?? 0}`} sub={`${c?.taux ?? 0} % réussies`} />
            <Tile label="Links bénévoles" value={String(links.count)} sub={`${fmt(links.kg)} kg livrés`} />
            {partnerId ? <Tile label="Annulées" value={String(c?.annulees ?? 0)} sub="sur la période" /> : <Tile label="Distributions" value={String(depot.count)} sub={`${fmt(depot.kg)} kg reçus`} />}
          </div>
        )}

        {!placeMode && (
          <div className={`${card} mb-3`}>
            <p className="mb-1.5 text-[12px] font-semibold text-[var(--slate)]">Volume par jour</p>
            {evo.length ? <Bars data={evo} /> : <p className="text-[12px] text-[var(--slate)]">Pas encore de donnée.</p>}
          </div>
        )}

        <div className={`${card} mb-3`}>
          <p className="mb-2 text-[12px] font-semibold text-[var(--slate)]">Typologie des denrées</p>
          {placeMode ? (
            depot.cats.length ? (
              depot.cats.slice(0, allDenrees ? 99 : 3).map((x) => (
                <div key={x.k} className="mb-1.5 grid grid-cols-[96px_1fr_44px] items-center gap-2 text-[11.5px]">
                  <span className="truncate">{x.k}</span>
                  <span className="h-2 overflow-hidden rounded bg-[var(--track)]"><span className="block h-full rounded bg-[var(--turquoise)]" style={{ width: `${x.pct}%` }} /></span>
                  <span className="text-right font-semibold">{x.pct} %</span>
                </div>
              ))
            ) : (
              <p className="text-[12px] text-[var(--slate)]">Pas encore de donnée.</p>
            )
          ) : shown.length ? (
            shown.map((x, i) => (
              <div key={x.k} className="mb-1.5 grid grid-cols-[96px_1fr_44px] items-center gap-2 text-[11.5px]">
                <span className="truncate">{CAT_LABELS[x.k]}</span>
                <span className="h-2 overflow-hidden rounded bg-[var(--track)]"><span className="block h-full rounded" style={{ width: `${x.pct}%`, background: `var(--cat-${i + 1})` }} /></span>
                <span className="text-right font-semibold">{x.pct} %</span>
              </div>
            ))
          ) : (
            <p className="text-[12px] text-[var(--slate)]">Pas encore de donnée sur cette période.</p>
          )}
          {((placeMode && depot.cats.length > 3) || (!placeMode && denrees.length > 3)) && (
            <button type="button" onClick={() => setAllDenrees((v) => !v)} className="mt-1 text-[12px] font-bold text-[var(--turquoise)]">{allDenrees ? "Réduire" : "Voir toutes les denrées"}</button>
          )}
        </div>

        <p className="text-center text-[11.5px] text-[var(--slate)]">Valeur du don, CO₂, repas, motifs d&apos;annulation : sur la version PC.</p>
      </div>
    </div>
  );
}
