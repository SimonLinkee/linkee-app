"use client";

import { useMemo, useState } from "react";

type Gran = "jour" | "semaine" | "mois" | "custom";
type CatKey = "secs" | "fl" | "frais" | "plats";

type Denree = { k: CatKey; pct: number; kg: number };
type EvoPoint = { l: string; v: number };
type Motif = { l: string; pct: number };
type PartnerVol = { n: string; c: string; kg: number };

type Dataset = {
  periodLabel: string;
  volume: number;
  volumeDelta: number;
  volumeUp: boolean;
  collectes: number;
  ok: number;
  annulees: number;
  taux: number;
  temps: string;
  tempsSub: string;
  denrees: Denree[];
  evoNote: string;
  evo: EvoPoint[];
  motifs: Motif[];
  partners: PartnerVol[];
};

const CAT_COLORS: Record<CatKey, string> = {
  secs: "var(--cat-1)",
  fl: "var(--cat-2)",
  frais: "var(--cat-3)",
  plats: "var(--cat-4)",
};
const CAT_LABELS: Record<CatKey, string> = {
  secs: "Secs",
  fl: "Fruits et légumes",
  frais: "Produits frais",
  plats: "Plats préparés",
};

const DATA: Record<"jour" | "semaine" | "mois", Dataset> = {
  jour: {
    periodLabel: "Lundi 15 septembre 2026",
    volume: 187,
    volumeDelta: 8,
    volumeUp: true,
    collectes: 7,
    ok: 6,
    annulees: 1,
    taux: 86,
    temps: "6h40",
    tempsSub: "Akram · journée en cours",
    denrees: [
      { k: "secs", pct: 35, kg: 65 },
      { k: "fl", pct: 30, kg: 56 },
      { k: "frais", pct: 25, kg: 47 },
      { k: "plats", pct: 10, kg: 19 },
    ],
    evoNote: "Sur les 7 derniers jours",
    evo: [
      { l: "Ma", v: 142 },
      { l: "Me", v: 176 },
      { l: "Je", v: 158 },
      { l: "Ve", v: 201 },
      { l: "Sa", v: 0 },
      { l: "Di", v: 0 },
      { l: "Lu", v: 187 },
    ],
    motifs: [{ l: "Commerce fermé", pct: 100 }],
    partners: [
      { n: "Boulangerie des Terreaux", c: "Boulangerie", kg: 42 },
      { n: "Supermarché Presqu'île", c: "Supermarché", kg: 38 },
      { n: "Traiteur Lumière", c: "Traiteur", kg: 31 },
      { n: "Hôtel des Brotteaux", c: "Hôtel", kg: 29 },
      { n: "Grossiste Rhône Frais", c: "Grossiste", kg: 24 },
    ],
  },
  semaine: {
    periodLabel: "Semaine du 8 au 14 sept. 2026",
    volume: 1284,
    volumeDelta: 12,
    volumeUp: true,
    collectes: 42,
    ok: 38,
    annulees: 4,
    taux: 90,
    temps: "31h20",
    tempsSub: "Akram · 6 jours travaillés",
    denrees: [
      { k: "secs", pct: 32, kg: 411 },
      { k: "fl", pct: 28, kg: 360 },
      { k: "frais", pct: 26, kg: 334 },
      { k: "plats", pct: 14, kg: 179 },
    ],
    evoNote: "Sur les 8 dernières semaines",
    evo: [
      { l: "S32", v: 980 },
      { l: "S33", v: 1045 },
      { l: "S34", v: 890 },
      { l: "S35", v: 1150 },
      { l: "S36", v: 1080 },
      { l: "S37", v: 1201 },
      { l: "S38", v: 1146 },
      { l: "S39", v: 1284 },
    ],
    motifs: [
      { l: "Fermé / absent", pct: 40 },
      { l: "Rien à collecter", pct: 25 },
      { l: "Accès impossible", pct: 20 },
      { l: "Autre", pct: 15 },
    ],
    partners: [
      { n: "Boulangerie des Terreaux", c: "Boulangerie", kg: 196 },
      { n: "Supermarché Presqu'île", c: "Supermarché", kg: 172 },
      { n: "Traiteur Lumière", c: "Traiteur", kg: 141 },
      { n: "Hôtel des Brotteaux", c: "Hôtel", kg: 118 },
      { n: "Grossiste Rhône Frais", c: "Grossiste", kg: 104 },
    ],
  },
  mois: {
    periodLabel: "Septembre 2026",
    volume: 5310,
    volumeDelta: 6,
    volumeUp: true,
    collectes: 176,
    ok: 162,
    annulees: 14,
    taux: 92,
    temps: "128h00",
    tempsSub: "Akram · 22 jours travaillés",
    denrees: [
      { k: "secs", pct: 31, kg: 1646 },
      { k: "fl", pct: 27, kg: 1434 },
      { k: "frais", pct: 27, kg: 1434 },
      { k: "plats", pct: 15, kg: 796 },
    ],
    evoNote: "Sur les 6 derniers mois",
    evo: [
      { l: "Avr", v: 4380 },
      { l: "Mai", v: 4610 },
      { l: "Juin", v: 4920 },
      { l: "Juil", v: 4460 },
      { l: "Août", v: 3980 },
      { l: "Sept", v: 5310 },
    ],
    motifs: [
      { l: "Fermé / absent", pct: 38 },
      { l: "Rien à collecter", pct: 27 },
      { l: "Accès impossible", pct: 19 },
      { l: "Autre", pct: 16 },
    ],
    partners: [
      { n: "Boulangerie des Terreaux", c: "Boulangerie", kg: 812 },
      { n: "Supermarché Presqu'île", c: "Supermarché", kg: 734 },
      { n: "Traiteur Lumière", c: "Traiteur", kg: 598 },
      { n: "Hôtel des Brotteaux", c: "Hôtel", kg: 487 },
      { n: "Grossiste Rhône Frais", c: "Grossiste", kg: 441 },
    ],
  },
};

