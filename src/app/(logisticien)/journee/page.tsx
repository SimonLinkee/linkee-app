"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { signedUrls, uploadPrivatePhoto } from "@/lib/photos";
import { geocode } from "@/lib/geocode";
import NotificationBell from "@/components/NotificationBell";
import dynamic from "next/dynamic";
import type { MapPoint } from "@/components/RouteMap";

const RouteMap = dynamic(() => import("@/components/RouteMap"), {
  ssr: false,
  loading: () => <div className="flex h-[300px] items-center justify-center text-[12.5px] text-[var(--slate)]">Chargement de la carte…</div>,
});

type Kind = "partner" | "dropoff" | "stock" | "exceptionnel";
type ResultItem = { denree?: string; name?: string; kg: number; from?: string; sourceId?: string; stockId?: string; colis?: number };
type StopResult = { items?: ResultItem[]; totalKg?: number; photos?: number; photoPaths?: string[]; motif?: string };
type ChecklistItem = { id: string; label: string };
type Rel = { name: string; category: string | null; address: string | null; fiche: Record<string, unknown> | null; photo_url?: string | null };
type DbItem = { denree: string | null; name: string | null; kg: number; source_collecte_id: string | null };
type DbStop = {
  id: string;
  kind: string;
  label: string | null;
  comment: string | null;
  status: string;
  motif: string | null;
  photos_count: number;
  photo_paths: string[] | null;
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
  sitePhoto?: string;
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
    sitePhoto: one(r.partners)?.photo_url || undefined,
    comment: r.comment || undefined,
    allowedTypes: kind === "dropoff" ? Object.entries(fiche.denrees ?? {}).filter(([, on]) => on).map(([k]) => k) : undefined,
    result:
      status === "collecte"
        ? { items, totalKg: Math.round(items.reduce((s, it) => s + it.kg, 0) * 10) / 10, photos: r.photo_paths?.length || r.photos_count, photoPaths: r.photo_paths ?? [] }
        : status === "annule"
          ? { motif: r.motif ?? "" }
          : undefined,
  };
}

const TRUCK_SLOTS = [
  { key: "front", label: "Face avant" }, { key: "back", label: "Face arrière" }, { key: "left", label: "Côté gauche" },
  { key: "right", label: "Côté droit" }, { key: "cabin", label: "Intérieur cabine" }, { key: "hold", label: "Intérieur benne" },
];
// keys match the checks / revisions of the fleet sheet (Flotte)
const TRUCK_CHECKS = [
  { key: "huile", label: "Niveau d'huile moteur" },
  { key: "liquide", label: "Niveau de liquide de refroidissement" },
  { key: "pneus", label: "Pression des pneus" },
  { key: "laveglace", label: "Niveau de lave-glace" },
  { key: "eclairage", label: "Éclairage / clignotants" },
];
const TRUCK_REVISIONS = [
  { key: "rev1m", label: "Révision 1 mois (garage)" },
  { key: "rev3m", label: "Révision 3 mois (garage)" },
  { key: "karcher", label: "Grand nettoyage (Kärcher + aspirateur)" },
];
type Receipt = { id: string; amount: string; preview: string };

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

/** A clearly delimited step of a form: numbered badge, title, short help text. */
function StepBlock({ n, title, sub, children }: { n: number; title: string; sub?: string; children: ReactNode }) {
  return (
    <section className="rounded-[18px] border-2 border-[var(--border)] bg-[var(--card)] p-4 shadow-[var(--shadow)]">
      <div className="mb-3 flex items-start gap-2.5">
        <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-[var(--navy-deep)] font-display text-[14px] font-black text-[var(--panel-fg)]">{n}</span>
        <div className="min-w-0">
          <h4 className="font-display text-[16px] leading-tight font-extrabold text-[var(--navy)]">{title}</h4>
          {sub && <p className="mt-0.5 text-[11.5px] leading-[1.4] text-[var(--slate)]">{sub}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

/** Real camera / gallery picker: thumbnails of the chosen photos + a big "take a photo" button. */
function PhotoField({ previews, busy, onPick }: { previews: string[]; busy: boolean; onPick: (file: File) => void }) {
  return (
    <div>
      {previews.length > 0 && (
        <div className="mb-2.5 flex flex-wrap gap-2">
          {previews.map((src, k) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={k} src={src} alt="" className="h-16 w-16 flex-none rounded-xl object-cover" />
          ))}
        </div>
      )}
      <div>
        <label className={`flex min-h-[56px] w-full cursor-pointer items-center justify-center gap-2.5 rounded-2xl border-2 border-dashed border-[var(--turquoise)] bg-[var(--input-bg)] px-4 py-3 text-[14px] font-bold text-[var(--navy)] ${busy ? "opacity-50" : ""}`}>
          {busy ? <span>Envoi de la photo…</span> : (<><CameraIcon className="h-6 w-6 text-[var(--turquoise)]" />{previews.length ? "Ajouter une autre photo" : "Prendre une photo"}</>)}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) onPick(f);
            }}
          />
        </label>
      </div>
    </div>
  );
}

