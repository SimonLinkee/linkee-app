"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { geocode, type LatLng } from "@/lib/geocode";
import type { ClickPoint } from "@/components/PointsMap";

const PointsMap = dynamic(() => import("@/components/PointsMap"), {
  ssr: false,
  loading: () => <div className="flex h-[380px] items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--input-bg)] text-[13px] text-[var(--slate)]">Chargement de la carte…</div>,
});

export type DayHours = { open: string; close: string } | null;
export type MapBeneficiary = {
  id: string;
  name: string;
  cat: string;
  address: string;
  active: boolean;
  pinned?: boolean;
  horaires: string;
  hours?: Record<string, DayHours>;
  denrees: Record<string, boolean>;
  equipement: { cuisine: boolean; frigo: boolean; chambreFroide: boolean };
};

const DAYS = ["lun", "mar", "mer", "jeu", "ven", "sam", "dim"] as const;
const DAY_LABEL = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const DENREES = ["Secs", "Fruits et légumes", "Produits frais", "Plats préparés", "Boulangerie"];
const DENREE_COLOR = ["var(--cat-1)", "var(--cat-2)", "var(--cat-3)", "var(--cat-4)", "var(--cat-5)"];
const EQUIP: { k: "cuisine" | "frigo" | "chambreFroide"; l: string }[] = [
  { k: "cuisine", l: "Cuisine" },
  { k: "frigo", l: "Frigo" },
  { k: "chambreFroide", l: "Chambre froide" },
];

/** Reads free-text opening hours ("Lun-Ven 9h-17h", "mardi, jeudi", "7j/7") into the set of open days; null when nothing readable. */
export function openDays(text: string): Set<number> | null {
  const t = text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (!t.trim()) return null;
  if (/7\s*j\s*\/\s*7|7\/7|tous les jours|tlj/.test(t)) return new Set([0, 1, 2, 3, 4, 5, 6]);
  const re = /(lun|mar|mer|jeu|ven|sam|dim)[a-z]*/g;
  const hits: { d: number; start: number; end: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(t))) hits.push({ d: DAYS.indexOf(m[1] as (typeof DAYS)[number]), start: m.index, end: m.index + m[0].length });
  if (hits.length === 0) return null;
  const out = new Set<number>();
  for (let i = 0; i < hits.length; i++) {
    const cur = hits[i];
    const next = hits[i + 1];
    if (next && /^\s*(-|–|—|au|a|à)\s*$/.test(t.slice(cur.end, next.start))) {
      for (let d = cur.d; ; d = (d + 1) % 7) {
        out.add(d);
        if (d === next.d) break;
      }
      i++;
    } else out.add(cur.d);
  }
  return out;
}

/** Days open read from structured hours (jours×créneau), or null when nothing structured is set yet. */
export function openDaysFromHours(hours: Record<string, DayHours> | undefined): Set<number> | null {
  if (!hours || Object.keys(hours).length === 0) return null;
  const out = new Set<number>();
  DAYS.forEach((k, i) => {
    if (hours[k]) out.add(i);
  });
  return out;
}

/** Structured hours take priority when set; falls back to the free-text "horaires" field otherwise. */
export function resolveOpenDays(b: { horaires: string; hours?: Record<string, DayHours> }): Set<number> | null {
  return openDaysFromHours(b.hours) ?? openDays(b.horaires);
}

const chip = (on: boolean) =>
  `rounded-[40px] border-[1.5px] px-3 py-1.5 text-[12px] font-semibold whitespace-nowrap ${on ? "border-[var(--navy-deep)] bg-[var(--navy-deep)] text-[var(--panel-fg)]" : "border-[var(--border)] bg-[var(--card)] text-[var(--slate)] hover:border-[var(--turquoise)]"}`;

