"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { geocode, toKm, type LatLng } from "@/lib/geocode";
import { signedUrls } from "@/lib/photos";
import { useCity } from "@/components/admin/CityContext";
import { PassageBadges, type Passage } from "@/components/PassageIcons";
import AdminStopModal from "@/components/planning/AdminStopModal";
import dynamic from "next/dynamic";
import type { MapPoint } from "@/components/RouteMap";
import { formatCreneaux, slotsForDate, type Creneaux } from "@/lib/creneaux";
import { canAdminCity } from "@/lib/roles";

const RouteMap = dynamic(() => import("@/components/RouteMap"), {
  ssr: false,
  loading: () => <div className="flex h-[340px] items-center justify-center rounded-xl bg-[var(--input-bg)] text-[12.5px] text-[var(--slate)]">Chargement de la carte…</div>,
});
const TRAFFIC_FACTOR = 1.15; // city traffic margin applied to the raw road durations

type Kind = "partner" | "dropoff" | "stock" | "exceptionnel" | "demande_client" | "pause" | "dechetterie";
type Status = "planifie" | "annule";
type Coords = { x: number; y: number };
type Stop = {
  id: string;
  name: string;
  cat: string;
  kind: Kind;
  duration: number;
  status: Status;
  dbStatus: string;
  comment?: string;
  address: string;
  partnerId: string | null;
  beneficiaryId: string | null;
  label: string | null;
  photoPaths: string[];
  passage?: Passage;
  creneaux?: Creneaux;
};
type StopC = Stop & { coords: Coords };
type EnrichedStop = StopC & { scheduledTime: string | null; travelFromPrev: number; travelKmFromPrev: number; arrivalMin?: number; waitMin?: number };
type ChecklistItem = { id: string; label: string };
type Place = { key: string; kind: "partner" | "dropoff" | "stock" | "dechetterie"; name: string; cat: string; address: string; partnerId: string | null; beneficiaryId: string | null; passage?: Passage; creneaux?: Creneaux; regulier?: boolean; duration?: number };
// Partenaire régulier passant par un Link bénévole sur chacun de ses créneaux (case « Link bénévole systématique » de la fiche)
type LinkReminder = { partnerId: string; name: string; creneaux: Creneaux; linked: boolean };
type DbRel = { name: string; category: string | null; address: string | null; passage?: Passage | null; creneaux?: Creneaux | null };
type DbCollecte = {
  id: string;
  kind: Kind;
  partner_id: string | null;
  beneficiary_id: string | null;
  label: string | null;
  comment: string | null;
  status: string;
  duration_min: number;
  photo_paths: string[] | null;
  scheduled_time: string | null;
  partners: DbRel | DbRel[] | null;
  beneficiaries: DbRel | DbRel[] | null;
};
type WeekLine = { date: string; time: string | null; name: string; status: string };
type PartnerReq = {
  id: string;
  partner_id: string;
  wished_date: string;
  wished_time: string | null;
  denree: string | null;
  volume_kg: number | null;
  comment: string | null;
  partners: { name: string } | { name: string }[] | null;
};

const DEFAULT_DAY_START = 9 * 60; // 09:00, adjustable per day (day_settings)
const LUNCH_RESUME_FLOOR = 14 * 60; // la reprise après la pause ne se fait jamais avant 14h
const LUNCH_DEFAULT_DURATION = 30; // durée mini par défaut à l'ajout, modifiable comme la durée de n'importe quel arrêt
const HARD_LIMIT = 18 * 60;
const DEPOT_NAME = "Entrepôt Linkee"; // the depot address depends on the city (cities.depot_address)
const depotPlace = (address: string): Place => ({ key: "depot", kind: "stock", name: DEPOT_NAME, cat: "Dépôt stock", address, partnerId: null, beneficiaryId: null });

// Passage déchetterie : un seul lieu fixe, créneau hebdomadaire par défaut (mardi + mercredi) — pas de fiche
// dédiée, contrairement aux partenaires/bénéficiaires, donc adresse et créneaux sont ici des constantes.
const DECHETTERIE_NAME = "Déchetterie";
const DECHETTERIE_ADDRESS = "11 Av. du Dr Schweitzer, 69330 Meyzieu";
const DECHETTERIE_CRENEAUX: Creneaux = { mar: [{ open: "09:00", close: "10:00" }], mer: [{ open: "10:00", close: "11:00" }] };
const DECHETTERIE_PLACE: Place = { key: "dechetterie", kind: "dechetterie", name: DECHETTERIE_NAME, cat: "Déchetterie", address: DECHETTERIE_ADDRESS, partnerId: null, beneficiaryId: null, creneaux: DECHETTERIE_CRENEAUX };

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
// Crow-flight distance in km × 1.35 for the road, ≈ 23 km/h in town (parking included).
function dist(a: Coords, b: Coords) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}
function travelKm(a: Coords, b: Coords) {
  return dist(a, b) * 1.35;
}
function travelMinutes(a: Coords, b: Coords) {
  return Math.round(travelKm(a, b) * 2.6);
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
function toMin(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}
/** L'heure d'arrivée calculée par le trajet tombe-t-elle hors des créneaux habituels du partenaire ce jour-là ? */
function outsideUsualSlots(arrivalMin: number, slots: { open: string; close: string }[]) {
  if (!slots.length) return false;
  return !slots.some((s) => arrivalMin >= toMin(s.open) && arrivalMin <= toMin(s.close));
}
/** Si l'arrivée calculée tombe avant l'ouverture d'un créneau, on attend (non bloquant, intégré aux horaires) ;
 * si elle tombe après la fermeture de tous les créneaux du jour, on ne peut rien y faire — l'arrivée est
 * laissée telle quelle et sera signalée par outsideUsualSlots. */
function resolveArrival(natural: number, slots: { open: string; close: string }[]) {
  if (!slots.length) return { arrival: natural, waitMin: 0 };
  const ranges = slots.map((s) => ({ open: toMin(s.open), close: toMin(s.close) })).sort((a, b) => a.open - b.open);
  if (ranges.some((r) => natural >= r.open && natural <= r.close)) return { arrival: natural, waitMin: 0 };
  const next = ranges.find((r) => r.open > natural);
  if (next) return { arrival: next.open, waitMin: next.open - natural };
  return { arrival: natural, waitMin: 0 };
}
function one<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}
// DB weekdays: 1 = Monday … 7 = Sunday
const dbWeekday = (d: Date) => (d.getDay() === 0 ? 7 : d.getDay());

function rowToStop(r: DbCollecte, depotAddress: string): Stop {
  const p = one(r.partners);
  const b = one(r.beneficiaries);
  const rel = p ?? b;
  return {
    id: r.id,
    name: rel?.name ?? r.label ?? (r.kind === "dechetterie" ? DECHETTERIE_NAME : "Point de tournée"),
    cat: rel?.category ?? (r.kind === "stock" ? "Dépôt stock" : r.kind === "dechetterie" ? "Déchetterie" : ""),
    kind: r.kind,
    duration: r.duration_min ?? 10,
    status: r.status === "annule" ? "annule" : "planifie",
    dbStatus: r.status,
    comment: r.comment ?? undefined,
    address: rel?.address ?? (r.kind === "stock" ? depotAddress : r.kind === "dechetterie" ? DECHETTERIE_ADDRESS : ""),
    partnerId: r.partner_id,
    beneficiaryId: r.beneficiary_id,
    label: r.label,
    photoPaths: r.photo_paths ?? [],
    passage: p?.passage ?? undefined,
    creneaux: p?.creneaux ?? b?.creneaux ?? (r.kind === "dechetterie" ? DECHETTERIE_CRENEAUX : undefined),
  };
}

function pseudoCoords(seed: string): Coords {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return { x: (h % 2000) / 100 - 10, y: ((h >> 8) % 2000) / 100 - 10 };
}

/** Real road legs (minutes, km), one per active stop in order, plus the return leg to the depot at the end. */
type Leg = { min: number; km: number };

