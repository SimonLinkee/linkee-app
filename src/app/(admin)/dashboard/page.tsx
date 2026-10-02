"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useCity } from "@/components/admin/CityContext";
import EntityActivity from "@/components/admin/EntityActivity";
import { canAdminCity } from "@/lib/roles";
import { CAT_KEYS, CAT_LABELS, CO2_SOURCE, DEFAULT_EUR_PER_KG, STAT_SELECT, SUBCAT_SELECT, buildEvo, isoOf, rse, subMap, summarize, type CatKey, type StatRow, type SubCat, type Summary } from "@/lib/stats";

type Gran = "jour" | "semaine" | "mois" | "custom";
type EvoPoint = { l: string; v: number };

const CAT_COLORS: Record<CatKey, string> = {
  secs: "var(--cat-1)",
  fl: "var(--cat-2)",
  frais: "var(--cat-3)",
  plats: "var(--cat-4)",
  boulang: "var(--cat-5)",
};

const CAT_DOT: Record<string, string> = {
  Boulangerie: "var(--cat-4)",
  Supermarché: "var(--cat-1)",
  Traiteur: "var(--cat-2)",
  Hôtel: "var(--cat-3)",
  Grossiste: "var(--slate)",
};

function fmt(n: number) {
  return Math.round(n).toLocaleString("fr-FR");
}

const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const DAYS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const short = (d: Date) => `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 4)}.`;

/** Start/end (inclusive) of the period around `anchor`. */
function periodRange(gran: Gran, anchor: Date, customFrom: string, customTo: string): { from: Date; to: Date; label: string } {
  if (gran === "jour") {
    return { from: new Date(anchor), to: new Date(anchor), label: `${DAYS[anchor.getDay()]} ${anchor.getDate()} ${MONTHS[anchor.getMonth()]} ${anchor.getFullYear()}` };
  }
  if (gran === "semaine") {
    const from = new Date(anchor);
    from.setDate(anchor.getDate() - ((anchor.getDay() + 6) % 7));
    const to = new Date(from);
    to.setDate(from.getDate() + 6);
    return { from, to, label: `Semaine du ${short(from)} au ${short(to)} ${to.getFullYear()}` };
  }
  if (gran === "mois") {
    const from = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const to = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
    return { from, to, label: `${MONTHS[anchor.getMonth()][0].toUpperCase()}${MONTHS[anchor.getMonth()].slice(1)} ${anchor.getFullYear()}` };
  }
  let from = new Date((customFrom || isoOf(anchor)) + "T00:00:00");
  let to = new Date((customTo || isoOf(anchor)) + "T00:00:00");
  if (to < from) [from, to] = [to, from];
  return { from, to, label: `Du ${short(from)} au ${short(to)} ${to.getFullYear()}` };
}


function Sparkline({ evo }: { evo: EvoPoint[] }) {
  const spark = evo.slice(-7);
  if (spark.length === 0) return <div className="h-[34px]" />;
  const maxV = Math.max(...spark.map((p) => p.v), 1);
  const w = 160;
  const h = 34;
  const step = w / (spark.length - 1 || 1);
  const pts = spark.map((p, i) => [i * step, h - (p.v / maxV) * h * 0.9 - 2]);
  const line = `M ${pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" L ")}`;
  const area = `${line} L ${w},${h} L 0,${h} Z`;
  return (
    <svg className="mt-0.5" viewBox="0 0 160 34" width="100%" height="34" preserveAspectRatio="none">
      <path d={area} fill="var(--seq-tint)" stroke="none" />
      <path d={line} fill="none" stroke="var(--seq)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function EvolutionChart({ evo }: { evo: EvoPoint[] }) {
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null);
  const W = 620;
  const H = 220;
  const padL = 38;
  const padR = 12;
  const padT = 14;
  const padB = 26;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const maxV = Math.max(...evo.map((p) => p.v));
  const niceMax = Math.ceil(maxV / 100) * 100 || 100;
  const step = plotW / (evo.length - 1 || 1);

  const pts = evo.map((p, i) => ({
    x: padL + i * step,
    y: padT + plotH - (p.v / niceMax) * plotH,
    v: p.v,
    l: p.l,
  }));

  const linePath = `M ${pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" L ")}`;
  const areaPath = `${linePath} L ${pts[pts.length - 1].x.toFixed(1)},${padT + plotH} L ${pts[0].x.toFixed(1)},${padT + plotH} Z`;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={220}>
        {[0, 1, 2, 3, 4].map((g) => {
          const gy = padT + plotH - (g / 4) * plotH;
          return (
            <g key={g}>
              <line x1={padL} y1={gy} x2={W - padR} y2={gy} stroke="var(--grid)" strokeWidth={1} />
              <text x={padL - 8} y={gy + 4} fontSize={10.5} fill="var(--muted)" textAnchor="end">
                {fmt((niceMax * g) / 4)}
              </text>
            </g>
          );
        })}
        <path d={areaPath} fill="var(--seq-tint)" stroke="none" />
        <path d={linePath} fill="none" stroke="var(--seq)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
        {pts.map((p, i) => {
          const isLast = i === pts.length - 1;
          return (
            <g key={i}>
              <circle cx={p.x} cy={p.y} r={isLast ? 4 : 3} fill={isLast ? "var(--seq)" : "var(--card)"} stroke="var(--seq)" strokeWidth={2} />
              <circle
                cx={p.x}
                cy={p.y}
                r={12}
                fill="transparent"
                className="cursor-pointer"
                onMouseEnter={() => setTooltip({ x: (p.x / W) * 100, y: (p.y / H) * 100, text: `${p.l} — ${fmt(p.v)} kg` })}
                onMouseLeave={() => setTooltip(null)}
              />
            </g>
          );
        })}
        {pts.map((p, i) => (
          <text key={i} x={p.x} y={H - 6} fontSize={11} fill="var(--muted)" textAnchor="middle">
            {p.l}
          </text>
        ))}
      </svg>
      {tooltip && (
        <div
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-[120%] rounded-[9px] bg-[var(--navy-deep)] px-2.5 py-1.5 text-xs font-semibold whitespace-nowrap text-[var(--panel-fg)] shadow-[var(--shadow)]"
          style={{ left: `${tooltip.x}%`, top: `${tooltip.y}%` }}
        >
          {tooltip.text}
        </div>
      )}
    </div>
  );
}


