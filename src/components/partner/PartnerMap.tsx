"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { geocode, type LatLng } from "@/lib/geocode";
import type { ClickPoint } from "@/components/PointsMap";
import type { Creneaux } from "@/lib/creneaux";

const PointsMap = dynamic(() => import("@/components/PointsMap"), {
  ssr: false,
  loading: () => <div className="flex h-[380px] items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--input-bg)] text-[13px] text-[var(--slate)]">Chargement de la carte…</div>,
});

export type MapPartner = {
  id: string;
  name: string;
  cat: string;
  address: string;
  active: boolean;
  activityStatus?: string;
  denrees: Record<string, boolean>;
  creneaux: Creneaux;
};

const DAYS = ["lun", "mar", "mer", "jeu", "ven", "sam", "dim"] as const;
const DAY_LABEL = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const DENREES = ["Secs", "Fruits et légumes", "Produits frais", "Plats préparés", "Boulangerie"];
const DENREE_COLOR = ["var(--cat-1)", "var(--cat-2)", "var(--cat-3)", "var(--cat-4)", "var(--cat-5)"];

const chip = (on: boolean) =>
  `rounded-[40px] border-[1.5px] px-3 py-1.5 text-[12px] font-semibold whitespace-nowrap ${on ? "border-[var(--navy-deep)] bg-[var(--navy-deep)] text-[var(--panel-fg)]" : "border-[var(--border)] bg-[var(--card)] text-[var(--slate)] hover:border-[var(--turquoise)]"}`;

/** "La carte des partenaires": the donors of the city on OpenStreetMap, filterable; a click on a point opens its fiche. Folded by default. */
export default function PartnerMap({ items, selectedId, onSelect }: { items: MapPartner[]; selectedId: string | null; onSelect: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<Record<string, LatLng | null>>({});
  const [days, setDays] = useState<Set<number>>(new Set());
  const [denrees, setDenrees] = useState<Set<string>>(new Set());
  const [cat, setCat] = useState("");
  const [activity, setActivity] = useState("");
  const [onlyActive, setOnlyActive] = useState(true);

  // locate each address once, only when the map is opened (results are cached in the browser)
  const addrKey = items.map((p) => p.id + "|" + p.address).join("\n");
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      for (const p of items) {
        if (cancelled) return;
        if (!p.address.trim() || coords[p.id + "|" + p.address] !== undefined) continue;
        const g = await geocode(p.address);
        if (cancelled) return;
        setCoords((prev) => ({ ...prev, [p.id + "|" + p.address]: g }));
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addrKey, open]);

  const cats = useMemo(() => Array.from(new Set(items.map((p) => p.cat).filter(Boolean))).sort(), [items]);
  const activities = useMemo(() => Array.from(new Set(items.map((p) => p.activityStatus || "Non défini"))).sort(), [items]);
  const toggle = <T,>(set: Set<T>, v: T, apply: (s: Set<T>) => void) => {
    const n = new Set(set);
    if (n.has(v)) n.delete(v);
    else n.add(v);
    apply(n);
  };

  // days of collection read from the structured slots (creneaux)
  const collectDays = (p: MapPartner) => new Set(DAYS.map((k, i) => ((p.creneaux?.[k] ?? []).length ? i : -1)).filter((i) => i >= 0));

  const filtered = items.filter((p) => {
    if (onlyActive && !p.active) return false;
    if (cat && p.cat !== cat) return false;
    if (activity && (p.activityStatus || "Non défini") !== activity) return false;
    for (const d of denrees) if (!p.denrees?.[d]) return false;
    if (days.size) {
      const cd = collectDays(p);
      for (const d of days) if (!cd.has(d)) return false;
    }
    return true;
  });
  const located = filtered.filter((p) => coords[p.id + "|" + p.address]);
  const pending = filtered.filter((p) => p.address.trim() && coords[p.id + "|" + p.address] === undefined).length;
  const noAddress = filtered.filter((p) => !p.address.trim() || coords[p.id + "|" + p.address] === null).length;
  const points: ClickPoint[] = located.map((p) => {
    const g = coords[p.id + "|" + p.address]!;
    return { id: p.id, lat: g.lat, lng: g.lng, label: p.name, sub: [p.cat, p.activityStatus && p.activityStatus !== "Non défini" ? p.activityStatus : ""].filter(Boolean).join(" · "), color: !p.active ? "#8a93a8" : "#eb6834" };
  });
  const nFilters = days.size + denrees.size + (cat ? 1 : 0) + (activity ? 1 : 0);

  return (
    <div className="mt-[18px] overflow-hidden rounded-[18px] border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow)]" style={{ borderTop: "4px solid #eb6834" }}>
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-3 px-5 py-3.5 text-left">
        <span className="flex h-9 w-9 flex-none items-center justify-center rounded-[11px] bg-[#eb6834] text-white">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
            <path d="M12 21 C 8 16.5, 5 13, 5 9.5 A7 7 0 0 1 19 9.5 C 19 13, 16 16.5, 12 21 Z" />
            <circle cx="12" cy="9.5" r="2.3" />
          </svg>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold text-[var(--navy)]">La carte des partenaires</span>
          <span className="block text-[12px] text-[var(--slate)]">
            {filtered.length} partenaire{filtered.length > 1 ? "s" : ""}
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
              <span className="w-[112px] flex-none text-[11.5px] font-semibold text-[var(--slate)]">Collecte le</span>
              {DAY_LABEL.map((l, i) => (
                <button key={l} type="button" onClick={() => toggle(days, i, setDays)} className={chip(days.has(i))}>
                  {l}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="w-[112px] flex-none text-[11.5px] font-semibold text-[var(--slate)]">Denrées données</span>
              {DENREES.map((d, i) => (
                <button key={d} type="button" onClick={() => toggle(denrees, d, setDenrees)} className={`${chip(denrees.has(d))} flex items-center gap-1.5`}>
                  <span className="h-2 w-2 rounded-full" style={{ background: DENREE_COLOR[i] }} />
                  {d}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <select value={cat} onChange={(e) => setCat(e.target.value)} className="rounded-[40px] border-[1.5px] border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-[12px] font-semibold text-[var(--slate)]">
                <option value="">Toutes les catégories</option>
                {cats.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
              <select value={activity} onChange={(e) => setActivity(e.target.value)} className="rounded-[40px] border-[1.5px] border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-[12px] font-semibold text-[var(--slate)]">
                <option value="">Tous statuts</option>
                {activities.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
              <label className="ml-1 flex items-center gap-1.5 text-[12px] font-semibold text-[var(--slate)]">
                <input type="checkbox" checked={onlyActive} onChange={(e) => setOnlyActive(e.target.checked)} className="accent-[var(--turquoise)]" />
                Actifs seulement
              </label>
              {nFilters > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setDays(new Set());
                    setDenrees(new Set());
                    setCat("");
                    setActivity("");
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
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[#eb6834]" />Partenaire actif</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[#8a93a8]" />Inactif</span>
            {pending > 0 && <span>Localisation en cours… ({pending})</span>}
            {noAddress > 0 && <span>{noAddress} sans adresse localisable</span>}
          </div>
        </div>
      )}
    </div>
  );
}