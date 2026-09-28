"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Kind = "partner" | "dropoff" | "stock" | "exceptionnel";
type ResultItem = { denree?: string; name?: string; kg: number; from?: string; sourceId?: string; stockId?: string; colis?: number };
type StopResult = { items?: ResultItem[]; totalKg?: number; photos?: number; motif?: string };
type ChecklistItem = { id: string; label: string };
type Rel = { name: string; category: string | null; address: string | null; fiche: Record<string, unknown> | null };
type DbItem = { denree: string | null; name: string | null; kg: number; source_collecte_id: string | null };
type DbStop = {
  id: string;
  kind: string;
  label: string | null;
  comment: string | null;
  status: string;
  motif: string | null;
  photos_count: number;
  scheduled_time: string | null;
  partners: Rel | Rel[] | null;
  beneficiaries: Rel | Rel[] | null;
  collecte_items: DbItem[] | null;
};
type WeekRow = { scheduled_date: string; scheduled_time: string | null; status: string; label: string | null; partners: { name: string; category: string | null } | { name: string; category: string | null }[] | null; beneficiaries: { name: string; category: string | null } | { name: string; category: string | null }[] | null };
type Stop = {
  id: string;
  time: string;
  name: string;
  cat: string;
  access: string[];
  status: "todo" | "collecte" | "annule";
  kind: Kind;
  address: string;
  accessDetails?: string;
  comment?: string;
  allowedTypes?: string[];
  presetItems?: { id: string; name: string; colis: number; upc: number; grammage: number }[];
  result?: StopResult;
};

const DENREE_OPTIONS = ["Secs", "Fruits et légumes", "Produits frais", "Plats préparés", "Boulangerie"];
const DEPOT_ADDRESS = "110 Rue du Companet, 69140 Rillieux-la-Pape";

function one<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}
const isoDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const dbWeekday = (d: Date) => (d.getDay() === 0 ? 7 : d.getDay());
const ACCESS_KEY_MAP: Record<string, string> = { digicode: "digicode", quai: "quai", camion: "camion", etage: "ascenseur", horaire: "horaire" };

/** Positions for the schematic map: spread the stops on a loose zig-zag. */
function mapPoint(i: number) {
  const cols = 4;
  const row = Math.floor(i / cols);
  const col = i % cols;
  const x = 40 + (row % 2 === 0 ? col : cols - 1 - col) * 95;
  return { x, y: 40 + row * 62 };
}


function rowToStop(r: DbStop, all: DbStop[]): Stop {
  const rel = one(r.partners) ?? one(r.beneficiaries);
  const fiche = (rel?.fiche ?? {}) as { access?: Record<string, boolean>; accessNote?: string; denrees?: Record<string, boolean> };
  const kind: Kind = r.kind === "dropoff" ? "dropoff" : r.kind === "stock" ? "stock" : r.kind === "partner" ? "partner" : "exceptionnel";
  const items: ResultItem[] = (r.collecte_items ?? []).map((it) => {
    const src = it.source_collecte_id ? all.find((x) => x.id === it.source_collecte_id) : null;
    const srcRel = src ? (one(src.partners) ?? one(src.beneficiaries)) : null;
    return { denree: it.denree ?? undefined, name: it.name ?? undefined, kg: Number(it.kg), sourceId: it.source_collecte_id ?? undefined, from: srcRel?.name ?? src?.label ?? undefined };
  });
  const status = r.status === "collecte" ? "collecte" : r.status === "annule" ? "annule" : "todo";
  return {
    id: r.id,
    time: r.scheduled_time ? r.scheduled_time.slice(0, 5) : "",
    name: rel?.name ?? r.label ?? "Point de tournée",
    cat: rel?.category ?? (r.kind === "stock" ? "Dépôt stock" : ""),
    access: Object.entries(fiche.access ?? {}).filter(([, on]) => on).map(([k]) => ACCESS_KEY_MAP[k] ?? k),
    status,
    kind,
    address: rel?.address ?? (r.kind === "stock" ? DEPOT_ADDRESS : ""),
    accessDetails: fiche.accessNote || undefined,
    comment: r.comment || undefined,
    allowedTypes: kind === "dropoff" ? Object.entries(fiche.denrees ?? {}).filter(([, on]) => on).map(([k]) => k) : undefined,
    result:
      status === "collecte"
        ? { items, totalKg: Math.round(items.reduce((s, it) => s + it.kg, 0) * 10) / 10, photos: r.photos_count }
        : status === "annule"
          ? { motif: r.motif ?? "" }
          : undefined,
  };
}

const TRUCK_SLOTS = [
  { key: "front", label: "Face avant" }, { key: "back", label: "Face arrière" }, { key: "left", label: "Côté gauche" },
  { key: "right", label: "Côté droit" }, { key: "cabin", label: "Intérieur cabine" }, { key: "hold", label: "Intérieur benne" },
];
const TRUCK_CHECKS = ["Niveau d'huile moteur", "Niveau de liquide de refroidissement", "Pression des pneus", "Niveau de lave-glace", "Éclairage / clignotants"];
const TRUCK_REVISIONS = [
  { label: "Révision 1 mois", sub: "Prochaine échéance : 15 octobre 2026" },
  { label: "Révision 3 mois", sub: "Prochaine échéance : 15 décembre 2026" },
];

const ACCESS_LABELS: Record<string, string> = { digicode: "Digicode", quai: "Quai de livraison", camion: "Accès camion", ascenseur: "Ascenseur / étage", horaire: "Horaire strict" };
const ACCESS_PATHS: Record<string, ReactNode> = {
  camion: <><rect x="2" y="9" width="12" height="8" rx="1" /><path d="M14 12 H18 L21 15 V17 H14 Z" /><circle cx="6.5" cy="18.5" r="1.4" /><circle cx="18" cy="18.5" r="1.4" /></>,
  digicode: <><rect x="5" y="3" width="14" height="18" rx="2" /><circle cx="9" cy="8" r="1" /><circle cx="15" cy="8" r="1" /><circle cx="9" cy="13" r="1" /><circle cx="15" cy="13" r="1" /></>,
  quai: <><rect x="2" y="9" width="12" height="8" rx="1" /><path d="M14 12 H18 L21 15 V17 H14 Z" /><circle cx="6.5" cy="18.5" r="1.4" /><circle cx="18" cy="18.5" r="1.4" /></>,
  ascenseur: <><rect x="6" y="3" width="12" height="18" rx="1.5" /><path d="M10 8 L12 6 L14 8 M10 14 L12 16 L14 14" /></>,
  horaire: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5 V12 L15 14" /></>,
};
const CAT_PATHS: Record<string, ReactNode> = {
  Boulangerie: <><path d="M4 18 C 8 10, 14 7, 20 5" /><path d="M8 14.5 L6.5 13 M12 11.3 L10.5 9.8 M16 8.2 L14.5 6.7" /></>,
  Supermarché: <><path d="M3 4 H5 L7.5 15 H18 L20 7 H6.5" /><circle cx="9" cy="19" r="1.4" /><circle cx="17" cy="19" r="1.4" /></>,
  Traiteur: <><path d="M7 20 H17 V15 H7 Z" /><path d="M7 15 C5 15, 4 12.5, 6 11 C 6.3 8.8, 8.3 7.5, 10 8.3 C 10.8 6.6, 13.2 6.6, 14 8.3 C 15.7 7.5, 17.7 8.8, 18 11 C 20 12.5, 19 15, 17 15" /></>,
  Hôtel: <><path d="M3 19 V11 A2 2 0 0 1 5 9 H19 A2 2 0 0 1 21 11 V19" /><path d="M3 15 H21" /><rect x="5" y="10.5" width="5" height="2.8" rx="1" /></>,
  Grossiste: <><rect x="4" y="4" width="7" height="7" rx="1" /><rect x="13" y="4" width="7" height="7" rx="1" /><rect x="4" y="13" width="7" height="7" rx="1" /><rect x="13" y="13" width="7" height="7" rx="1" /></>,
  "Restauration rapide": <><path d="M6 8 H18 L16.5 20 H7.5 Z" /><path d="M9 8 V5 H15 V8" /></>,
  "Dépôt stock": <><rect x="4" y="3.5" width="16" height="17" rx="1.5" /><path d="M4 9.5 H20 M4 14.5 H20" /></>,
  "Association partenaire": <path d="M12 20 C 6 15.5, 3 12.3, 3 8.8 C 3 6.1, 5.1 4 7.7 4 C 9.4 4, 11 5, 12 6.5 C 13 5, 14.6 4, 16.3 4 C 18.9 4, 21 6.1, 21 8.8 C 21 12.3, 18 15.5, 12 20 Z" />,
  default: <><path d="M4 8 L8 4 H16 L20 8" /><rect x="4" y="8" width="16" height="11" rx="1.5" /><path d="M4 8 H20" /></>,
};

