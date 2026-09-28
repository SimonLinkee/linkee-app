// Statistics computed from the real collectes / collecte_items rows.
// Shared by the admin dashboard and the partner space (RSE report).

export type CatKey = "secs" | "fl" | "frais" | "plats" | "boulang";
export const CAT_KEYS: CatKey[] = ["secs", "fl", "frais", "plats", "boulang"];
export const CAT_LABELS: Record<CatKey, string> = {
  secs: "Secs",
  fl: "Fruits et légumes",
  frais: "Produits frais",
  plats: "Plats préparés",
  boulang: "Boulangerie",
};
const DENREE_TO_KEY: Record<string, CatKey> = Object.fromEntries(CAT_KEYS.map((k) => [CAT_LABELS[k], k])) as Record<string, CatKey>;

type Rel = { name: string; category: string | null };
export type StatRow = {
  scheduled_date: string;
  kind: string;
  status: string;
  motif: string | null;
  partner_id: string | null;
  partners: Rel | Rel[] | null;
  collecte_items: { denree: string | null; kg: number | string }[] | null;
};
export const STAT_SELECT = "scheduled_date,kind,status,motif,partner_id,partners(name,category),collecte_items!collecte_id(denree,kg)";

export type Summary = {
  volume: number;
  collectes: number;
  ok: number;
  annulees: number;
  taux: number;
  denrees: { k: CatKey; pct: number; kg: number }[];
  partners: { id: string; n: string; c: string; kg: number }[];
  motifs: { l: string; pct: number }[];
  byDay: Record<string, number>;
};

// Only pick-ups from partners count as "collected"; drop-offs and stock moves just move goods around.
export const isCollectKind = (k: string) => k === "partner" || k === "exceptionnel" || k === "demande_client";

const first = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

export function summarize(rows: StatRow[]): Summary {
  let volume = 0;
  let ok = 0;
  let annulees = 0;
  const kgByCat: Record<CatKey, number> = { secs: 0, fl: 0, frais: 0, plats: 0, boulang: 0 };
  const byPartner = new Map<string, { id: string; n: string; c: string; kg: number }>();
  const motifs = new Map<string, number>();
  const byDay: Record<string, number> = {};

  for (const r of rows) {
    if (!isCollectKind(r.kind)) continue;
    if (r.status === "annule") {
      annulees++;
      const m = (r.motif ?? "").trim() || "Non précisé";
      motifs.set(m, (motifs.get(m) ?? 0) + 1);
      continue;
    }
    if (r.status !== "collecte") continue;
    ok++;
    const p = first(r.partners);
    let kg = 0;
    for (const it of r.collecte_items ?? []) {
      const v = Number(it.kg) || 0;
      kg += v;
      const key = it.denree ? DENREE_TO_KEY[it.denree] : undefined;
      if (key) kgByCat[key] += v;
    }
    volume += kg;
    byDay[r.scheduled_date] = (byDay[r.scheduled_date] ?? 0) + kg;
    const pid = r.partner_id ?? "?";
    const cur = byPartner.get(pid) ?? { id: pid, n: p?.name ?? "Partenaire", c: p?.category ?? "", kg: 0 };
    cur.kg += kg;
    byPartner.set(pid, cur);
  }

  const collectes = ok + annulees;
  const totalCat = Object.values(kgByCat).reduce((a, b) => a + b, 0);
  return {
    volume: Math.round(volume * 10) / 10,
    collectes,
    ok,
    annulees,
    taux: collectes ? Math.round((ok / collectes) * 100) : 0,
    denrees: CAT_KEYS.map((k) => ({ k, kg: Math.round(kgByCat[k] * 10) / 10, pct: totalCat ? Math.round((kgByCat[k] / totalCat) * 100) : 0 })),
    partners: Array.from(byPartner.values()).sort((a, b) => b.kg - a.kg),
    motifs: Array.from(motifs.entries())
      .map(([l, n]) => ({ l, pct: Math.round((n / (annulees || 1)) * 100) }))
      .sort((a, b) => b.pct - a.pct),
    byDay,
  };
}

/** Evolution points: one per day, grouped so the chart never exceeds `maxPoints`. */
export function buildEvo(byDay: Record<string, number>, from: Date, to: Date, maxPoints = 16): { l: string; v: number }[] {
  const days: { d: Date; v: number }[] = [];
  const cur = new Date(from);
  while (cur <= to) {
    const key = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}-${String(cur.getDate()).padStart(2, "0")}`;
    days.push({ d: new Date(cur), v: byDay[key] ?? 0 });
    cur.setDate(cur.getDate() + 1);
  }
  const step = Math.max(1, Math.ceil(days.length / maxPoints));
  const out: { l: string; v: number }[] = [];
  for (let i = 0; i < days.length; i += step) {
    const chunk = days.slice(i, i + step);
    out.push({ l: `${chunk[0].d.getDate()}/${chunk[0].d.getMonth() + 1}`, v: Math.round(chunk.reduce((s, x) => s + x.v, 0)) });
  }
  return out;
}

// ---- RSE formulas (same as the Linkee "bilan RSE" slide model) ----
export function rse(kg: number) {
  const don = kg * 8;
  return {
    kg,
    don,
    defisc: don * 0.6,
    repas: Math.round(kg / 2),
    social: don * 2,
    co2: (kg / 1000) * 1.53,
    dechets: Math.round(kg * 1.25),
  };
}

export const isoOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