const PARTNERS = [
  { key: "terreaux", name: "Boulangerie des Terreaux", cat: "Boulangerie", profile: { secs: 70, fl: 5, frais: 5, plats: 20 } },
  { key: "presquile", name: "Supermarché Presqu'île", cat: "Supermarché", profile: { secs: 28, fl: 24, frais: 26, plats: 22 } },
  { key: "lumiere", name: "Traiteur Lumière", cat: "Traiteur", profile: { secs: 10, fl: 0, frais: 20, plats: 70 } },
  { key: "brotteaux", name: "Hôtel des Brotteaux", cat: "Hôtel", profile: { secs: 20, fl: 0, frais: 30, plats: 50 } },
  { key: "rhonefrais", name: "Grossiste Rhône Frais", cat: "Grossiste", profile: { secs: 30, fl: 60, frais: 10, plats: 0 } },
] as const;

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

const WEEKDAY_MULT = [0.97, 1.08, 0.92, 1.12, 1.05, 0.55, 0.4];

function getBaseDataset(gran: Gran, dateFrom: string, dateTo: string): Dataset {
  if (gran !== "custom") return DATA[gran];

  let from = new Date(dateFrom || "2026-09-01");
  let to = new Date(dateTo || "2026-09-15");
  if (to < from) {
    const tmp = to;
    to = from;
    from = tmp;
  }
  const days = Math.max(1, Math.round((to.getTime() - from.getTime()) / 86400000) + 1);
  const ref = DATA.jour;
  const evo: EvoPoint[] = [];
  let totalVolume = 0;
  let totalCollectes = 0;
  let totalOk = 0;
  const cur = new Date(from);
  const maxPoints = 16;
  const step = Math.max(1, Math.ceil(days / maxPoints));

  for (let i = 0; i < days; i++) {
    const dow = cur.getDay() === 0 ? 6 : cur.getDay() - 1;
    const mult = WEEKDAY_MULT[dow];
    const v = Math.round(ref.volume * mult);
    totalVolume += v;
    totalCollectes += Math.round(ref.collectes * mult);
    totalOk += Math.round(ref.ok * mult);
    if (i % step === 0 || i === days - 1) {
      evo.push({ l: `${cur.getDate()}/${cur.getMonth() + 1}`, v });
    }
    cur.setDate(cur.getDate() + 1);
  }

  const annulees = Math.max(0, totalCollectes - totalOk);
  const scale = totalVolume / ref.volume;
  const denrees: Denree[] = ref.denrees.map((x) => ({
    k: x.k,
    pct: x.pct,
    kg: Math.round((totalVolume * x.pct) / 100),
  }));
  const partners: PartnerVol[] = ref.partners.map((p) => ({ n: p.n, c: p.c, kg: Math.round(p.kg * scale) }));
  const fmtDate = (dt: Date) => dt.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });

  return {
    periodLabel: `Du ${fmtDate(from)} au ${fmtDate(to)} ${to.getFullYear()}`,
    volume: totalVolume,
    volumeDelta: 5,
    volumeUp: true,
    collectes: totalCollectes,
    ok: totalOk,
    annulees,
    taux: totalCollectes ? Math.round((totalOk / totalCollectes) * 100) : 0,
    temps: `${Math.round(days * 4.6)}h (estimation)`,
    tempsSub: `Akram · estimation sur ${days} jour(s)`,
    denrees,
    evoNote: `${days} jour(s) sélectionné(s)`,
    evo,
    motifs: ref.motifs,
    partners,
  };
}