function Icon({ children, className = "h-3 w-3", sw = 1.8 }: { children: ReactNode; className?: string; sw?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" className={className}>
      {children}
    </svg>
  );
}
const CameraIcon = ({ className = "h-[18px] w-[18px]" }: { className?: string }) => (
  <Icon className={className}>
    <path d="M4 8 L7 4 H17 L20 8" />
    <rect x="3" y="8" width="18" height="12" rx="2" />
    <circle cx="12" cy="14" r="3.2" />
  </Icon>
);
const CheckIcon = ({ className = "h-4 w-4" }: { className?: string }) => (
  <Icon className={className} sw={2}>
    <path d="M20 6 L9 17 L4 12" />
  </Icon>
);
const CloseIcon = ({ className = "h-4 w-4" }: { className?: string }) => (
  <Icon className={className} sw={2}>
    <path d="M6 6 L18 18 M18 6 L6 18" />
  </Icon>
);

const fieldCls = "w-full rounded-xl border-[1.5px] border-[var(--border)] bg-[var(--input-bg)] px-[13px] py-[11px] text-sm font-medium text-[var(--navy)] outline-none focus:border-[var(--turquoise)]";
const thumbCls = "flex h-14 w-14 flex-none items-center justify-center rounded-xl bg-gradient-to-br from-[var(--turquoise)] to-[var(--navy-deep)] text-white";

function summary(s: Stop) {
  const r = s.result!;
  const photos = r.photos ?? 0;
  if (s.kind === "stock") return <><strong className="text-[var(--navy)]">{r.totalKg} kg pris</strong> · {r.items!.length} item(s) : {r.items!.map((i) => i.name).join(", ")} · {photos} photo(s)</>;
  if (s.kind === "dropoff") return <><strong className="text-[var(--navy)]">{r.totalKg} kg déposés</strong> · {r.items!.map((i) => `${i.denree} (${i.from})`).join(", ")} · {photos} photo(s)</>;
  return <><strong className="text-[var(--navy)]">{r.totalKg} kg</strong> · {r.items!.length} item(s) ({r.items!.map((i) => i.denree).join(", ")}) · {photos} photo(s)</>;
}

function PhotoField({ count, onAdd, required = true }: { count: number; onAdd: () => void; required?: boolean }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-bold text-[var(--navy)]">
        {required ? <>Photo <span className="text-[var(--critical)]">*</span></> : "Photos"}
      </label>
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: count }, (_, k) => (
          <div key={k} className={thumbCls}>
            <CameraIcon />
          </div>
        ))}
        <button type="button" onClick={onAdd} className="flex h-14 w-14 flex-none items-center justify-center rounded-xl border-[1.5px] border-dashed border-[var(--border)] bg-[var(--input-bg)] text-[var(--slate)]">
          <CameraIcon />
        </button>
      </div>
    </div>
  );
}

