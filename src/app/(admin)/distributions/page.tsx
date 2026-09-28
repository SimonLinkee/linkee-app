"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useCity } from "@/components/admin/CityContext";
import DistribTabs from "@/components/DistribTabs";
import PhotoStrip from "@/components/PhotoStrip";
import { STATUS_UI, distribStatus } from "@/lib/distributions";

/* ---------------- types ---------------- */
type Place = { id: string; name: string; cat: string; address: string };
type Line = {
  key: string;
  category: string;
  product: string;
  nb_colis: string;
  colis_weight_kg: string;
  weight_kg: string;
  supplier: string;
  don_pct: string;
  delivery_mode: string;
  eco_label: string;
  geo_label: string;
  source_collecte_id: string | null;
};
type Inter = { associationId: string; comment: string; photoPaths: string[] };
type Assoc = { id: string; name: string; activity_type: string | null; archived: boolean };
type Draft = {
  id?: string;
  beneficiaryId: string;
  date: string;
  registered: string;
  presence: string;
  baskets: string;
  volunteers: string;
  coordinators: string;
  flTarget: string;
  status: "prevue" | "distribuee";
  receivedOk: boolean;
  photoPaths: string[];
  eventPhotos: string[];
  interventions: Inter[];
  comment: string;
  lines: Line[];
};
type DbDist = {
  id: string;
  beneficiary_id: string;
  event_date: string;
  registered: number | null;
  presence_rate: number | string;
  baskets: number | null;
  volunteers_total: number | null;
  coordinators: number | null;
  fl_target_kg: number | string | null;
  status: "prevue" | "distribuee";
  received_ok: boolean;
  photo_paths: string[] | null;
  event_photo_paths: string[] | null;
  distribution_interventions: { association_id: string; comment: string | null; photo_paths: string[] | null }[] | null;
  comment: string | null;
  distribution_lines: DbLine[] | null;
};
type DbLine = Partial<Record<Exclude<keyof Line, "key">, string | number | null>> & { sort_order: number };
type PlanDrop = { id: string; beneficiary_id: string; scheduled_date: string; status: string; collecte_items: { denree: string | null; name: string | null; kg: number | string; source_collecte_id: string | null }[] | null };
type Entry = { key: string; beneficiaryId: string; date: string; status: "prevue" | "distribuee"; saved: boolean; registered: number | null; baskets: number | null; planned: boolean };

/* ---------------- helpers ---------------- */
const CATS = ["F&L", "Boulang", "Sec", "Frais", "Plats préparés", "Hygiène", "Autre"];
const DENREE_TO_CAT: Record<string, string> = { "Fruits et légumes": "F&L", Boulangerie: "Boulang", Secs: "Sec", "Produits frais": "Frais", "Plats préparés": "Plats préparés" };
const num = (s: string) => {
  const v = parseFloat(String(s).replace(",", "."));
  return Number.isFinite(v) ? v : 0;
};
const numOrNull = (s: string) => (s.trim() === "" ? null : num(s));
const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;
const fmt = (n: number, d = 1) => n.toLocaleString("fr-FR", { maximumFractionDigits: d });
const eur = (n: number) => n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
const isoOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const fmtDay = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const fmtShort = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
const uid = () => Math.random().toString(36).slice(2, 10);
const first = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));
const s = (v: string | number | null | undefined) => (v == null ? "" : String(v));

// closed lists (no free typing): values taken from the Linkee follow-up spreadsheet
const OPTIONS: Record<string, string[]> = {
  delivery_mode: ["Collecte Log", "Reste camion", "Livraison sur site", "Sortie stock", "Stockage sur place"],
  eco_label: ["BIO", "HVE"],
  geo_label: ["Local", "France", "Monde"],
};
const STOCK_SUPPLIER = "Stock Linkee";

const blankLine = (): Line => ({ key: uid(), category: "F&L", product: "", nb_colis: "", colis_weight_kg: "", weight_kg: "", supplier: "", don_pct: "", delivery_mode: "", eco_label: "", geo_label: "", source_collecte_id: null });

const fieldCls = "w-full rounded-[10px] border-[1.5px] border-[var(--border)] bg-[var(--input-bg)] px-2.5 py-2 text-[13px] font-medium text-[var(--navy)] outline-none focus:border-[var(--turquoise)]";
// light green = a box to fill in
const fillCls = "w-full rounded-[10px] border-[1.5px] border-[var(--good)]/40 bg-[var(--good-bg)] px-2.5 py-2 text-[13px] font-medium text-[var(--navy)] outline-none focus:border-[var(--good)]";
const labelCls = "mb-1 block text-[11.5px] font-semibold text-[var(--slate)]";
const cellCls = "w-full rounded-lg border border-transparent bg-[var(--good-bg)] px-1.5 py-1.5 text-[12.5px] text-[var(--navy)] outline-none hover:border-[var(--good)]/50 focus:border-[var(--good)]";

function DistribBadge() {
  return (
    <span className="inline-flex flex-none items-center gap-1.5 rounded-[40px] bg-[#2a78d6] px-3 py-1.5 text-[12px] font-semibold text-white">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className="h-[15px] w-[15px]">
        <path d="M5 9 H19 L17.5 19 H6.5 Z M9 9 V6.5 A3 3 0 0 1 15 6.5 V9" />
      </svg>
      Distribution Linkee
    </span>
  );
}