function computeSchedule(stops: StopC[], legs: Leg[] | undefined, dayStart: number = DEFAULT_DAY_START, dateIso: string) {
  let t = dayStart;
  let totalTravel = 0;
  let totalKm = 0;
  let totalDuration = 0;
  let prevCoords: Coords = { x: 0, y: 0 };
  let activeIdx = 0;
  const enriched: EnrichedStop[] = stops.map((s) => {
    if (s.status === "annule") {
      return { ...s, scheduledTime: null, travelFromPrev: 0, travelKmFromPrev: 0 };
    }
    if (s.kind === "pause") {
      // pas de trajet : la pause se prend là où l'équipe se trouve. Reprise au plus tôt à 14h, avec une
      // durée mini garantie (s.duration, modifiable comme n'importe quel arrêt) même en cas de retard.
      const arrivalMin = t;
      const scheduledTime = fmtTime(t);
      const resumeAt = Math.max(LUNCH_RESUME_FLOOR, t + s.duration);
      totalDuration += resumeAt - t;
      t = resumeAt;
      return { ...s, scheduledTime, travelFromPrev: 0, travelKmFromPrev: 0, arrivalMin };
    }
    const leg = legs?.[activeIdx++];
    const travel = leg ? Math.round(leg.min) : travelMinutes(prevCoords, s.coords);
    const km = leg ? leg.km : travelKm(prevCoords, s.coords);
    const natural = t + travel;
    // arrivée avant l'ouverture du créneau habituel du partenaire : on attend (non bloquant, intégré aux
    // horaires) ; arrivée après la fermeture de tous les créneaux du jour : rien à faire, juste signalé.
    const { arrival, waitMin } = (s.kind === "partner" || s.kind === "dropoff" || s.kind === "dechetterie") && s.creneaux ? resolveArrival(natural, slotsForDate(s.creneaux, dateIso)) : { arrival: natural, waitMin: 0 };
    totalTravel += travel;
    totalKm += km;
    const arrivalMin = arrival;
    const scheduledTime = fmtTime(arrival);
    t = arrival + s.duration;
    totalDuration += s.duration;
    prevCoords = s.coords;
    return { ...s, scheduledTime, travelFromPrev: travel, travelKmFromPrev: km, arrivalMin, waitMin };
  });
  // the truck goes back to the depot at the end of the day
  let returnMin = 0;
  let returnKm = 0;
  if (activeIdx > 0) {
    const ret = legs?.[activeIdx];
    returnMin = ret ? Math.round(ret.min) : travelMinutes(prevCoords, { x: 0, y: 0 });
    returnKm = ret ? ret.km : travelKm(prevCoords, { x: 0, y: 0 });
    t += returnMin;
    totalTravel += returnMin;
    totalKm += returnKm;
  }
  return { stops: enriched, dayEnd: t, totalTravel, totalKm, totalDuration, returnMin, returnKm };
}

const KIND_BADGE: Record<string, string> = { stock: "Stock", dropoff: "Dépose", demande_client: "Demande exceptionnelle client", exceptionnel: "Exceptionnel", pause: "Pause", dechetterie: "Déchetterie" };
const KIND_BORDER: Record<Kind, string> = {
  partner: "",
  stock: "border-l-4 border-l-[var(--stock-accent)]",
  dropoff: "border-l-4 border-l-[var(--dropoff)]",
  exceptionnel: "border-l-4 border-l-[var(--exc-accent)]",
  demande_client: "border-l-4 border-l-[var(--client-req)] bg-[var(--client-req-bg)]",
  pause: "border-l-4 border-l-[var(--muted)] border-dashed bg-[var(--input-bg)]",
  dechetterie: "border-l-4 border-l-[#6b7f3a]",
};
const KIND_BADGE_CLS: Record<string, string> = {
  stock: "bg-[var(--stock-accent-bg)] text-[var(--stock-accent)]",
  dropoff: "bg-[var(--dropoff-bg)] text-[var(--dropoff)]",
  exceptionnel: "bg-[var(--exc-accent-bg)] text-[var(--exc-accent)]",
  demande_client: "bg-[var(--client-req)] text-white",
  pause: "bg-[var(--track)] text-[var(--slate)]",
  dechetterie: "bg-[#6b7f3a1a] text-[#6b7f3a]",
};

const SELECT_DAY =
  "id,kind,partner_id,beneficiary_id,label,comment,status,duration_min,photo_paths,scheduled_time,partners(name,category,address,passage:fiche->passage,creneaux:fiche->creneaux),beneficiaries(name,category,address,creneaux:fiche->creneaux)";