type PartnerOpt = { id: string; name: string; cat: string };

function fmtHours(secs: number) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return `${h}h${String(m).padStart(2, "0")}`;
}

export default function DashboardPage() {
  const supabase = useMemo(() => createClient(), []);
  const [gran, setGran] = useState<Gran>("semaine");
  const [anchor, setAnchor] = useState(() => new Date());
  const [dateFrom, setDateFrom] = useState(() => isoOf(new Date(Date.now() - 14 * 86400000)));
  const [dateTo, setDateTo] = useState(() => isoOf(new Date()));
  const [activePartnerId, setActivePartnerId] = useState("");
  const [partnerOpts, setPartnerOpts] = useState<PartnerOpt[]>([]);
  const [activeBeneficiaryId, setActiveBeneficiaryId] = useState("");
  const [beneficiaryOpts, setBeneficiaryOpts] = useState<PartnerOpt[]>([]);
  const [depot, setDepot] = useState<{ volume: number; count: number; denrees: { k: string; kg: number; pct: number }[] } | null>(null);
  const [linkKpi, setLinkKpi] = useState<{ count: number; kg: number; don: number }>({ count: 0, kg: 0, don: 0 });
  function pickPartner(id: string) {
    setActivePartnerId(id);
    if (id) setActiveBeneficiaryId("");
  }
  function pickBeneficiary(id: string) {
    setActiveBeneficiaryId(id);
    if (id) setActivePartnerId("");
  }
  const [cur, setCur] = useState<Summary | null>(null);
  const [prev, setPrev] = useState<Summary | null>(null);
  const [evo, setEvo] = useState<EvoPoint[]>([]);
  const [work, setWork] = useState<{ secs: number; days: number }>({ secs: 0, days: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { cityId, city, isAll, cities, role } = useCity(); // cityId is null in the national view; the page remounts when the city changes
  const [byCity, setByCity] = useState<{ id: string; name: string; color: string; volume: number; ok: number; collectes: number }[]>([]);

  const range = useMemo(() => periodRange(gran, anchor, dateFrom, dateTo), [gran, anchor, dateFrom, dateTo]);
  const fromKey = range.from.getTime();
  const toKey = range.to.getTime();

  useEffect(() => {
    let pq = supabase.from("partners").select("id,name,category").is("deleted_at", null).order("name");
    if (cityId) pq = pq.eq("city_id", cityId);
    pq.then(({ data }) => setPartnerOpts(((data ?? []) as { id: string; name: string; category: string | null }[]).map((p) => ({ id: p.id, name: p.name, cat: p.category ?? "" }))));
  }, [supabase]);

  // "lieux de dépose" = bénéficiaires marqués Distribution Linkee (ou épinglés) — même logique que côté planning mobile
  useEffect(() => {
    let bq = supabase.from("beneficiaries").select("id,name,category,fiche").is("deleted_at", null).order("name");
    if (cityId) bq = bq.eq("city_id", cityId);
    bq.then(({ data }) => {
      const rows = (data ?? []) as { id: string; name: string; category: string | null; fiche: { pinned?: boolean } | null }[];
      setBeneficiaryOpts(rows.filter((b) => b.category === "Distribution Linkee" || b.fiche?.pinned).map((b) => ({ id: b.id, name: b.name, cat: b.category ?? "" })));
    });
  }, [supabase, cityId]);

  // vue "lieu de dépose" : volumes reçus et typologie des denrées, à partir des distributions réellement clôturées
  useEffect(() => {
    if (!activeBeneficiaryId) return setDepot(null);
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("distributions")
        .select("id,event_date,distribution_lines(category,weight_kg)")
        .eq("beneficiary_id", activeBeneficiaryId)
        .gte("event_date", isoOf(range.from))
        .lte("event_date", isoOf(range.to));
      if (cancelled) return;
      const rows = (data ?? []) as { id: string; event_date: string; distribution_lines: { category: string | null; weight_kg: number | string | null }[] | null }[];
      const byCat = new Map<string, number>();
      let total = 0;
      for (const d of rows) for (const l of d.distribution_lines ?? []) { const kg = Number(l.weight_kg) || 0; total += kg; const k = l.category || "Autre"; byCat.set(k, (byCat.get(k) ?? 0) + kg); }
      const denrees = Array.from(byCat.entries()).map(([k, kg]) => ({ k, kg: Math.round(kg * 10) / 10, pct: total ? Math.round((kg / total) * 100) : 0 })).sort((a, b) => b.kg - a.kg);
      setDepot({ volume: Math.round(total * 10) / 10, count: rows.length, denrees });
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, activeBeneficiaryId, fromKey, toKey]);

  // indicateurs Links Bénévoles : filtrables par partenaire et par ville (vide = toutes villes)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let q = supabase.from("links").select("status,kg_estime,weight_actual,don_value,window_date").gte("window_date", isoOf(range.from)).lte("window_date", isoOf(range.to));
      if (cityId) q = q.eq("city_id", cityId);
      if (activePartnerId) q = q.eq("partner_id", activePartnerId);
      if (activeBeneficiaryId) q = q.eq("beneficiary_id", activeBeneficiaryId);
      const { data } = await q;
      if (cancelled) return;
      const rows = (data ?? []) as { status: string; kg_estime: number; weight_actual: number | null; don_value: number | null }[];
      const mine = rows.filter((l) => l.status !== "annulee");
      const delivered = mine.filter((l) => l.status === "livree");
      const kg = delivered.reduce((s, l) => s + (Number(l.weight_actual ?? l.kg_estime) || 0), 0);
      // valeur du don : celle renseignée manuellement (don_value) écrase le calcul automatique (kg × prix par défaut), pour ce Link uniquement
      const don = delivered.reduce((s, l) => s + (l.don_value != null ? Number(l.don_value) : (Number(l.weight_actual ?? l.kg_estime) || 0) * DEFAULT_EUR_PER_KG), 0);
      setLinkKpi({ count: mine.length, kg: Math.round(kg * 10) / 10, don: Math.round(don * 100) / 100 });
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, cityId, activePartnerId, activeBeneficiaryId, fromKey, toKey]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      const from = new Date(fromKey);
      const to = new Date(toKey);
      const days = Math.round((toKey - fromKey) / 86400000) + 1;
      const prevFrom = new Date(from);
      prevFrom.setDate(from.getDate() - days);
      const evoFrom = new Date(from);
      if (gran === "jour") evoFrom.setDate(to.getDate() - 6);
      const start = prevFrom < evoFrom ? prevFrom : evoFrom;

      let q = supabase.from("collectes").select(STAT_SELECT).gte("scheduled_date", isoOf(start)).lte("scheduled_date", isoOf(to)).limit(5000);
      if (cityId) q = q.eq("city_id", cityId); // one city, or every city in the national view
      if (activePartnerId) q = q.eq("partner_id", activePartnerId);
      let sq = supabase.from("day_sessions").select("started_at,closed_at").gte("day", isoOf(from)).lte("day", isoOf(to)).not("closed_at", "is", null);
      if (cityId) sq = sq.eq("city_id", cityId);
      const [{ data, error: err }, ses, subRes] = await Promise.all([
        q,
        activePartnerId ? Promise.resolve({ data: [] as { started_at: string | null; closed_at: string | null }[] }) : sq,
        supabase.from("partner_subcategories").select(SUBCAT_SELECT).limit(5000),
      ]);
      if (cancelled) return;
      if (err) setError(err.message);
      const subs = subMap(((subRes.data ?? []) as unknown as SubCat[]).map((s) => ({ ...s, unit_price: s.unit_price == null ? null : Number(s.unit_price), unit_weight_kg: s.unit_weight_kg == null ? null : Number(s.unit_weight_kg) })));
      const rows = (data ?? []) as unknown as StatRow[];
      // national view: volume and collections per city
      if (!cityId) {
        const fk0 = isoOf(from);
        const tk0 = isoOf(to);
        const cur0 = rows.filter((r) => r.scheduled_date >= fk0 && r.scheduled_date <= tk0);
        setByCity(cities.map((c) => ({ id: c.id, name: c.name, color: c.color, ...(() => { const s = summarize(cur0.filter((r) => r.city_id === c.id)); return { volume: s.volume, ok: s.ok, collectes: s.collectes }; })() })));
      }
      const fk = isoOf(from);
      const pk = isoOf(prevFrom);
      setCur(summarize(rows.filter((r) => r.scheduled_date >= fk && r.scheduled_date <= isoOf(to)), subs));
      setPrev(summarize(rows.filter((r) => r.scheduled_date >= pk && r.scheduled_date < fk), subs));
      const ek = isoOf(evoFrom);
      setEvo(buildEvo(summarize(rows.filter((r) => r.scheduled_date >= ek)).byDay, evoFrom, to));
      const sessions = (ses.data ?? []) as { started_at: string | null; closed_at: string | null }[];
      setWork({
        secs: sessions.reduce((s, x) => (x.started_at && x.closed_at ? s + Math.max(0, (new Date(x.closed_at).getTime() - new Date(x.started_at).getTime()) / 1000) : s), 0),
        days: sessions.length,
      });
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, gran, fromKey, toKey, activePartnerId]);

  function shift(dir: 1 | -1) {
    const d = new Date(anchor);
    if (gran === "jour") d.setDate(d.getDate() + dir);
    else if (gran === "semaine") d.setDate(d.getDate() + 7 * dir);
    else d.setMonth(d.getMonth() + dir);
    setAnchor(d);
  }

  const activePartner = partnerOpts.find((p) => p.id === activePartnerId);
  const activeBeneficiary = beneficiaryOpts.find((b) => b.id === activeBeneficiaryId);
  const c: Summary = cur ?? { volume: 0, don: 0, customShare: 0, collectes: 0, ok: 0, annulees: 0, taux: 0, denrees: CAT_KEYS.map((k) => ({ k, kg: 0, pct: 0 })), partners: [], motifs: [], byDay: {} };
  const okPct = c.collectes ? Math.round((c.ok / c.collectes) * 100) : 0;
  const delta = prev && prev.volume > 0 ? Math.round(((c.volume - prev.volume) / prev.volume) * 100) : null;
  const ring = 2 * Math.PI * 21;
  const maxDenreePct = Math.max(...c.denrees.map((x) => x.pct), 1);
  const sortedDenrees = [...c.denrees].sort((a, b) => b.pct - a.pct);
  const maxMotifPct = Math.max(...c.motifs.map((x) => x.pct), 1);
  const dayCount = Math.round((toKey - fromKey) / 86400000) + 1;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-5">
        <div>
          <h1 className="font-display text-[34px] leading-none font-black">Tableau de bord</h1>
          <p className="mt-1.5 text-sm text-[var(--slate)]">{isAll ? "Vue nationale — toutes les villes cumulées." : `Vue d'ensemble de l'activité de collecte — ${city?.name ?? ""}.`}</p>
        </div>
        <div className="flex flex-col items-end gap-2.5">
          <div className="flex rounded-[40px] border border-[var(--border)] bg-[var(--card)] p-[3px]">
            {(
              [
                ["jour", "Jour"],
                ["semaine", "Semaine"],
                ["mois", "Mois"],
                ["custom", "Personnalisé"],
              ] as [Gran, string][]
            ).map(([g, label]) => (
              <button
                key={g}
                type="button"
                onClick={() => setGran(g)}
                className={`rounded-[40px] px-4 py-[7px] font-display text-[13px] font-bold ${gran === g ? "bg-[var(--navy-deep)] text-[var(--panel-fg)]" : "text-[var(--slate)]"}`}
              >
                {label}
              </button>
            ))}
          </div>
          {gran !== "custom" ? (
            <div className="flex items-center gap-2.5 text-[13px] text-[var(--slate)]">
              <button type="button" aria-label="Période précédente" onClick={() => shift(-1)} className="flex h-[26px] w-[26px] items-center justify-center rounded-full border border-[var(--border)] bg-[var(--card)] text-[var(--navy)]">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-[13px] w-[13px]">
                  <path d="M15 5 L8 12 L15 19" />
                </svg>
              </button>
              <span className="font-semibold text-[var(--navy)]">{range.label}</span>
              <button type="button" aria-label="Période suivante" onClick={() => shift(1)} className="flex h-[26px] w-[26px] items-center justify-center rounded-full border border-[var(--border)] bg-[var(--card)] text-[var(--navy)]">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-[13px] w-[13px]">
                  <path d="M9 5 L16 12 L9 19" />
                </svg>
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} aria-label="Date de début" className="rounded-[10px] border border-[var(--border)] bg-[var(--card)] px-2.5 py-1.5 text-[12.5px] font-semibold text-[var(--navy)] outline-none focus:border-[var(--turquoise)]" />
              <span className="text-[13px] text-[var(--slate)]">→</span>
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} aria-label="Date de fin" className="rounded-[10px] border border-[var(--border)] bg-[var(--card)] px-2.5 py-1.5 text-[12.5px] font-semibold text-[var(--navy)] outline-none focus:border-[var(--turquoise)]" />
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2.5">
            <label htmlFor="partner-select" className="text-xs font-semibold whitespace-nowrap text-[var(--slate)]">
              Isoler un partenaire
            </label>
            <select
              id="partner-select"
              value={activePartnerId}
              onChange={(e) => pickPartner(e.target.value)}
              className="max-w-[220px] cursor-pointer rounded-[10px] border border-[var(--border)] bg-[var(--card)] px-2.5 py-[7px] text-[12.5px] font-semibold text-[var(--navy)] outline-none focus:border-[var(--turquoise)]"
            >
              <option value="">Tous les partenaires</option>
              {partnerOpts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <label htmlFor="depot-select" className="text-xs font-semibold whitespace-nowrap text-[var(--slate)]">
              Isoler un lieu de dépose
            </label>
            <select
              id="depot-select"
              value={activeBeneficiaryId}
              onChange={(e) => pickBeneficiary(e.target.value)}
              className="max-w-[220px] cursor-pointer rounded-[10px] border border-[var(--border)] bg-[var(--card)] px-2.5 py-[7px] text-[12.5px] font-semibold text-[var(--navy)] outline-none focus:border-[var(--turquoise)]"
            >
              <option value="">Tous les lieux</option>
              {beneficiaryOpts.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {error && <div className="mb-4 rounded-xl bg-[var(--critical-bg)] px-4 py-3 text-[13px] font-semibold text-[var(--critical)]">Chargement impossible : {error}</div>}

      {activePartner && (
        <div className="-mt-2.5 mb-[22px] flex flex-wrap items-center justify-between gap-4 rounded-[18px] bg-[var(--navy-deep)] px-[22px] py-4 text-[var(--panel-fg)] shadow-[var(--shadow)]">
          <div>
            <span className="text-[11px] font-bold tracking-[0.05em] text-[var(--panel-fg-dim)] uppercase">{activePartner.cat}</span>
            <h2 className="my-0.5 font-display text-[22px] font-extrabold">{activePartner.name}</h2>
            <p className="text-[12.5px] text-[var(--panel-fg-dim)]">Vue isolée sur ce partenaire pour la période sélectionnée.</p>
          </div>
          <button type="button" onClick={() => setActivePartnerId("")} className="flex-none rounded-[40px] border-[1.5px] border-white/35 px-4 py-2.5 font-display text-[13px] font-bold hover:border-[var(--turquoise)] hover:text-[var(--turquoise)]">
            Retour à la vue globale
          </button>
        </div>
      )}

      {activeBeneficiary && (
        <div className="-mt-2.5 mb-[22px] flex flex-wrap items-center justify-between gap-4 rounded-[18px] bg-[var(--navy-deep)] px-[22px] py-4 text-[var(--panel-fg)] shadow-[var(--shadow)]">
          <div>
            <span className="text-[11px] font-bold tracking-[0.05em] text-[var(--panel-fg-dim)] uppercase">Lieu de dépose</span>
            <h2 className="my-0.5 font-display text-[22px] font-extrabold">{activeBeneficiary.name}</h2>
            <p className="text-[12.5px] text-[var(--panel-fg-dim)]">Volumes reçus et typologie des denrées — pour préparer un point avec l&apos;association.</p>
          </div>
          <button type="button" onClick={() => setActiveBeneficiaryId("")} className="flex-none rounded-[40px] border-[1.5px] border-white/35 px-4 py-2.5 font-display text-[13px] font-bold hover:border-[var(--turquoise)] hover:text-[var(--turquoise)]">
            Retour à la vue globale
          </button>
        </div>
      )}

      {(activePartnerId || activeBeneficiaryId) && <EntityActivity key={activePartnerId || activeBeneficiaryId} kind={activePartnerId ? "partner" : "beneficiary"} id={activePartnerId || activeBeneficiaryId} />}

      {activeBeneficiaryId ? (
        <div className={loading ? "opacity-60 transition-opacity" : "transition-opacity"}>
          <section className="mb-[22px] grid grid-cols-2 gap-4 lg:grid-cols-4">
            <div className="flex flex-col gap-2 rounded-[18px] border border-[var(--border)] bg-[var(--card)] p-5 shadow-[var(--shadow)]">
              <span className="text-xs font-bold tracking-[0.04em] text-[var(--slate)] uppercase">Volume reçu</span>
              <span className="font-display text-[30px] leading-none font-black text-[var(--navy)] tabular-nums">{fmt(depot?.volume ?? 0)} kg</span>
              <span className="text-[12.5px] text-[var(--slate)]">sur la période sélectionnée</span>
            </div>
            <div className="flex flex-col gap-2 rounded-[18px] border border-[var(--border)] bg-[var(--card)] p-5 shadow-[var(--shadow)]">
              <span className="text-xs font-bold tracking-[0.04em] text-[var(--slate)] uppercase">Distributions</span>
              <span className="font-display text-[30px] leading-none font-black text-[var(--navy)] tabular-nums">{depot?.count ?? 0}</span>
              <span className="text-[12.5px] text-[var(--slate)]">réalisées sur la période</span>
            </div>
            <div className="flex flex-col gap-2 rounded-[18px] border border-[var(--border)] bg-[var(--card)] p-5 shadow-[var(--shadow)]" style={{ borderTop: "4px solid #eb6834" }}>
              <span className="text-xs font-bold tracking-[0.04em] text-[var(--slate)] uppercase">Links Bénévoles</span>
              <span className="font-display text-[30px] leading-none font-black text-[var(--navy)] tabular-nums">{linkKpi.count}</span>
              <span className="text-[12.5px] text-[var(--slate)]">demandes vers ce lieu</span>
            </div>
            <div className="flex flex-col gap-2 rounded-[18px] border border-[var(--border)] bg-[var(--card)] p-5 shadow-[var(--shadow)]" style={{ borderTop: "4px solid #eb6834" }}>
              <span className="text-xs font-bold tracking-[0.04em] text-[var(--slate)] uppercase">kg sauvés (Links)</span>
              <span className="font-display text-[30px] leading-none font-black text-[var(--navy)] tabular-nums">{fmt(linkKpi.kg)} kg</span>
              <span className="text-[12.5px] text-[var(--slate)]">livrés par les Linkers</span>
            </div>
          </section>
          <section className="rounded-[18px] border border-[var(--border)] bg-[var(--card)] p-6 shadow-[var(--shadow)]">
            <h3 className="mb-0.5 font-display text-[17px] font-extrabold text-[var(--navy)]">Répartition par type de denrée</h3>
            <p className="mb-4 text-[12.5px] text-[var(--slate)]">Part du volume reçu par ce lieu sur la période</p>
            {!depot || depot.denrees.length === 0 ? (
              <p className="py-6 text-center text-[13px] text-[var(--slate)]">Aucune distribution enregistrée sur cette période.</p>
            ) : (
              <div className="flex flex-col gap-3.5">
                {depot.denrees.map((x) => {
                  const max = Math.max(...depot.denrees.map((d) => d.pct), 1);
                  return (
                    <div key={x.k} className="grid grid-cols-[128px_1fr_90px] items-center gap-2.5">
                      <span className="text-[12.5px] font-semibold text-[var(--navy)]">{x.k}</span>
                      <span className="h-3 overflow-hidden rounded-md bg-[var(--track)]">
                        <span className="block h-full rounded-md" style={{ width: `${Math.round((x.pct / max) * 100)}%`, background: "#2a78d6" }} />
                      </span>
                      <span className="text-right text-[12.5px] font-semibold text-[var(--slate)] tabular-nums">{x.pct}% · {fmt(x.kg)}kg</span>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      ) : (
      <div className={loading ? "opacity-60 transition-opacity" : "transition-opacity"}>
        <section className="mb-[22px] grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
          <div className="flex flex-col gap-2 rounded-[18px] border border-[var(--border)] bg-[var(--card)] p-5 shadow-[var(--shadow)]">
            <span className="text-xs font-bold tracking-[0.04em] text-[var(--slate)] uppercase">Volume collecté</span>
            <span className="font-display text-[30px] leading-none font-black text-[var(--navy)] tabular-nums">{fmt(c.volume)} kg</span>
            <span className={`flex items-center gap-1 text-[12.5px] font-semibold ${delta === null ? "text-[var(--slate)]" : delta >= 0 ? "text-[var(--good)]" : "text-[var(--critical)]"}`}>
              {delta === null ? "Pas de période précédente à comparer" : `${delta >= 0 ? "▲" : "▼"} ${Math.abs(delta)} % vs période précédente`}
            </span>
            <Sparkline evo={evo} />
          </div>
          <div className="flex flex-col gap-2 rounded-[18px] border border-[var(--border)] bg-[var(--card)] p-5 shadow-[var(--shadow)]">
            <span className="text-xs font-bold tracking-[0.04em] text-[var(--slate)] uppercase">Collectes traitées</span>
            <span className="font-display text-[30px] leading-none font-black text-[var(--navy)] tabular-nums">{c.collectes}</span>
            <span className="text-[12.5px] text-[var(--slate)]">
              {c.ok} collectées · {c.annulees} annulées
            </span>
            <div className="mt-0.5 flex h-2 overflow-hidden rounded-[5px] bg-[var(--track)]">
              <span style={{ width: `${okPct}%`, background: "var(--good)" }} />
              <span style={{ width: `${c.collectes ? 100 - okPct : 0}%`, background: "var(--critical)" }} />
            </div>
          </div>
          <div className="flex flex-col gap-2 rounded-[18px] border border-[var(--border)] bg-[var(--card)] p-5 shadow-[var(--shadow)]">
            <span className="text-xs font-bold tracking-[0.04em] text-[var(--slate)] uppercase">Taux de réussite</span>
            <div className="flex items-center gap-3">
              <svg viewBox="0 0 52 52" className="h-[52px] w-[52px]">
                <circle cx="26" cy="26" r="21" fill="none" stroke="var(--track)" strokeWidth={6} />
                <circle cx="26" cy="26" r="21" fill="none" stroke="var(--good)" strokeWidth={6} strokeLinecap="round" strokeDasharray={ring.toFixed(1)} strokeDashoffset={(ring * (1 - c.taux / 100)).toFixed(1)} transform="rotate(-90 26 26)" />
              </svg>
              <span className="font-display text-[26px] font-black text-[var(--navy)] tabular-nums">{c.taux} %</span>
            </div>
          </div>
          {canAdminCity(role) && (
          <div className="flex flex-col gap-2 rounded-[18px] border border-[var(--border)] bg-[var(--card)] p-5 shadow-[var(--shadow)]">
            <span className="text-xs font-bold tracking-[0.04em] text-[var(--slate)] uppercase">Temps de travail</span>
            <span className="font-display text-[30px] leading-none font-black text-[var(--navy)] tabular-nums">{activePartnerId ? "—" : fmtHours(work.secs)}</span>
            <span className="text-[12.5px] text-[var(--slate)]">{activePartnerId ? "Non applicable à un seul partenaire" : `${work.days} journée(s) clôturée(s)`}</span>
          </div>
          )}
          <div className="flex flex-col gap-2 rounded-[18px] border border-[var(--border)] bg-[var(--card)] p-5 shadow-[var(--shadow)]" style={{ borderTop: "4px solid #eb6834" }}>
            <span className="text-xs font-bold tracking-[0.04em] text-[var(--slate)] uppercase">Links Bénévoles</span>
            <span className="font-display text-[30px] leading-none font-black text-[var(--navy)] tabular-nums">{linkKpi.count}</span>
            <span className="text-[12.5px] text-[var(--slate)]">{isAll ? "toutes villes" : city?.name ?? ""}{activePartnerId ? " · ce partenaire" : ""}</span>
          </div>
          <div className="flex flex-col gap-2 rounded-[18px] border border-[var(--border)] bg-[var(--card)] p-5 shadow-[var(--shadow)]" style={{ borderTop: "4px solid #eb6834" }}>
            <span className="text-xs font-bold tracking-[0.04em] text-[var(--slate)] uppercase">kg sauvés (Links)</span>
            <span className="font-display text-[30px] leading-none font-black text-[var(--navy)] tabular-nums">{fmt(linkKpi.kg)} kg</span>
            <span className="text-[12.5px] text-[var(--slate)]">livrés par les Linkers</span>
          </div>
        </section>

        <section className="mb-4 grid grid-cols-1 gap-4 xl:grid-cols-[1.3fr_1fr]">
          <div className="rounded-[18px] border border-[var(--border)] bg-[var(--card)] p-6 shadow-[var(--shadow)]">
            <h3 className="mb-0.5 font-display text-[17px] font-extrabold text-[var(--navy)]">Évolution du volume collecté</h3>
            <p className="mb-4 text-[12.5px] text-[var(--slate)]">{gran === "jour" ? "7 derniers jours jusqu'à la date choisie" : `${dayCount} jour(s) sélectionné(s)`}</p>
            {evo.length > 0 ? <EvolutionChart evo={evo} /> : <p className="py-10 text-center text-[13px] text-[var(--slate)]">Aucune donnée sur cette période.</p>}
          </div>
          <div className="rounded-[18px] border border-[var(--border)] bg-[var(--card)] p-6 shadow-[var(--shadow)]">
            <h3 className="mb-0.5 font-display text-[17px] font-extrabold text-[var(--navy)]">Répartition par type de denrée</h3>
            <p className="mb-4 text-[12.5px] text-[var(--slate)]">Part du volume total collecté sur la période</p>
            <div className="flex flex-col gap-3.5">
              {sortedDenrees.map((x) => (
                <div key={x.k} className="grid grid-cols-[128px_1fr_70px] items-center gap-2.5">
                  <span className="text-[12.5px] font-semibold text-[var(--navy)]">{CAT_LABELS[x.k]}</span>
                  <span className="h-3 overflow-hidden rounded-md bg-[var(--track)]">
                    <span className="block h-full rounded-md" style={{ width: `${Math.round((x.pct / maxDenreePct) * 100)}%`, background: CAT_COLORS[x.k] }} />
                  </span>
                  <span className="text-right text-[12.5px] font-semibold text-[var(--slate)] tabular-nums">
                    {x.pct}% · {fmt(x.kg)}kg
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {isAll && (
          <section className="mb-4 rounded-[18px] border border-[var(--border)] bg-[var(--card)] p-6 shadow-[var(--shadow)]">
            <h3 className="mb-0.5 font-display text-[17px] font-extrabold text-[var(--navy)]">Répartition par ville</h3>
            <p className="mb-4 text-[12.5px] text-[var(--slate)]">Volume collecté et collectes réalisées, ville par ville, sur la période</p>
            <div className="flex flex-col gap-3">
              {byCity.map((c) => {
                const max = Math.max(...byCity.map((x) => x.volume), 1);
                return (
                  <div key={c.id} className="grid grid-cols-[140px_1fr_150px] items-center gap-3">
                    <span className="flex items-center gap-2 text-[13px] font-bold text-[var(--navy)]">
                      <span className="h-3 w-3 flex-none rounded-full" style={{ background: c.color }} />
                      {c.name}
                    </span>
                    <span className="h-3 overflow-hidden rounded-md bg-[var(--track)]">
                      <span className="block h-full rounded-md" style={{ width: `${Math.round((c.volume / max) * 100)}%`, background: c.color }} />
                    </span>
                    <span className="text-right text-[12.5px] font-semibold text-[var(--slate)] tabular-nums">
                      {fmt(c.volume)} kg · {c.ok} collecte{c.ok > 1 ? "s" : ""}
                    </span>
                  </div>
                );
              })}
              {byCity.length === 0 && <p className="text-[13px] text-[var(--slate)]">Aucune ville.</p>}
            </div>
          </section>
        )}

        <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-[18px] border border-[var(--border)] bg-[var(--card)] p-6 shadow-[var(--shadow)]">
            <h3 className="mb-0.5 font-display text-[17px] font-extrabold text-[var(--navy)]">Motifs d&apos;annulation</h3>
            <p className="mb-4 text-[12.5px] text-[var(--slate)]">Répartition des collectes annulées, par motif</p>
            {c.motifs.length === 0 && <p className="text-[13px] text-[var(--slate)]">Aucune annulation sur cette période.</p>}
            {c.motifs.map((x) => (
              <div key={x.l} className="mb-3 grid grid-cols-[150px_1fr_44px] items-center gap-2.5 last:mb-0">
                <span className="truncate text-[12.5px] font-semibold text-[var(--navy)]">{x.l}</span>
                <span className="h-[9px] overflow-hidden rounded-md bg-[var(--track)]">
                  <span className="block h-full rounded-md bg-[var(--slate)] opacity-75" style={{ width: `${Math.round((x.pct / maxMotifPct) * 100)}%` }} />
                </span>
                <span className="text-right text-xs text-[var(--slate)] tabular-nums">{x.pct}%</span>
              </div>
            ))}
          </div>
          <div className="rounded-[18px] border border-[var(--border)] bg-[var(--card)] p-6 shadow-[var(--shadow)]">
            <h3 className="mb-0.5 font-display text-[17px] font-extrabold text-[var(--navy)]">Top partenaires contributeurs</h3>
            <p className="mb-4 text-[12.5px] text-[var(--slate)]">Classés par volume collecté sur la période</p>
            {c.partners.length === 0 && <p className="text-[13px] text-[var(--slate)]">Aucune collecte enregistrée sur cette période.</p>}
            {c.partners.slice(0, 8).map((p, i) => (
              <div key={p.id} className="flex items-center gap-3 border-b border-[var(--border)] py-2.5 first:pt-0 last:border-none last:pb-0">
                <span className="w-4 font-display text-[15px] font-extrabold text-[var(--muted)]">{i + 1}</span>
                <span className="h-[9px] w-[9px] flex-none rounded-full" style={{ background: CAT_DOT[p.c] || "var(--slate)" }} />
                <span className="min-w-0 flex-1">
                  <div className="truncate text-[13.5px] font-semibold text-[var(--navy)]">{p.n}</div>
                  <div className="text-[11.5px] text-[var(--slate)]">{p.c}</div>
                </span>
                <span className="text-[13px] font-bold text-[var(--navy)] tabular-nums">{fmt(p.kg)} kg</span>
              </div>
            ))}
          </div>
        </section>

        <div className="mt-9 mb-4 flex items-center gap-3.5">
          <h2 className="font-display text-[22px] font-black whitespace-nowrap text-[var(--navy)]">Valorisation RSE</h2>
          <span className="h-px flex-1 bg-[var(--border)]" />
        </div>
        <p className="-mt-2 mb-4 text-[12.5px] text-[var(--slate)]">
          Recalculé en direct à partir des collectes validées et des Links Bénévoles livrés sur la période.
          {c.volume > 0 && c.customShare > 0 ? ` ${c.customShare} % du volume est valorisé au prix propre du partenaire, le reste à ${DEFAULT_EUR_PER_KG} €/kg.` : ` Valeur des dons calculée à ${DEFAULT_EUR_PER_KG} €/kg par défaut (sauf valeur renseignée manuellement pour un Link).`}
        </p>
        <section className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
          {(() => {
            const r = rse(c.volume + linkKpi.kg, c.don + linkKpi.don);
            const eur = (n: number) => `${fmt(n)} €`;
            const tiles: [string, string, string][] = [
              ["Valeur des dons", eur(r.don), "var(--good)"],
              ["Défiscalisation (60 %)", eur(r.defisc), "var(--turquoise)"],
              ["Valeur sociale (×2)", eur(r.social), "var(--client-req)"],
              ["Repas distribués", fmt(r.repas), "var(--warn)"],
              ["CO₂ évité", `${fmt(r.co2)} kg CO2e`, "var(--cat-2)"],
              ["Déchets évités", `${fmt(r.dechets)} kg`, "var(--slate)"],
            ];
            return tiles.map(([l, v, col]) => (
              <div key={l} className="flex flex-col gap-2 rounded-[18px] border border-[var(--border)] bg-[var(--card)] p-5 shadow-[var(--shadow)]" style={{ borderTop: `4px solid ${col}` }}>
                <span className="text-xs font-bold tracking-[0.04em] text-[var(--slate)] uppercase">{l}</span>
                <span className="font-display text-[26px] leading-none font-black text-[var(--navy)] tabular-nums">{v}</span>
                {l === "CO₂ évité" && <span className="text-[10px] font-semibold text-[var(--muted)]">{CO2_SOURCE}</span>}
              </div>
            ));
          })()}
        </section>
      </div>
      )}
    </div>
  );
}