const COLS: { k: keyof Omit<Line, "key" | "source_collecte_id">; l: string; w: number; type?: "num" | "cat" | "opt" | "supplier" }[] = [
  { k: "category", l: "Catégorie", w: 118, type: "cat" },
  { k: "product", l: "Produit", w: 170 },
  { k: "nb_colis", l: "Nb colis", w: 74, type: "num" },
  { k: "colis_weight_kg", l: "Pds colis (kg)", w: 88, type: "num" },
  { k: "weight_kg", l: "Poids (kg)", w: 82, type: "num" },
  { k: "supplier", l: "Fournisseur", w: 170, type: "supplier" },
  { k: "don_pct", l: "% don", w: 66, type: "num" },
  { k: "delivery_mode", l: "Mode de livraison", w: 150, type: "opt" },
  { k: "eco_label", l: "Label éco", w: 96, type: "opt" },
  { k: "geo_label", l: "Label géo", w: 96, type: "opt" },
];

function dbToDraft(d: DbDist): Draft {
  return {
    id: d.id,
    beneficiaryId: d.beneficiary_id,
    date: d.event_date,
    registered: s(d.registered),
    presence: s(d.presence_rate),
    baskets: s(d.baskets),
    volunteers: s(d.volunteers_total),
    coordinators: s(d.coordinators),
    flTarget: s(d.fl_target_kg),
    status: d.status,
    receivedOk: d.received_ok,
    photoPaths: d.photo_paths ?? [],
    eventPhotos: d.event_photo_paths ?? [],
    interventions: (d.distribution_interventions ?? []).map((i) => ({ associationId: i.association_id, comment: i.comment ?? "", photoPaths: i.photo_paths ?? [] })),
    comment: d.comment ?? "",
    lines: [...(d.distribution_lines ?? [])]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((l) => ({ ...blankLine(), ...Object.fromEntries(COLS.map((c) => [c.k, s(l[c.k])])), source_collecte_id: s(l.source_collecte_id) || null })),
  };
}