export default function PlanningPage() {
  const supabase = useMemo(() => createClient(), []);
  const { cityId, city, depotAddress, role } = useCity(); // the page remounts when the city changes
  const ro = !canAdminCity(role); // le Responsable d'antenne modifie le planning de sa ville (migration 047)
  const DEPOT = { name: DEPOT_NAME, address: depotAddress };
  const DEPOT_PLACE = depotPlace(depotAddress);
  const [places, setPlaces] = useState<Place[]>([depotPlace(depotAddress)]);
  const [view, setView] = useState<"jour" | "semaine">("jour");
  const [currentDate, setCurrentDate] = useState(() => new Date());
  // deep link from the Stock screen: /planning?date=YYYY-MM-DD
  useEffect(() => {
    const d = new URLSearchParams(window.location.search).get("date");
    if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) setCurrentDate(new Date(d + "T00:00:00"));
  }, []);
  const [stops, setStops] = useState<Stop[]>([]);
  // date à laquelle appartiennent les arrêts chargés : au changement de jour, `stops` contient encore ceux du jour
  // précédent le temps du chargement — l'ajout automatique et l'enregistrement attendent donc que les deux coïncident
  const [stopsIso, setStopsIso] = useState<string | null>(null);
  const isoRef = useRef<string | null>(null); // jour réellement affiché, pour ignorer les réponses arrivées trop tard
  const [loadingDay, setLoadingDay] = useState(true);
  const [geo, setGeo] = useState<Record<string, LatLng>>({});
  const [weekLines, setWeekLines] = useState<WeekLine[]>([]);
  const [toast, setToast] = useState<string | null>(null);

  const [excOpen, setExcOpen] = useState(false);
  const [excPlaceKey, setExcPlaceKey] = useState("");
  const [excDenree, setExcDenree] = useState(DENREE_OPTIONS[0]);
  const [excVolume, setExcVolume] = useState("");
  const [excDate, setExcDate] = useState(() => isoDate(new Date()));
  const [excTime, setExcTime] = useState("10:30");
  const [excComment, setExcComment] = useState("");
  const [addPlaceKey, setAddPlaceKey] = useState("");

  const [checklistOpen, setChecklistOpen] = useState(false);
  const [checklistTemplates, setChecklistTemplates] = useState<Record<number, ChecklistItem[]>>({});
  const [checklistOverride, setChecklistOverride] = useState<ChecklistItem[] | null>(null);
  const [checklistNewItem, setChecklistNewItem] = useState("");

  const [pendingReqs, setPendingReqs] = useState<PartnerReq[]>([]);
  const [linkPartners, setLinkPartners] = useState<Omit<LinkReminder, "linked">[]>([]);
  const [linkedToday, setLinkedToday] = useState<Set<string>>(new Set());
  const [resultStop, setResultStop] = useState<Stop | null>(null);
  const [resultMode, setResultMode] = useState<"status" | "data">("status");
  const [gallery, setGallery] = useState<{ name: string; urls: string[] } | null>(null);
  async function openGallery(s: Stop) {
    const urls = await signedUrls(supabase, s.photoPaths);
    setGallery({ name: s.name, urls: urls.filter(Boolean) });
  }

  const dragSrcId = useRef<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const dirty = useRef(false);
  const persistTimer = useRef<number | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2600);
  }
  function fail(prefix: string, message: string) {
    showToast(`${prefix} : ${message}`);
  }

  const iso = isoDate(currentDate);
  const depotGeo = geo[DEPOT.address];

  /* ---------- coordinates ---------- */
  const stopsC: StopC[] = useMemo(
    () =>
      stops.map((s) => {
        const g = geo[s.address];
        return { ...s, coords: g && depotGeo ? toKm(g, depotGeo) : pseudoCoords(s.address || s.name) };
      }),
    [stops, geo, depotGeo],
  );
  // real road routing: depot → active stops (in order) → depot, computed by /api/route once every address is geolocated
  const [route, setRoute] = useState<{ key: string; legs: Leg[]; geometry: [number, number][]; provider: string } | null>(null);
  const [routeError, setRouteError] = useState<string | null>(null);
  const routePts = useMemo(() => {
    if (!depotGeo) return null;
    const pts: LatLng[] = [depotGeo];
    for (const s of stops) {
      if (s.status === "annule" || s.kind === "pause") continue;
      const g = geo[s.address];
      if (!g) return null;
      pts.push(g);
    }
    if (pts.length < 2) return null;
    pts.push(depotGeo);
    return pts;
  }, [stops, geo, depotGeo]);
  const routeKey = routePts ? routePts.map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join("|") : null;
  const activeRoute = route && route.key === routeKey ? route : null;
  const [dayStart, setDayStart] = useState(DEFAULT_DAY_START);
  const sched = useMemo(() => computeSchedule(stopsC, activeRoute?.legs, dayStart, iso), [stopsC, activeRoute, dayStart, iso]);

  useEffect(() => {
    if (!routePts || !routeKey || route?.key === routeKey) return;
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch("/api/route", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ points: routePts }) });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Calcul d'itinéraire impossible");
        setRoute({
          key: routeKey,
          provider: json.provider,
          geometry: json.geometry,
          legs: (json.legs as { seconds: number; meters: number }[]).map((l) => ({ min: (l.seconds / 60) * TRAFFIC_FACTOR, km: l.meters / 1000 })),
        });
        setRouteError(null);
      } catch (e) {
        setRouteError((e as Error).message);
      }
    }, 600);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeKey]);
  const activeStops = sched.stops.filter((s) => s.status !== "annule");
  const cancelledCount = stops.length - activeStops.length;
  const overflow = sched.dayEnd - HARD_LIMIT;

  // geocode every address we have not seen yet
  useEffect(() => {
    const addrs = Array.from(new Set([DEPOT.address, ...stops.map((s) => s.address)])).filter((a) => a && !geo[a]);
    if (!addrs.length) return;
    let cancelled = false;
    (async () => {
      const found: Record<string, LatLng> = {};
      for (const a of addrs) {
        const g = await geocode(a);
        if (g) found[a] = g;
      }
      if (!cancelled && Object.keys(found).length) setGeo((prev) => ({ ...prev, ...found }));
    })();
    return () => {
      cancelled = true;
    };
  }, [stops, geo]);

  /* ---------- initial load: city, places, checklist templates ---------- */
  useEffect(() => {
    (async () => {
      const [ps, bs, tpl, lp] = await Promise.all([
        // les partenaires "Éligible collecte bénévole" sortent du planning pro classique — ils passent par les Links Bénévoles
        supabase.from("partners").select("id,name,category,address,passage:fiche->passage,creneaux:fiche->creneaux,rythme:fiche->>rythme,duree:fiche->dureeCollecte").eq("city_id", cityId ?? "").eq("active", true).eq("benevole_only", false).is("deleted_at", null).order("name"),
        supabase.from("beneficiaries").select("id,name,category,address,creneaux:fiche->creneaux").eq("city_id", cityId ?? "").eq("active", true).is("deleted_at", null).order("name"),
        supabase.from("checklist_templates").select("weekday,items").eq("city_id", cityId ?? ""),
        supabase.from("partners").select("id,name,creneaux:fiche->creneaux").eq("city_id", cityId ?? "").eq("active", true).eq("fiche->>rythme", "regulier").eq("fiche->linkSystematique", true).is("deleted_at", null).order("name"),
      ]);
      setLinkPartners(((lp.data ?? []) as unknown as { id: string; name: string; creneaux: Creneaux | null }[]).map((p) => ({ partnerId: p.id, name: p.name, creneaux: p.creneaux ?? {} })));
      const list: Place[] = [
        ...((ps.data ?? []) as unknown as { id: string; name: string; category: string | null; address: string | null; passage: Passage | null; creneaux: Creneaux | null; rythme: string | null; duree: number | null }[]).map((p) => ({
          key: "p:" + p.id, kind: "partner" as const, name: p.name, cat: p.category ?? "", address: p.address ?? "", partnerId: p.id, beneficiaryId: null, passage: p.passage ?? undefined, creneaux: p.creneaux ?? undefined,
          regulier: p.rythme === "regulier",
          duration: Number(p.duree) > 0 ? Number(p.duree) : undefined, // « Durée de collecte » de la fiche
        })),
        ...((bs.data ?? []) as unknown as { id: string; name: string; category: string | null; address: string | null; creneaux: Creneaux | null }[]).map((b) => ({
          key: "b:" + b.id, kind: "dropoff" as const, name: b.name, cat: b.category ?? "", address: b.address ?? "", partnerId: null, beneficiaryId: b.id, creneaux: b.creneaux ?? undefined,
        })),
        DEPOT_PLACE,
        // la déchetterie (Meyzieu) est celle de Lyon : les autres villes n'ont pas ce passage hebdomadaire
        ...(city?.name === "Lyon" ? [DECHETTERIE_PLACE] : []),
      ];
      setPlaces(list);
      const firstPartner = list.find((p) => p.kind === "partner");
      setExcPlaceKey(firstPartner?.key ?? "");
      setAddPlaceKey(list[0].key);
      const t: Record<number, ChecklistItem[]> = {};
      ((tpl.data ?? []) as { weekday: number; items: ChecklistItem[] }[]).forEach((r) => (t[r.weekday] = r.items));
      setChecklistTemplates(t);
    })();
  }, [supabase]);

  /* ---------- load the selected day (+ its checklist override + the week) ---------- */
  async function loadDay() {
    const forIso = iso;
    setLoadingDay(true);
    setStopsIso(null);
    dirty.current = false;
    const { data, error } = await supabase.from("collectes").select(SELECT_DAY).eq("city_id", cityId ?? "").eq("scheduled_date", forIso).eq("source", "planning").order("sort_order");
    if (isoRef.current !== forIso) return; // on a changé de jour entre-temps : ce chargement n'est plus le bon
    if (error) fail("Chargement impossible", error.message);
    const list = ((data ?? []) as unknown as DbCollecte[]).map((r) => rowToStop(r, depotAddress));
    setStops(list);
    setStopsIso(forIso);
    // rows that were never scheduled (fresh copies) get their times written once
    if ((data ?? []).some((r) => (r as { scheduled_time: string | null }).scheduled_time === null && (r as { status: string }).status !== "annule")) dirty.current = true;
    setLoadingDay(false);
  }
  async function loadRequests() {
    const { data } = await supabase
      .from("exceptional_requests")
      .select("id,partner_id,wished_date,wished_time,denree,volume_kg,comment,partners!inner(name,city_id)")
      .eq("partners.city_id", cityId ?? "")
      .eq("status", "en_attente")
      .order("wished_date");
    setPendingReqs((data ?? []) as unknown as PartnerReq[]);
  }
  async function validateRequest(r: PartnerReq) {
    if (!cityId) return;
    const { error } = await supabase.from("collectes").insert({
      city_id: cityId, kind: "demande_client", partner_id: r.partner_id, scheduled_date: r.wished_date, scheduled_time: r.wished_time,
      sort_order: 99, status: "todo", comment: r.comment, duration_min: 10, denree: r.denree, volume_kg: r.volume_kg,
    });
    if (error) return fail("Validation impossible", error.message);
    const { error: e2 } = await supabase.from("exceptional_requests").update({ status: "validee" }).eq("id", r.id);
    if (e2) return fail("Validation impossible", e2.message);
    setPendingReqs((prev) => prev.filter((x) => x.id !== r.id));
    if (r.wished_date === iso) await loadDay();
    else setCurrentDate(new Date(r.wished_date + "T00:00:00"));
    showToast("Demande validée — ajoutée au planning (en violet).");
  }
  async function refuseRequest(r: PartnerReq) {
    const { error } = await supabase.from("exceptional_requests").update({ status: "refusee" }).eq("id", r.id);
    if (error) return fail("Refus impossible", error.message);
    setPendingReqs((prev) => prev.filter((x) => x.id !== r.id));
    showToast("Demande refusée.");
  }
  // Links déjà créés ce jour-là pour les partenaires « Link bénévole systématique » (hors Links annulés)
  async function loadLinkedToday() {
    const ids = linkPartners.map((p) => p.partnerId);
    if (!ids.length) return; // pas de rappel à afficher : rien à vérifier
    const { data } = await supabase.from("links").select("partner_id").in("partner_id", ids).eq("window_date", iso).neq("status", "annulee");
    setLinkedToday(new Set(((data ?? []) as { partner_id: string }[]).map((r) => r.partner_id)));
  }
  useEffect(() => {
    loadLinkedToday();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkPartners, iso]);
  const linkReminders: LinkReminder[] = linkPartners
    .filter((p) => slotsForDate(p.creneaux, iso).length > 0)
    .map((p) => ({ ...p, linked: linkedToday.has(p.partnerId) }));

  async function loadDayStart() {
    const { data } = await supabase.from("day_settings").select("start_min").eq("city_id", cityId ?? "").eq("day", iso).maybeSingle();
    setDayStart(data?.start_min ?? DEFAULT_DAY_START);
  }
  async function changeDayStart(min: number) {
    setDayStart(min);
    dirty.current = true; // arrival times shift: write them back for the logisticien
    if (!cityId) return;
    const { error } = await supabase.from("day_settings").upsert({ city_id: cityId, day: iso, start_min: min });
    if (error) fail("Heure de départ non enregistrée", error.message + " (la migration 010 est-elle passée ?)");
  }
  async function loadOverride() {
    const { data } = await supabase.from("checklist_overrides").select("items").eq("city_id", cityId ?? "").eq("day", iso).maybeSingle();
    setChecklistOverride((data?.items as ChecklistItem[] | undefined) ?? null);
  }
  async function loadWeek() {
    const monday = new Date(currentDate);
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const { data } = await supabase
      .from("collectes")
      .select("scheduled_date,scheduled_time,status,label,sort_order,partners(name),beneficiaries(name)")
      .eq("city_id", cityId ?? "")
      .eq("source", "planning")
      .gte("scheduled_date", isoDate(monday))
      .lte("scheduled_date", isoDate(sunday))
      .order("scheduled_date")
      .order("sort_order");
    setWeekLines(
      ((data ?? []) as unknown as { scheduled_date: string; scheduled_time: string | null; status: string; label: string | null; partners: { name: string } | { name: string }[] | null; beneficiaries: { name: string } | { name: string }[] | null }[]).map((r) => ({
        date: r.scheduled_date,
        time: r.scheduled_time ? r.scheduled_time.slice(0, 5) : null,
        name: one(r.partners)?.name ?? one(r.beneficiaries)?.name ?? r.label ?? "Point",
        status: r.status,
      })),
    );
  }
  useEffect(() => {
    if (!cityId) return;
    isoRef.current = iso;
    loadDay();
    loadDayStart();
    loadOverride();
    loadWeek();
    loadRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cityId, iso]);

  // Les arrêts réguliers (partenaires « Régulier », associations à créneau fixe, déchetterie de Lyon) ne sont plus
  // ajoutés à l'ouverture d'un jour : ils sont créés une fois par mois, d'un bloc, par generate_planning_month
  // (migration 056 — bouton « Générer le planning du mois » ci-dessous, ou tâche automatique le 20 pour le mois suivant).
  const monthIso = iso.slice(0, 7) + "-01";
  const [monthGen, setMonthGen] = useState<{ generated_at: string; stops_created: number } | null | undefined>(undefined);
  const [generating, setGenerating] = useState(false);
  async function loadMonthGen() {
    const { data } = await supabase.from("planning_generations").select("generated_at,stops_created").eq("city_id", cityId ?? "").eq("month", monthIso).maybeSingle();
    setMonthGen((data as { generated_at: string; stops_created: number } | null) ?? null);
  }
  useEffect(() => {
    if (!cityId) return;
    supabase.from("planning_generations").select("generated_at,stops_created").eq("city_id", cityId).eq("month", monthIso).maybeSingle()
      .then(({ data }) => setMonthGen((data as { generated_at: string; stops_created: number } | null) ?? null));
  }, [supabase, cityId, monthIso]);
  async function generateMonth() {
    if (!cityId) return;
    const label = `${MONTH_NAMES[Number(monthIso.slice(5, 7)) - 1]} ${monthIso.slice(0, 4)}`;
    if (!window.confirm(`Générer toutes les collectes régulières de ${label} à partir des fiches (partenaires « Régulier », associations à créneau fixe${city?.name === "Lyon" ? ", déchetterie" : ""}) ?\n\nLes arrêts déjà présents ne sont pas recréés. Tu pourras ensuite revoir et réarranger chaque journée.`)) return;
    setGenerating(true);
    const { data, error } = await supabase.rpc("generate_planning_month", { p_city: cityId, p_month: monthIso });
    setGenerating(false);
    if (error) return fail("Génération impossible", error.message + (error.message.includes("generate_planning_month") ? " (la migration 056 est-elle passée ?)" : ""));
    const r = data as { already?: boolean; stops_created?: number };
    await loadMonthGen();
    await loadDay();
    loadWeek();
    showToast(r.already ? `Le planning de ${label} avait déjà été généré.` : r.stops_created ? `${r.stops_created} arrêts créés pour ${label} — ouvre chaque journée pour vérifier l'ordre et les heures.` : `Aucun arrêt à créer pour ${label} (fiches sans créneau, ou arrêts déjà présents).`);
  }

  /* ---------- write back order / times after user edits ---------- */
  useEffect(() => {
    if (!dirty.current || !cityId || loadingDay || stops.length === 0 || stopsIso !== iso) return;
    if (persistTimer.current) window.clearTimeout(persistTimer.current);
    persistTimer.current = window.setTimeout(async () => {
      const rows = sched.stops.map((st, i) => ({
        id: st.id,
        city_id: cityId,
        kind: st.kind,
        partner_id: st.partnerId,
        beneficiary_id: st.beneficiaryId,
        label: st.label,
        scheduled_date: iso,
        scheduled_time: st.scheduledTime,
        sort_order: i,
        status: st.dbStatus,
        comment: st.comment ?? null,
        duration_min: st.duration,
      }));
      const { error } = await supabase.from("collectes").upsert(rows);
      if (error) fail("Enregistrement impossible", error.message);
      else loadWeek(); // the logisticien's notification is created by a database trigger
    }, 800);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sched]);

  function editStops(fn: (prev: Stop[]) => Stop[]) {
    if (ro) return; // read only
    dirty.current = true;
    setStops(fn);
  }

  /* ---------- checklist ---------- */
  const weekday = dbWeekday(currentDate);
  const checklistItems = checklistOverride ?? checklistTemplates[weekday] ?? [];
  const checklistRepeatsNow = checklistOverride === null;

  async function saveChecklist(items: ChecklistItem[], repeats: boolean) {
    if (!cityId) return;
    if (repeats) {
      setChecklistTemplates((prev) => ({ ...prev, [weekday]: items }));
      setChecklistOverride(null);
      const a = await supabase.from("checklist_templates").upsert({ city_id: cityId, weekday, items });
      const b = await supabase.from("checklist_overrides").delete().eq("city_id", cityId).eq("day", iso);
      if (a.error || b.error) fail("Checklist non enregistrée", (a.error ?? b.error)!.message);
    } else {
      setChecklistOverride(items);
      const { error } = await supabase.from("checklist_overrides").upsert({ city_id: cityId, day: iso, items });
      if (error) fail("Checklist non enregistrée", error.message);
    }
  }
  function addChecklistItem() {
    const label = checklistNewItem.trim();
    if (!label) return;
    saveChecklist([...checklistItems, { id: "ck" + Date.now(), label }], checklistRepeatsNow);
    setChecklistNewItem("");
  }
  function removeChecklistItem(idx: number) {
    saveChecklist(checklistItems.filter((_, i) => i !== idx), checklistRepeatsNow);
  }

  /* ---------- stops ---------- */
  async function insertStop(place: Place, kind: Kind, extra: { comment?: string; denree?: string; volume?: number | null }, insertAt?: number) {
    if (!cityId) return showToast("Aucune ville n'est associée à ton compte.");
    const forIso = iso;
    const stopDuration = kind === "dechetterie" ? 60 : (place.duration ?? 10);
    const { data, error } = await supabase
      .from("collectes")
      .insert({
        city_id: cityId,
        kind,
        partner_id: place.partnerId,
        beneficiary_id: place.beneficiaryId,
        label: !place.partnerId && !place.beneficiaryId ? place.name : null,
        scheduled_date: forIso,
        sort_order: stops.length,
        status: "todo",
        comment: extra.comment || null,
        duration_min: stopDuration,
        denree: extra.denree ?? null,
        volume_kg: extra.volume ?? null,
      })
      .select("id")
      .single();
    if (error || !data) return fail("Ajout impossible", error?.message ?? "erreur inconnue");
    if (isoRef.current !== forIso) return; // l'arrêt est bien créé à sa date, mais on affiche un autre jour : ne pas le mélanger
    const stop: Stop = {
      id: data.id as string, name: place.name, cat: place.cat, kind, duration: stopDuration, status: "planifie", dbStatus: "todo",
      comment: extra.comment || undefined, address: place.address, partnerId: place.partnerId, beneficiaryId: place.beneficiaryId,
      label: !place.partnerId && !place.beneficiaryId ? place.name : null,
      photoPaths: [],
      passage: place.passage,
      creneaux: place.creneaux,
    };
    editStops((prev) => {
      const next = [...prev];
      next.splice(insertAt ?? next.length, 0, stop);
      return next;
    });
  }

  function addPlaceToTour() {
    const place = places.find((p) => p.key === addPlaceKey);
    if (place) insertStop(place, place.kind, {}).then(() => showToast(`${place.name} ajouté à la tournée.`));
  }

  /** La pause déjeuner est une étape comme une autre : déplaçable par glisser-déposer, sans trajet propre —
   * voir computeSchedule pour la règle "reprise pas avant 14h, durée mini garantie même en retard". */
  async function addLunchStop() {
    if (!cityId) return showToast("Aucune ville n'est associée à ton compte.");
    const { data, error } = await supabase
      .from("collectes")
      .insert({ city_id: cityId, kind: "pause", label: "Pause déjeuner", scheduled_date: iso, sort_order: stops.length, status: "todo", duration_min: LUNCH_DEFAULT_DURATION })
      .select("id")
      .single();
    if (error || !data) return fail("Ajout impossible", error?.message ?? "erreur inconnue (la migration 031 est-elle passée ?)");
    const stop: Stop = {
      id: data.id as string, name: "Pause déjeuner", cat: "", kind: "pause", duration: LUNCH_DEFAULT_DURATION, status: "planifie", dbStatus: "todo",
      address: "", partnerId: null, beneficiaryId: null, label: "Pause déjeuner", photoPaths: [],
    };
    editStops((prev) => [...prev, stop]);
    showToast("Pause déjeuner ajoutée — glisse-la où tu veux dans la tournée.");
  }

  async function submitExceptional() {
    const place = places.find((p) => p.key === excPlaceKey);
    if (!place) return showToast("Choisis d'abord un partenaire (crée-en un dans l'onglet Partenaires).");
    const dateVal = excDate || iso;
    const [hh, mm] = (excTime || "10:30").split(":");
    const desiredMin = +hh * 60 + +mm;
    if (dateVal !== iso) {
      // insert on another day, then jump there
      const { error } = await supabase.from("collectes").insert({
        city_id: cityId, kind: "exceptionnel", partner_id: place.partnerId, beneficiary_id: place.beneficiaryId, scheduled_date: dateVal,
        sort_order: 99, status: "todo", comment: excComment.trim() || null, duration_min: 10, denree: excDenree, volume_kg: excVolume ? +excVolume : null,
      });
      if (error) return fail("Ajout impossible", error.message);
      setCurrentDate(new Date(dateVal + "T00:00:00"));
      showToast(`Planning basculé sur le ${fmtDayLabel(new Date(dateVal + "T00:00:00"))} — collecte exceptionnelle ajoutée.`);
    } else {
      let insertAt = stops.length;
      for (let i = 0; i < sched.stops.length; i++) {
        if ((sched.stops[i].arrivalMin ?? -Infinity) > desiredMin) {
          insertAt = i;
          break;
        }
      }
      await insertStop(place, "exceptionnel", { comment: excComment.trim(), denree: excDenree, volume: excVolume ? +excVolume : null }, insertAt);
      showToast("Collecte exceptionnelle ajoutée au planning.");
    }
    setExcOpen(false);
    setExcVolume("");
    setExcComment("");
  }

  function toggleCancel(id: string) {
    editStops((prev) =>
      prev.map((s) => {
        if (s.id !== id || s.dbStatus === "collecte") return s;
        const cancel = s.status !== "annule";
        return { ...s, status: cancel ? "annule" : "planifie", dbStatus: cancel ? "annule" : "todo" };
      }),
    );
  }
  async function removeStop(id: string) {
    const { error } = await supabase.from("collectes").delete().eq("id", id);
    if (error) return fail("Suppression impossible", error.message);
    editStops((prev) => prev.filter((s) => s.id !== id));
  }
  function updateDuration(idx: number, value: number) {
    editStops((prev) => prev.map((s, i) => (i === idx ? { ...s, duration: Math.max(0, value) } : s)));
  }
  function handleDrop(targetId: string) {
    const srcId = dragSrcId.current;
    setDragOverId(null);
    if (!srcId || srcId === targetId) return;
    editStops((prev) => {
      const srcIdx = prev.findIndex((s) => s.id === srcId);
      const tgtIdx = prev.findIndex((s) => s.id === targetId);
      const next = [...prev];
      const [moved] = next.splice(srcIdx, 1);
      next.splice(tgtIdx, 0, moved);
      return next;
    });
  }

  async function copyFromLastWeek() {
    if (!cityId) return;
    const prev = new Date(currentDate);
    prev.setDate(prev.getDate() - 7);
    const { data, error } = await supabase
      .from("collectes")
      .select("kind,partner_id,beneficiary_id,label,duration_min,sort_order")
      .eq("city_id", cityId)
      .eq("source", "planning")
      .eq("scheduled_date", isoDate(prev))
      .in("kind", ["partner", "dropoff", "stock"])
      .order("sort_order");
    if (error) return fail("Copie impossible", error.message);
    if (!data || data.length === 0) return showToast(`Aucune tournée le ${fmtDayLabel(prev)} à recopier.`);
    const rows = data.map((r, i) => ({ ...r, city_id: cityId, scheduled_date: iso, sort_order: i, status: "todo" }));
    const { error: e2 } = await supabase.from("collectes").insert(rows);
    if (e2) return fail("Copie impossible", e2.message);
    await loadDay();
    showToast(`Tournée du ${fmtDayLabel(prev)} recopiée.`);
  }

  /* ---------- map projection (km → svg) ---------- */
  const KIND_HEX: Record<Kind, string> = { partner: "#0a1a3f", stock: "#b97600", dropoff: "#1a8f68", exceptionnel: "#1f93a8", demande_client: "#7c5cd9", pause: "#7a7f8c", dechetterie: "#6b7f3a" };
  const mapPoints: MapPoint[] = [];
  if (depotGeo) mapPoints.push({ lat: depotGeo.lat, lng: depotGeo.lng, label: "Entrepôt Linkee — départ", color: "#4FC1D6", num: "home", time: `Début de journée ${fmtTime(dayStart)}` });
  activeStops.forEach((s) => {
    const g = geo[s.address];
    if (g) mapPoints.push({ lat: g.lat, lng: g.lng, label: s.name, color: KIND_HEX[s.kind], num: sched.stops.findIndex((x) => x.id === s.id) + 1, time: s.scheduledTime ?? undefined });
  });
  const unlocated = activeStops.filter((s) => !geo[s.address]).length;

  const weekDays = (() => {
    const monday = new Date(currentDate);
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    return Array.from({ length: 7 }, (_, k) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + k);
      return d;
    });
  })();

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
                setCurrentDate(d);
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
              value={iso}
              onChange={(e) => e.target.value && setCurrentDate(new Date(e.target.value + "T00:00:00"))}
              className="rounded-[10px] border border-[var(--border)] bg-[var(--card)] px-2.5 py-1.5 text-[12.5px] font-semibold text-[var(--navy)] outline-none focus:border-[var(--turquoise)]"
            />
            <button
              type="button"
              aria-label="Jour suivant"
              onClick={() => {
                const d = new Date(currentDate);
                d.setDate(d.getDate() + 1);
                setCurrentDate(d);
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
          {ro && (
            <div className="mb-3 flex items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--input-bg)] px-4 py-2.5 text-[12.5px] font-semibold text-[var(--slate)]">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 flex-none"><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10 V7 A4 4 0 0 1 16 7 V10" /></svg>
              Planning en lecture seule — seul le Superadmin peut le modifier.
            </div>
          )}
          {!ro && monthGen !== undefined && iso.slice(0, 7) >= isoDate(new Date()).slice(0, 7) && (
            <div className="mb-3 flex flex-wrap items-center gap-3 rounded-2xl border-[1.5px] border-[var(--border)] bg-[var(--card)] px-4 py-3">
              <span className="min-w-0 flex-1">
                <div className="text-[13.5px] font-bold text-[var(--navy)]">Planning de {MONTH_NAMES[Number(monthIso.slice(5, 7)) - 1]} {monthIso.slice(0, 4)}</div>
                <div className="text-[11.5px] text-[var(--slate)]">
                  {monthGen
                    ? `Généré le ${new Date(monthGen.generated_at).toLocaleDateString("fr-FR")} — ${monthGen.stops_created} arrêts réguliers créés d'après les fiches. Revois et réarrange chaque journée si besoin.`
                    : "Pas encore généré : les collectes régulières (partenaires « Régulier », associations à créneau fixe) seront créées d'un coup, sans doublon. Généré automatiquement le 20 du mois précédent."}
                </div>
              </span>
              {!monthGen && (
                <button type="button" disabled={generating} onClick={generateMonth} className="rounded-[40px] bg-[var(--navy-deep)] px-4 py-2 font-display text-[13px] font-bold text-[var(--panel-fg)] disabled:opacity-50">
                  {generating ? "Génération…" : "Générer le planning du mois"}
                </button>
              )}
            </div>
          )}
          {!ro && iso >= isoDate(new Date()) && linkReminders.length > 0 && (
            <div className="mb-3 rounded-2xl border-[1.5px] border-[#eb6834] bg-[rgba(235,104,52,.08)] p-4">
              <h4 className="mb-2.5 font-display text-[15px] font-extrabold text-[#eb6834]">Links bénévoles à prévoir ({linkReminders.filter((r) => !r.linked).length})</h4>
              <div className="flex flex-col gap-2">
                {linkReminders.map((r) => (
                  <div key={r.partnerId} className="flex flex-wrap items-center gap-3 rounded-xl bg-[var(--card)] px-3.5 py-2.5">
                    <span className="min-w-0 flex-1">
                      <div className="truncate text-[13.5px] font-bold text-[var(--navy)]">{r.name}</div>
                      <div className="text-[11.5px] text-[var(--slate)]">
                        Créneau régulier · {slotsForDate(r.creneaux, iso).map((sl) => `${sl.open}–${sl.close}`).join(", ")}
                      </div>
                    </span>
                    {r.linked ? (
                      <span className="rounded-[40px] bg-[var(--good-bg)] px-3 py-1 text-[12px] font-bold text-[var(--good)]">✓ Link créé</span>
                    ) : (
                      <span className="rounded-[40px] bg-[var(--warn-bg)] px-3 py-1 text-[12px] font-bold text-[var(--warn)]">Link à créer</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          {!ro && pendingReqs.length > 0 && (
            <div className="mb-3 rounded-2xl border-[1.5px] border-[var(--client-req)] bg-[var(--client-req-bg)] p-4">
              <h4 className="mb-2.5 font-display text-[15px] font-extrabold text-[var(--client-req)]">Demandes des partenaires en attente ({pendingReqs.length})</h4>
              <div className="flex flex-col gap-2">
                {pendingReqs.map((r) => {
                  const d = new Date(r.wished_date + "T00:00:00");
                  return (
                    <div key={r.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-[var(--card)] px-3.5 py-2.5">
                      <span className="min-w-0 flex-1">
                        <div className="truncate text-[13.5px] font-bold text-[var(--navy)]">{one(r.partners)?.name ?? "Partenaire"}</div>
                        <div className="text-[11.5px] text-[var(--slate)]">
                          {fmtDayLabel(d)} · {r.wished_time ? r.wished_time.slice(0, 5) : "heure libre"} · {r.denree ?? "—"}
                          {r.volume_kg ? ` · ~${r.volume_kg} kg` : ""}
                          {r.comment ? ` · « ${r.comment} »` : ""}
                        </div>
                      </span>
                      <button type="button" onClick={() => validateRequest(r)} className="rounded-[40px] bg-[var(--client-req)] px-3.5 py-1.5 font-display text-[13px] font-bold text-white">
                        Valider
                      </button>
                      <button type="button" onClick={() => refuseRequest(r)} className="rounded-[40px] border-[1.5px] border-[var(--border)] px-3.5 py-1.5 font-display text-[13px] font-bold text-[var(--slate)]">
                        Refuser
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {!ro && (
          <button
            type="button"
            onClick={() => {
              setExcOpen((v) => !v);
              if (!excOpen) setExcDate(iso);
            }}
            className="mb-3 flex w-full items-center gap-2 rounded-2xl border-[1.5px] border-dashed border-[var(--border)] bg-[var(--card)] px-4 py-3 text-[13px] font-bold text-[var(--navy)] hover:border-[var(--exc-accent)] hover:text-[var(--exc-accent)]"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
              <path d="M12 5 V19 M5 12 H19" />
            </svg>
            Ajouter une collecte exceptionnelle
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={`ml-auto h-4 w-4 transition-transform ${excOpen ? "rotate-180" : ""}`}>
              <path d="M6 9 L12 15 L18 9" />
            </svg>
          </button>
          )}
          {!ro && excOpen && (
            <div className="mb-[18px] rounded-2xl border-[1.5px] border-[var(--exc-accent)] bg-[var(--card)] p-[18px] shadow-[var(--shadow)]">
              <h4 className="mb-3 font-display text-[15px] font-extrabold text-[var(--navy)]">Nouvelle collecte exceptionnelle</h4>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className={labelCls}>Partenaire</label>
                  <select value={excPlaceKey} onChange={(e) => setExcPlaceKey(e.target.value)} className={inputCls}>
                    {places.filter((p) => p.kind === "partner").length === 0 && <option value="">Aucun partenaire — crée-en un d&apos;abord</option>}
                    {places.filter((p) => p.kind === "partner").map((p) => (
                      <option key={p.key} value={p.key}>
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
                  <textarea value={excComment} onChange={(e) => setExcComment(e.target.value)} rows={2} placeholder="Ex : accès particulier, contexte, consigne pour le logisticien…" className={`${inputCls} resize-y`} />
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

          {!ro && (
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
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={`ml-auto h-4 w-4 transition-transform ${checklistOpen ? "rotate-180" : ""}`}>
              <path d="M6 9 L12 15 L18 9" />
            </svg>
          </button>
          )}
          {!ro && checklistOpen && (
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
                    <button type="button" onClick={() => removeChecklistItem(idx)} title="Retirer" className="flex h-6 w-6 flex-none items-center justify-center rounded-full border-[1.5px] border-[var(--border)] bg-[var(--card)] text-sm leading-none text-[var(--slate)] hover:border-[var(--critical)] hover:bg-[var(--critical-bg)] hover:text-[var(--critical)]">
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
                <input type="checkbox" checked={checklistRepeatsNow} onChange={(e) => saveChecklist(checklistItems, e.target.checked)} />
                Se répète chaque semaine (tous les {DOW_NAMES[currentDate.getDay()]}s)
              </label>
            </div>
          )}

          <div className="mb-[18px] rounded-[20px] border border-[var(--border)] bg-[var(--card)] p-[18px] shadow-[var(--shadow)]">
            <h3 className="mb-0.5 font-display text-base font-extrabold">Itinéraire du jour</h3>
            <p className="mb-2.5 text-[11.5px] text-[var(--slate)] italic">
              {activeRoute
                ? `Itinéraire routier réel (${activeRoute.provider === "ors" ? "OpenRouteService" : "OSRM"} · fond OpenStreetMap), retour au dépôt inclus. Temps de trajet majorés de 15 % pour la circulation.`
                : routeError
                  ? `Calcul routier indisponible (${routeError}) — temps estimés à vol d'oiseau en attendant.`
                  : unlocated > 0
                    ? `Géolocalisation des adresses en cours… (${unlocated} adresse(s) à trouver — vérifie qu'elles sont complètes dans fiche partenaire).`
                    : "Calcul de l'itinéraire routier en cours…"}
            </p>
            {mapPoints.length > 1 ? <RouteMap points={mapPoints} line={activeRoute?.geometry ?? []} /> : <div className="flex h-[200px] items-center justify-center rounded-xl bg-[var(--input-bg)] text-[12.5px] text-[var(--slate)]">Ajoute des points à la tournée pour voir la carte.</div>}
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
                <div className="text-[13.5px] font-bold">Début de journée — départ de l&apos;Entrepôt Linkee</div>
                <div className="text-[11.5px] text-[var(--panel-fg-dim)]">{DEPOT.address}</div>
              </span>
              <label className="flex flex-none flex-col items-end gap-0.5">
                <span className="text-[9.5px] font-bold tracking-[0.05em] text-[var(--panel-fg-dim)] uppercase">Départ ce jour-là ✎</span>
                <input
                  type="time"
                  disabled={ro}
                  title="Modifie l'heure de départ de cette journée uniquement"
                  value={fmtTime(dayStart)}
                  onChange={(e) => {
                    if (!e.target.value) return;
                    const [h, m] = e.target.value.split(":").map(Number);
                    changeDayStart(h * 60 + m);
                  }}
                  className="cursor-pointer rounded-lg border-[1.5px] border-[var(--turquoise)] bg-white/10 px-2 py-1 font-display text-[16px] font-extrabold text-[var(--turquoise)] outline-none hover:bg-white/20"
                />
                {/* l'heure ne vaut que pour la date affichée : les autres jours gardent 9h00 */}
                <span className="text-[10.5px] text-[var(--panel-fg-dim)]">
                  {dayStart === DEFAULT_DAY_START ? (
                    `Habituellement ${fmtTime(DEFAULT_DAY_START)}`
                  ) : (
                    <>
                      Modifiée pour ce jour
                      {!ro && (
                        <>
                          {" · "}
                          <button type="button" onClick={(e) => { e.preventDefault(); changeDayStart(DEFAULT_DAY_START); }} className="font-bold text-[var(--turquoise)] underline">
                            revenir à {fmtTime(DEFAULT_DAY_START)}
                          </button>
                        </>
                      )}
                    </>
                  )}
                </span>
              </label>
            </div>

            {loadingDay && <div className="py-6 text-center text-[13px] text-[var(--slate)]">Chargement…</div>}

            {!loadingDay && stops.length === 0 && (
              <div className="rounded-2xl border-[1.5px] border-dashed border-[var(--border)] bg-[var(--card)] px-4 py-8 text-center text-[13px] text-[var(--slate)]">
                Aucune collecte planifiée ce jour.
                <div className="mt-3 flex flex-wrap justify-center gap-2.5">
                  {!ro && (
                    <button type="button" onClick={copyFromLastWeek} className="rounded-[40px] bg-[var(--navy-deep)] px-4 py-2 font-display text-[13px] font-bold text-[var(--panel-fg)]">
                      Recopier la tournée de la semaine dernière
                    </button>
                  )}
                </div>
              </div>
            )}

            {sched.stops.map((s, i) => {
              const cancelled = s.status === "annule";
              const done = s.dbStatus === "collecte";
              return (
                <div key={s.id}>
                  {cancelled ? (
                    <div className="py-1 pl-[50px] text-[11px] font-semibold text-[var(--critical)] italic">Annulé — exclu du calcul de trajet et de la carte</div>
                  ) : s.kind === "pause" ? null : (
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
                    draggable={!ro}
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
                    className={`flex cursor-grab items-center gap-3 rounded-2xl border-[1.5px] bg-[var(--card)] px-3.5 py-3 shadow-[var(--shadow)] transition-[opacity,transform] ${KIND_BORDER[s.kind]} ${dragOverId === s.id ? "-translate-y-0.5 border-[var(--turquoise)]" : "border-[var(--border)]"} ${cancelled ? "opacity-55" : ""}`}
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
                    <span className={`w-[70px] flex-none leading-tight ${cancelled ? "opacity-60" : ""}`}>
                      <span className="block text-[9.5px] font-bold tracking-[0.05em] text-[var(--slate)] uppercase">{s.kind === "dropoff" ? "Dépose" : s.kind === "stock" ? "Prise stock" : s.kind === "pause" ? "Pause" : s.kind === "dechetterie" ? "Déchetterie" : "Collecte"}</span>
                      <span className="block font-display text-[18px] font-extrabold text-[var(--navy)]">{s.scheduledTime || "—"}</span>
                      {s.arrivalMin !== undefined && (
                        <span className="block text-[10.5px] text-[var(--slate)]">→ {fmtTime(s.kind === "pause" ? Math.max(LUNCH_RESUME_FLOOR, s.arrivalMin + s.duration) : s.arrivalMin + s.duration)}</span>
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className={`truncate text-[13.5px] font-bold text-[var(--navy)] ${cancelled ? "line-through" : ""}`}>{s.name}</span>
                        <PassageBadges passage={s.passage} size={24} />
                        {s.photoPaths.length > 0 && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openGallery(s);
                            }}
                            title="Voir les photos prises par le logisticien"
                            className="flex h-8 flex-none items-center gap-1.5 rounded-full bg-[var(--turquoise)] px-3 text-[12px] font-bold whitespace-nowrap text-[#04262e] shadow-[0_2px_8px_-2px_rgba(79,193,214,0.7)] hover:brightness-95"
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                              <path d="M4 8 L7 4 H17 L20 8" />
                              <rect x="3" y="8" width="18" height="12" rx="2" />
                              <circle cx="12" cy="14" r="3.2" />
                            </svg>
                            {s.photoPaths.length} photo{s.photoPaths.length > 1 ? "s" : ""}
                          </button>
                        )}
                      </div>
                      <div className="text-[11.5px] text-[var(--slate)]">{s.cat}</div>
                      {(s.kind === "partner" || s.kind === "dropoff" || s.kind === "dechetterie") && s.creneaux && (() => {
                        const todaySlots = slotsForDate(s.creneaux, iso);
                        if (!todaySlots.length) return null;
                        const mismatch = s.arrivalMin !== undefined && outsideUsualSlots(s.arrivalMin, todaySlots);
                        return (
                          <div className={`text-[11px] ${mismatch ? "font-semibold text-[var(--warn)]" : "text-[var(--slate)]"}`}>
                            Créneau habituel : {todaySlots.map((sl) => `${sl.open}–${sl.close}`).join(", ")}
                            {mismatch ? " ⚠︎ hors créneau" : s.waitMin ? ` · ⏳ attente ${fmtDuration(s.waitMin)} avant l'ouverture` : ""}
                          </div>
                        );
                      })()}
                      {s.comment && (s.kind === "stock" || s.kind === "dropoff") && <div className="truncate text-[11px] text-[var(--stock-accent)] italic" title={s.comment}>{s.comment}</div>}
                    </span>
                    <span className={`flex-none rounded-[40px] px-2 py-[3px] text-[9.5px] font-bold tracking-[0.03em] uppercase ${cancelled ? "bg-[var(--critical-bg)] text-[var(--critical)]" : done ? "bg-[var(--good-bg)] text-[var(--good)]" : KIND_BADGE_CLS[s.kind] || "bg-[var(--track)] text-[var(--slate)]"}`}>
                      {cancelled ? "Annulé" : done ? "Réalisée" : KIND_BADGE[s.kind] || "Collecte"}
                    </span>
                    <span className="flex flex-none items-center gap-1">
                      <input
                        type="number"
                        min={0}
                        step={5}
                        value={s.duration}
                        onClick={(e) => e.stopPropagation()}
                        disabled={ro}
                        title={s.kind === "pause" ? "Durée minimum garantie (la reprise ne se fait jamais avant 14h)" : undefined}
                        onChange={(e) => updateDuration(i, +e.target.value || 0)}
                        className="w-11 rounded-[8px] border-[1.5px] border-[var(--border)] bg-[var(--input-bg)] px-1.5 py-1 text-center text-xs font-semibold text-[var(--navy)] outline-none focus:border-[var(--turquoise)]"
                      />
                      <small className="text-[11px] text-[var(--slate)]">min</small>
                    </span>
                    <span className="flex flex-none gap-1.5">
                      {!ro && !(s.kind === "stock" && done) && s.kind !== "pause" && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setResultMode("data");
                            setResultStop(s);
                          }}
                          title="Saisir les denrées, poids ou produits à la place du logisticien — le statut se met à jour tout seul"
                          className="flex h-[28px] flex-none items-center gap-1 rounded-full bg-[var(--navy-deep)] px-3 text-[11.5px] font-bold whitespace-nowrap text-[var(--panel-fg)] hover:brightness-110"
                        >
                          Compléter les infos
                        </button>
                      )}
                      {!ro && s.kind !== "pause" && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setResultMode("status");
                            setResultStop(s);
                          }}
                          title="Changer le statut : à faire, réalisé (denrées, poids) ou annulé (motif)"
                          className={`flex h-[28px] flex-none items-center gap-1 rounded-full border-[1.5px] px-3 text-[11.5px] font-bold whitespace-nowrap hover:brightness-95 ${done ? "border-[var(--good)] bg-[var(--good-bg)] text-[var(--good)]" : cancelled ? "border-[var(--critical)] bg-[var(--critical-bg)] text-[var(--critical)]" : "border-[var(--border)] bg-[var(--input-bg)] text-[var(--navy)]"}`}
                        >
                          {done ? "Réalisée" : cancelled ? "Annulée" : "À faire"}
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
                            <path d="M6 9 L12 15 L18 9" />
                          </svg>
                        </button>
                      )}
                      {!done && !ro && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleCancel(s.id);
                          }}
                          title={cancelled ? "Réactiver ce point" : "Marquer comme annulé"}
                          className={`flex h-[26px] w-[26px] items-center justify-center rounded-full border-[1.5px] ${cancelled ? "border-[var(--good)] bg-[var(--good-bg)] text-[var(--good)]" : "border-[var(--border)] bg-[var(--input-bg)] text-[var(--slate)] hover:border-[var(--critical)] hover:bg-[var(--critical-bg)] hover:text-[var(--critical)]"}`}
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
                            {cancelled ? <path d="M20 6 L9 17 L4 12" /> : <path d="M6 6 L18 18 M18 6 L6 18" />}
                          </svg>
                        </button>
                      )}
                      {!done && !ro && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeStop(s.id);
                          }}
                          title="Retirer de la tournée"
                          className="flex h-[26px] w-[26px] items-center justify-center rounded-full border-[1.5px] border-[var(--border)] bg-[var(--input-bg)] text-[var(--slate)] hover:border-[var(--critical)] hover:bg-[var(--critical-bg)] hover:text-[var(--critical)]"
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
                            <path d="M4 7 H20 M9 7 V4 H15 V7 M6 7 L7 20 H17 L18 7" />
                          </svg>
                        </button>
                      )}
                    </span>
                  </div>
                </div>
              );
            })}

            {activeStops.length > 0 && (
              <div className="flex items-center gap-3 rounded-2xl border-[1.5px] border-dashed border-[var(--border)] px-3.5 py-2.5 text-[12.5px] text-[var(--slate)]">
                <span className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-full bg-[var(--track)] text-sm">🏠</span>
                <span className="flex-1">
                  Retour Entrepôt Linkee · {fmtDuration(sched.returnMin)} de trajet · {sched.returnKm.toFixed(1)} km
                </span>
                <span className="font-display text-[15px] font-extrabold text-[var(--navy)]">{fmtTime(sched.dayEnd)}</span>
              </div>
            )}

            {!ro && (
            <div className="mt-1 flex flex-wrap items-center gap-2.5 rounded-2xl border border-[var(--border)] bg-[var(--card)] px-3.5 py-3">
              <span className="text-[12.5px] font-bold text-[var(--navy)]">Ajouter un point à la tournée</span>
              <select value={addPlaceKey} onChange={(e) => setAddPlaceKey(e.target.value)} className={`${inputCls} !w-auto min-w-[220px] flex-1`}>
                {places.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.name} — {p.kind === "dropoff" ? "dépose" : p.kind === "stock" ? "stock" : "collecte"}
                    {p.kind === "partner" && formatCreneaux(p.creneaux) ? ` (${formatCreneaux(p.creneaux)})` : ""}
                  </option>
                ))}
              </select>
              <button type="button" onClick={addPlaceToTour} className="rounded-[40px] bg-[var(--navy-deep)] px-4 py-2 font-display text-[13px] font-bold text-[var(--panel-fg)]">
                + Ajouter
              </button>
              {!stops.some((s) => s.kind === "pause") && (
                <button type="button" onClick={addLunchStop} className="rounded-[40px] border-[1.5px] border-dashed border-[var(--border)] px-4 py-2 font-display text-[13px] font-bold text-[var(--slate)] hover:border-[var(--turquoise)] hover:text-[var(--turquoise)]">
                  + Pause déjeuner
                </button>
              )}
            </div>
            )}
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
              <div className="mt-1 text-[11.5px] text-[var(--slate)]">{cancelledCount ? `${cancelledCount} annulé(s) exclu(s)` : `${stops.filter((s) => s.kind === "exceptionnel").length} exceptionnel(s)`}</div>
            </div>
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-[var(--shadow)]">
              <span className="mb-1.5 block text-[11px] font-bold tracking-[0.03em] text-[var(--slate)] uppercase">Amplitude horaire</span>
              <span className={`font-display text-2xl font-black ${overflow > 0 ? "text-[var(--critical)]" : "text-[var(--good)]"}`}>
                {fmtTime(dayStart)} → {fmtTime(sched.dayEnd)}
              </span>
              <div className="mt-1 text-[11.5px] text-[var(--slate)]">{fmtDuration(sched.dayEnd - dayStart)} au total</div>
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
              <span>Aucune collecte active ce jour.</span>
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
          {weekDays
            .filter((d) => d.getDay() !== 0 || weekLines.some((l) => l.date === isoDate(d)))
            .map((d) => {
              const key = isoDate(d);
              const isToday = key === isoDate(new Date());
              const lines = weekLines.filter((l) => l.date === key);
              return (
                <div key={key} className={`rounded-2xl border bg-[var(--card)] p-4 shadow-[var(--shadow)] ${isToday ? "border-[var(--turquoise)]" : "border-[var(--border)]"}`}>
                  <h4 className="mb-2.5 font-display text-base font-extrabold text-[var(--navy)]">
                    {DOW_NAMES[d.getDay()]} {d.getDate()} {MONTH_NAMES[d.getMonth()].slice(0, 4)}.{isToday ? " · aujourd'hui" : ""}
                  </h4>
                  {lines.length === 0 ? (
                    <p className="text-[12.5px] text-[var(--slate)]">Rien de planifié.</p>
                  ) : (
                    lines.map((l, i) => (
                      <div key={i} className="flex justify-between gap-2.5 border-b border-[var(--border)] py-1.5 text-[12.5px] last:border-none">
                        <span className="flex-none font-bold text-[var(--slate)]">{l.status === "annule" ? "Annulé" : (l.time ?? "—")}</span>
                        <span className="truncate text-right font-semibold text-[var(--navy)]">{l.name}</span>
                      </div>
                    ))
                  )}
                </div>
              );
            })}
        </div>
      )}

      {resultStop && cityId && (
        <AdminStopModal
          stop={{ id: resultStop.id, name: resultStop.name, kind: resultStop.kind, partnerId: resultStop.partnerId, cat: resultStop.cat }}
          cityId={cityId}
          date={iso}
          current={resultStop.dbStatus}
          mode={resultMode}
          onClose={() => setResultStop(null)}
          onSaved={(r) => {
            const id = resultStop.id;
            setStops((prev) => prev.map((s) => (s.id === id ? { ...s, status: r.status === "annule" ? "annule" : "planifie", dbStatus: r.status === "todo" ? "todo" : r.status, photoPaths: r.photoPaths } : s)));
            setResultStop(null);
            loadWeek();
            showToast(r.status === "annule" ? "Arrêt marqué comme annulé." : r.status === "todo" ? "Arrêt remis à faire." : "Arrêt enregistré comme réalisé — visible dans les statistiques.");
          }}
        />
      )}

      {gallery && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 p-4" onClick={() => setGallery(null)}>
          <div className="max-h-[90vh] w-full max-w-[720px] overflow-auto rounded-[20px] bg-[var(--card)] p-5 shadow-[var(--shadow)]" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h4 className="font-display text-[17px] font-extrabold text-[var(--navy)]">Photos — {gallery.name}</h4>
              <button type="button" onClick={() => setGallery(null)} className="rounded-full border-[1.5px] border-[var(--border)] px-3 py-1 text-[12px] font-bold text-[var(--slate)]">
                Fermer
              </button>
            </div>
            {gallery.urls.length === 0 ? (
              <p className="text-[13px] text-[var(--slate)]">Impossible d&apos;afficher les photos.</p>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {gallery.urls.map((u, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={i} src={u} alt={`Photo ${i + 1}`} className="w-full rounded-xl object-cover" />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      {toast && <div className="fixed bottom-[26px] left-1/2 z-[999] max-w-[380px] -translate-x-1/2 rounded-[14px] bg-[var(--navy-deep)] px-[18px] py-3 text-center text-[13px] font-semibold text-[var(--panel-fg)] shadow-[var(--shadow)]">{toast}</div>}
    </div>
  );
}

const inputCls = "w-full rounded-[10px] border-[1.5px] border-[var(--border)] bg-[var(--input-bg)] px-2.5 py-2 text-[13px] font-medium text-[var(--navy)] outline-none focus:border-[var(--turquoise)]";
const labelCls = "mb-[5px] block text-[11px] font-bold tracking-[0.03em] text-[var(--slate)] uppercase";