/** "La carte des associations partenaires": all beneficiaries on OpenStreetMap, filterable; a click on a point opens its fiche. */
export default function BeneficiaryMap({ items, selectedId, onSelect }: { items: MapBeneficiary[]; selectedId: string | null; onSelect: (id: string) => void }) {
  const [open, setOpen] = useState(false); // repliée par défaut : on la déplie à la demande
  const [coords, setCoords] = useState<Record<string, LatLng | null>>({});
  const [days, setDays] = useState<Set<number>>(new Set());
  const [denrees, setDenrees] = useState<Set<string>>(new Set());
  const [equip, setEquip] = useState<Set<string>>(new Set());
  const [cat, setCat] = useState("");
  const [onlyActive, setOnlyActive] = useState(true);

  // locate each address once (results are cached in the browser)
  const addrKey = items.map((b) => b.id + "|" + b.address).join("\n");
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      for (const b of items) {
        if (cancelled) return;
        if (!b.address.trim() || coords[b.id + "|" + b.address] !== undefined) continue;
        const g = await geocode(b.address);
        if (cancelled) return;
        setCoords((prev) => ({ ...prev, [b.id + "|" + b.address]: g }));
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addrKey, open]);

  const cats = useMemo(() => Array.from(new Set(items.map((b) => b.cat).filter(Boolean))).sort(), [items]);
  const toggle = <T,>(set: Set<T>, v: T, apply: (s: Set<T>) => void) => {
    const n = new Set(set);
    if (n.has(v)) n.delete(v);
    else n.add(v);
    apply(n);
  };

  const filtered = items.filter((b) => {
    if (onlyActive && !b.active) return false;
    if (cat && b.cat !== cat) return false;
    for (const d of denrees) if (!b.denrees[d]) return false;
    for (const k of equip) if (!b.equipement[k as "cuisine"]) return false;
    if (days.size) {
      const od = resolveOpenDays(b);
      if (!od) return false;
      for (const d of days) if (!od.has(d)) return false;
    }
    return true;
  });
  const located = filtered.filter((b) => coords[b.id + "|" + b.address]);
  const pending = filtered.filter((b) => b.address.trim() && coords[b.id + "|" + b.address] === undefined).length;
  const noAddress = filtered.filter((b) => !b.address.trim() || coords[b.id + "|" + b.address] === null).length;
  const points: ClickPoint[] = located.map((b) => {
    const g = coords[b.id + "|" + b.address]!;
    return { id: b.id, lat: g.lat, lng: g.lng, label: b.name, sub: [b.cat, b.horaires].filter(Boolean).join(" · "), color: !b.active ? "#8a93a8" : b.pinned ? "#2a78d6" : "#0a1a3f" };
  });
  const unreadable = days.size ? items.filter((b) => (!onlyActive || b.active) && !resolveOpenDays(b)).length : 0;
  const nFilters = days.size + denrees.size + equip.size + (cat ? 1 : 0);

  return (
    <div className="mt-[18px] overflow-hidden rounded-[18px] border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow)]" style={{ borderTop: "4px solid var(--turquoise)" }}>
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-3 px-5 py-3.5 text-left">
        <span className="flex h-9 w-9 flex-none items-center justify-center rounded-[11px] bg-[var(--turquoise)] text-[#04262e]">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
            <path d="M12 21 C 8 16.5, 5 13, 5 9.5 A7 7 0 0 1 19 9.5 C 19 13, 16 16.5, 12 21 Z" />
            <circle cx="12" cy="9.5" r="2.3" />
          </svg>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold text-[var(--navy)]">La carte des associations partenaires</span>
          <span className="block text-[12px] text-[var(--slate)]">
            {filtered.length} association{filtered.length > 1 ? "s" : ""}
            {nFilters ? ` · ${nFilters} filtre${nFilters > 1 ? "s" : ""}` : ""} — clique sur un point pour ouvrir sa fiche
          </span>
        </span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={`h-[15px] w-[15px] flex-none text-[var(--slate)] transition-transform ${open ? "rotate-180" : ""}`}>
          <path d="M6 9 L12 15 L18 9" />
        </svg>
      </button>

      {open && (
        <div className="border-t border-[var(--border)] p-4">
          <div className="mb-3 flex flex-col gap-2.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="w-[112px] flex-none text-[11.5px] font-semibold text-[var(--slate)]">Ouvert le</span>
              {DAY_LABEL.map((l, i) => (
                <button key={l} type="button" onClick={() => toggle(days, i, setDays)} className={chip(days.has(i))}>
                  {l}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="w-[112px] flex-none text-[11.5px] font-semibold text-[var(--slate)]">Denrées acceptées</span>
              {DENREES.map((d, i) => (
                <button key={d} type="button" onClick={() => toggle(denrees, d, setDenrees)} className={`${chip(denrees.has(d))} flex items-center gap-1.5`}>
                  <span className="h-2 w-2 rounded-full" style={{ background: DENREE_COLOR[i] }} />
                  {d}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="w-[112px] flex-none text-[11.5px] font-semibold text-[var(--slate)]">Équipement</span>
              {EQUIP.map((e) => (
                <button key={e.k} type="button" onClick={() => toggle(equip, e.k, setEquip)} className={chip(equip.has(e.k))}>
                  {e.l}
                </button>
              ))}
              <select value={cat} onChange={(e) => setCat(e.target.value)} className="ml-1 rounded-[40px] border-[1.5px] border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-[12px] font-semibold text-[var(--slate)]">
                <option value="">Toutes les typologies</option>
                {cats.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
              <label className="ml-1 flex items-center gap-1.5 text-[12px] font-semibold text-[var(--slate)]">
                <input type="checkbox" checked={onlyActive} onChange={(e) => setOnlyActive(e.target.checked)} className="accent-[var(--turquoise)]" />
                Actives seulement
              </label>
              {nFilters > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setDays(new Set());
                    setDenrees(new Set());
                    setEquip(new Set());
                    setCat("");
                  }}
                  className="ml-auto text-[12px] font-bold text-[var(--turquoise)]"
                >
                  Effacer les filtres
                </button>
              )}
            </div>
          </div>

          <PointsMap points={points} selectedId={selectedId} onSelect={onSelect} height={380} />

          <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-[var(--slate)]">
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[#2a78d6]" />Distribution Linkee</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[#0a1a3f]" />Association</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[#8a93a8]" />Inactive</span>
            {pending > 0 && <span>Localisation en cours… ({pending})</span>}
            {noAddress > 0 && <span>{noAddress} sans adresse localisable</span>}
            {unreadable > 0 && <span>{unreadable} fiche{unreadable > 1 ? "s" : ""} avec des horaires non lisibles (écris-les sous la forme « Lun-Ven 9h-17h »)</span>}
          </div>
        </div>
      )}
    </div>
  );
}