function buildPartnerDataset(base: Dataset, partnerKey: string): Dataset {
  const partner = PARTNERS.find((p) => p.key === partnerKey)!;
  const match = base.partners.find((p) => p.n === partner.name);
  const volume = match ? match.kg : Math.round(base.volume * 0.08);
  const shareFrac = base.volume ? volume / base.volume : 0;
  const collectes = Math.max(1, Math.round(base.collectes * shareFrac));
  let ok = Math.max(0, Math.round(base.ok * shareFrac));
  if (ok > collectes) ok = collectes;
  const annulees = Math.max(0, collectes - ok);
  const denrees: Denree[] = (["secs", "fl", "frais", "plats"] as CatKey[]).map((k) => {
    const pct = partner.profile[k];
    return { k, pct, kg: Math.round((volume * pct) / 100) };
  });
  const evo = base.evo.map((p) => ({ l: p.l, v: Math.round(p.v * shareFrac) }));

  return {
    periodLabel: base.periodLabel,
    volume,
    volumeDelta: base.volumeDelta,
    volumeUp: base.volumeUp,
    collectes,
    ok,
    annulees,
    taux: collectes ? Math.round((ok / collectes) * 100) : 0,
    temps: base.temps,
    tempsSub: base.tempsSub,
    denrees,
    evoNote: base.evoNote,
    evo,
    motifs: base.motifs,
    partners: [{ n: partner.name, c: partner.cat, kg: volume }],
  };
}