function StopPanel({ stops, index, onDone, onUpload }: { stops: Stop[]; index: number; onDone: (r: StopResult, status: "collecte" | "annule") => void; onUpload: (stopId: string, file: File) => Promise<string | null> }) {
  const s = stops[index];
  const [pick, setPick] = useState<"collecte" | "annule" | null>(null);
  const [rows, setRows] = useState<{ denree: string; kg: string }[]>([{ denree: "", kg: "" }]);
  const [photoPaths, setPhotoPaths] = useState<string[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [photoBusy, setPhotoBusy] = useState(false);
  const photos = photoPaths.length;
  async function addPhoto(file: File) {
    setPhotoBusy(true);
    const path = await onUpload(s.id, file);
    setPhotoBusy(false);
    if (path) {
      setPhotoPaths((p) => [...p, path]);
      setPreviews((p) => [...p, URL.createObjectURL(file)]);
    }
  }
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
      onDone({ items, totalKg: Math.round(items.reduce((sum, it) => sum + it.kg, 0) * 100) / 100, photos, photoPaths }, "collecte");
    } else if (s.kind === "dropoff") {
      const dropped: ResultItem[] = [];
      dropChecked.forEach((key) => {
        const [p, it] = key.split(":").map(Number);
        const src = stops[p].result!.items![it];
        dropped.push({ denree: src.denree, kg: src.kg, from: stops[p].name, sourceId: stops[p].id });
      });
      if (dropped.length < 1 || photos < 1) return setErrCollecte("Cochez au moins un produit à laisser ici, et ajoutez une photo.");
      onDone({ items: dropped, totalKg: Math.round(dropped.reduce((sum, it) => sum + it.kg, 0) * 10) / 10, photos, photoPaths }, "collecte");
    } else {
      const items = rows.filter((r) => r.denree && r.kg).map((r) => ({ denree: r.denree, kg: parseFloat(r.kg) }));
      if (rows.some((r) => (r.denree && !r.kg) || (!r.denree && r.kg))) return setErrCollecte("Pour chaque denrée, choisissez le type ET indiquez le poids.");
      if (items.length < 1) return setErrCollecte("Choisissez au moins un type de denrée et son poids (étape 1).");
      if (photos < 1) return setErrCollecte("Ajoutez une photo (étape 2).");
      onDone({ items, totalKg: Math.round(items.reduce((sum, it) => sum + it.kg, 0) * 10) / 10, photos, photoPaths }, "collecte");
    }
  }

  return (
    <div className="mt-3.5 border-t border-[var(--border)] pt-3.5">
      <div className="mb-2 text-[12px] font-bold text-[var(--slate)]">Où en est cet arrêt ?</div>
      <div className="flex gap-2.5">
        <button type="button" onClick={() => setPick("collecte")} className={`flex min-h-[56px] flex-1 items-center justify-center gap-2 rounded-2xl border-2 p-3 text-[15px] font-bold ${pick === "collecte" ? "border-[var(--good)] bg-[var(--good-bg)] text-[var(--good)]" : "border-[var(--border)] bg-[var(--card)] text-[var(--navy)]"}`}>
          <CheckIcon className="h-5 w-5" />
          {okLabel}
        </button>
        <button type="button" onClick={() => setPick("annule")} className={`flex min-h-[56px] flex-1 items-center justify-center gap-2 rounded-2xl border-2 p-3 text-[15px] font-bold ${pick === "annule" ? "border-[var(--critical)] bg-[var(--critical-bg)] text-[var(--critical)]" : "border-[var(--border)] bg-[var(--card)] text-[var(--navy)]"}`}>
          <CloseIcon className="h-5 w-5" />
          Annulé
        </button>
      </div>

      {pick === "collecte" && (
        <div className="mt-3.5 flex flex-col gap-3.5">
          <StepBlock
            n={1}
            title={s.kind === "stock" ? "Que prenez-vous au stock ?" : s.kind === "dropoff" ? "Que laissez-vous ici ?" : "Qu'avez-vous collecté ?"}
            sub={s.kind === "stock" ? "Indiquez le nombre de colis pour chaque produit." : s.kind === "dropoff" ? "Cochez les produits déposés. Seuls les types acceptés par l'association sont sélectionnables." : "Une carte par type de denrée : choisissez le type, puis le poids."}
          >
          {s.kind === "partner" || s.kind === "exceptionnel" ? (
            <div>
              <div className="flex flex-col gap-3">
                {rows.map((row, idx) => (
                  <div key={idx} className="rounded-2xl border-2 border-[var(--border)] bg-[var(--input-bg)] p-3.5">
                    <div className="mb-2.5 flex items-center justify-between">
                      <span className="font-display text-[12.5px] font-extrabold tracking-[0.04em] text-[var(--slate)] uppercase">Denrée n°{idx + 1}</span>
                      {rows.length > 1 && (
                        <button type="button" onClick={() => setRows(rows.filter((_, i) => i !== idx))} className="flex items-center gap-1 rounded-full border-[1.5px] border-[var(--border)] bg-[var(--card)] px-2.5 py-1 text-[11.5px] font-bold text-[var(--slate)] hover:border-[var(--critical)] hover:text-[var(--critical)]">
                          <CloseIcon className="h-3 w-3" />
                          Retirer
                        </button>
                      )}
                    </div>
                    <div className="mb-1.5 text-[12px] font-bold text-[var(--navy)]">Type de denrée</div>
                    <div className="mb-3.5 grid grid-cols-2 gap-2">
                      {DENREE_OPTIONS.map((d, k) => {
                        const on = row.denree === d;
                        return (
                          <button
                            key={d}
                            type="button"
                            onClick={() => setRows(rows.map((r, i) => (i === idx ? { ...r, denree: d } : r)))}
                            className={`flex min-h-[48px] items-center gap-2 rounded-xl border-2 px-3 py-2.5 text-left text-[13px] leading-tight font-bold ${k === DENREE_OPTIONS.length - 1 ? "col-span-2" : ""} ${on ? "border-[var(--navy-deep)] bg-[var(--navy-deep)] text-[var(--panel-fg)]" : "border-[var(--border)] bg-[var(--card)] text-[var(--navy)]"}`}
                          >
                            <span className="h-3 w-3 flex-none rounded-full" style={{ background: `var(--cat-${k + 1})` }} />
                            <span className="flex-1">{d}</span>
                            {on && <CheckIcon className="h-4 w-4 flex-none" />}
                          </button>
                        );
                      })}
                    </div>
                    <div className="mb-1.5 text-[12px] font-bold text-[var(--navy)]">Poids</div>
                    <div className="flex items-center gap-2">
                      <button type="button" aria-label="Moins 1 kg" onClick={() => setRows(rows.map((r, i) => (i === idx ? { ...r, kg: String(Math.max(0, (parseFloat(r.kg) || 0) - 1)) } : r)))} className="flex h-12 w-12 flex-none items-center justify-center rounded-xl border-2 border-[var(--border)] bg-[var(--card)] text-2xl font-bold text-[var(--navy)]">
                        –
                      </button>
                      <div className="relative min-w-0 flex-1">
                        <input
                          type="number"
                          inputMode="decimal"
                          min={0}
                          step={0.5}
                          placeholder="0"
                          value={row.kg}
                          onChange={(e) => setRows(rows.map((r, i) => (i === idx ? { ...r, kg: e.target.value } : r)))}
                          className="w-full rounded-xl border-2 border-[var(--border)] bg-[var(--card)] py-2.5 pr-11 pl-3 text-center font-display text-[26px] font-black text-[var(--navy)] outline-none focus:border-[var(--turquoise)]"
                        />
                        <span className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-sm font-bold text-[var(--slate)]">kg</span>
                      </div>
                      <button type="button" aria-label="Plus 1 kg" onClick={() => setRows(rows.map((r, i) => (i === idx ? { ...r, kg: String((parseFloat(r.kg) || 0) + 1) } : r)))} className="flex h-12 w-12 flex-none items-center justify-center rounded-xl border-2 border-[var(--border)] bg-[var(--card)] text-2xl font-bold text-[var(--navy)]">
                        +
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <button type="button" onClick={() => setRows([...rows, { denree: "", kg: "" }])} className="mt-3 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[var(--turquoise)] bg-[var(--input-bg)] p-2.5 text-[14px] font-bold text-[var(--navy)]">
                <span className="text-lg leading-none text-[var(--turquoise)]">+</span> Ajouter une autre denrée
              </button>
              <div className="mt-3 flex items-center justify-between rounded-xl bg-[var(--track)] px-4 py-2.5">
                <span className="text-[12.5px] font-bold text-[var(--slate)]">Total collecté</span>
                <span className="font-display text-[20px] font-black text-[var(--navy)]">{Math.round(rows.reduce((sum, r) => sum + (parseFloat(r.kg) || 0), 0) * 10) / 10} kg</span>
              </div>
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
          </StepBlock>
          <StepBlock n={2} title="Prenez une photo" sub={s.kind === "stock" ? "Une photo de ce que vous chargez suffit." : "Une seule photo suffit pour valider, quel que soit le nombre de denrées."}>
            <PhotoField previews={previews} busy={photoBusy} onPick={addPhoto} />
          </StepBlock>
          {errCollecte && <div className="rounded-xl bg-[var(--critical-bg)] px-3.5 py-2.5 text-[12.5px] font-semibold text-[var(--critical)]">{errCollecte}</div>}
          <button type="button" onClick={validateCollecte} className="min-h-[56px] rounded-[40px] bg-[var(--good)] px-4 py-3.5 font-display text-[16px] font-bold text-white">
            {s.kind === "stock" ? "Valider la sortie de stock" : s.kind === "dropoff" ? "Valider la dépose" : "Valider la collecte"}
          </button>
        </div>
      )}

      {pick === "annule" && (
        <div className="mt-3.5 flex flex-col gap-3.5">
          <StepBlock n={1} title="Pourquoi cet arrêt est annulé ?" sub="Le motif est transmis à l'équipe.">
            <textarea value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="Ex : commerce fermé, personne sur place…" className={`${fieldCls} min-h-[90px] resize-y text-[15px]`} />
          </StepBlock>
          {errAnnule && <div className="rounded-xl bg-[var(--critical-bg)] px-3.5 py-2.5 text-[12.5px] font-semibold text-[var(--critical)]">{errAnnule}</div>}
          <button
            type="button"
            onClick={() => (motif.trim() ? onDone({ motif: motif.trim() }, "annule") : setErrAnnule("Le motif d'annulation est obligatoire."))}
            className="min-h-[56px] rounded-[40px] bg-[var(--critical)] px-4 py-3.5 font-display text-[16px] font-bold text-white"
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
  const [vehicle, setVehicle] = useState<{ id: string; name: string; plate: string | null } | null>(null);
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const [depChecked, setDepChecked] = useState<Set<number>>(new Set());
  const [mapOpen, setMapOpen] = useState(false);
  const [accessOpen, setAccessOpen] = useState<Set<number>>(new Set());
  const [elapsed, setElapsed] = useState(0);
  const [closedText, setClosedText] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [weekOpen, setWeekOpen] = useState<number | null>(null);
  const [truckPaths, setTruckPaths] = useState<(string | null)[]>(TRUCK_SLOTS.map(() => null));
  const [truckPreviews, setTruckPreviews] = useState<(string | null)[]>(TRUCK_SLOTS.map(() => null));
  const [truckBusy, setTruckBusy] = useState<number | null>(null);
  const [truckDone, setTruckDone] = useState<string | null>(null);
  const [doneChecks, setDoneChecks] = useState<Record<string, string>>({}); // key -> vehicle_events.id (this week)
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const truckPhotoCount = truckPaths.filter(Boolean).length;
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
          .select("id,kind,label,comment,status,motif,photos_count,photo_paths,scheduled_time,partners(name,category,address,fiche,photo_url),beneficiaries(name,category,address,fiche),collecte_items!collecte_id(denree,name,kg,source_collecte_id)")
          .eq("scheduled_date", iso)
          .order("sort_order"),
        supabase.from("checklist_templates").select("items").eq("weekday", dbWeekday(now)).maybeSingle(),
        supabase.from("checklist_overrides").select("items").eq("day", iso).maybeSingle(),
        supabase.from("stock_items").select("id,name,colis,upc,grammage").gt("colis", 0).order("name"),
        supabase.from("vehicles").select("id,name,plate").limit(1).maybeSingle(),
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
      setVehicle((veh.data as { id: string; name: string; plate: string | null } | null) ?? null);
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
  async function uploadStopPhoto(stopId: string, file: File): Promise<string | null> {
    if (!cityId) {
      showToast("Compte sans ville : contacte l'administrateur.");
      return null;
    }
    try {
      return await uploadPrivatePhoto(supabase, `${cityId}/${stopId}`, file);
    } catch (e) {
      showToast("Photo non envoyée : " + (e as Error).message);
      return null;
    }
  }
  /* ---------- camion: this week's declarations (tour photos, checks, receipts) ---------- */
  useEffect(() => {
    if (!vehicle) return;
    (async () => {
      const monday = new Date(now);
      monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
      monday.setHours(0, 0, 0, 0);
      const { data } = await supabase.from("vehicle_events").select("id,kind,key,amount,photos,created_at").eq("vehicle_id", vehicle.id).gte("created_at", monday.toISOString()).order("created_at");
      const rows = (data ?? []) as { id: string; kind: string; key: string | null; amount: number | null; photos: string[]; created_at: string }[];
      const map: Record<string, string> = {};
      rows.filter((r) => r.kind === "check" && r.key).forEach((r) => (map[r.key!] = r.id));
      setDoneChecks(map);
      const tour = rows.find((r) => r.kind === "tour");
      if (tour) setTruckDone(`État des lieux validé le ${new Date(tour.created_at).toLocaleDateString("fr-FR", { weekday: "long", hour: "2-digit", minute: "2-digit" })} — ${tour.photos.length} photos enregistrées.`);
      const rc = rows.filter((r) => r.kind === "receipt");
      const urls = await signedUrls(supabase, rc.map((r) => r.photos[0] ?? ""));
      setReceipts(rc.map((r, i) => ({ id: r.id, amount: r.amount != null ? String(r.amount) : "", preview: urls[i] ?? "" })));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicle?.id]);

  function needVehicle() {
    if (!vehicle || !cityId) {
      showToast("Aucun véhicule enregistré : l'admin doit d'abord en ajouter un dans Flotte.");
      return false;
    }
    return true;
  }
  async function pickTruckPhoto(idx: number, file: File) {
    if (!needVehicle()) return;
    setTruckBusy(idx);
    try {
      const path = await uploadPrivatePhoto(supabase, `${cityId}/vehicle`, file);
      setTruckPaths((p) => p.map((x, i) => (i === idx ? path : x)));
      setTruckPreviews((p) => p.map((x, i) => (i === idx ? URL.createObjectURL(file) : x)));
    } catch (e) {
      showToast("Photo non envoyée : " + (e as Error).message);
    }
    setTruckBusy(null);
  }
  async function validateTruck() {
    if (!needVehicle()) return;
    const { error } = await supabase.from("vehicle_events").insert({ city_id: cityId, vehicle_id: vehicle!.id, kind: "tour", photos: truckPaths.filter(Boolean), created_by: userId });
    if (error) return showToast("Enregistrement impossible : " + error.message);
    const n = new Date();
    setTruckDone(`État des lieux validé à ${pad(n.getHours())}:${pad(n.getMinutes())} — ${truckPhotoCount} photos enregistrées.`);
    showToast("État des lieux du camion enregistré.");
  }
  async function toggleCheck(key: string) {
    if (!needVehicle()) return;
    const existing = doneChecks[key];
    if (existing) {
      const { error } = await supabase.from("vehicle_events").delete().eq("id", existing);
      if (error) return showToast("Modification impossible : " + error.message);
      setDoneChecks((m) => {
        const c = { ...m };
        delete c[key];
        return c;
      });
    } else {
      const { data, error } = await supabase.from("vehicle_events").insert({ city_id: cityId, vehicle_id: vehicle!.id, kind: "check", key, created_by: userId }).select("id").single();
      if (error || !data) return showToast("Enregistrement impossible : " + (error?.message ?? "erreur"));
      setDoneChecks((m) => ({ ...m, [key]: data.id as string }));
    }
  }
  async function addReceipt(file: File) {
    if (!needVehicle()) return;
    try {
      const path = await uploadPrivatePhoto(supabase, `${cityId}/vehicle`, file);
      const { data, error } = await supabase.from("vehicle_events").insert({ city_id: cityId, vehicle_id: vehicle!.id, kind: "receipt", photos: [path], created_by: userId }).select("id").single();
      if (error || !data) return showToast("Ticket non enregistré : " + (error?.message ?? "erreur"));
      setReceipts((r) => [...r, { id: data.id as string, amount: "", preview: URL.createObjectURL(file) }]);
      showToast("Ticket ajouté — il apparaît dans la fiche véhicule (Flotte) côté admin.");
    } catch (e) {
      showToast("Photo non envoyée : " + (e as Error).message);
    }
  }
  async function saveReceiptAmount(id: string, amount: string) {
    const { error } = await supabase.from("vehicle_events").update({ amount: amount ? parseFloat(amount) : null }).eq("id", id);
    if (error) showToast("Montant non enregistré : " + error.message);
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
      .update({ status, motif: result.motif ?? null, photos_count: result.photos ?? 0, photo_paths: result.photoPaths ?? [], done_at: new Date().toISOString(), logisticien_id: userId })
      .eq("id", s.id);
    if (error) return showToast("Enregistrement impossible : " + error.message);
    if (status === "collecte" && result.items?.length) {
      const { error: e2 } = await supabase.from("collecte_items").insert(
        result.items.map((it) => ({ collecte_id: s.id, denree: it.denree ?? null, name: it.name ?? null, kg: it.kg, source_collecte_id: it.sourceId ?? null })),
      );
      if (e2) return showToast("Poids non enregistrés : " + e2.message);
    }
    setStops((prev) => prev.map((x, idx) => (idx === i ? { ...x, status, result } : x)));
    setOpenIdx(null);  }
  async function logout() {
    await createClient().auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const [mapPts, setMapPts] = useState<MapPoint[]>([]);
  const [mapLine, setMapLine] = useState<[number, number][]>([]);
  const addrKey = stops.map((s) => s.address + s.status).join("|");
  useEffect(() => {
    if (!mapOpen || stops.length === 0) return;
    let cancelled = false;
    (async () => {
      const hex: Record<Kind, string> = { partner: "#0a1a3f", stock: "#b97600", dropoff: "#1a8f68", exceptionnel: "#1f93a8" };
      const depot = await geocode(DEPOT_ADDRESS);
      const found: { s: Stop; i: number; g: { lat: number; lng: number } }[] = [];
      for (let i = 0; i < stops.length; i++) {
        if (stops[i].status === "annule") continue;
        const g = await geocode(stops[i].address);
        if (g) found.push({ s: stops[i], i, g });
      }
      if (cancelled) return;
      const points: MapPoint[] = [
        ...(depot ? [{ lat: depot.lat, lng: depot.lng, label: "Entrepôt Linkee — départ", color: "#4FC1D6", num: "home" as const }] : []),
        ...found.map(({ s, i, g }) => ({ lat: g.lat, lng: g.lng, label: s.name, color: hex[s.kind], num: i + 1, time: s.time || undefined })),
      ];
      setMapPts(points);
      if (depot && found.length) {
        try {
          const res = await fetch("/api/route", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ points: [depot, ...found.map((f) => f.g), depot] }) });
          const json = await res.json();
          if (!cancelled && res.ok) setMapLine(json.geometry);
        } catch {
          /* straight lines are drawn instead */
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapOpen, addrKey]);
  const todayWeekStops = stops.map((s) => ({ t: s.time, n: s.name, c: s.cat }));

  return (
    <div className="relative">
      <div className="flex items-center justify-between pt-2.5 pb-3.5">
        <div>
          <div className="font-display text-2xl leading-none font-black">Bonjour{firstName ? ` ${firstName}` : ""}</div>
          <div className="mt-[3px] text-[12.5px] text-[var(--slate)] capitalize">{today}</div>
        </div>
        <div className="flex items-center gap-2.5">
          <NotificationBell align="right" />
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
              {mapPts.length > 1 ? (
                <RouteMap points={mapPts} line={mapLine} height={300} />
              ) : (
                <div className="flex h-[160px] items-center justify-center text-[12.5px] text-[var(--slate)]">{stops.length === 0 ? "Aucun arrêt à afficher." : "Chargement de la carte…"}</div>
              )}
              <p className="mt-2 text-[11px] leading-[1.4] text-[var(--slate)] italic">Ordre de la tournée sur fond OpenStreetMap. Le bouton « Y aller » de chaque arrêt lance la navigation.</p>
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
                        <div className="font-display text-[19px] leading-none font-black text-[var(--navy)]">{s.time || "—"}</div>
                        <div className="mt-1 text-[15.5px] leading-tight font-bold text-[var(--navy)]">{s.name}</div>
                        <div className="text-[12px] text-[var(--slate)]">{s.cat}</div>
                        {!done && dayState === "running" && openIdx !== i && <div className="mt-1 text-[11.5px] font-bold text-[var(--turquoise)]">Touchez pour saisir cet arrêt</div>}
                      </span>
                      <span className={`rounded-[40px] px-[9px] py-[5px] text-[10.5px] font-bold tracking-[0.02em] whitespace-nowrap uppercase ${badgeCls}`}>{badge}</span>
                      {!done && dayState !== "closed" && (
                        <Icon className={`h-4 w-4 flex-none text-[var(--slate)] transition-transform ${openIdx === i ? "rotate-180" : ""}`} sw={2}><path d="M6 9 L12 15 L18 9" /></Icon>
                      )}
                    </div>

                    <div className="mt-3 flex items-center gap-2.5 rounded-xl border border-[var(--border)] bg-[var(--input-bg)] p-2.5">
                      <span className="flex min-w-0 flex-1 items-start gap-2 text-[12.5px] leading-[1.35] font-semibold text-[var(--navy)]">
                        <Icon className="mt-0.5 h-4 w-4 flex-none text-[var(--turquoise)]"><path d="M12 21 C 8 16.5, 5 13, 5 9.5 A7 7 0 0 1 19 9.5 C 19 13, 16 16.5, 12 21 Z" /><circle cx="12" cy="9.5" r="2.3" /></Icon>
                        <span>{s.address || "Adresse non renseignée"}</span>
                      </span>
                      <a href={`https://www.google.com/maps?q=${encodeURIComponent(s.address)}`} target="_blank" rel="noopener noreferrer" className="flex min-h-[40px] flex-none items-center gap-1.5 rounded-[40px] bg-[var(--turquoise)] px-4 py-2 text-[13px] font-bold whitespace-nowrap text-[#04262e]">
                        <Icon className="h-3.5 w-3.5" sw={2.2}><path d="M7 17 L17 7 M9 7 H17 V15" /></Icon>
                        Y aller
                      </a>
                    </div>
                    {s.comment && (
                      <div className="mt-2 flex items-start gap-2 rounded-xl bg-[var(--exc-accent-bg)] px-3 py-2.5 text-[12.5px] leading-[1.45] font-semibold text-[var(--navy)]">
                        <Icon className="mt-px h-3.5 w-3.5 flex-none text-[var(--exc-accent)]"><path d="M4 5 H20 V16 H9 L5 19 V16 H4 Z" /></Icon>
                        <span>{s.comment}</span>
                      </div>
                    )}
                    {(s.accessDetails || s.sitePhoto) && (
                      <>
                        <button type="button" onClick={() => setAccessOpen(toggle(accessOpen, i))} className="mt-2 flex min-h-[44px] w-full items-center gap-2.5 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-left text-[13px] font-bold text-[var(--navy)]">
                          <Icon className="h-4 w-4 flex-none text-[var(--turquoise)]"><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10 V7 A4 4 0 0 1 16 7 V10" /></Icon>
                          <span>Conditions d&apos;accès</span>
                          {s.access.length > 0 && (
                            <span className="flex gap-1.5 text-[var(--slate)]">
                              {s.access.map((a) => (
                                <span key={a} title={ACCESS_LABELS[a]}><Icon className="h-4 w-4">{ACCESS_PATHS[a]}</Icon></span>
                              ))}
                            </span>
                          )}
                          <Icon className={`ml-auto h-4 w-4 flex-none text-[var(--slate)] ${accessOpen.has(i) ? "rotate-180" : ""}`} sw={2}><path d="M6 9 L12 15 L18 9" /></Icon>
                        </button>
                        {accessOpen.has(i) && <div className="mt-[7px] rounded-[10px] border border-[var(--border)] bg-[var(--input-bg)] px-[11px] py-[9px] text-[11.5px] leading-[1.5] text-[var(--slate)]">
                          {s.accessDetails}
                          {s.sitePhoto && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={s.sitePhoto} alt="Lieu de collecte" className="mt-2 max-h-40 w-full rounded-lg object-cover" />
                          )}
                        </div>}
                      </>
                    )}
                    {s.status === "collecte" && <div className="mt-2 border-t border-[var(--border)] pt-2 text-xs text-[var(--slate)]">{summary(s)}</div>}
                    {s.status === "annule" && <div className="mt-2 border-t border-[var(--border)] pt-2 text-xs text-[var(--slate)]">Motif : <strong className="text-[var(--navy)]">{s.result?.motif || "annulé depuis le planning"}</strong></div>}

                    {!done && dayState === "running" && openIdx === i && <StopPanel stops={stops} index={i} onDone={(r, st) => finishStop(i, r, st)} onUpload={uploadStopPhoto} />}
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
                    const preview = truckPreviews[idx];
                    return (
                      <div key={slot.key} className="flex flex-col items-center gap-1.5">
                        <label className={`relative flex aspect-[4/3] w-full cursor-pointer items-center justify-center overflow-hidden rounded-xl border-[1.5px] ${preview ? "border-solid border-transparent" : "border-dashed border-[var(--border)] bg-[var(--input-bg)] text-[var(--slate)]"}`}>
                          {preview ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={preview} alt={slot.label} className="h-full w-full object-cover" />
                          ) : truckBusy === idx ? (
                            <span className="text-xs font-bold">…</span>
                          ) : (
                            <CameraIcon className="h-5 w-5" />
                          )}
                          <input
                            type="file"
                            accept="image/*"
                            capture="environment"
                            hidden
                            disabled={truckBusy !== null}
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              e.target.value = "";
                              if (f) pickTruckPhoto(idx, f);
                            }}
                          />
                        </label>
                        <span className="text-center text-[10.5px] leading-[1.2] font-bold text-[var(--navy)]">{slot.label}</span>
                      </div>
                    );
                  })}
                </div>
                <button type="button" disabled={truckPhotoCount !== TRUCK_SLOTS.length} onClick={validateTruck} className="w-full rounded-[40px] bg-[var(--good)] p-3 font-display text-[14.5px] font-bold text-white disabled:opacity-50">
                  Valider l&apos;état du camion
                </button>
                <div className="mt-2 text-center text-[11.5px] text-[var(--slate)]">
                  {truckPhotoCount === TRUCK_SLOTS.length ? "Photos complètes — vous pouvez valider l'état du camion." : `${truckPhotoCount} / ${TRUCK_SLOTS.length} photos prises.`}
                </div>
              </>
            )}
          </div>

          <div className="mb-3.5 rounded-[18px] border border-[var(--border)] bg-[var(--card)] p-[18px] shadow-[var(--shadow)]">
            <span className="mb-2 inline-block rounded-[40px] bg-[var(--todo-bg)] px-2.5 py-1 text-[10.5px] font-bold tracking-[0.03em] text-[var(--slate)] uppercase">Contrôle d&apos;usage</span>
            <h3 className="mb-1 font-display text-[17px] font-extrabold">Entretien courant</h3>
            <p className="mb-3.5 text-xs leading-[1.5] text-[var(--slate)]">À vérifier chaque lundi en même temps que le tour photo.</p>
            <div className="flex flex-col gap-2">
              {TRUCK_CHECKS.map((c) => <CheckRow key={c.key} label={c.label} checked={!!doneChecks[c.key]} onChange={() => toggleCheck(c.key)} />)}
            </div>
          </div>

          <div className="mb-3.5 rounded-[18px] border border-[var(--border)] bg-[var(--card)] p-[18px] shadow-[var(--shadow)]">
            <span className="mb-2 inline-block rounded-[40px] bg-[var(--todo-bg)] px-2.5 py-1 text-[10.5px] font-bold tracking-[0.03em] text-[var(--slate)] uppercase">Suivi garage</span>
            <h3 className="mb-1 font-display text-[17px] font-extrabold">Révisions programmées</h3>
            <p className="mb-3.5 text-xs leading-[1.5] text-[var(--slate)]">Coché par l&apos;admin ou le logisticien une fois la révision effectuée en garage.</p>
            <div className="flex flex-col gap-2">
              {TRUCK_REVISIONS.map((r) => <CheckRow key={r.key} label={r.label} checked={!!doneChecks[r.key]} onChange={() => toggleCheck(r.key)} />)}
            </div>
          </div>

          <div className="mb-3.5 rounded-[18px] border border-[var(--border)] bg-[var(--card)] p-[18px] shadow-[var(--shadow)]">
            <span className="mb-2 inline-block rounded-[40px] bg-[var(--todo-bg)] px-2.5 py-1 text-[10.5px] font-bold tracking-[0.03em] text-[var(--slate)] uppercase">Frais camion</span>
            <h3 className="mb-1 font-display text-[17px] font-extrabold">Tickets &amp; factures</h3>
            <p className="mb-3.5 text-xs leading-[1.5] text-[var(--slate)]">Carburant, lavage, petites réparations… prenez le ticket en photo, il remonte dans la fiche véhicule de l&apos;admin.</p>
            <div className="mb-2.5 flex flex-wrap gap-2">
              {receipts.map((rc) => (
                <div key={rc.id} className="flex w-14 flex-col items-center gap-1">
                  {rc.preview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={rc.preview} alt="Ticket" className="h-14 w-14 flex-none rounded-xl object-cover" />
                  ) : (
                    <div className={thumbCls}><CameraIcon /></div>
                  )}
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder="€"
                    value={rc.amount}
                    onChange={(e) => setReceipts((list) => list.map((x) => (x.id === rc.id ? { ...x, amount: e.target.value } : x)))}
                    onBlur={() => saveReceiptAmount(rc.id, rc.amount)}
                    className="w-14 rounded-lg border border-[var(--border)] bg-[var(--input-bg)] px-0.5 py-[3px] text-center text-[10.5px] text-[var(--navy)]"
                  />
                </div>
              ))}
            </div>
            <label className="flex h-14 w-14 cursor-pointer items-center justify-center rounded-xl border-[1.5px] border-dashed border-[var(--border)] bg-[var(--input-bg)] text-[var(--slate)]">
              <CameraIcon />
              <input
                type="file"
                accept="image/*"
                capture="environment"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) addReceipt(f);
                }}
              />
            </label>
          </div>
        </div>
      )}

      {toast && <div className="fixed right-[18px] bottom-[18px] left-[18px] z-50 mx-auto max-w-[424px] rounded-[14px] bg-[var(--navy-deep)] px-4 py-3 text-center text-[12.5px] font-semibold text-[var(--panel-fg)] shadow-[var(--shadow)]">{toast}</div>}
    </div>
  );
}
