"use client";

import { useMemo, useRef, useState } from "react";

type Kind = "partner" | "dropoff" | "stock" | "exceptionnel" | "demande_client";
type Status = "planifie" | "annule";
type Coords = { x: number; y: number };
type Stop = { id: string; name: string; cat: string; kind: Kind; duration: number; coords: Coords; status: Status; comment?: string };
type EnrichedStop = Stop & { scheduledTime: string | null; travelFromPrev: number; travelKmFromPrev: number; arrivalMin?: number };
type ChecklistItem = { id: string; label: string };

const DAY_START = 9 * 60;
const LUNCH_START = 12 * 60 + 30;
const LUNCH_END = 13 * 60 + 30;
const HARD_LIMIT = 18 * 60;
const DEPOT = { name: "Entrepôt Linkee", address: "110 Rue du Companet, 69140 Rillieux-la-Pape", coords: { x: 230, y: 15 } };

const PLACE_POOL: Record<string, { cat: string; kind: "partner" | "dropoff" | "stock"; coords: Coords }> = {
  "Boulangerie des Terreaux": { cat: "Boulangerie", kind: "partner", coords: { x: 40, y: 78 } },
  "Supermarché Presqu'île": { cat: "Supermarché", kind: "partner", coords: { x: 130, y: 122 } },
  "Traiteur Lumière": { cat: "Traiteur", kind: "partner", coords: { x: 220, y: 70 } },
  "Hôtel des Brotteaux": { cat: "Hôtel", kind: "partner", coords: { x: 310, y: 126 } },
  "Épicerie Sociale Saint-Camille de Vaise": { cat: "Association partenaire", kind: "dropoff", coords: { x: 410, y: 78 } },
  "Grossiste Rhône Frais": { cat: "Grossiste", kind: "partner", coords: { x: 340, y: 230 } },
  "Entrepôt Linkee": { cat: "Dépôt stock", kind: "stock", coords: { x: 230, y: 15 } },
  "Boulangerie Croix-Rousse": { cat: "Boulangerie", kind: "partner", coords: { x: 70, y: 180 } },
  "Épicerie de la Guillotière": { cat: "Supermarché", kind: "partner", coords: { x: 250, y: 170 } },
  "Café des Terreaux": { cat: "Restauration rapide", kind: "partner", coords: { x: 20, y: 50 } },
  "Marché des Capucins": { cat: "Grossiste", kind: "partner", coords: { x: 440, y: 180 } },
};

const DAY_TEMPLATES: Record<number, string[]> = {
  1: ["Boulangerie des Terreaux", "Supermarché Presqu'île", "Traiteur Lumière", "Hôtel des Brotteaux", "Épicerie Sociale Saint-Camille de Vaise", "Grossiste Rhône Frais", "Entrepôt Linkee"],
  2: ["Boulangerie Croix-Rousse", "Supermarché Presqu'île", "Traiteur Lumière", "Hôtel des Brotteaux", "Grossiste Rhône Frais"],
  3: ["Boulangerie des Terreaux", "Épicerie de la Guillotière", "Traiteur Lumière", "Hôtel des Brotteaux", "Épicerie Sociale Saint-Camille de Vaise", "Grossiste Rhône Frais", "Entrepôt Linkee"],
  4: ["Café des Terreaux", "Supermarché Presqu'île", "Traiteur Lumière", "Hôtel des Brotteaux", "Marché des Capucins"],
  5: ["Boulangerie des Terreaux", "Supermarché Presqu'île", "Grossiste Rhône Frais", "Hôtel des Brotteaux"],
  6: ["Boulangerie des Terreaux", "Épicerie de la Guillotière", "Entrepôt Linkee"],
  0: [],
};

const EXTRA_PARTNERS = Object.keys(PLACE_POOL).map((name) => ({ name, cat: PLACE_POOL[name].cat, coords: PLACE_POOL[name].coords }));
const DENREE_OPTIONS = ["Secs", "Fruits et légumes", "Produits frais", "Plats préparés", "Boulangerie"];
const DOW_NAMES = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
const MONTH_NAMES = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

