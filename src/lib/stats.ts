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

// ---- Valuation ("Valorisation RSE"): sub-categories with a unit price, per partner ----
export type Unit = "kg" | "unite" | "litre";
export const UNIT_LABEL: Record<Unit, string> = { kg: "kg", unite: "unité", litre: "litre" };
export type SubCat = { id: string; partner_id: string; category: string; name: string; unit_price: number | null; unit: Unit; unit_weight_kg: number | null; barem_id?: string | null; hidden?: boolean };
export const DEFAULT_EUR_PER_KG = 8; // value of a donation when the partner has no price for the item
export const SUBCAT_SELECT = "id,partner_id,category,name,unit_price,unit,unit_weight_kg,barem_id,hidden";
export const subMap = (list: SubCat[]) => new Map(list.map((s) => [s.id, s]));

// ---- Barèmes par défaut : un jeu de sous-catégories par TYPE de partenaire (ex. "Boulangerie"), géré côté admin ----
export type Bareme = { id: string; partner_category: string; category: string; name: string; unit_price: number; unit: Unit; unit_weight_kg: number | null };
export const BAREME_SELECT = "id,partner_category,category,name,unit_price,unit,unit_weight_kg";
/** Sous-catégorie héritée du barème et non personnalisée (id "barem:…") : elle n'existe pas dans partner_subcategories,
 * donc on n'enregistre pas son id sur la ligne de poids — on fige plutôt sa valeur (value_snapshot). */
export const isBaremSub = (id: string | null | undefined) => !!id && id.startsWith("barem:");

/** Sous-catégorie "effective" affichée pour un partenaire : celles de son barème par défaut (surchargées ou non),
 * plus celles qu'il a ajoutées lui-même. `isDefault` distingue une valeur héritée du barème d'une valeur
 * "personnalisée" (surchargée pour ce partenaire) ; les items masqués (hidden) n'apparaissent pas. */
export type EffectiveSubCat = SubCat & { isDefault: boolean; baremDefault?: { unit_price: number; unit_weight_kg: number | null } };
export function mergeBareme(partnerCategory: string, baremes: Bareme[], subs: SubCat[]): EffectiveSubCat[] {
  const overrideByBarem = new Map(subs.filter((s) => s.barem_id).map((s) => [s.barem_id as string, s]));
  const fromBareme: EffectiveSubCat[] = [];
  for (const b of baremes) {
    if (b.partner_category !== partnerCategory) continue;
    const ov = overrideByBarem.get(b.id);
    if (ov?.hidden) continue;
    if (ov) {
      fromBareme.push({ ...ov, isDefault: false, baremDefault: { unit_price: b.unit_price, unit_weight_kg: b.unit_weight_kg } });
    } else {
      fromBareme.push({ id: `barem:${b.id}`, partner_id: "", category: b.category, name: b.name, unit_price: b.unit_price, unit: b.unit, unit_weight_kg: b.unit_weight_kg, barem_id: b.id, isDefault: true });
    }
  }
  const ownRows: EffectiveSubCat[] = subs.filter((s) => !s.barem_id && !s.hidden).map((s) => ({ ...s, isDefault: false }));
  return [...fromBareme, ...ownRows];
}

type ItemLike = { kg: number | string; subcategory_id?: string | null; quantity?: number | string | null; value_snapshot?: number | string | null };

/** Value in € of one weighed line: its frozen value if one was recorded at entry time (value_snapshot — the
 * historical figure never changes afterwards), else the partner's current price, else 8 €/kg. */
export function itemValue(it: ItemLike, subs: Map<string, SubCat>): { value: number; custom: boolean } {
  const kg = Number(it.kg) || 0;
  if (it.value_snapshot != null) return { value: Number(it.value_snapshot), custom: true };
  const sub = it.subcategory_id ? subs.get(it.subcategory_id) : undefined;
  if (sub && sub.unit_price != null) {
    const qty = sub.unit === "kg" ? kg : it.quantity != null && Number(it.quantity) > 0 ? Number(it.quantity) : sub.unit === "litre" ? kg : null;
    if (qty != null) return { value: qty * Number(sub.unit_price), custom: true };
  }
  return { value: kg * DEFAULT_EUR_PER_KG, custom: false };
}

/** Weight in kg for a quantity typed in the sub-category's unit (1 litre = 1 kg, units use the unit weight). */
export function kgFromQuantity(qty: number, unit: Unit, unitWeightKg: number | null): number | null {
  if (unit === "kg" || unit === "litre") return qty;
  return unitWeightKg && unitWeightKg > 0 ? Math.round(qty * unitWeightKg * 1000) / 1000 : null;
}

type Rel = { name: string; category: string | null };
export type StatRow = {
  city_id?: string;
  scheduled_date: string;
  kind: string;
  status: string;
  motif: string | null;
  source?: string;
  partner_id: string | null;
  partners: Rel | Rel[] | null;
  collecte_items: { denree: string | null; kg: number | string; subcategory_id?: string | null; quantity?: number | string | null; unit?: string | null; value_snapshot?: number | string | null }[] | null;
};
export const STAT_SELECT = "city_id,scheduled_date,kind,status,motif,source,partner_id,partners(name,category),collecte_items!collecte_id(denree,kg,subcategory_id,quantity,unit,value_snapshot)";

export type Summary = {
  volume: number;
  /** value of the donations in €: partner prices where known, 8 €/kg otherwise */
  don: number;
  /** share (0-100) of the weight valued with the partner's own prices */
  customShare: number;
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

export function summarize(rows: StatRow[], subs: Map<string, SubCat> = new Map()): Summary {
  let volume = 0;
  let don = 0;
  let customKg = 0;
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
      const val = itemValue(it, subs);
      don += val.value;
      if (val.custom) customKg += v;
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
    don: Math.round(don * 100) / 100,
    customShare: volume ? Math.round((customKg / volume) * 100) : 0,
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
export const CO2_SOURCE = "Estimation, source : FAO 2013";
export function rse(kg: number, donValue?: number) {
  const don = donValue ?? kg * DEFAULT_EUR_PER_KG; // partner prices when known
  return {
    kg,
    don,
    defisc: don * 0.6,
    repas: Math.round(kg * 2), // 1 repas ≈ 500 g
    social: don * 2,
    co2: kg * 2.5, // kg CO2e évités — FAO 2013
    dechets: Math.round(kg * 1.25),
  };
}

export const isoOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