function Sparkline({ evo }: { evo: EvoPoint[] }) {
  const spark = evo.slice(-7);
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

export default function DashboardPage() {
  const [gran, setGran] = useState<Gran>("semaine");
  const [dateFrom, setDateFrom] = useState("2026-09-01");
  const [dateTo, setDateTo] = useState("2026-09-15");
  const [activePartnerKey, setActivePartnerKey] = useState("");

  const dataset = useMemo(() => {
    const base = getBaseDataset(gran, dateFrom, dateTo);
    return activePartnerKey ? buildPartnerDataset(base, activePartnerKey) : base;
  }, [gran, dateFrom, dateTo, activePartnerKey]);

  const activePartner = PARTNERS.find((p) => p.key === activePartnerKey);
  const okPct = dataset.collectes ? Math.round((dataset.ok / dataset.collectes) * 100) : 0;
  const C = 2 * Math.PI * 21;
  const maxDenreePct = Math.max(...dataset.denrees.map((x) => x.pct));
  const sortedDenrees = [...dataset.denrees].sort((a, b) => b.pct - a.pct);
  const maxMotifPct = Math.max(...dataset.motifs.map((x) => x.pct));

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-5">
        <div>
          <h1 className="font-display text-[34px] leading-none font-black">Tableau de bord</h1>
          <p className="mt-1.5 text-sm text-[var(--slate)]">Vue d&apos;ensemble de l&apos;activité de collecte — zone Lyon.</p>
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
                className={`rounded-[40px] px-4 py-[7px] font-display text-[13px] font-bold ${
                  gran === g ? "bg-[var(--navy-deep)] text-[var(--panel-fg)]" : "text-[var(--slate)]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {gran !== "custom" ? (
            <div className="flex items-center gap-2.5 text-[13px] text-[var(--slate)]">
              <button
                type="button"
                aria-label="Période précédente"
                className="flex h-[26px] w-[26px] items-center justify-center rounded-full border border-[var(--border)] bg-[var(--card)] text-[var(--navy)]"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-[13px] w-[13px]">
                  <path d="M15 5 L8 12 L15 19" />
                </svg>
              </button>
              <span className="font-semibold text-[var(--navy)]">{dataset.periodLabel}</span>
              <button
                type="button"
                aria-label="Période suivante"
                className="flex h-[26px] w-[26px] items-center justify-center rounded-full border border-[var(--border)] bg-[var(--card)] text-[var(--navy)]"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-[13px] w-[13px]">
                  <path d="M9 5 L16 12 L9 19" />
                </svg>
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                aria-label="Date de début"
                className="rounded-[10px] border border-[var(--border)] bg-[var(--card)] px-2.5 py-1.5 text-[12.5px] font-semibold text-[var(--navy)] outline-none focus:border-[var(--turquoise)]"
              />
              <span className="text-[13px] text-[var(--slate)]">→</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                aria-label="Date de fin"
                className="rounded-[10px] border border-[var(--border)] bg-[var(--card)] px-2.5 py-1.5 text-[12.5px] font-semibold text-[var(--navy)] outline-none focus:border-[var(--turquoise)]"
              />
            </div>
          )}
          <div className="flex items-center gap-2.5">
            <label htmlFor="partner-select" className="text-xs font-semibold whitespace-nowrap text-[var(--slate)]">
              Isoler un partenaire
            </label>
            <select
              id="partner-select"
              value={activePartnerKey}
              onChange={(e) => setActivePartnerKey(e.target.value)}
              className="max-w-[220px] cursor-pointer rounded-[10px] border border-[var(--border)] bg-[var(--card)] px-2.5 py-[7px] text-[12.5px] font-semibold text-[var(--navy)] outline-none focus:border-[var(--turquoise)]"
            >
              <option value="">Tous les partenaires</option>
              {PARTNERS.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {activePartner && (
        <div className="-mt-2.5 mb-[22px] flex flex-wrap items-center justify-between gap-4 rounded-[18px] bg-[var(--navy-deep)] px-[22px] py-4 text-[var(--panel-fg)] shadow-[var(--shadow)]">
          <div>
            <span className="text-[11px] font-bold tracking-[0.05em] text-[var(--panel-fg-dim)] uppercase">{activePartner.cat}</span>
            <h2 className="my-0.5 font-display text-[22px] font-extrabold">{activePartner.name}</h2>
            <p className="text-[12.5px] text-[var(--panel-fg-dim)]">Vue isolée sur ce partenaire pour la période sélectionnée.</p>
          </div>
          <button
            type="button"
            onClick={() => setActivePartnerKey("")}
            className="flex-none rounded-[40px] border-[1.5px] border-white/35 px-4 py-2.5 font-display text-[13px] font-bold hover:border-[var(--turquoise)] hover:text-[var(--turquoise)]"
          >
            Retour à la vue globale
          </button>
        </div>
      )}

      <section className="mb-[22px] grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="flex flex-col gap-2 rounded-[18px] border border-[var(--border)] bg-[var(--card)] p-5 shadow-[var(--shadow)]">
          <span className="text-xs font-bold tracking-[0.04em] text-[var(--slate)] uppercase">Volume collecté</span>
          <span className="font-display text-[30px] leading-none font-black text-[var(--navy)] tabular-nums">{fmt(dataset.volume)} kg</span>
          <span className={`flex items-center gap-1 text-[12.5px] font-semibold ${dataset.volumeUp ? "text-[var(--good)]" : "text-[var(--critical)]"}`}>
            {dataset.volumeUp ? "▲" : "▼"} {dataset.volumeDelta} % vs période précédente
          </span>
          <Sparkline evo={dataset.evo} />
        </div>
        <div className="flex flex-col gap-2 rounded-[18px] border border-[var(--border)] bg-[var(--card)] p-5 shadow-[var(--shadow)]">
          <span className="text-xs font-bold tracking-[0.04em] text-[var(--slate)] uppercase">Collectes réalisées</span>
          <span className="font-display text-[30px] leading-none font-black text-[var(--navy)] tabular-nums">{dataset.collectes}</span>
          <span className="text-[12.5px] text-[var(--slate)]">
            {dataset.ok} collectées · {dataset.annulees} annulées
          </span>
          <div className="mt-0.5 flex h-2 overflow-hidden rounded-[5px] bg-[var(--track)]">
            <span style={{ width: `${okPct}%`, background: "var(--good)" }} />
            <span style={{ width: `${100 - okPct}%`, background: "var(--critical)" }} />
          </div>
        </div>
        <div className="flex flex-col gap-2 rounded-[18px] border border-[var(--border)] bg-[var(--card)] p-5 shadow-[var(--shadow)]">
          <span className="text-xs font-bold tracking-[0.04em] text-[var(--slate)] uppercase">Taux de réussite</span>
          <div className="flex items-center gap-3">
            <svg viewBox="0 0 52 52" className="h-[52px] w-[52px]">
              <circle cx="26" cy="26" r="21" fill="none" stroke="var(--track)" strokeWidth={6} />
              <circle
                cx="26"
                cy="26"
                r="21"
                fill="none"
                stroke="var(--good)"
                strokeWidth={6}
                strokeLinecap="round"
                strokeDasharray={C.toFixed(1)}
                strokeDashoffset={(C * (1 - dataset.taux / 100)).toFixed(1)}
                transform="rotate(-90 26 26)"
              />
            </svg>
            <span className="font-display text-[26px] font-black text-[var(--navy)] tabular-nums">{dataset.taux} %</span>
          </div>
        </div>
        <div className="flex flex-col gap-2 rounded-[18px] border border-[var(--border)] bg-[var(--card)] p-5 shadow-[var(--shadow)]">
          <span className="text-xs font-bold tracking-[0.04em] text-[var(--slate)] uppercase">Temps de travail</span>
          <span className="font-display text-[30px] leading-none font-black text-[var(--navy)] tabular-nums">{dataset.temps}</span>
          <span className="text-[12.5px] text-[var(--slate)]">{dataset.tempsSub}</span>
        </div>
      </section>

      <section className="mb-4 grid grid-cols-1 gap-4 xl:grid-cols-[1.3fr_1fr]">
        <div className="rounded-[18px] border border-[var(--border)] bg-[var(--card)] p-6 shadow-[var(--shadow)]">
          <h3 className="mb-0.5 font-display text-[17px] font-extrabold text-[var(--navy)]">Évolution du volume collecté</h3>
          <p className="mb-4 text-[12.5px] text-[var(--slate)]">{dataset.evoNote}</p>
          <EvolutionChart evo={dataset.evo} />
        </div>
        <div className="rounded-[18px] border border-[var(--border)] bg-[var(--card)] p-6 shadow-[var(--shadow)]">
          <h3 className="mb-0.5 font-display text-[17px] font-extrabold text-[var(--navy)]">Répartition par type de denrée</h3>
          <p className="mb-4 text-[12.5px] text-[var(--slate)]">Part du volume total collecté sur la période</p>
          <div className="flex flex-col gap-3.5">
            {sortedDenrees.map((x) => (
              <div key={x.k} className="grid grid-cols-[128px_1fr_70px] items-center gap-2.5">
                <span className="text-[12.5px] font-semibold text-[var(--navy)]">{CAT_LABELS[x.k]}</span>
                <span className="h-3 overflow-hidden rounded-md bg-[var(--track)]">
                  <span
                    className="block h-full rounded-md"
                    style={{ width: `${Math.round((x.pct / maxDenreePct) * 100)}%`, background: CAT_COLORS[x.k] }}
                  />
                </span>
                <span className="text-right text-[12.5px] font-semibold text-[var(--slate)] tabular-nums">
                  {x.pct}% · {fmt(x.kg)}kg
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-[18px] border border-[var(--border)] bg-[var(--card)] p-6 shadow-[var(--shadow)]">
          <h3 className="mb-0.5 font-display text-[17px] font-extrabold text-[var(--navy)]">Motifs d&apos;annulation</h3>
          <p className="mb-4 text-[12.5px] text-[var(--slate)]">Répartition des collectes annulées, par motif</p>
          {dataset.motifs.map((x) => (
            <div key={x.l} className="mb-3 grid grid-cols-[150px_1fr_44px] items-center gap-2.5 last:mb-0">
              <span className="text-[12.5px] font-semibold text-[var(--navy)]">{x.l}</span>
              <span className="h-[9px] overflow-hidden rounded-md bg-[var(--track)]">
                <span
                  className="block h-full rounded-md bg-[var(--slate)] opacity-75"
                  style={{ width: `${Math.round((x.pct / maxMotifPct) * 100)}%` }}
                />
              </span>
              <span className="text-right text-xs text-[var(--slate)] tabular-nums">{x.pct}%</span>
            </div>
          ))}
        </div>
        <div className="rounded-[18px] border border-[var(--border)] bg-[var(--card)] p-6 shadow-[var(--shadow)]">
          <h3 className="mb-0.5 font-display text-[17px] font-extrabold text-[var(--navy)]">Top partenaires contributeurs</h3>
          <p className="mb-4 text-[12.5px] text-[var(--slate)]">Classés par volume collecté sur la période</p>
          {dataset.partners.map((p, i) => (
            <div key={p.n} className="flex items-center gap-3 border-b border-[var(--border)] py-2.5 first:pt-0 last:border-none last:pb-0">
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
    </div>
  );
}