function isoDate(d: Date) {
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return `${d.getFullYear()}-${m < 10 ? "0" : ""}${m}-${day < 10 ? "0" : ""}${day}`;
}
function fmtDayLabel(d: Date) {
  return `${DOW_NAMES[d.getDay()]} ${d.getDate()} ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
}
function dist(a: Coords, b: Coords) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}
function travelMinutes(a: Coords, b: Coords) {
  return Math.round(dist(a, b) * 0.11);
}
function travelKm(a: Coords, b: Coords) {
  return dist(a, b) * 0.045;
}
function fmtTime(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h < 10 ? "0" : ""}${h}:${m < 10 ? "0" : ""}${m}`;
}
function fmtDuration(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h${m < 10 ? "0" : ""}${m}` : `${m}min`;
}
function buildStopsForDate(d: Date): Stop[] {
  const dow = d.getDay();
  const names = DAY_TEMPLATES[dow] || [];
  return names.map((name, i) => {
    const p = PLACE_POOL[name];
    return { id: `d${dow}_${i}_${name.length}`, name, cat: p.cat, kind: p.kind, duration: 10, coords: p.coords, status: "planifie" as Status };
  });
}

function computeSchedule(stops: Stop[]) {
  let t = DAY_START;
  let totalTravel = 0;
  let totalKm = 0;
  let totalDuration = 0;
  let lunchAt = -1;
  let prevCoords: Coords = DEPOT.coords;
  const enriched: EnrichedStop[] = stops.map((s, i) => {
    if (s.status === "annule") {
      return { ...s, scheduledTime: null, travelFromPrev: 0, travelKmFromPrev: 0 };
    }
    const travel = travelMinutes(prevCoords, s.coords);
    const km = travelKm(prevCoords, s.coords);
    if (lunchAt === -1 && t + travel >= LUNCH_START && t < LUNCH_END) {
      lunchAt = i;
      t = LUNCH_END;
    } else {
      t += travel;
    }
    totalTravel += travel;
    totalKm += km;
    const arrivalMin = t;
    const scheduledTime = fmtTime(t);
    t += s.duration;
    totalDuration += s.duration;
    prevCoords = s.coords;
    return { ...s, scheduledTime, travelFromPrev: travel, travelKmFromPrev: km, arrivalMin };
  });
  return { stops: enriched, dayEnd: t, totalTravel, totalKm, totalDuration, lunchAt };
}

const DEFAULT_CHECKLIST_TEMPLATES: Record<number, ChecklistItem[]> = {
  0: [],
  1: [
    { id: "ck1", label: "Vérifier le niveau de carburant" },
    { id: "ck2", label: "Charger les caisses et les glacières" },
    { id: "ck3", label: "Contrôler la pression des pneus" },
  ],
  2: [],
  3: [],
  4: [],
  5: [],
  6: [],
};

const WEEK = [
  { dow: "Lundi 15 sept.", today: true, lines: null as { t: string; n: string }[] | null },
  { dow: "Mardi 16 sept.", lines: [{ t: "09:00", n: "Départ — Entrepôt Linkee" }, { t: "09:20", n: "Boulangerie Croix-Rousse" }, { t: "10:05", n: "Supermarché Presqu'île" }, { t: "11:00", n: "Traiteur Lumière" }, { t: "14:10", n: "Hôtel des Brotteaux" }, { t: "15:00", n: "Grossiste Rhône Frais" }] },
  { dow: "Mercredi 17 sept.", lines: [{ t: "09:00", n: "Départ — Entrepôt Linkee" }, { t: "09:20", n: "Boulangerie des Terreaux" }, { t: "09:45", n: "Épicerie de la Guillotière" }, { t: "10:30", n: "Traiteur Lumière" }, { t: "11:15", n: "Hôtel des Brotteaux" }, { t: "12:00", n: "Épicerie Sociale Saint-Camille de Vaise" }, { t: "14:00", n: "Grossiste Rhône Frais" }, { t: "15:30", n: "Entrepôt Linkee (stock)" }] },
  { dow: "Jeudi 18 sept.", lines: [{ t: "09:00", n: "Départ — Entrepôt Linkee" }, { t: "09:25", n: "Café des Terreaux" }, { t: "10:05", n: "Supermarché Presqu'île" }, { t: "11:00", n: "Traiteur Lumière" }, { t: "11:45", n: "Hôtel des Brotteaux" }, { t: "14:15", n: "Marché des Capucins" }] },
  { dow: "Vendredi 19 sept.", lines: [{ t: "09:00", n: "Départ — Entrepôt Linkee" }, { t: "09:20", n: "Boulangerie des Terreaux" }, { t: "10:05", n: "Supermarché Presqu'île" }, { t: "11:00", n: "Grossiste Rhône Frais" }, { t: "14:00", n: "Hôtel des Brotteaux" }] },
  { dow: "Samedi 20 sept.", lines: [{ t: "09:00", n: "Départ — Entrepôt Linkee" }, { t: "09:20", n: "Boulangerie des Terreaux" }, { t: "09:50", n: "Épicerie de la Guillotière" }, { t: "10:30", n: "Entrepôt Linkee (stock)" }] },
];

const KIND_BADGE: Record<string, string> = { stock: "Stock", dropoff: "Dépose", demande_client: "Demande exceptionnelle client", exceptionnel: "Exceptionnel" };
const KIND_BORDER: Record<Kind, string> = {
  partner: "",
  stock: "border-l-4 border-l-[var(--stock-accent)]",
  dropoff: "border-l-4 border-l-[var(--dropoff)]",
  exceptionnel: "border-l-4 border-l-[var(--exc-accent)]",
  demande_client: "border-l-4 border-l-[var(--client-req)] bg-[var(--client-req-bg)]",
};
const KIND_BADGE_CLS: Record<string, string> = {
  stock: "bg-[var(--stock-accent-bg)] text-[var(--stock-accent)]",
  dropoff: "bg-[var(--dropoff-bg)] text-[var(--dropoff)]",
  exceptionnel: "bg-[var(--exc-accent-bg)] text-[var(--exc-accent)]",
  demande_client: "bg-[var(--client-req)] text-white",
};

export default function PlanningPage() {
  const [view, setView] = useState<"jour" | "semaine">("jour");
  const [currentDate, setCurrentDate] = useState(new Date(2026, 8, 15));
  const [stops, setStops] = useState<Stop[]>(() => buildStopsForDate(new Date(2026, 8, 15)));
  const [toast, setToast] = useState<string | null>(null);

  const [excOpen, setExcOpen] = useState(false);
  const [excPartnerIdx, setExcPartnerIdx] = useState(0);
  const [excDenree, setExcDenree] = useState(DENREE_OPTIONS[0]);
  const [excVolume, setExcVolume] = useState("");
  const [excDate, setExcDate] = useState(isoDate(new Date(2026, 8, 15)));
  const [excTime, setExcTime] = useState("10:30");
  const [excComment, setExcComment] = useState("");

  const [checklistOpen, setChecklistOpen] = useState(false);
  const [checklistTemplates, setChecklistTemplates] = useState<Record<number, ChecklistItem[]>>(DEFAULT_CHECKLIST_TEMPLATES);
  const [checklistOverrides, setChecklistOverrides] = useState<Record<string, ChecklistItem[]>>({});
  const [checklistRepeat, setChecklistRepeat] = useState(true);
  const [checklistNewItem, setChecklistNewItem] = useState("");

  const dragSrcId = useRef<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2600);
  }

  const sched = useMemo(() => computeSchedule(stops), [stops]);
  const activeStops = sched.stops.filter((s) => s.status !== "annule");
  const cancelledCount = stops.length - activeStops.length;
  const overflow = sched.dayEnd - HARD_LIMIT;

  const checklistIso = isoDate(currentDate);
  const checklistItems = checklistOverrides[checklistIso] || checklistTemplates[currentDate.getDay()] || [];
  const checklistRepeatsNow = !checklistOverrides[checklistIso];

  function loadDate(d: Date) {
    setCurrentDate(d);
    setStops(buildStopsForDate(d));
  }

  function saveChecklist(items: ChecklistItem[], repeats: boolean) {
    const iso = isoDate(currentDate);
    if (repeats) {
      setChecklistTemplates((prev) => ({ ...prev, [currentDate.getDay()]: items }));
      setChecklistOverrides((prev) => {
        const next = { ...prev };
        delete next[iso];
        return next;
      });
    } else {
      setChecklistOverrides((prev) => ({ ...prev, [iso]: items }));
    }
  }

  function addChecklistItem() {
    const label = checklistNewItem.trim();
    if (!label) return;
    saveChecklist([...checklistItems, { id: "ck" + Date.now(), label }], checklistRepeat);
    setChecklistNewItem("");
  }
  function removeChecklistItem(idx: number) {
    saveChecklist(checklistItems.filter((_, i) => i !== idx), checklistRepeat);
  }

  function submitExceptional() {
    const p = EXTRA_PARTNERS[excPartnerIdx];
    const timeVal = excTime || "10:30";
    const dateVal = excDate || isoDate(currentDate);
    const [hh, mm] = timeVal.split(":");
    const desiredMin = (+hh) * 60 + (+mm);
    const switchedDay = dateVal !== isoDate(currentDate);

    const baseStops = switchedDay ? buildStopsForDate(new Date(dateVal + "T00:00:00")) : stops;
    const baseSched = computeSchedule(baseStops);
    const newStop: Stop = { id: "exc" + Date.now(), name: p.name, cat: p.cat, kind: "exceptionnel", duration: 10, coords: p.coords, status: "planifie", comment: excComment.trim() };

    let insertAt = baseStops.length;
    for (let i = 0; i < baseSched.stops.length; i++) {
      if ((baseSched.stops[i].arrivalMin ?? -Infinity) > desiredMin) {
        insertAt = i;
        break;
      }
    }
    const newStops = [...baseStops];
    newStops.splice(insertAt, 0, newStop);

    if (switchedDay) setCurrentDate(new Date(dateVal + "T00:00:00"));
    setStops(newStops);
    setExcOpen(false);
    setExcVolume("");
    setExcComment("");
    showToast(switchedDay ? `Planning basculé sur le ${fmtDayLabel(new Date(dateVal + "T00:00:00"))} — collecte exceptionnelle ajoutée.` : "Collecte exceptionnelle ajoutée au planning.");
  }

  function toggleCancel(id: string) {
    setStops((prev) => prev.map((s) => (s.id === id ? { ...s, status: s.status === "annule" ? "planifie" : "annule" } : s)));
  }
  function removeStop(id: string) {
    setStops((prev) => prev.filter((s) => s.id !== id));
  }
  function updateDuration(idx: number, value: number) {
    setStops((prev) => prev.map((s, i) => (i === idx ? { ...s, duration: Math.max(0, value) } : s)));
  }
  function handleDrop(targetId: string) {
    const srcId = dragSrcId.current;
    setDragOverId(null);
    if (!srcId || srcId === targetId) return;
    setStops((prev) => {
      const srcIdx = prev.findIndex((s) => s.id === srcId);
      const tgtIdx = prev.findIndex((s) => s.id === targetId);
      const next = [...prev];
      const [moved] = next.splice(srcIdx, 1);
      next.splice(tgtIdx, 0, moved);
      return next;
    });
  }

  // map
  let lunchActivePos = -1;
  if (sched.lunchAt !== -1) {
    const lunchStop = sched.stops[sched.lunchAt];
    lunchActivePos = activeStops.indexOf(lunchStop);
  }
  const allPts = [DEPOT.coords, ...activeStops.map((s) => s.coords)];

  return (
    <div>
      <div className="mb-[18px] flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-[32px] leading-none font-black">Mode Planning</h1>
          <p className="text-[13.5px] text-[var(--slate)]">Glissez-déposez pour réorganiser la tournée d&apos;Akram — les horaires et indicateurs se recalculent en direct.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3.5">
          <div className="flex rounded-[40px] border border-[var(--border)] bg-[var(--card)] p-[3px] shadow-[var(--shadow)]">
            {(["jour", "semaine"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={`rounded-[40px] px-[18px] py-2 font-display text-[13.5px] font-bold ${view === v ? "bg-[var(--navy-deep)] text-[var(--panel-fg)]" : "text-[var(--slate)]"}`}
              >
                {v === "jour" ? "Jour" : "Semaine"}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              aria-label="Jour précédent"
              onClick={() => {
                const d = new Date(currentDate);
                d.setDate(d.getDate() - 1);
                loadDate(d);
              }}
              className="flex h-[30px] w-[30px] items-center justify-center rounded-full border border-[var(--border)] bg-[var(--card)] text-[var(--navy)]"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                <path d="M15 5 L8 12 L15 19" />
              </svg>
            </button>
            <span className="min-w-[170px] text-center font-display text-base font-extrabold text-[var(--navy)]">{fmtDayLabel(currentDate)}</span>
            <input
              type="date"
              value={isoDate(currentDate)}
              onChange={(e) => e.target.value && loadDate(new Date(e.target.value + "T00:00:00"))}
              className="rounded-[10px] border border-[var(--border)] bg-[var(--card)] px-2.5 py-1.5 text-[12.5px] font-semibold text-[var(--navy)] outline-none focus:border-[var(--turquoise)]"
            />
            <button
              type="button"
              aria-label="Jour suivant"
              onClick={() => {
                const d = new Date(currentDate);
                d.setDate(d.getDate() + 1);
                loadDate(d);
              }}
              className="flex h-[30px] w-[30px] items-center justify-center rounded-full border border-[var(--border)] bg-[var(--card)] text-[var(--navy)]"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                <path d="M9 5 L16 12 L9 19" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {view === "jour" ? (
        <div>
          <button
            type="button"
            onClick={() => {
              setExcOpen((v) => !v);
              if (!excOpen) setExcDate(isoDate(currentDate));
            }}
            className="mb-3 flex w-full items-center gap-2 rounded-2xl border-[1.5px] border-dashed border-[var(--border)] bg-[var(--card)] px-4 py-3 text-[13px] font-bold text-[var(--navy)] hover:border-[var(--exc-accent)] hover:text-[var(--exc-accent)]"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
              <path d="M12 5 V19 M5 12 H19" />
            </svg>
            Ajouter une collecte exceptionnelle
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`ml-auto h-4 w-4 transition-transform ${excOpen ? "rotate-180" : ""}`}
            >
              <path d="M6 9 L12 15 L18 9" />
            </svg>
          </button>
          {excOpen && (
            <div className="mb-[18px] rounded-2xl border-[1.5px] border-[var(--exc-accent)] bg-[var(--card)] p-[18px] shadow-[var(--shadow)]">
              <h4 className="mb-3 font-display text-[15px] font-extrabold text-[var(--navy)]">Nouvelle collecte exceptionnelle</h4>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className={labelCls}>Partenaire</label>
                  <select value={excPartnerIdx} onChange={(e) => setExcPartnerIdx(+e.target.value)} className={inputCls}>
                    {EXTRA_PARTNERS.map((p, idx) => (
                      <option key={p.name} value={idx}>
                        {p.name} ({p.cat})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Type de denrée</label>
                  <select value={excDenree} onChange={(e) => setExcDenree(e.target.value)} className={inputCls}>
                    {DENREE_OPTIONS.map((d) => (
                      <option key={d}>{d}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Volume estimé (kg)</label>
                  <input type="number" min={0} value={excVolume} onChange={(e) => setExcVolume(e.target.value)} placeholder="Ex : 20" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Date</label>
                  <input type="date" value={excDate} onChange={(e) => setExcDate(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Créneau souhaité</label>
                  <input type="time" value={excTime} onChange={(e) => setExcTime(e.target.value)} className={inputCls} />
                </div>
                <div className="sm:col-span-3">
                  <label className={labelCls}>Commentaire (optionnel)</label>
                  <textarea
                    value={excComment}
                    onChange={(e) => setExcComment(e.target.value)}
                    rows={2}
                    placeholder="Ex : accès particulier, contexte, consigne pour le logisticien…"
                    className={`${inputCls} resize-y`}
                  />
                  <p className="mt-1.5 text-[11px] text-[var(--slate)]">S&apos;il est renseigné, ce commentaire s&apos;affiche directement sous l&apos;adresse côté logisticien, sans avoir besoin de dérouler.</p>
                </div>
              </div>
              <div className="mt-3.5 flex gap-2.5">
                <button type="button" onClick={submitExceptional} className="rounded-[40px] bg-[var(--exc-accent)] px-[18px] py-2.5 font-display text-[13.5px] font-bold text-white">
                  Ajouter au planning
                </button>
                <button type="button" onClick={() => setExcOpen(false)} className="rounded-[40px] border-[1.5px] border-[var(--border)] px-4 py-2.5 font-display text-[13.5px] font-bold text-[var(--slate)]">
                  Annuler
                </button>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={() => setChecklistOpen((v) => !v)}
            className="mb-3 flex w-full items-center gap-2 rounded-2xl border-[1.5px] border-dashed border-[var(--border)] bg-[var(--card)] px-4 py-3 text-[13px] font-bold text-[var(--navy)] hover:border-[var(--good)] hover:text-[var(--good)]"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
              <path d="M9 11 L12 14 L20 6" />
              <path d="M20 12 V18 A2 2 0 0 1 18 20 H6 A2 2 0 0 1 4 18 V6 A2 2 0 0 1 6 4 H14" />
            </svg>
            Checklist de départ
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`ml-auto h-4 w-4 transition-transform ${checklistOpen ? "rotate-180" : ""}`}
            >
              <path d="M6 9 L12 15 L18 9" />
            </svg>
          </button>
          {checklistOpen && (
            <div className="mb-[18px] rounded-2xl border-[1.5px] border-[var(--good)] bg-[var(--card)] p-[18px] shadow-[var(--shadow)]">
              <h4 className="mb-3 font-display text-[15px] font-extrabold text-[var(--navy)]">
                Checklist de départ — <span>{DOW_NAMES[currentDate.getDay()]}</span>
              </h4>
              <p className="mb-3 text-[11.5px] text-[var(--slate)]">À cocher entièrement par le logisticien avant de pouvoir lancer sa journée.</p>
              {checklistItems.length === 0 ? (
                <p className="text-[11.5px] text-[var(--slate)]">Aucun point pour l&apos;instant — ajoutez-en un ci-dessous.</p>
              ) : (
                checklistItems.map((it, idx) => (
                  <div key={it.id} className="flex items-center justify-between gap-2.5 border-b border-[var(--border)] py-2.5 text-[13px] font-semibold text-[var(--navy)] last:border-none">
                    <span>{it.label}</span>
                    <button
                      type="button"
                      onClick={() => removeChecklistItem(idx)}
                      title="Retirer"
                      className="flex h-6 w-6 flex-none items-center justify-center rounded-full border-[1.5px] border-[var(--border)] bg-[var(--card)] text-sm leading-none text-[var(--slate)] hover:border-[var(--critical)] hover:bg-[var(--critical-bg)] hover:text-[var(--critical)]"
                    >
                      ×
                    </button>
                  </div>
                ))
              )}
              <div className="mt-3 flex gap-2">
                <input
                  value={checklistNewItem}
                  onChange={(e) => setChecklistNewItem(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addChecklistItem();
                    }
                  }}
                  placeholder="Ajouter un point…"
                  className={`${inputCls} flex-1`}
                />
                <button type="button" onClick={addChecklistItem} className="rounded-[40px] bg-[var(--good)] px-4 py-2.5 font-display text-[13.5px] font-bold whitespace-nowrap text-white">
                  + Ajouter
                </button>
              </div>
              <label className="mt-3.5 flex cursor-pointer items-center gap-2 text-[12.5px] font-semibold text-[var(--slate)]">
                <input
                  type="checkbox"
                  checked={checklistRepeatsNow}
                  onChange={(e) => {
                    setChecklistRepeat(e.target.checked);
                    saveChecklist(checklistItems, e.target.checked);
                  }}
                />
                Se répète chaque semaine (tous les {DOW_NAMES[currentDate.getDay()]}s)
              </label>
            </div>
          )}

          <div className="mb-[18px] rounded-[20px] border border-[var(--border)] bg-[var(--card)] p-[18px] shadow-[var(--shadow)]">
            <h3 className="mb-0.5 font-display text-base font-extrabold">Itinéraire du jour</h3>
            <p className="mb-2.5 text-[11.5px] text-[var(--slate)] italic">
              Carte schématique (aperçu hors-ligne, sans tuiles cartographiques) — la version réelle utilisera Leaflet / OpenStreetMap avec les adresses géolocalisées et OpenRouteService pour les
              temps de trajet.
            </p>
            <svg viewBox="0 0 720 290" className="block w-full rounded-xl bg-[var(--input-bg)]">
              {allPts.slice(0, -1).map((pt, k) => {
                const next = allPts[k + 1];
                const isBreak = k === lunchActivePos;
                return (
                  <line
                    key={k}
                    x1={pt.x}
                    y1={pt.y}
                    x2={next.x}
                    y2={next.y}
                    stroke="var(--slate)"
                    strokeWidth={2}
                    strokeDasharray={isBreak ? "5 5" : undefined}
                    opacity={isBreak ? 0.5 : 0.3}
                  />
                );
              })}
              <g>
                <circle cx={DEPOT.coords.x} cy={DEPOT.coords.y} r={12} fill="var(--turquoise)" stroke="var(--card)" strokeWidth={2.5} />
                <text x={DEPOT.coords.x} y={DEPOT.coords.y + 4} fontSize={13} textAnchor="middle">
                  🏠
                </text>
                <text x={DEPOT.coords.x} y={DEPOT.coords.y + 26} fontSize={9.5} fontWeight={700} fill="var(--navy)" textAnchor="middle">
                  Départ {fmtTime(DAY_START)}
                </text>
              </g>
              {activeStops.map((s) => {
                const color =
                  s.kind === "stock" ? "var(--stock-accent)" : s.kind === "dropoff" ? "var(--dropoff)" : s.kind === "demande_client" ? "var(--client-req)" : s.kind === "exceptionnel" ? "var(--exc-accent)" : "var(--navy-deep)";
                const short = s.name.length > 16 ? s.name.slice(0, 15) + "…" : s.name;
                const num = sched.stops.findIndex((x) => x.id === s.id) + 1;
                return (
                  <g key={s.id}>
                    <circle cx={s.coords.x} cy={s.coords.y} r={12} fill={color} stroke="var(--card)" strokeWidth={2.5} />
                    <text x={s.coords.x} y={s.coords.y + 4} fontSize={11} fontWeight={700} fill="#fff" textAnchor="middle">
                      {num}
                    </text>
                    <text x={s.coords.x} y={s.coords.y + 25} fontSize={9.5} fill="var(--slate)" textAnchor="middle">
                      {short}
                    </text>
                    <text x={s.coords.x} y={s.coords.y - 16} fontSize={9.5} fontWeight={700} fill="var(--navy)" textAnchor="middle">
                      {s.scheduledTime}
                    </text>
                  </g>
                );
              })}
            </svg>
            <div className="mt-2.5 flex flex-wrap gap-x-[18px] gap-y-2.5 border-t border-[var(--border)] pt-2.5">
              {[
                ["var(--turquoise)", "Départ dépôt"],
                ["var(--navy-deep)", "Collecte partenaire"],
                ["var(--stock-accent)", "Stock"],
                ["var(--dropoff)", "Dépose association"],
                ["var(--exc-accent)", "Collecte exceptionnelle"],
                ["var(--client-req)", "Demande exceptionnelle client"],
              ].map(([color, label]) => (
                <span key={label} className="flex items-center text-[11px] font-semibold text-[var(--slate)]">
                  <i className="mr-[5px] inline-block h-[9px] w-[9px] rounded-full" style={{ background: color }} />
                  {label}
                </span>
              ))}
            </div>
          </div>

          <div className="mb-[22px] flex flex-col gap-2.5">
            <div className="mb-0.5 flex items-center gap-3 rounded-2xl bg-[var(--navy-deep)] px-3.5 py-3 text-[var(--panel-fg)]">
              <span className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-full bg-white/14 text-base">🏠</span>
              <span className="min-w-0 flex-1">
                <div className="text-[13.5px] font-bold">Départ — Entrepôt Linkee</div>
                <div className="text-[11.5px] text-[var(--panel-fg-dim)]">{DEPOT.address}</div>
              </span>
              <span className="font-display text-[15px] font-extrabold text-[var(--turquoise)]">{fmtTime(DAY_START)}</span>
            </div>

            {stops.length === 0 && (
              <div className="rounded-2xl border-[1.5px] border-dashed border-[var(--border)] bg-[var(--card)] py-10 text-center text-[13px] text-[var(--slate)]">
                Aucune tournée récurrente ce jour. Utilisez « Ajouter une collecte exceptionnelle » si besoin.
              </div>
            )}

            {sched.stops.map((s, i) => {
              const cancelled = s.status === "annule";
              const isLunch = i === sched.lunchAt;
              return (
                <div key={s.id}>
                  {cancelled ? (
                    <div className="py-1 pl-[50px] text-[11px] font-semibold text-[var(--critical)] italic">Annulé — exclu du calcul de trajet et de la carte</div>
                  ) : isLunch ? (
                    <div className="flex items-center gap-2.5 rounded-2xl border-[1.5px] border-dashed border-[var(--border)] px-3.5 py-2.5 text-[12.5px] text-[var(--slate)]">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-[15px] w-[15px]">
                        <path d="M6 3 V7 M18 3 V7 M4 7 H20 L19 20 H5 Z" />
                      </svg>
                      <span>Pause déjeuner — 12h30 – 13h30</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 py-0.5 pl-[50px] text-[11px] font-semibold text-[var(--muted)]">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-[13px] w-[13px]">
                        <path d="M12 5 V19 M6 13 L12 19 L18 13" />
                      </svg>
                      <span>
                        {fmtDuration(s.travelFromPrev)} de trajet · {s.travelKmFromPrev.toFixed(1)} km
                      </span>
                    </div>
                  )}
                  <div
                    draggable
                    onDragStart={() => (dragSrcId.current = s.id)}
                    onDragEnd={() => setDragOverId(null)}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragOverId(s.id);
                    }}
                    onDragLeave={() => setDragOverId(null)}
                    onDrop={(e) => {
                      e.preventDefault();
                      handleDrop(s.id);
                    }}
                    className={`flex cursor-grab items-center gap-3 rounded-2xl border-[1.5px] bg-[var(--card)] px-3.5 py-3 shadow-[var(--shadow)] transition-[opacity,transform] ${KIND_BORDER[s.kind]} ${
                      dragOverId === s.id ? "-translate-y-0.5 border-[var(--turquoise)]" : "border-[var(--border)]"
                    } ${cancelled ? "opacity-55" : ""}`}
                  >
                    <span className="flex-none text-[var(--muted)]">
                      <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                        <circle cx="9" cy="6" r="1.6" />
                        <circle cx="15" cy="6" r="1.6" />
                        <circle cx="9" cy="12" r="1.6" />
                        <circle cx="15" cy="12" r="1.6" />
                        <circle cx="9" cy="18" r="1.6" />
                        <circle cx="15" cy="18" r="1.6" />
                      </svg>
                    </span>
                    <span className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-full bg-[var(--track)] font-display text-xs font-extrabold text-[var(--navy)]">{i + 1}</span>
                    <span className={`w-[52px] flex-none font-display text-[15px] font-extrabold text-[var(--navy)] ${cancelled ? "opacity-60" : ""}`}>{s.scheduledTime || "—"}</span>
                    <span className="min-w-0 flex-1">
                      <div className={`truncate text-[13.5px] font-bold text-[var(--navy)] ${cancelled ? "line-through" : ""}`}>{s.name}</div>
                      <div className="text-[11.5px] text-[var(--slate)]">{s.cat}</div>
                    </span>
                    <span className={`flex-none rounded-[40px] px-2 py-[3px] text-[9.5px] font-bold tracking-[0.03em] uppercase ${cancelled ? "bg-[var(--critical-bg)] text-[var(--critical)]" : KIND_BADGE_CLS[s.kind] || "bg-[var(--track)] text-[var(--slate)]"}`}>
                      {cancelled ? "Annulé" : KIND_BADGE[s.kind] || "Collecte"}
                    </span>
                    <span className="flex flex-none items-center gap-1">
                      <input
                        type="number"
                        min={0}
                        step={5}
                        value={s.duration}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => updateDuration(i, +e.target.value || 0)}
                        className="w-11 rounded-[8px] border-[1.5px] border-[var(--border)] bg-[var(--input-bg)] px-1.5 py-1 text-center text-xs font-semibold text-[var(--navy)] outline-none focus:border-[var(--turquoise)]"
                      />
                      <small className="text-[11px] text-[var(--slate)]">min</small>
                    </span>
                    <span className="flex flex-none gap-1.5">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleCancel(s.id);
                        }}
                        title={cancelled ? "Réactiver ce point" : "Marquer comme annulé"}
                        className={`flex h-[26px] w-[26px] items-center justify-center rounded-full border-[1.5px] ${
                          cancelled ? "border-[var(--good)] bg-[var(--good-bg)] text-[var(--good)]" : "border-[var(--border)] bg-[var(--input-bg)] text-[var(--slate)] hover:border-[var(--critical)] hover:bg-[var(--critical-bg)] hover:text-[var(--critical)]"
                        }`}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
                          {cancelled ? <path d="M20 6 L9 17 L4 12" /> : <path d="M6 6 L18 18 M18 6 L6 18" />}
                        </svg>
                      </button>
                      {s.kind === "exceptionnel" && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeStop(s.id);
                          }}
                          title="Supprimer"
                          className="flex h-[26px] w-[26px] items-center justify-center rounded-full border-[1.5px] border-[var(--border)] bg-[var(--input-bg)] text-[var(--slate)] hover:border-[var(--critical)] hover:bg-[var(--critical-bg)] hover:text-[var(--critical)]"
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
                            <path d="M6 6 L18 18 M18 6 L6 18" />
                          </svg>
                        </button>
                      )}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mb-[18px] grid grid-cols-2 gap-3.5 lg:grid-cols-5">
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-[var(--shadow)]">
              <span className="mb-1.5 block text-[11px] font-bold tracking-[0.03em] text-[var(--slate)] uppercase">Distance totale</span>
              <span className="font-display text-2xl font-black text-[var(--navy)]">{sched.totalKm.toFixed(1)} km</span>
              <div className="mt-1 text-[11.5px] text-[var(--slate)]">sur {activeStops.length} points actifs</div>
            </div>
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-[var(--shadow)]">
              <span className="mb-1.5 block text-[11px] font-bold tracking-[0.03em] text-[var(--slate)] uppercase">Trajet vs collecte</span>
              <span className="font-display text-2xl font-black text-[var(--navy)]">{fmtDuration(sched.totalTravel)}</span>
              <div className="mt-1 text-[11.5px] text-[var(--slate)]">{fmtDuration(sched.totalDuration)} passés sur place</div>
              <div className="mt-2 flex h-[7px] overflow-hidden rounded-md bg-[var(--track)]">
                {(() => {
                  const sum = sched.totalTravel + sched.totalDuration;
                  const travelPct = sum ? Math.round((sched.totalTravel / sum) * 100) : 0;
                  return (
                    <>
                      <span style={{ width: `${travelPct}%`, background: "var(--exc-accent)" }} />
                      <span style={{ width: `${100 - travelPct}%`, background: "var(--good)" }} />
                    </>
                  );
                })()}
              </div>
            </div>
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-[var(--shadow)]">
              <span className="mb-1.5 block text-[11px] font-bold tracking-[0.03em] text-[var(--slate)] uppercase">Points de tournée</span>
              <span className="font-display text-2xl font-black text-[var(--navy)]">{activeStops.length}</span>
              <div className="mt-1 text-[11.5px] text-[var(--slate)]">
                {cancelledCount ? `${cancelledCount} annulé(s) exclu(s)` : `${stops.filter((s) => s.kind === "exceptionnel").length} exceptionnel(s)`}
              </div>
            </div>
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-[var(--shadow)]">
              <span className="mb-1.5 block text-[11px] font-bold tracking-[0.03em] text-[var(--slate)] uppercase">Amplitude horaire</span>
              <span className={`font-display text-2xl font-black ${overflow > 0 ? "text-[var(--critical)]" : "text-[var(--good)]"}`}>
                {fmtTime(DAY_START)} → {fmtTime(sched.dayEnd)}
              </span>
              <div className="mt-1 text-[11.5px] text-[var(--slate)]">{fmtDuration(sched.dayEnd - DAY_START)} au total</div>
            </div>
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-[var(--shadow)]">
              <span className="mb-1.5 block text-[11px] font-bold tracking-[0.03em] text-[var(--slate)] uppercase">{overflow > 0 ? "Dépassement" : "Marge disponible"}</span>
              <span className={`font-display text-2xl font-black ${overflow > 0 ? "text-[var(--critical)]" : "text-[var(--good)]"}`}>{fmtDuration(Math.abs(overflow))}</span>
              <div className="mt-1 text-[11.5px] text-[var(--slate)]">avant 18h00</div>
            </div>
          </div>

          <div className={`flex items-center gap-2.5 rounded-2xl px-4 py-3 text-[13px] font-semibold ${activeStops.length === 0 || overflow <= 0 ? "bg-[var(--good-bg)] text-[var(--good)]" : "bg-[var(--critical-bg)] text-[var(--critical)]"}`}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px] flex-none">
              {activeStops.length === 0 || overflow <= 0 ? <path d="M20 6 L9 17 L4 12" /> : <path d="M12 9 V13 M12 17 H12.01" />}
            </svg>
            {activeStops.length === 0 ? (
              <span>Aucune collecte active ce jour — ajoutez une collecte exceptionnelle si besoin.</span>
            ) : overflow > 0 ? (
              <span>
                Tournée <strong>non réalisable</strong> dans les créneaux 9h-12h / 13h-18h — dépassement de {fmtDuration(overflow)} après 18h00. Retirez un point ou avancez le départ.
              </span>
            ) : (
              <span>
                Tournée <strong>réalisable</strong> — marge de {fmtDuration(-overflow)} avant 18h00.
              </span>
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2 xl:grid-cols-3">
          {WEEK.map((d) => {
            const lines = d.today ? [{ t: fmtTime(DAY_START), n: "Départ — Entrepôt Linkee" }, ...sched.stops.map((s) => ({ t: s.scheduledTime || "Annulé", n: s.name }))] : d.lines!;
            return (
              <div key={d.dow} className={`rounded-2xl border bg-[var(--card)] p-4 shadow-[var(--shadow)] ${d.today ? "border-[var(--turquoise)]" : "border-[var(--border)]"}`}>
                <h4 className="mb-2.5 font-display text-base font-extrabold text-[var(--navy)]">
                  {d.dow}
                  {d.today ? " · aujourd'hui" : ""}
                </h4>
                {lines.map((l, i) => (
                  <div key={i} className="flex justify-between gap-2.5 border-b border-[var(--border)] py-1.5 text-[12.5px] last:border-none">
                    <span className="flex-none font-bold text-[var(--slate)]">{l.t}</span>
                    <span className="truncate text-right font-semibold text-[var(--navy)]">{l.n}</span>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {toast && (
        <div className="fixed bottom-[26px] left-1/2 z-[999] max-w-[380px] -translate-x-1/2 rounded-[14px] bg-[var(--navy-deep)] px-[18px] py-3 text-center text-[13px] font-semibold text-[var(--panel-fg)] shadow-[var(--shadow)]">
          {toast}
        </div>
      )}
    </div>
  );
}

const inputCls = "w-full rounded-[10px] border-[1.5px] border-[var(--border)] bg-[var(--input-bg)] px-2.5 py-2 text-[13px] font-medium text-[var(--navy)] outline-none focus:border-[var(--turquoise)]";
const labelCls = "mb-[5px] block text-[11px] font-bold tracking-[0.03em] text-[var(--slate)] uppercase";