export default function DistributionsPage() {
  const supabase = useMemo(() => createClient(), []);
  const { cityId, city } = useCity(); // the page remounts when the city changes
  const [places, setPlaces] = useState<Place[]>([]);
  const [assocs, setAssocs] = useState<Assoc[]>([]);
  const [suppliers, setSuppliers] = useState<string[]>([]); // partner names of the city (suppliers are picked, never typed)
  const [dists, setDists] = useState<DbDist[]>([]);
  const [drops, setDrops] = useState<PlanDrop[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "encours" | "avenir" | "retard" | "cloture">("all");
  const [selKey, setSelKey] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [newOpen, setNewOpen] = useState(false);
  const [newPlace, setNewPlace] = useState("");
  const [newDate, setNewDate] = useState(isoOf(new Date()));
  const dirty = useRef(false);
  const timer = useRef<number | null>(null);
  const lock = useRef<Promise<unknown>>(Promise.resolve());
  const draftRef = useRef<Draft | null>(null);
  draftRef.current = draft;
  const detailRef = useRef<HTMLDivElement>(null);

  async function load() {
    if (!cityId) return;
    const since = isoOf(new Date(Date.now() - 180 * 86400000));
    const bq = await supabase.from("beneficiaries").select("id,name,category,address,fiche").eq("city_id", cityId).order("name");
    const pl = ((bq.data ?? []) as { id: string; name: string; category: string | null; address: string | null; fiche: { pinned?: boolean } | null }[])
      .filter((b) => b.category === "Distribution Linkee" || b.fiche?.pinned)
      .map((b) => ({ id: b.id, name: b.name, cat: b.category ?? "", address: b.address ?? "" }));
    setPlaces(pl);
    const ids = pl.map((p) => p.id);
    const aq = await supabase.from("associations").select("id,name,activity_type,archived").eq("city_id", cityId).order("name");
    setAssocs((aq.data ?? []) as Assoc[]);
    const pq = await supabase.from("partners").select("name").eq("city_id", cityId).order("name");
    setSuppliers(((pq.data ?? []) as { name: string }[]).map((p) => p.name));
    const [dq, cq] = await Promise.all([
      supabase.from("distributions").select("*,distribution_lines(*),distribution_interventions(*)").eq("city_id", cityId).gte("event_date", since).order("event_date", { ascending: false }),
      ids.length
        ? supabase.from("collectes").select("id,beneficiary_id,scheduled_date,status,collecte_items!collecte_id(denree,name,kg,source_collecte_id)").eq("city_id", cityId).eq("kind", "dropoff").eq("source", "planning").in("beneficiary_id", ids).gte("scheduled_date", since).neq("status", "annule")
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (dq.error) setMsg("Chargement impossible : " + dq.error.message + " (la migration 014 est-elle passée ?)");
    setDists((dq.data ?? []) as unknown as DbDist[]);
    setDrops((cq.data ?? []) as unknown as PlanDrop[]);
    setLoading(false);
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cityId]);

  // deep link from the steering page: /distributions?b=<lieu>&date=YYYY-MM-DD
  const deepLinked = useRef(false);
  const placeById = useMemo(() => new Map(places.map((p) => [p.id, p])), [places]);

  // saved distributions + planning drop-offs at Linkee places that were not turned into a distribution yet
  const entries: Entry[] = useMemo(() => {
    const out: Entry[] = dists.map((d) => ({ key: `${d.beneficiary_id}|${d.event_date}`, beneficiaryId: d.beneficiary_id, date: d.event_date, status: d.status, saved: true, registered: d.registered, baskets: d.baskets, planned: false }));
    const seen = new Set(out.map((e) => e.key));
    for (const c of drops) {
      const key = `${c.beneficiary_id}|${c.scheduled_date}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ key, beneficiaryId: c.beneficiary_id, date: c.scheduled_date, status: "prevue", saved: false, registered: null, baskets: null, planned: true });
    }
    return out.sort((a, b) => b.date.localeCompare(a.date));
  }, [dists, drops]);
  useEffect(() => {
    if (deepLinked.current || loading || entries.length === 0) return;
    const q = new URLSearchParams(window.location.search);
    const b = q.get("b");
    const date = q.get("date");
    if (!b || !date) return;
    deepLinked.current = true;
    const e = entries.find((x) => x.key === `${b}|${date}`);
    if (e) void open(e);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, loading]);
  const stOf = (e: { date: string; status: string }) => distribStatus(e.date, e.status === "distribuee");
  const shown = entries.filter((e) => filter === "all" || stOf(e) === filter);
  const count = (k: "encours" | "avenir" | "retard" | "cloture") => entries.filter((e) => stOf(e) === k).length;
  const nLate = count("retard");

  /* ---------- open one distribution (the landing page) ---------- */
  async function suppliersFor(sourceIds: string[]) {
    const ids = Array.from(new Set(sourceIds.filter(Boolean)));
    const map = new Map<string, string>();
    if (!ids.length) return map;
    const { data } = await supabase.from("collectes").select("id,label,partners(name),beneficiaries(name)").in("id", ids);
    for (const c of (data ?? []) as unknown as { id: string; label: string | null; partners: { name: string } | { name: string }[] | null; beneficiaries: { name: string } | { name: string }[] | null }[]) {
      map.set(c.id, first(c.partners)?.name ?? first(c.beneficiaries)?.name ?? c.label ?? "");
    }
    return map;
  }
  async function linesFromItems(items: { denree: string | null; name: string | null; kg: number | string; source_collecte_id: string | null }[]): Promise<Line[]> {
    const sup = await suppliersFor(items.map((i) => i.source_collecte_id ?? ""));
    return items.map((i) => {
      const kg = r2(Number(i.kg) || 0);
      return { ...blankLine(), category: (i.denree && DENREE_TO_CAT[i.denree]) || "Autre", product: i.name || i.denree || "", weight_kg: String(kg), supplier: (i.source_collecte_id && sup.get(i.source_collecte_id)) || "", don_pct: i.source_collecte_id ? "100" : "", delivery_mode: i.source_collecte_id ? "Collecte Log" : "", source_collecte_id: i.source_collecte_id };
    });
  }

  async function open(e: Entry) {
    await flush();
    setSelKey(e.key);
    dirty.current = false;
    setSaveState("idle");
    const saved = dists.find((d) => `${d.beneficiary_id}|${d.event_date}` === e.key);
    let d: Draft;
    if (saved) d = dbToDraft(saved);
    else {
      const mine = drops.filter((c) => `${c.beneficiary_id}|${c.scheduled_date}` === e.key);
      const lines = await linesFromItems(mine.flatMap((c) => c.collecte_items ?? []));
      d = { beneficiaryId: e.beneficiaryId, date: e.date, registered: "", presence: "80", baskets: "", volunteers: "", coordinators: "", flTarget: "", status: "prevue", receivedOk: false, photoPaths: [], eventPhotos: [], interventions: [], comment: "", lines };
    }
    setDraft(d);
    window.setTimeout(() => detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  }

  /* ---------- saving (debounced; the first save turns a planning entry into a real distribution) ---------- */
  function edit(fn: (d: Draft) => Draft) {
    dirty.current = true;
    setDraft((d) => (d ? fn(d) : d));
    setSaveState("idle");
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void save(), 900);
  }
  async function flush() {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
    if (dirty.current) await save();
  }
  function save(): Promise<unknown> {
    lock.current = lock.current.then(async () => {
      const d = draftRef.current;
      if (!d || !cityId || !dirty.current) return;
      dirty.current = false;
      setSaveState("saving");
      const row = {
        city_id: cityId,
        beneficiary_id: d.beneficiaryId,
        event_date: d.date,
        registered: numOrNull(d.registered) == null ? null : Math.round(num(d.registered)),
        presence_rate: d.presence.trim() === "" ? 80 : num(d.presence),
        baskets: numOrNull(d.baskets) == null ? null : Math.round(num(d.baskets)),
        volunteers_total: numOrNull(d.volunteers) == null ? null : Math.round(num(d.volunteers)),
        coordinators: numOrNull(d.coordinators) == null ? null : Math.round(num(d.coordinators)),
        fl_target_kg: numOrNull(d.flTarget),
        status: d.status,
        received_ok: d.receivedOk,
        photo_paths: d.photoPaths,
        event_photo_paths: d.eventPhotos,
        comment: d.comment || null,
        ...(d.status === "distribuee" ? { validated_at: new Date().toISOString() } : {}),
      };
      const up = await supabase.from("distributions").upsert(row, { onConflict: "beneficiary_id,event_date" }).select("id").single();
      if (up.error || !up.data) {
        setSaveState("idle");
        dirty.current = true;
        return setMsg("Enregistrement impossible : " + (up.error?.message ?? "erreur"));
      }
      const id = up.data.id as string;
      await supabase.from("distribution_lines").delete().eq("distribution_id", id);
      if (d.lines.length) {
        const ins = await supabase.from("distribution_lines").insert(
          d.lines.map((l, i) => ({
            distribution_id: id,
            sort_order: i,
            category: l.category || null,
            product: l.product || null,
            nb_colis: numOrNull(l.nb_colis),
            colis_weight_kg: numOrNull(l.colis_weight_kg),
            weight_kg: numOrNull(l.weight_kg),
            supplier: l.supplier || null,
            don_pct: numOrNull(l.don_pct),
            delivery_mode: l.delivery_mode || null,
            eco_label: l.eco_label || null,
            geo_label: l.geo_label || null,
            source_collecte_id: l.source_collecte_id,
          })),
        );
        if (ins.error) setMsg("Lignes non enregistrées : " + ins.error.message);
      }
      await supabase.from("distribution_interventions").delete().eq("distribution_id", id);
      if (d.interventions.length) {
        const ii = await supabase.from("distribution_interventions").insert(d.interventions.map((i) => ({ distribution_id: id, association_id: i.associationId, comment: i.comment || null, photo_paths: i.photoPaths })));
        if (ii.error) setMsg("Interventions non enregistrées : " + ii.error.message + " (la migration 015 est-elle passée ?)");
      }
      if (!d.id) setDraft((cur) => (cur && !cur.id ? { ...cur, id } : cur));
      setSaveState("saved");
      await load();
    });
    return lock.current;
  }

  async function validate() {
    edit((d) => ({ ...d, status: "distribuee", receivedOk: true }));
    await flush();
  }
  async function reopen() {
    edit((d) => ({ ...d, status: "prevue", receivedOk: false }));
    await flush();
  }

  async function prefillFromDay() {
    if (!draft || !cityId) return;
    const { data } = await supabase
      .from("collectes")
      .select("id,collecte_items!collecte_id(denree,name,kg)")
      .eq("city_id", cityId)
      .eq("scheduled_date", draft.date)
      .eq("status", "collecte")
      .eq("source", "planning")
      .in("kind", ["partner", "exceptionnel", "demande_client"]);
    const items = ((data ?? []) as unknown as { id: string; collecte_items: { denree: string | null; name: string | null; kg: number | string }[] | null }[]).flatMap((c) => (c.collecte_items ?? []).map((i) => ({ ...i, source_collecte_id: c.id })));
    if (!items.length) return setMsg("Aucune collecte réalisée ce jour-là pour l'instant.");
    const lines = await linesFromItems(items);
    edit((d) => ({ ...d, lines: [...d.lines, ...lines] }));
  }

  async function createNew() {
    if (!cityId || !newPlace || !newDate) return;
    const exists = entries.find((e) => e.key === `${newPlace}|${newDate}`);
    setNewOpen(false);
    if (exists) return open(exists);
    await flush();
    setSelKey(`${newPlace}|${newDate}`);
    dirty.current = false;
    setDraft({ beneficiaryId: newPlace, date: newDate, registered: "", presence: "80", baskets: "", volunteers: "", coordinators: "", flTarget: "", status: "prevue", receivedOk: false, photoPaths: [], eventPhotos: [], interventions: [], comment: "", lines: [] });
    edit((d) => d); // creates it right away
  }

  /* ---------- figures ---------- */
  const fig = useMemo(() => {
    if (!draft) return null;
    const L = draft.lines;
    const weight = L.reduce((a, l) => a + num(l.weight_kg), 0);
    const distributed = weight; // kilos received = kilos distributed
    const fl = L.filter((l) => l.category === "F&L").reduce((a, l) => a + num(l.weight_kg), 0);
    const baskets = num(draft.baskets);
    const registered = num(draft.registered);
    return {
      weight, distributed, fl,
      avgBasket: baskets ? distributed / baskets : 0,
      flPer: baskets ? fl / baskets : 0,
      presence: registered && baskets ? (baskets / registered) * 100 : 0,
      expected: Math.round((registered * num(draft.presence)) / 100),
    };
  }, [draft]);

  const place = draft ? placeById.get(draft.beneficiaryId) : null;
  const done = draft?.status === "distribuee";

  function setLine(i: number, k: keyof Line, v: string) {
    edit((d) => ({
      ...d,
      lines: d.lines.map((l, idx) => {
        if (idx !== i) return l;
        const n: Line = { ...l, [k]: v };
        if ((k === "nb_colis" || k === "colis_weight_kg") && n.nb_colis && n.colis_weight_kg) n.weight_kg = String(r2(num(n.nb_colis) * num(n.colis_weight_kg)));
        return n;
      }),
    }));
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[32px] leading-none font-black">Distributions Linkee</h1>
          <p className="mt-1 text-[13.5px] text-[var(--slate)]">Suivi des distributions de {city?.name ?? "la ville"} : inscrits, paniers, produits distribués. Les livraisons du planning apparaissent ici automatiquement.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/saisie-mobile" className="flex items-center gap-1.5 rounded-[40px] border-[1.5px] border-[#2a78d6] px-4 py-[8px] font-display text-[13.5px] font-bold text-[#2a78d6]">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><rect x="6" y="2.5" width="12" height="19" rx="2.5" /><path d="M10.5 18.5 H13.5" /></svg>
            Version mobile
          </Link>
          <button type="button" onClick={() => setNewOpen((v) => !v)} className="flex items-center gap-1.5 rounded-[40px] bg-[var(--navy-deep)] px-[17px] py-[9px] font-display text-[13.5px] font-bold text-[var(--panel-fg)]">
            + Nouvelle distribution
          </button>
        </div>
      </div>

      <DistribTabs />

      {nLate > 0 && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border-[1.5px] border-[var(--critical)] bg-[var(--critical-bg)] px-4 py-3">
          <span className="text-[13.5px] font-semibold text-[var(--critical)]">
            ⚠ {nLate} distribution{nLate > 1 ? "s" : ""} pas encore clôturée{nLate > 1 ? "s" : ""} alors que le jour J est passé. Clique sur « Bien réceptionné et distribué » pour la clôturer.
          </span>
          <button type="button" onClick={() => setFilter("retard")} className="rounded-[40px] bg-[var(--critical)] px-4 py-1.5 text-[12.5px] font-bold text-white">Voir les distributions en retard</button>
        </div>
      )}

      {msg && (
        <div className="mb-3 flex items-start justify-between gap-3 rounded-xl bg-[var(--critical-bg)] px-3.5 py-2.5 text-[12.5px] font-semibold text-[var(--critical)]">
          <span>{msg}</span>
          <button type="button" onClick={() => setMsg(null)}>×</button>
        </div>
      )}

      {newOpen && (
        <div className="mb-4 flex flex-wrap items-end gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
          <div className="min-w-[220px] flex-1">
            <label className={labelCls}>Lieu de distribution</label>
            <select className={fieldCls} value={newPlace} onChange={(e) => setNewPlace(e.target.value)}>
              <option value="">Choisir…</option>
              {places.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            {places.length === 0 && <p className="mt-1 text-[11.5px] text-[var(--slate)]">Aucun lieu : dans Bénéficiaires, mets la catégorie « Distribution Linkee » sur une fiche.</p>}
          </div>
          <div>
            <label className={labelCls}>Date</label>
            <input type="date" className={fieldCls} value={newDate} onChange={(e) => setNewDate(e.target.value)} />
          </div>
          <button type="button" onClick={createNew} disabled={!newPlace} className="rounded-[40px] bg-[#2a78d6] px-5 py-2.5 font-display text-[13.5px] font-bold text-white disabled:opacity-50">Créer</button>
        </div>
      )}

      <div className="flex flex-col gap-4">
        {/* ---- distributions: a compact strip instead of a side column ---- */}
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="text-[12px] font-semibold text-[var(--slate)]">Statut</span>
            {(
              [
                ["all", "Toutes"],
                ["encours", `En cours${count("encours") ? ` ${count("encours")}` : ""}`],
                ["avenir", "À venir"],
                ["retard", `En retard${nLate ? ` ${nLate}` : ""}`],
                ["cloture", "Clôturées"],
              ] as ["all" | "encours" | "avenir" | "retard" | "cloture", string][]
            ).map(([k, l]) => (
              <button key={k} type="button" onClick={() => setFilter(k)} className={`rounded-[40px] border px-3 py-1 text-[11.5px] font-semibold whitespace-nowrap ${filter === k ? "border-[var(--navy-deep)] bg-[var(--navy-deep)] text-[var(--panel-fg)]" : k === "retard" && nLate ? "border-[var(--critical)] text-[var(--critical)]" : "border-[var(--border)] text-[var(--slate)] hover:border-[#2a78d6]"}`}>
                {l}
              </button>
            ))}
            <span className="ml-auto text-[11.5px] text-[var(--slate)]">{shown.length} distribution{shown.length > 1 ? "s" : ""}</span>
          </div>
          {loading && <p className="text-[13px] text-[var(--slate)]">Chargement…</p>}
          {!loading && shown.length === 0 && <p className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--card)] px-4 py-3 text-[13px] text-[var(--slate)]">Aucune distribution. Planifie une dépose dans un lieu « Distribution Linkee », ou crée-en une avec le bouton en haut.</p>}
          <div className="flex gap-2 overflow-x-auto pb-2">
            {shown.map((e) => {
              const p = placeById.get(e.beneficiaryId);
              const on = e.key === selKey;
              return (
                <button key={e.key} type="button" onClick={() => open(e)} className={`flex w-[236px] flex-none items-center gap-2.5 rounded-xl border-[1.5px] bg-[var(--card)] px-2.5 py-2 text-left ${on ? "border-[#2a78d6] shadow-[var(--shadow)]" : "border-[var(--border)] hover:border-[#2a78d6]"}`}>
                  <span className="flex h-10 w-10 flex-none flex-col items-center justify-center rounded-[10px] bg-[#2a78d6] text-white">
                    <span className="font-display text-[15px] leading-none font-black">{new Date(e.date + "T00:00:00").getDate()}</span>
                    <span className="text-[9px] font-semibold uppercase">{new Date(e.date + "T00:00:00").toLocaleDateString("fr-FR", { month: "short" })}</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold text-[var(--navy)]">{p?.name ?? "Lieu"}</span>
                    <span className="mt-0.5 inline-block rounded-[40px] px-2 py-px text-[10.5px] font-bold" style={{ background: STATUS_UI[stOf(e)].bg, color: STATUS_UI[stOf(e)].fg }}>
                      {stOf(e) === "retard" ? "En retard" : STATUS_UI[stOf(e)].label}
                    </span>
                    {(e.registered != null || e.baskets != null) && (
                      <span className="ml-1.5 text-[11px] text-[var(--slate)]">
                        {e.registered != null ? `${e.registered} insc.` : ""}
                        {e.baskets != null ? ` · ${e.baskets} paniers` : ""}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ---- landing page of the selected distribution ---- */}
        <div ref={detailRef} className="scroll-mt-4 min-w-0">
          {!draft || !fig ? (
            <div className="flex flex-col items-center gap-3 rounded-[20px] border border-dashed border-[var(--border)] bg-[var(--card)] px-6 py-[70px] text-center text-[var(--slate)]">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#2a78d6] text-white">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className="h-8 w-8">
                  <path d="M5 9 H19 L17.5 19 H6.5 Z M9 9 V6.5 A3 3 0 0 1 15 6.5 V9" />
                </svg>
              </span>
              <p className="text-[15px] font-semibold text-[var(--navy)]">Sélectionne une distribution</p>
              <p className="max-w-[380px] text-[13px]">Tu retrouveras ici les inscrits, les paniers, le poids moyen du colis et le détail des produits distribués.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {/* header */}
              <div className="rounded-[20px] border border-[var(--border)] bg-[var(--card)] p-5 shadow-[var(--shadow)]" style={{ borderTop: `4px solid ${done ? "var(--good)" : "#2a78d6"}` }}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <h2 className="font-display text-[28px] leading-tight font-black text-[var(--navy)]">{place?.name ?? "Lieu"}</h2>
                      <DistribBadge />
                      <span className="rounded-[40px] px-3 py-1.5 text-[12px] font-bold" style={{ background: STATUS_UI[distribStatus(draft.date, done)].bg, color: STATUS_UI[distribStatus(draft.date, done)].fg }}>
                        {STATUS_UI[distribStatus(draft.date, done)].label}
                      </span>
                    </div>
                    <p className="mt-1 text-[13.5px] text-[var(--slate)]">
                      {fmtDay(draft.date)}
                      {place?.address ? ` · ${place.address}` : ""}
                    </p>
                    <p className={`mt-1 text-[11.5px] font-semibold ${saveState === "saved" ? "text-[var(--good)]" : "text-[var(--slate)]"}`}>{saveState === "saving" ? "Enregistrement…" : saveState === "saved" ? "Modifications enregistrées" : draft.id ? "" : "Pas encore enregistrée — elle le sera dès ta première modification."}</p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    {done ? (
                      <>
                        <span className="flex items-center gap-2 rounded-[40px] bg-[var(--good-bg)] px-4 py-2 font-display text-[14px] font-bold text-[var(--good)]">✓ Clôturée — réceptionnée et distribuée</span>
                        <button type="button" onClick={reopen} className="text-[12px] font-semibold text-[var(--slate)] underline">Rouvrir pour corriger</button>
                      </>
                    ) : (
                      <button type="button" onClick={validate} className="rounded-[40px] bg-[var(--good)] px-6 py-3 font-display text-[15px] font-bold text-white shadow-[var(--shadow)]">
                        Bien réceptionné et distribué
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* key figures: green = to fill in, grey = calculated */}
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
                  <label className={labelCls}>Nombre d&apos;inscrits</label>
                  <input type="number" min={0} className={`${fillCls} font-display !text-[22px] font-black`} value={draft.registered} onChange={(e) => edit((d) => ({ ...d, registered: e.target.value }))} placeholder="0" />
                  <p className="mt-1.5 text-[11.5px] text-[var(--slate)]">À compléter</p>
                </div>
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
                  <label className={labelCls}>Nombre de paniers distribués</label>
                  <input type="number" min={0} className={`${fillCls} font-display !text-[22px] font-black`} value={draft.baskets} onChange={(e) => edit((d) => ({ ...d, baskets: e.target.value }))} placeholder="0" />
                  <p className="mt-1.5 text-[11.5px] text-[var(--slate)]">À compléter à la fin de la distribution</p>
                </div>
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--track)] p-4">
                  <span className={labelCls}>Taux de présence</span>
                  <div className="rounded-[10px] bg-[var(--input-bg)] px-2.5 py-1.5 font-display text-[22px] font-black text-[var(--slate)] tabular-nums">{fig.presence ? `${fmt(fig.presence, 0)} %` : "—"}</div>
                  <p className="mt-1.5 text-[11.5px] text-[var(--slate)]">Calculé : paniers ÷ inscrits</p>
                </div>
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--track)] p-4">
                  <span className={labelCls}>Poids moyen par colis théorique</span>
                  <div className="rounded-[10px] bg-[var(--input-bg)] px-2.5 py-1.5 font-display text-[22px] font-black text-[var(--slate)] tabular-nums">{fig.avgBasket ? `${fmt(fig.avgBasket, 2)} kg` : "—"}</div>
                  <p className="mt-1.5 text-[11.5px] text-[var(--slate)]">Calculé : {fmt(fig.weight)} kg du tableau ÷ paniers</p>
                </div>
              </div>
              {/* volunteers */}
              <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 py-3.5" style={{ borderTop: "4px solid var(--client-req)" }}>
                <div className="flex items-center gap-2.5">
                  <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-[var(--client-req)] text-white">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                      <circle cx="9" cy="8" r="3" />
                      <path d="M3 19 C3.5 15.5 5.8 13.6 9 13.6 C12.2 13.6 14.5 15.5 15 19" />
                      <path d="M16 5.5 A3 3 0 0 1 16 11 M17.5 13.8 C19.6 14.3 20.7 16 21 19" />
                    </svg>
                  </span>
                  <div>
                    <div className="text-[14.5px] font-semibold text-[var(--navy)]">Équipe bénévole</div>
                    <div className="text-[11.5px] text-[var(--slate)]">Présents à la distribution</div>
                  </div>
                </div>
                <div className="w-[190px]">
                  <label className={labelCls}>Bénévoles présents (total)</label>
                  <input type="number" min={0} className={`${fillCls} font-display !text-[20px] font-black`} value={draft.volunteers} onChange={(e) => edit((d) => ({ ...d, volunteers: e.target.value }))} placeholder="0" />
                </div>
                <div className="w-[190px]">
                  <label className={labelCls}>dont coordinateurs</label>
                  <input type="number" min={0} className={`${fillCls} font-display !text-[20px] font-black`} value={draft.coordinators} onChange={(e) => edit((d) => ({ ...d, coordinators: e.target.value }))} placeholder="0" />
                </div>
                {num(draft.coordinators) > num(draft.volunteers) && <span className="text-[12px] font-semibold text-[var(--critical)]">Les coordinateurs sont comptés dans le total : vérifie les chiffres.</span>}
              </div>

              {/* products */}              <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-[15px] font-semibold text-[var(--navy)]">Produits distribués</h3>
                    <p className="text-[11.5px] text-[var(--slate)]">Pré-rempli avec ce qui est livré au planning ce jour-là. Poids = nb colis × poids d&apos;un colis.</p>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={prefillFromDay} className="rounded-[40px] border-[1.5px] border-[var(--border)] px-3.5 py-2 text-[12.5px] font-semibold text-[var(--navy)] hover:border-[#2a78d6]">
                      Ajouter les collectes du jour
                    </button>
                    <button type="button" onClick={() => edit((d) => ({ ...d, lines: [...d.lines, blankLine()] }))} className="rounded-[40px] bg-[#2a78d6] px-3.5 py-2 text-[12.5px] font-bold text-white">
                      + Ajouter une ligne
                    </button>
                  </div>
                </div>
                <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
                  <table className="text-left" style={{ minWidth: COLS.reduce((a, c) => a + c.w, 0) + 44 }}>
                    <thead>
                      <tr className="bg-[var(--input-bg)]">
                        {COLS.map((c) => (
                          <th key={c.k} style={{ width: c.w, minWidth: c.w }} className="px-1.5 py-2 text-[11px] font-semibold text-[var(--slate)]">{c.l}</th>
                        ))}
                        <th className="w-[44px]" />
                      </tr>
                    </thead>
                    <tbody>
                      {draft.lines.length === 0 && (
                        <tr>
                          <td colSpan={COLS.length + 1} className="px-4 py-6 text-center text-[12.5px] text-[var(--slate)]">Aucun produit pour l&apos;instant. Ajoute une ligne, ou récupère les collectes du jour.</td>
                        </tr>
                      )}
                      {draft.lines.map((l, i) => (
                        <tr key={l.key} className="border-t border-[var(--border)]">
                          {COLS.map((c) => (
                            <td key={c.k} className="px-1 py-0.5">
                              {c.type === "cat" ? (
                                <select className={cellCls} value={l.category} onChange={(e) => setLine(i, "category", e.target.value)}>
                                  {Array.from(new Set([...CATS, l.category])).map((x) => (
                                    <option key={x}>{x}</option>
                                  ))}
                                </select>
                              ) : c.type === "opt" || c.type === "supplier" ? (
                                <select className={cellCls} value={l[c.k]} onChange={(e) => setLine(i, c.k, e.target.value)}>
                                  <option value="">—</option>
                                  {Array.from(new Set([...(c.type === "supplier" ? [...suppliers, STOCK_SUPPLIER] : OPTIONS[c.k]), l[c.k]].filter(Boolean))).map((x) => (
                                    <option key={x}>{x}</option>
                                  ))}
                                </select>
                              ) : (
                                <input type={c.type === "num" ? "number" : "text"} step={c.type === "num" ? "any" : undefined} className={`${cellCls} ${c.type === "num" ? "text-right tabular-nums" : ""}`} value={l[c.k]} onChange={(e) => setLine(i, c.k, e.target.value)} />
                              )}
                            </td>
                          ))}
                          <td className="px-1 text-center">
                            <button type="button" title="Supprimer la ligne" onClick={() => edit((d) => ({ ...d, lines: d.lines.filter((_, k) => k !== i) }))} className="h-7 w-7 rounded-full text-[var(--slate)] hover:bg-[var(--critical-bg)] hover:text-[var(--critical)]">×</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    {draft.lines.length > 0 && (
                      <tfoot>
                        <tr className="border-t-2 border-[var(--border)] bg-[var(--input-bg)] text-[12.5px] font-semibold text-[var(--navy)]">
                          <td className="px-2.5 py-2" colSpan={2}>Total</td>
                          <td className="px-2.5 py-2 text-right tabular-nums">{fmt(draft.lines.reduce((a, l) => a + num(l.nb_colis), 0), 0)}</td>
                          <td />
                          <td className="px-2.5 py-2 text-right tabular-nums">{fmt(fig.weight)}</td>
                          <td colSpan={COLS.length - 4} />
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3">                <div className="rounded-2xl border-[1.5px] border-[#2a78d6] bg-[var(--card)] p-4">
                  <h3 className="mb-0.5 flex items-center gap-2 text-[14.5px] font-semibold text-[var(--navy)]">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px] text-[#2a78d6]">
                      <path d="M4 5 H20 V16 H10 L5.5 20 V16 H4 Z" />
                    </svg>
                    Commentaire de la distribution
                  </h3>
                  <p className="mb-2 text-[11.5px] text-[var(--slate)]">Affluence, imprévus, retours des bénéficiaires… il apparaît aussi dans l&apos;historique du pilotage.</p>
                  <textarea className={`${fillCls} min-h-[90px] resize-y`} placeholder="Ex : rupture de pain, forte affluence…" value={draft.comment} onChange={(e) => edit((d) => ({ ...d, comment: e.target.value }))} />
                </div>
              </div>

              {/* photos: parcel and event are two separate spaces */}
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4" style={{ borderTop: "4px solid var(--cat-4)" }}>
                  <h3 className="text-[14.5px] font-semibold text-[var(--navy)]">Photos du colis</h3>
                  <p className="mb-2.5 text-[11.5px] text-[var(--slate)]">Le contenu type d&apos;un panier distribué.</p>
                  <PhotoStrip paths={draft.photoPaths} folder={`${cityId}/dist-${draft.beneficiaryId}-${draft.date}`} onChange={(p) => edit((d) => ({ ...d, photoPaths: p }))} accent="var(--cat-4)" />
                </div>
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4" style={{ borderTop: "4px solid #2a78d6" }}>
                  <h3 className="text-[14.5px] font-semibold text-[var(--navy)]">Photos de la distribution</h3>
                  <p className="mb-2.5 text-[11.5px] text-[var(--slate)]">Ambiance, stand, bénéficiaires, bénévoles…</p>
                  <PhotoStrip paths={draft.eventPhotos} folder={`${cityId}/dist-${draft.beneficiaryId}-${draft.date}`} onChange={(p) => edit((d) => ({ ...d, eventPhotos: p }))} accent="#2a78d6" />
                </div>
              </div>
              {/* associations present (external interventions) */}
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4" style={{ borderTop: "4px solid #eb6834" }}>
                <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="flex items-center gap-2 text-[14.5px] font-semibold text-[var(--navy)]">
                    Associations présentes
                    <span className="rounded-[40px] bg-[#eb6834] px-2.5 py-0.5 text-[12px] font-bold text-white">{draft.interventions.length}</span>
                  </h3>
                  <Link href="/distributions/village" className="text-[12px] font-semibold text-[#eb6834]">Ouvrir le Village associatif →</Link>
                </div>
                <p className="mb-3 text-[11.5px] text-[var(--slate)]">Choisis dans la liste celles qui sont intervenues. Chaque intervention apparaît aussi dans la fiche de l&apos;association.</p>
                <select
                  value=""
                  onChange={(e) => {
                    const id = e.target.value;
                    if (id) edit((d) => (d.interventions.some((i) => i.associationId === id) ? d : { ...d, interventions: [...d.interventions, { associationId: id, comment: "", photoPaths: [] }] }));
                  }}
                  className={`${fieldCls} max-w-[420px]`}
                >
                  <option value="">{assocs.filter((a) => !a.archived && !draft.interventions.some((i) => i.associationId === a.id)).length ? "Ajouter une association présente…" : assocs.length ? "Toutes les associations sont déjà ajoutées" : "Aucune association dans le Village associatif"}</option>
                  {assocs.filter((a) => !a.archived && !draft.interventions.some((i) => i.associationId === a.id)).map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>                {draft.interventions.length > 0 && (
                  <div className="mt-4 flex flex-col gap-3">
                    {draft.interventions.map((iv) => {
                      const a = assocs.find((x) => x.id === iv.associationId);
                      return (
                        <div key={iv.associationId} className="rounded-xl border border-[var(--border)] bg-[var(--input-bg)] p-3">
                          <div className="mb-2 flex items-center justify-between">
                            <span className="text-[13.5px] font-semibold text-[var(--navy)]">{a?.name ?? "Association"}{a?.activity_type ? <span className="ml-2 text-[11.5px] font-normal text-[var(--slate)]">{a.activity_type}</span> : null}</span>
                            <button type="button" onClick={() => edit((d) => ({ ...d, interventions: d.interventions.filter((i) => i.associationId !== iv.associationId) }))} className="text-[12px] font-semibold text-[var(--slate)] hover:text-[var(--critical)]">Retirer</button>
                          </div>
                          <textarea className={`${fillCls} min-h-[64px] resize-y`} placeholder="Ce que l'association a fait, retour sur son intervention…" value={iv.comment} onChange={(e) => edit((d) => ({ ...d, interventions: d.interventions.map((i) => (i.associationId === iv.associationId ? { ...i, comment: e.target.value } : i)) }))} />
                          <div className="mt-2">
                            <PhotoStrip paths={iv.photoPaths} folder={`${cityId}/dist-${draft.beneficiaryId}-${draft.date}`} onChange={(p) => edit((d) => ({ ...d, interventions: d.interventions.map((i) => (i.associationId === iv.associationId ? { ...i, photoPaths: p } : i)) }))} accent="#eb6834" size={72} label="Photos" />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

            </div>
          )}
        </div>
      </div>
    </div>
  );
}