function StopPanel({ stops, index, onDone }: { stops: Stop[]; index: number; onDone: (r: StopResult, status: "collecte" | "annule") => void }) {
  const s = stops[index];
  const [pick, setPick] = useState<"collecte" | "annule" | null>(null);
  const [rows, setRows] = useState<{ denree: string; kg: string }[]>([{ denree: "", kg: "" }]);
  const [photos, setPhotos] = useState(0);
  const [stockCounts, setStockCounts] = useState<Record<string, number>>({});
  const [dropChecked, setDropChecked] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [motif, setMotif] = useState("");
  const [errCollecte, setErrCollecte] = useState("");
  const [errAnnule, setErrAnnule] = useState("");

  const okLabel = s.kind === "stock" ? "Pris" : s.kind === "dropoff" ? "Déposé" : "Collecté";
  const earlier = stops.map((st, idx) => ({ st, idx })).filter(({ st, idx }) => idx < index && st.kind === "partner" && st.status === "collecte" && st.result?.items?.length);
  const allowed = s.allowedTypes || [];

  function validateCollecte() {
    if (s.kind === "stock") {
      const taken = (s.presetItems ?? []).filter((it) => (stockCounts[it.id] ?? 0) > 0);
      if (taken.length < 1 || photos < 1) return setErrCollecte("Indiquez au moins un produit pris en stock (nombre de colis) et ajoutez une photo.");
      const items: ResultItem[] = taken.map((it) => ({ name: it.name, kg: Math.round(((stockCounts[it.id] ?? 0) * it.upc * it.grammage) / 10) / 100, stockId: it.id, colis: stockCounts[it.id] }));
      onDone({ items, totalKg: Math.round(items.reduce((sum, it) => sum + it.kg, 0) * 100) / 100, photos }, "collecte");
    } else if (s.kind === "dropoff") {
      const dropped: ResultItem[] = [];
      dropChecked.forEach((key) => {
        const [p, it] = key.split(":").map(Number);
        const src = stops[p].result!.items![it];
        dropped.push({ denree: src.denree, kg: src.kg, from: stops[p].name, sourceId: stops[p].id });
      });
      if (dropped.length < 1 || photos < 1) return setErrCollecte("Cochez au moins un produit à laisser ici, et ajoutez une photo.");
      onDone({ items: dropped, totalKg: Math.round(dropped.reduce((sum, it) => sum + it.kg, 0) * 10) / 10, photos }, "collecte");
    } else {
      const items = rows.filter((r) => r.denree && r.kg).map((r) => ({ denree: r.denree, kg: parseFloat(r.kg) }));
      if (items.length < 1 || photos < 1) return setErrCollecte("Ajoutez au moins un item (type + poids) et une photo.");
      onDone({ items, totalKg: Math.round(items.reduce((sum, it) => sum + it.kg, 0) * 10) / 10, photos }, "collecte");
    }
  }

  return (
    <div className="mt-3.5 border-t border-[var(--border)] pt-3.5">
      <div className="flex gap-2.5">
        <button type="button" onClick={() => setPick("collecte")} className={`flex flex-1 items-center justify-center gap-[7px] rounded-[14px] border-[1.5px] p-3 text-[13.5px] font-bold ${pick === "collecte" ? "border-[var(--good)] bg-[var(--good-bg)] text-[var(--good)]" : "border-[var(--border)] bg-[var(--input-bg)] text-[var(--navy)]"}`}>
          <CheckIcon />
          {okLabel}
        </button>
        <button type="button" onClick={() => setPick("annule")} className={`flex flex-1 items-center justify-center gap-[7px] rounded-[14px] border-[1.5px] p-3 text-[13.5px] font-bold ${pick === "annule" ? "border-[var(--critical)] bg-[var(--critical-bg)] text-[var(--critical)]" : "border-[var(--border)] bg-[var(--input-bg)] text-[var(--navy)]"}`}>
          <CloseIcon />
          Annulé
        </button>
      </div>

      {pick === "collecte" && (
        <div className="mt-3.5 flex flex-col gap-3">
          {s.kind === "partner" || s.kind === "exceptionnel" ? (
            <div>
              <label className="mb-1.5 block text-xs font-bold text-[var(--navy)]">Items collectés <span className="text-[var(--critical)]">*</span></label>
              <div className="mb-2 flex flex-col gap-2">
                {rows.map((row, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <select value={row.denree} onChange={(e) => setRows(rows.map((r, i) => (i === idx ? { denree: e.target.value, kg: e.target.value ? r.kg : "" } : r)))} className={`${fieldCls} min-w-0 flex-1`}>
                      <option value="">Type d&apos;item…</option>
                      {DENREE_OPTIONS.map((d) => <option key={d}>{d}</option>)}
                    </select>
                    <input type="number" min={0} step={0.5} placeholder="kg" disabled={!row.denree} value={row.kg} onChange={(e) => setRows(rows.map((r, i) => (i === idx ? { ...r, kg: e.target.value } : r)))} className={`${fieldCls} w-[76px] flex-none text-right disabled:bg-[var(--todo-bg)] disabled:opacity-50`} />
                    <button type="button" aria-label="Retirer l'item" onClick={() => setRows(rows.length > 1 ? rows.filter((_, i) => i !== idx) : [{ denree: "", kg: "" }])} className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-full border-[1.5px] border-[var(--border)] bg-[var(--input-bg)] text-[var(--slate)] hover:border-[var(--critical)] hover:bg-[var(--critical-bg)] hover:text-[var(--critical)]">
                      <CloseIcon className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
              <button type="button" onClick={() => setRows([...rows, { denree: "", kg: "" }])} className="w-full rounded-xl border-[1.5px] border-dashed border-[var(--border)] bg-[var(--input-bg)] p-2.5 text-[13px] font-bold text-[var(--navy)] hover:border-[var(--turquoise)] hover:text-[var(--turquoise)]">
                + Ajouter un item
              </button>
            </div>
          ) : s.kind === "stock" ? (
            <div>
              <label className="mb-1.5 block text-xs font-bold text-[var(--navy)]">Produits du stock — indiquez le nombre de colis pris</label>
              {(s.presetItems ?? []).length === 0 && <p className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--input-bg)] px-3.5 py-3 text-[12.5px] text-[var(--slate)]">Le stock est vide : rien à prendre ici.</p>}
              <div className="flex flex-col gap-2">
                {(s.presetItems ?? []).map((it) => (
                  <div key={it.id} className="flex items-center gap-2.5 rounded-xl border-[1.5px] border-[var(--border)] bg-[var(--input-bg)] px-[13px] py-[9px]">
                    <span className="min-w-0 flex-1">
                      <div className="truncate text-[13.5px] font-semibold text-[var(--navy)]">{it.name}</div>
                      <div className="text-[11px] text-[var(--slate)]">{it.colis} colis dispo · {it.upc} u/colis</div>
                    </span>
                    <input
                      type="number"
                      min={0}
                      max={it.colis}
                      value={stockCounts[it.id] ?? 0}
                      onChange={(e) => setStockCounts((prev) => ({ ...prev, [it.id]: Math.min(it.colis, Math.max(0, parseInt(e.target.value, 10) || 0)) }))}
                      className="w-16 rounded-lg border-[1.5px] border-[var(--border)] bg-[var(--card)] px-2 py-1.5 text-center text-[13px] font-bold text-[var(--navy)]"
                    />
                  </div>
                ))}
              </div>
            </div>
          ) : earlier.length === 0 ? (
            <p className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--input-bg)] px-3.5 py-3 text-[12.5px] leading-[1.5] text-[var(--slate)]">
              Aucun produit collecté avant ce point pour l&apos;instant. Traitez d&apos;abord une collecte le matin, puis revenez ici.
            </p>
          ) : (
            <div>
              <label className="mb-1.5 block text-xs font-bold text-[var(--navy)]">Points collectés ce matin — cochez ce qui est laissé ici <span className="text-[var(--critical)]">*</span></label>
              <div className="flex flex-col gap-2">
                {earlier.map(({ st, idx }, n) => {
                  const pointItems = st.result!.items!;
                  const allowedIdx = pointItems.map((it, j) => (allowed.includes(it.denree!) ? j : -1)).filter((j) => j >= 0);
                  const pointChecked = allowedIdx.length > 0 && allowedIdx.every((j) => dropChecked.has(`${idx}:${j}`));
                  return (
                    <div key={idx} className="overflow-hidden rounded-xl border-[1.5px] border-[var(--border)] bg-[var(--input-bg)]">
                      <div className="flex items-center gap-[9px] px-3 py-2.5">
                        <input
                          type="checkbox"
                          checked={pointChecked}
                          onChange={(e) => {
                            setDropChecked((prev) => {
                              const next = new Set(prev);
                              allowedIdx.forEach((j) => (e.target.checked ? next.add(`${idx}:${j}`) : next.delete(`${idx}:${j}`)));
                              return next;
                            });
                            if (e.target.checked) setExpanded((prev) => new Set(prev).add(idx));
                          }}
                          className="h-[19px] w-[19px] accent-[var(--dropoff)]"
                        />
                        <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-[var(--navy)]">{st.name}</span>
                        <span className="flex-none text-[11px] font-semibold text-[var(--slate)]">{st.time}</span>
                        {n === 0 && <span className="flex-none rounded-[40px] bg-[var(--dropoff-bg)] px-[7px] py-[3px] text-[9.5px] font-bold tracking-[0.03em] text-[var(--dropoff)] uppercase">Suggéré</span>}
                        <button type="button" onClick={() => setExpanded((prev) => { const nx = new Set(prev); if (nx.has(idx)) nx.delete(idx); else nx.add(idx); return nx; })} className="flex flex-none p-0.5 text-[var(--slate)]">
                          <Icon className={`h-3.5 w-3.5 transition-transform ${expanded.has(idx) ? "rotate-180" : ""}`} sw={2}>
                            <path d="M6 9 L12 15 L18 9" />
                          </Icon>
                        </button>
                      </div>
                      {expanded.has(idx) && (
                        <div className="flex flex-col gap-px border-t border-[var(--border)]">
                          {pointItems.map((it, j) => {
                            const ok = allowed.includes(it.denree!);
                            return (
                              <label key={j} className={`flex items-center gap-[9px] bg-[var(--card)] py-[9px] pr-3 pl-[34px] text-[12.5px] font-semibold ${ok ? "cursor-pointer text-[var(--navy)]" : "cursor-not-allowed text-[var(--slate)] opacity-65"}`}>
                                <input
                                  type="checkbox"
                                  disabled={!ok}
                                  checked={dropChecked.has(`${idx}:${j}`)}
                                  onChange={() => setDropChecked((prev) => { const nx = new Set(prev); const key = `${idx}:${j}`; if (nx.has(key)) nx.delete(key); else nx.add(key); return nx; })}
                                  className="h-4 w-4 accent-[var(--dropoff)]"
                                />
                                <span className="flex-1">{it.denree}</span>
                                <span className="text-[var(--slate)] tabular-nums">{it.kg} kg</span>
                                {!ok && <span className="flex-none text-[10.5px] font-normal italic text-[var(--slate)]">non accepté ici</span>}
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <p className="mt-2 text-[11.5px] leading-[1.5] text-[var(--slate)]">Sélectionnable uniquement pour : {allowed.join(", ")} (défini par l&apos;admin sur la fiche association). Le reste continue la tournée dans le camion.</p>
            </div>
          )}
          <PhotoField count={photos} onAdd={() => setPhotos((p) => p + 1)} />
          {s.kind === "partner" && <p className="-mt-1.5 text-[11.5px] text-[var(--slate)]">Une photo suffit pour valider, quel que soit le nombre d&apos;items.</p>}
          <div className="min-h-[14px] text-[11.5px] text-[var(--critical)]">{errCollecte}</div>
          <button type="button" onClick={validateCollecte} className="rounded-[40px] bg-[var(--good)] p-3 font-display text-[14.5px] font-bold text-white">
            {s.kind === "stock" ? "Valider la sortie de stock" : s.kind === "dropoff" ? "Valider la dépose" : "Valider la collecte"}
          </button>
        </div>
      )}

      {pick === "annule" && (
        <div className="mt-3.5 flex flex-col gap-3">
          <div>
            <label className="mb-1.5 block text-xs font-bold text-[var(--navy)]">Motif d&apos;annulation <span className="text-[var(--critical)]">*</span></label>
            <textarea value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="Ex : commerce fermé, personne sur place…" className={`${fieldCls} min-h-[70px] resize-y`} />
          </div>
          <div className="min-h-[14px] text-[11.5px] text-[var(--critical)]">{errAnnule}</div>
          <button
            type="button"
            onClick={() => (motif.trim() ? onDone({ motif: motif.trim() }, "annule") : setErrAnnule("Le motif d'annulation est obligatoire."))}
            className="rounded-[40px] bg-[var(--critical)] p-3 font-display text-[14.5px] font-bold text-white"
          >
            Valider l&apos;annulation
          </button>
        </div>
      )}
    </div>
  );
}

function CheckRow({ label, sub, checked, onChange }: { label: string; sub?: string; checked: boolean; onChange: () => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-[11px] rounded-xl border-[1.5px] border-[var(--border)] bg-[var(--input-bg)] px-[13px] py-[11px]">
      <input type="checkbox" checked={checked} onChange={onChange} className="h-[19px] w-[19px] flex-none accent-[var(--good)]" />
      <span className={`flex-1 text-[13px] font-semibold ${checked ? "text-[var(--slate)] line-through decoration-[var(--border)]" : "text-[var(--navy)]"}`}>
        {label}
        {sub && <small className="mt-px block text-[11px] font-medium text-[var(--slate)]">{sub}</small>}
      </span>
    </label>
  );
}

function toggle(set: Set<number>, k: number) {
  const n = new Set(set);
  if (n.has(k)) n.delete(k);
  else n.add(k);
  return n;
}

export default function JourneePage() {
  const router = useRouter();
  const [view, setView] = useState<"jour" | "semaine" | "camion">("jour");
  const [dayState, setDayState] = useState<"idle" | "running" | "closed">("idle");
  const supabase = useMemo(() => createClient(), []);
  const [stops, setStops] = useState<Stop[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [cityId, setCityId] = useState<string | null>(null);
  const [firstName, setFirstName] = useState("");
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [weekRows, setWeekRows] = useState<WeekRow[]>([]);
  const [vehicle, setVehicle] = useState<{ name: string; plate: string | null } | null>(null);
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const [depChecked, setDepChecked] = useState<Set<number>>(new Set());
  const [mapOpen, setMapOpen] = useState(false);
  const [accessOpen, setAccessOpen] = useState<Set<number>>(new Set());
  const [elapsed, setElapsed] = useState(0);
  const [closedText, setClosedText] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [weekOpen, setWeekOpen] = useState<number | null>(null);
  const [truckPhotos, setTruckPhotos] = useState<Set<number>>(new Set());
  const [truckDone, setTruckDone] = useState<string | null>(null);
  const [checks, setChecks] = useState<Set<number>>(new Set());
  const [revisions, setRevisions] = useState<Set<number>>(new Set());
  const [receipts, setReceipts] = useState(0);
  const timer = useRef<number | null>(null);

  const depDone = depChecked.size === checklist.length;
  const doneCount = stops.filter((s) => s.status !== "todo").length;
  const remaining = stops.length - doneCount;
  const breakIdx = stops.findIndex((s) => s.time >= "13:30");
  const pad = (n: number) => (n < 10 ? "0" + n : "" + n);
  const timerText = `${pad(Math.floor(elapsed / 3600))}:${pad(Math.floor((elapsed % 3600) / 60))}:${pad(elapsed % 60)}`;
  const [now] = useState(() => new Date());
  const today = now.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  const iso = isoDate(now);

  const week = (() => {
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    const names = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
    return names
      .map((dow, k) => {
        const d = new Date(monday);
        d.setDate(monday.getDate() + k);
        const key = isoDate(d);
        const rows = weekRows.filter((r) => r.scheduled_date === key);
        return {
          dow,
          dom: String(d.getDate()),
          key,
          title: key === iso ? "Aujourd'hui" : rows.length ? "Tournée planifiée" : "Pas de tournée",
          status: key === iso ? ("today" as const) : key < iso ? ("past" as const) : ("upcoming" as const),
          stops: rows.map((r) => ({
            t: r.scheduled_time ? r.scheduled_time.slice(0, 5) : "—",
            n: one(r.partners)?.name ?? one(r.beneficiaries)?.name ?? r.label ?? "Point",
            c: one(r.partners)?.category ?? one(r.beneficiaries)?.category ?? (r.label ? "Dépôt stock" : ""),
          })),
        };
      })
      .filter((w) => w.dow !== "Dim" || w.stops.length > 0);
  })();

  function startTimer(fromSeconds: number) {
    if (timer.current) window.clearInterval(timer.current);
    setElapsed(fromSeconds);
    timer.current = window.setInterval(() => setElapsed((e) => e + 1), 1000);
  }
  useEffect(() => () => { if (timer.current) window.clearInterval(timer.current); }, []);

  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) return;
      setUserId(uid);
      const monday = new Date(now);
      monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      const [prof, col, tpl, ovr, stock, veh, ses, wk] = await Promise.all([
        supabase.from("profiles").select("city_id,full_name,email").eq("id", uid).maybeSingle(),
        supabase
          .from("collectes")
          .select("id,kind,label,comment,status,motif,photos_count,scheduled_time,partners(name,category,address,fiche),beneficiaries(name,category,address,fiche),collecte_items(denree,name,kg,source_collecte_id)")
          .eq("scheduled_date", iso)
          .order("sort_order"),
        supabase.from("checklist_templates").select("items").eq("weekday", dbWeekday(now)).maybeSingle(),
        supabase.from("checklist_overrides").select("items").eq("day", iso).maybeSingle(),
        supabase.from("stock_items").select("id,name,colis,upc,grammage").gt("colis", 0).order("name"),
        supabase.from("vehicles").select("name,plate").limit(1).maybeSingle(),
        supabase.from("day_sessions").select("started_at,closed_at").eq("logisticien_id", uid).eq("day", iso).maybeSingle(),
        supabase
          .from("collectes")
          .select("scheduled_date,scheduled_time,status,label,partners(name,category),beneficiaries(name,category)")
          .gte("scheduled_date", isoDate(monday))
          .lte("scheduled_date", isoDate(sunday))
          .order("scheduled_date")
          .order("sort_order"),
      ]);
      setCityId(prof.data?.city_id ?? null);
      setFirstName(((prof.data?.full_name || prof.data?.email?.split("@")[0] || "") as string).split(" ")[0]);
      if (col.error) showToast("Chargement impossible : " + col.error.message);
      const rows = (col.data ?? []) as unknown as DbStop[];
      const presets = ((stock.data ?? []) as { id: string; name: string; colis: number; upc: number; grammage: number | string }[]).map((s) => ({ id: s.id, name: s.name, colis: s.colis, upc: s.upc, grammage: Number(s.grammage) }));
      setStops(rows.map((r) => rowToStop(r, rows)).map((s) => (s.kind === "stock" ? { ...s, presetItems: presets } : s)));
      setChecklist((ovr.data?.items ?? tpl.data?.items ?? []) as ChecklistItem[]);
      setVehicle((veh.data as { name: string; plate: string | null } | null) ?? null);
      setWeekRows((wk.data ?? []) as unknown as WeekRow[]);
      const s = ses.data as { started_at: string | null; closed_at: string | null } | null;
      if (s?.closed_at) {
        setDayState("closed");
        const secs = s.started_at ? Math.floor((new Date(s.closed_at).getTime() - new Date(s.started_at).getTime()) / 1000) : 0;
        setClosedText(`Journée clôturée — ${pad(Math.floor(secs / 3600))}:${pad(Math.floor((secs % 3600) / 60))}:${pad(secs % 60)} travaillées.`);
      } else if (s?.started_at) {
        setDayState("running");
        startTimer(Math.max(0, Math.floor((Date.now() - new Date(s.started_at).getTime()) / 1000)));
      }
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  function showToast(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2200);
  }
  async function startDay() {
    if (!userId || !cityId) return showToast("Compte sans ville : contacte l'administrateur.");
    const { error } = await supabase
      .from("day_sessions")
      .upsert({ city_id: cityId, logisticien_id: userId, day: iso, checklist_done: checklist.map((c) => c.id), started_at: new Date().toISOString(), closed_at: null }, { onConflict: "logisticien_id,day" });
    if (error) return showToast("Démarrage impossible : " + error.message);
    setDayState("running");
    startTimer(0);
    const n = new Date();
    showToast(`Journée démarrée à ${pad(n.getHours())}:${pad(n.getMinutes())}.`);
  }
  async function closeDay() {
    if (!userId) return;
    const { error } = await supabase.from("day_sessions").update({ closed_at: new Date().toISOString() }).eq("logisticien_id", userId).eq("day", iso);
    if (error) return showToast("Clôture impossible : " + error.message);
    if (timer.current) window.clearInterval(timer.current);
    setClosedText(`Journée clôturée — ${timerText} travaillées. La journée de demain reste verrouillée jusqu'à son ouverture.`);
    setDayState("closed");
    setOpenIdx(null);
  }
  async function finishStop(i: number, result: StopResult, status: "collecte" | "annule") {
    const s = stops[i];
    if (s.kind === "stock" && status === "collecte" && result.items?.length) {
      // atomic stock decrement + movement history (migration 006)
      const take = await supabase.rpc("take_stock", {
        p_items: result.items.map((it) => ({ id: it.stockId, colis: it.colis })),
        p_destination: `Tournée du ${iso}`,
        p_day: iso,
        p_time: null,
      });
      if (take.error) return showToast("Stock non mis à jour : " + take.error.message);
    }
    const { error } = await supabase
      .from("collectes")
      .update({ status, motif: result.motif ?? null, photos_count: result.photos ?? 0, done_at: new Date().toISOString(), logisticien_id: userId })
      .eq("id", s.id);
    if (error) return showToast("Enregistrement impossible : " + error.message);
    if (status === "collecte" && result.items?.length) {
      const { error: e2 } = await supabase.from("collecte_items").insert(
        result.items.map((it) => ({ collecte_id: s.id, denree: it.denree ?? null, name: it.name ?? null, kg: it.kg, source_collecte_id: it.sourceId ?? null })),
      );
      if (e2) return showToast("Poids non enregistrés : " + e2.message);
    }
    setStops((prev) => prev.map((x, idx) => (idx === i ? { ...x, status, result } : x)));
    setOpenIdx(null);
  }
  async function logout() {
    await createClient().auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const pts = stops.map((s, i) => ({ ...mapPoint(i), kind: s.kind, name: s.name, num: i + 1 }));
  const todayWeekStops = stops.map((s) => ({ t: s.time, n: s.name, c: s.cat }));

  return (
    <div className="relative">
      <div className="flex items-center justify-between pt-2.5 pb-3.5">
        <div>
          <div className="font-display text-2xl leading-none font-black">Bonjour{firstName ? ` ${firstName}` : ""}</div>
          <div className="mt-[3px] text-[12.5px] text-[var(--slate)] capitalize">{today}</div>
        </div>
        <div className="flex items-center gap-2.5">
          <button type="button" onClick={logout} className="text-xs font-semibold text-[var(--slate)] underline">Déconnexion</button>
          <span className="flex h-[38px] w-[38px] items-center justify-center rounded-full bg-[var(--turquoise)] font-display text-[15px] font-bold text-[#04262e]">{(firstName || "?").charAt(0).toUpperCase()}</span>
        </div>
      </div>

      <div className="mb-4 flex rounded-[40px] border border-[var(--border)] bg-[var(--input-bg)] p-[3px]">
        {(["jour", "semaine", "camion"] as const).map((v) => (
          <button key={v} type="button" onClick={() => setView(v)} className={`flex-1 rounded-[40px] p-[9px] font-display text-[13.5px] font-bold ${view === v ? "bg-[var(--navy-deep)] text-[var(--panel-fg)]" : "text-[var(--slate)]"}`}>
            {v === "jour" ? "Jour" : v === "semaine" ? "Semaine" : "Camion"}
          </button>
        ))}
      </div>

      {view === "jour" && (
        <div>
          {dayState === "closed" && (
            <div className="mb-4 flex items-start gap-2.5 rounded-2xl bg-[var(--good-bg)] px-4 py-3.5 text-[13px] font-semibold text-[var(--good)]">
              <CheckIcon className="mt-px h-[18px] w-[18px] flex-none" />
              <span>{closedText}</span>
            </div>
          )}

          {loading && <div className="py-6 text-center text-[13px] text-[var(--slate)]">Chargement de ta journée…</div>}

          {!loading && dayState === "idle" && checklist.length > 0 && (
            <div className="mb-[14px] rounded-[18px] border border-[var(--border)] bg-[var(--card)] p-[18px] shadow-[var(--shadow)]">
              <span className="mb-2 inline-block rounded-[40px] bg-[var(--good-bg)] px-2.5 py-1 text-[10.5px] font-bold tracking-[0.03em] text-[var(--good)] uppercase">À faire avant de commencer</span>
              <h3 className="mb-2 font-display text-[17px] font-extrabold">Checklist de départ</h3>
              <div className="flex flex-col gap-2">
                {checklist.map((item, idx) => (
                  <CheckRow key={item.id} label={item.label} checked={depChecked.has(idx)} onChange={() => setDepChecked(toggle(depChecked, idx))} />
                ))}
              </div>
              <div className="mt-2 text-center text-[11.5px] text-[var(--slate)]">{depDone ? "Checklist complète — prête à démarrer." : `${depChecked.size} / ${checklist.length} points validés.`}</div>
            </div>
          )}

          {dayState !== "closed" && (
            <div className="mb-[18px] rounded-[20px] bg-[var(--navy-deep)] px-5 py-[18px] text-[var(--panel-fg)] shadow-[var(--shadow)]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-display text-base font-extrabold">{dayState === "running" ? "Journée en cours" : "Journée pas encore démarrée"}</div>
                  <div className="mt-[3px] text-xs text-[var(--panel-fg-dim)]">{stops.length === 0 && !loading ? "Aucun arrêt planifié aujourd'hui" : `${stops.length} arrêts prévus aujourd'hui`}</div>
                </div>
                {dayState === "running" && <div className="font-display text-[26px] font-extrabold tabular-nums">{timerText}</div>}
              </div>
              {dayState === "idle" ? (
                <>
                  <div className="relative">
                    {!depDone && <span title="Checklist de départ requise" className="absolute top-0 right-2.5 z-[2] flex h-[22px] w-[22px] -translate-y-[40%] items-center justify-center rounded-full border-2 border-[var(--navy-deep)] bg-[var(--critical)] text-xs font-extrabold text-white shadow">!</span>}
                    <button type="button" disabled={!depDone || loading} onClick={startDay} className="mt-3.5 flex w-full items-center justify-center gap-2 rounded-[40px] bg-[var(--turquoise)] p-4 font-display text-[17px] font-bold text-[#04262e] disabled:cursor-not-allowed disabled:bg-white/[0.18] disabled:text-white/50">
                      <Icon className="h-[18px] w-[18px]" sw={2}><path d="M6 4 L20 12 L6 20 Z" /></Icon>
                      Démarrer ma journée
                    </button>
                  </div>
                  {!depDone && <div className="mt-2 text-center text-[11.5px] text-[var(--panel-fg-dim)]">Coche tous les points de la checklist de départ pour débloquer ta journée.</div>}
                </>
              ) : (
                <>
                  <button type="button" disabled={remaining > 0} onClick={closeDay} className="mt-3.5 flex w-full items-center justify-center gap-2 rounded-[40px] bg-[var(--panel-fg)] p-4 font-display text-[17px] font-bold text-[var(--navy-deep)] disabled:cursor-not-allowed disabled:bg-white/[0.18] disabled:text-white/50">
                    <Icon className="h-[18px] w-[18px]" sw={2}><rect x="4" y="4" width="16" height="16" rx="3" /></Icon>
                    Clôturer ma journée
                  </button>
                  {remaining > 0 && <div className="mt-2 text-center text-[11.5px] text-[var(--panel-fg-dim)]">{remaining} arrêt{remaining > 1 ? "s" : ""} restent à renseigner</div>}
                </>
              )}
            </div>
          )}

          <div className="mb-3 flex items-center justify-between px-0.5">
            <span className="text-[12.5px] font-bold">{doneCount} / {stops.length} traitées</span>
            <span className="mx-2.5 h-[7px] flex-1 overflow-hidden rounded-[5px] bg-[var(--todo-bg)]">
              <span className="block h-full rounded-[5px] bg-[var(--good)] transition-[width]" style={{ width: `${Math.round((doneCount / stops.length) * 100)}%` }} />
            </span>
          </div>

          <button type="button" onClick={() => setMapOpen((v) => !v)} className="mb-3 flex w-full items-center gap-[9px] rounded-[14px] border-[1.5px] border-[var(--border)] bg-[var(--card)] px-3.5 py-3 text-[13px] font-bold text-[var(--navy)] shadow-[var(--shadow)]">
            <Icon className="h-4 w-4 flex-none text-[var(--turquoise)]"><path d="M12 21 C 8 16.5, 5 13, 5 9.5 A7 7 0 0 1 19 9.5 C 19 13, 16 16.5, 12 21 Z" /><circle cx="12" cy="9.5" r="2.3" /></Icon>
            Voir l&apos;itinéraire du jour
            <Icon className={`ml-auto h-3.5 w-3.5 transition-transform ${mapOpen ? "rotate-180" : ""}`} sw={2}><path d="M6 9 L12 15 L18 9" /></Icon>
          </button>
          {mapOpen && (
            <div className="mb-3 rounded-[18px] border border-[var(--border)] bg-[var(--card)] p-3.5 shadow-[var(--shadow)]">
              <svg viewBox="0 0 360 260" className="block h-auto w-full">
                {pts.slice(0, -1).map((p, k) => (
                  <line key={k} x1={p.x} y1={p.y} x2={pts[k + 1].x} y2={pts[k + 1].y} stroke="var(--slate)" strokeWidth={2} strokeDasharray={k + 1 === breakIdx ? "5 5" : undefined} opacity={k + 1 === breakIdx ? 0.55 : 0.3} />
                ))}
                {pts.map((p) => {
                  const color = p.kind === "stock" ? "var(--stock-accent)" : p.kind === "dropoff" ? "var(--dropoff)" : p.kind === "exceptionnel" ? "var(--exc-accent)" : "var(--navy-deep)";
                  return (
                    <g key={p.num}>
                      <circle cx={p.x} cy={p.y} r={11} fill={color} stroke="var(--card)" strokeWidth={2} />
                      <text x={p.x} y={p.y + 3.5} fontSize={10} fontWeight={700} fill="#fff" textAnchor="middle">{p.num}</text>
                      <text x={p.x} y={p.y + 23} fontSize={8.5} fill="var(--slate)" textAnchor="middle">{p.name.length > 13 ? p.name.slice(0, 12) + "…" : p.name}</text>
                    </g>
                  );
                })}
              </svg>
              <p className="mt-2 text-[11px] leading-[1.4] text-[var(--slate)] italic">Carte schématique de l&apos;ordre de tournée (aperçu hors-ligne). L&apos;application utilisera une vraie carte Leaflet / OpenStreetMap avec les adresses réelles.</p>
            </div>
          )}

          <div className="flex flex-col gap-3">
            {stops.map((s, i) => {
              const done = s.status !== "todo";
              const badge = s.status === "collecte" ? (s.kind === "stock" ? "Pris" : s.kind === "dropoff" ? "Déposé" : "Collecté") : s.status === "annule" ? "Annulé" : "À faire";
              const borderCls = s.kind === "stock" ? "border-l-[3px] border-l-[var(--stock-accent)]" : s.kind === "dropoff" ? "border-l-[3px] border-l-[var(--dropoff)]" : s.kind === "exceptionnel" ? "border-l-[3px] border-l-[var(--exc-accent)]" : "";
              const iconCls = s.kind === "stock" ? "bg-[var(--stock-accent-bg)] text-[var(--stock-accent)]" : s.kind === "dropoff" ? "bg-[var(--dropoff-bg)] text-[var(--dropoff)]" : s.kind === "exceptionnel" ? "bg-[var(--exc-accent-bg)] text-[var(--exc-accent)]" : "bg-[var(--todo-bg)] text-[var(--slate)]";
              const badgeCls = s.status === "collecte" ? (s.kind === "dropoff" ? "bg-[var(--dropoff-bg)] text-[var(--dropoff)]" : "bg-[var(--good-bg)] text-[var(--good)]") : s.status === "annule" ? "bg-[var(--critical-bg)] text-[var(--critical)]" : "bg-[var(--todo-bg)] text-[var(--slate)]";
              const orderCls = s.status === "collecte" ? "bg-[var(--good-bg)] text-[var(--good)]" : s.status === "annule" ? "bg-[var(--critical-bg)] text-[var(--critical)]" : "bg-[var(--todo-bg)] text-[var(--navy)]";
              return (
                <div key={i}>
                  {i === breakIdx && (
                    <div className="mb-3 flex items-center gap-2.5 rounded-[14px] border-[1.5px] border-dashed border-[var(--border)] px-4 py-[11px] text-[var(--slate)]">
                      <Icon className="h-4 w-4 flex-none"><path d="M6 3 V7 M18 3 V7 M4 7 H20 L19 20 H5 Z" /></Icon>
                      <span>
                        <div className="text-[12.5px] font-bold text-[var(--navy)]">Pause déjeuner</div>
                        <div className="text-[11px]">12h30 – 13h30</div>
                      </span>
                    </div>
                  )}
                  <div className={`rounded-[18px] border border-[var(--border)] bg-[var(--card)] px-4 py-3.5 shadow-[var(--shadow)] ${borderCls}`}>
                    <div
                      className="flex cursor-pointer items-center gap-3"
                      onClick={() => {
                        if (dayState !== "running") {
                          if (dayState === "idle") showToast("Démarrez votre journée pour saisir une collecte.");
                          return;
                        }
                        if (!done) setOpenIdx(openIdx === i ? null : i);
                      }}
                    >
                      <span className="flex flex-none flex-col items-center gap-[5px]">
                        <span className={`flex h-[26px] w-[26px] items-center justify-center rounded-full font-display text-[12.5px] font-extrabold ${orderCls}`}>{i + 1}</span>
                        <span className={`flex h-5 w-5 items-center justify-center rounded-full ${iconCls}`}>
                          <Icon>{CAT_PATHS[s.cat] || CAT_PATHS.default}</Icon>
                        </span>
                      </span>
                      <span className="min-w-0 flex-1">
                        <div className="text-[11.5px] font-bold text-[var(--slate)]">{s.time}</div>
                        <div className="truncate text-[14.5px] font-bold text-[var(--navy)]">{s.name}</div>
                        <div className="text-[11.5px] text-[var(--slate)]">{s.cat}</div>
                      </span>
                      <span className={`rounded-[40px] px-[9px] py-[5px] text-[10.5px] font-bold tracking-[0.02em] whitespace-nowrap uppercase ${badgeCls}`}>{badge}</span>
                      {!done && dayState !== "closed" && (
                        <Icon className={`h-4 w-4 flex-none text-[var(--slate)] transition-transform ${openIdx === i ? "rotate-180" : ""}`} sw={2}><path d="M6 9 L12 15 L18 9" /></Icon>
                      )}
                    </div>

                    <div className="mt-2.5 flex items-center gap-2 border-t border-[var(--border)] pt-2.5">
                      <span className="flex min-w-0 flex-1 items-center gap-[5px] text-[11.5px] text-[var(--slate)]">
                        <Icon className="h-3 w-3 flex-none"><path d="M12 21 C 8 16.5, 5 13, 5 9.5 A7 7 0 0 1 19 9.5 C 19 13, 16 16.5, 12 21 Z" /><circle cx="12" cy="9.5" r="2.3" /></Icon>
                        <span className="truncate">{s.address}</span>
                      </span>
                      <a href={`https://www.google.com/maps?q=${encodeURIComponent(s.address)}`} target="_blank" rel="noopener noreferrer" className="flex flex-none items-center gap-[5px] rounded-[40px] border-[1.3px] border-[var(--border)] px-[11px] py-1.5 text-[11.5px] font-bold whitespace-nowrap text-[var(--navy)] hover:border-[var(--turquoise)] hover:text-[var(--turquoise)]">
                        <Icon className="h-3 w-3" sw={2}><path d="M7 17 L17 7 M9 7 H17 V15" /></Icon>
                        Y aller
                      </a>
                    </div>
                    {s.comment && (
                      <div className="mt-2 flex items-start gap-[7px] rounded-[10px] bg-[var(--exc-accent-bg)] px-[11px] py-[9px] text-xs leading-[1.45] text-[var(--navy)]">
                        <Icon className="mt-px h-3.5 w-3.5 flex-none text-[var(--exc-accent)]"><path d="M4 5 H20 V16 H9 L5 19 V16 H4 Z" /></Icon>
                        <span>{s.comment}</span>
                      </div>
                    )}
                    {s.accessDetails && (
                      <>
                        <button type="button" onClick={() => setAccessOpen(toggle(accessOpen, i))} className="mt-1.5 flex w-full items-center gap-2 text-left text-[11.5px] font-semibold text-[var(--slate)]">
                          {s.access.length > 0 && (
                            <span className="flex gap-[5px]">
                              {s.access.map((a) => (
                                <span key={a} title={ACCESS_LABELS[a]}><Icon>{ACCESS_PATHS[a]}</Icon></span>
                              ))}
                            </span>
                          )}
                          <span>Conditions d&apos;accès</span>
                          <Icon className={`ml-auto h-[13px] w-[13px] ${accessOpen.has(i) ? "rotate-180" : ""}`} sw={2}><path d="M6 9 L12 15 L18 9" /></Icon>
                        </button>
                        {accessOpen.has(i) && <div className="mt-[7px] rounded-[10px] border border-[var(--border)] bg-[var(--input-bg)] px-[11px] py-[9px] text-[11.5px] leading-[1.5] text-[var(--slate)]">{s.accessDetails}</div>}
                      </>
                    )}
                    {s.status === "collecte" && <div className="mt-2 border-t border-[var(--border)] pt-2 text-xs text-[var(--slate)]">{summary(s)}</div>}
                    {s.status === "annule" && <div className="mt-2 border-t border-[var(--border)] pt-2 text-xs text-[var(--slate)]">Motif : <strong className="text-[var(--navy)]">{s.result?.motif || "annulé depuis le planning"}</strong></div>}

                    {!done && dayState === "running" && openIdx === i && <StopPanel stops={stops} index={i} onDone={(r, st) => finishStop(i, r, st)} />}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {view === "semaine" && (
        <div className="flex flex-col gap-2.5">
          {week.map((w, idx) => {
            const list = w.status === "today" ? todayWeekStops : w.stops;
            const expanded = weekOpen === idx;
            return (
              <div key={idx}>
                <div
                  onClick={() => (w.status === "today" ? setView("jour") : setWeekOpen(expanded ? null : idx))}
                  className={`flex cursor-pointer items-center gap-3.5 border border-[var(--border)] bg-[var(--card)] px-4 py-3.5 ${expanded ? "rounded-t-2xl border-b-transparent" : "rounded-2xl shadow-[var(--shadow)]"} ${w.status !== "today" ? "opacity-55" : ""}`}
                >
                  <div className="w-11 flex-none text-center">
                    <div className="text-[10.5px] font-bold text-[var(--slate)] uppercase">{w.dow}</div>
                    <div className="font-display text-xl font-black text-[var(--navy)]">{w.dom}</div>
                  </div>
                  <div className="flex-1">
                    <div className="text-[13.5px] font-bold text-[var(--navy)]">{w.title}</div>
                    <div className="mt-0.5 text-[11.5px] text-[var(--slate)]">{list.length} arrêt(s) prévu(s)</div>
                  </div>
                  <span className={`rounded-[40px] px-2.5 py-[5px] text-[10.5px] font-bold uppercase ${w.status === "today" ? "bg-[var(--turquoise)] text-[#04262e]" : "bg-[var(--todo-bg)] text-[var(--slate)]"}`}>
                    {w.status === "today" ? "Aujourd'hui" : w.status === "past" ? "Terminée" : "À venir"}
                  </span>
                </div>
                {expanded && (
                  <div className="-mt-px flex flex-col rounded-b-2xl border border-t-0 border-[var(--border)] bg-[var(--card)] px-4 pt-1.5 pb-3.5 shadow-[var(--shadow)]">
                    <p className="mt-0.5 mb-2 text-[11px] text-[var(--slate)] italic">Lecture seule — clôturez la journée en cours pour déverrouiller cette tournée.</p>
                    {list.map((st, k) => (
                      <div key={k} className="flex items-center gap-3.5 border-t border-[var(--border)] py-[9px] text-[13px] text-[var(--slate)] first-of-type:border-t-0">
                        <span className="w-[42px] flex-none font-bold text-[var(--navy)] tabular-nums">{st.t}</span>
                        <span className="flex h-[22px] w-[22px] flex-none items-center justify-center rounded-full bg-[var(--todo-bg)] text-[var(--slate)]">
                          <Icon>{CAT_PATHS[st.c] || CAT_PATHS.default}</Icon>
                        </span>
                        <span className="flex-1 truncate font-semibold text-[var(--navy)]">{st.n}</span>
                        <span className="flex-none text-[11.5px]">{st.c}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {view === "camion" && (
        <div>
          <p className="mb-3 text-[12.5px] leading-[1.5] text-[var(--slate)]">Suivi de l&apos;entretien du camion. Tour complet en photo tous les lundis, comme un état des lieux de location, plus un contrôle d&apos;usage courant.</p>
          <div className="mb-4 flex items-center gap-2.5 rounded-[14px] bg-[var(--navy-deep)] px-3.5 py-[11px] text-[12.5px] text-[var(--panel-fg)]">
            <Icon className="h-5 w-5 flex-none" sw={1.7}><path d="M2 16 V8.5 L5 5 H12 V16" /><path d="M12 9 H16 L19.5 12.5 V16" /><path d="M1 16 H21" /><circle cx="6.5" cy="16" r="2.2" /><circle cx="16.5" cy="16" r="2.2" /></Icon>
            <span>{vehicle ? <><strong>{vehicle.name}</strong>{vehicle.plate ? ` — ${vehicle.plate}` : ""} · véhicule de la flotte</> : "Aucun véhicule enregistré pour l'instant (ajoutez-en un dans Flotte)."}</span>
          </div>

          <div className="mb-3.5 rounded-[18px] border border-[var(--border)] bg-[var(--card)] p-[18px] shadow-[var(--shadow)]">
            <span className="mb-2 inline-block rounded-[40px] bg-[var(--good-bg)] px-2.5 py-1 text-[10.5px] font-bold tracking-[0.03em] text-[var(--good)] uppercase">Cette semaine</span>
            <h3 className="mb-1 font-display text-[17px] font-extrabold">État des lieux du lundi</h3>
            <p className="mb-3.5 text-xs leading-[1.5] text-[var(--slate)]">Semaine du {week[0].dom} — à faire en début de semaine. Aucune photo n&apos;est requise le reste de la semaine.</p>
            {truckDone ? (
              <div className="flex items-center gap-2.5 rounded-[14px] bg-[var(--good-bg)] px-[15px] py-[13px] text-[13px] font-semibold text-[var(--good)]">
                <CheckIcon className="h-[18px] w-[18px] flex-none" />
                <span>{truckDone}</span>
              </div>
            ) : (
              <>
                <div className="mb-3.5 grid grid-cols-3 gap-2.5">
                  {TRUCK_SLOTS.map((slot, idx) => {
                    const filled = truckPhotos.has(idx);
                    return (
                      <div key={slot.key} className="flex flex-col items-center gap-1.5">
                        <button type="button" onClick={() => setTruckPhotos(new Set(truckPhotos).add(idx))} className={`flex aspect-[4/3] w-full items-center justify-center rounded-xl border-[1.5px] ${filled ? "border-solid border-transparent bg-gradient-to-br from-[var(--turquoise)] to-[var(--navy-deep)] text-white" : "border-dashed border-[var(--border)] bg-[var(--input-bg)] text-[var(--slate)]"}`}>
                          {filled ? <CheckIcon className="h-5 w-5" /> : <CameraIcon className="h-5 w-5" />}
                        </button>
                        <span className="text-center text-[10.5px] leading-[1.2] font-bold text-[var(--navy)]">{slot.label}</span>
                      </div>
                    );
                  })}
                </div>
                <button
                  type="button"
                  disabled={truckPhotos.size !== TRUCK_SLOTS.length}
                  onClick={() => {
                    const now = new Date();
                    setTruckDone(`État des lieux validé à ${pad(now.getHours())}:${pad(now.getMinutes())} — 6 photos enregistrées (avant, arrière, côtés, cabine, benne).`);
                    showToast("État des lieux du camion enregistré.");
                  }}
                  className="w-full rounded-[40px] bg-[var(--good)] p-3 font-display text-[14.5px] font-bold text-white disabled:opacity-50"
                >
                  Valider l&apos;état du camion
                </button>
                <div className="mt-2 text-center text-[11.5px] text-[var(--slate)]">
                  {truckPhotos.size === TRUCK_SLOTS.length ? "Photos complètes — vous pouvez valider l'état du camion." : `${truckPhotos.size} / ${TRUCK_SLOTS.length} photos prises.`}
                </div>
              </>
            )}
          </div>

          <div className="mb-3.5 rounded-[18px] border border-[var(--border)] bg-[var(--card)] p-[18px] shadow-[var(--shadow)]">
            <span className="mb-2 inline-block rounded-[40px] bg-[var(--todo-bg)] px-2.5 py-1 text-[10.5px] font-bold tracking-[0.03em] text-[var(--slate)] uppercase">Contrôle d&apos;usage</span>
            <h3 className="mb-1 font-display text-[17px] font-extrabold">Entretien courant</h3>
            <p className="mb-3.5 text-xs leading-[1.5] text-[var(--slate)]">À vérifier chaque lundi en même temps que le tour photo.</p>
            <div className="flex flex-col gap-2">
              {TRUCK_CHECKS.map((label, idx) => <CheckRow key={idx} label={label} checked={checks.has(idx)} onChange={() => setChecks(toggle(checks, idx))} />)}
            </div>
          </div>

          <div className="mb-3.5 rounded-[18px] border border-[var(--border)] bg-[var(--card)] p-[18px] shadow-[var(--shadow)]">
            <span className="mb-2 inline-block rounded-[40px] bg-[var(--todo-bg)] px-2.5 py-1 text-[10.5px] font-bold tracking-[0.03em] text-[var(--slate)] uppercase">Suivi garage</span>
            <h3 className="mb-1 font-display text-[17px] font-extrabold">Révisions programmées</h3>
            <p className="mb-3.5 text-xs leading-[1.5] text-[var(--slate)]">Coché par l&apos;admin ou le logisticien une fois la révision effectuée en garage.</p>
            <div className="flex flex-col gap-2">
              {TRUCK_REVISIONS.map((r, idx) => <CheckRow key={idx} label={r.label} sub={r.sub} checked={revisions.has(idx)} onChange={() => setRevisions(toggle(revisions, idx))} />)}
            </div>
          </div>

          <div className="mb-3.5 rounded-[18px] border border-[var(--border)] bg-[var(--card)] p-[18px] shadow-[var(--shadow)]">
            <span className="mb-2 inline-block rounded-[40px] bg-[var(--todo-bg)] px-2.5 py-1 text-[10.5px] font-bold tracking-[0.03em] text-[var(--slate)] uppercase">Frais camion</span>
            <h3 className="mb-1 font-display text-[17px] font-extrabold">Tickets &amp; factures</h3>
            <p className="mb-3.5 text-xs leading-[1.5] text-[var(--slate)]">Carburant, lavage, petites réparations… prenez le ticket en photo, il remonte dans la fiche véhicule de l&apos;admin.</p>
            <div className="mb-2.5 flex flex-wrap gap-2">
              {Array.from({ length: receipts }, (_, k) => (
                <div key={k} className="flex w-14 flex-col items-center gap-1">
                  <div className={thumbCls}><CameraIcon /></div>
                  <input type="number" placeholder="€" className="w-14 rounded-lg border border-[var(--border)] bg-[var(--input-bg)] px-0.5 py-[3px] text-center text-[10.5px] text-[var(--navy)]" />
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => {
                setReceipts((n) => n + 1);
                showToast("Ticket ajouté — il apparaîtra dans la fiche véhicule (Flotte) côté admin.");
              }}
              className="flex h-14 w-14 items-center justify-center rounded-xl border-[1.5px] border-dashed border-[var(--border)] bg-[var(--input-bg)] text-[var(--slate)]"
            >
              <CameraIcon />
            </button>
          </div>
        </div>
      )}

      {toast && <div className="fixed right-[18px] bottom-[18px] left-[18px] z-50 mx-auto max-w-[424px] rounded-[14px] bg-[var(--navy-deep)] px-4 py-3 text-center text-[12.5px] font-semibold text-[var(--panel-fg)] shadow-[var(--shadow)]">{toast}</div>}
    </div>
  );
}
