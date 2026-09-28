"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useCity } from "@/components/admin/CityContext";
import { signedUrls, uploadPrivatePhoto } from "@/lib/photos";
import DistribTabs from "@/components/DistribTabs";

/* ---------------- types ---------------- */
type Place = { id: string; name: string; cat: string; address: string };
type Line = {
  key: string;
  category: string;
  product: string;
  nb_colis: string;
  colis_weight_kg: string;
  weight_kg: string;
  loss_pct: string;
  returned_kg: string;
  redistributed_kg: string;
  distributed_kg: string;
  price: string;
  total_cost: string;
  supplier: string;
  don_pct: string;
  delivery_mode: string;
  eco_label: string;
  geo_label: string;
  categorisation: string;
  source_collecte_id: string | null;
};
type Draft = {
  id?: string;
  beneficiaryId: string;
  date: string;
  registered: string;
  presence: string;
  baskets: string;
  flTarget: string;
  status: "prevue" | "distribuee";
  receivedOk: boolean;
  photoPaths: string[];
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
  fl_target_kg: number | string | null;
  status: "prevue" | "distribuee";
  received_ok: boolean;
  photo_paths: string[] | null;
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

const blankLine = (): Line => ({ key: uid(), category: "F&L", product: "", nb_colis: "", colis_weight_kg: "", weight_kg: "", loss_pct: "", returned_kg: "", redistributed_kg: "", distributed_kg: "", price: "", total_cost: "", supplier: "", don_pct: "", delivery_mode: "", eco_label: "", geo_label: "", categorisation: "", source_collecte_id: null });

const fieldCls = "w-full rounded-[10px] border-[1.5px] border-[var(--border)] bg-[var(--input-bg)] px-2.5 py-2 text-[13px] font-medium text-[var(--navy)] outline-none focus:border-[var(--turquoise)]";
const labelCls = "mb-1 block text-[11.5px] font-semibold text-[var(--slate)]";
const cellCls = "w-full rounded-lg border border-transparent bg-transparent px-1.5 py-1.5 text-[12.5px] text-[var(--navy)] outline-none hover:border-[var(--border)] focus:border-[var(--turquoise)] focus:bg-[var(--input-bg)]";

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

const COLS: { k: keyof Omit<Line, "key" | "source_collecte_id">; l: string; w: number; type?: "num" | "cat" }[] = [
  { k: "category", l: "Catégorie", w: 118, type: "cat" },
  { k: "product", l: "Produit", w: 170 },
  { k: "nb_colis", l: "Nb colis", w: 74, type: "num" },
  { k: "colis_weight_kg", l: "Pds colis (kg)", w: 88, type: "num" },
  { k: "weight_kg", l: "Poids (kg)", w: 82, type: "num" },
  { k: "loss_pct", l: "% pertes", w: 72, type: "num" },
  { k: "returned_kg", l: "Retours (kg)", w: 82, type: "num" },
  { k: "redistributed_kg", l: "Redonné (kg)", w: 86, type: "num" },
  { k: "distributed_kg", l: "Distribué (kg)", w: 90, type: "num" },
  { k: "price", l: "Prix (€)", w: 72, type: "num" },
  { k: "total_cost", l: "Coût total (€)", w: 92, type: "num" },
  { k: "supplier", l: "Fournisseur", w: 140 },
  { k: "don_pct", l: "% don", w: 66, type: "num" },
  { k: "delivery_mode", l: "Mode de livraison", w: 130 },
  { k: "eco_label", l: "Label éco", w: 96 },
  { k: "geo_label", l: "Label géo", w: 96 },
  { k: "categorisation", l: "Catégorisation", w: 120 },
];

function dbToDraft(d: DbDist): Draft {
  return {
    id: d.id,
    beneficiaryId: d.beneficiary_id,
    date: d.event_date,
    registered: s(d.registered),
    presence: s(d.presence_rate),
    baskets: s(d.baskets),
    flTarget: s(d.fl_target_kg),
    status: d.status,
    receivedOk: d.received_ok,
    photoPaths: d.photo_paths ?? [],
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
  const [dists, setDists] = useState<DbDist[]>([]);
  const [drops, setDrops] = useState<PlanDrop[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [filter, setFilter] = useState<"todo" | "done" | "all">("all");
  const [selKey, setSelKey] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [photoBusy, setPhotoBusy] = useState(false);
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
    const [dq, cq] = await Promise.all([
      supabase.from("distributions").select("*,distribution_lines(*)").eq("city_id", cityId).gte("event_date", since).order("event_date", { ascending: false }),
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
  const shown = entries.filter((e) => (filter === "all" ? true : filter === "done" ? e.status === "distribuee" : e.status === "prevue"));
  const nTodo = entries.filter((e) => e.status === "prevue").length;

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
      return { ...blankLine(), category: (i.denree && DENREE_TO_CAT[i.denree]) || "Autre", product: i.name || i.denree || "", weight_kg: String(kg), distributed_kg: String(kg), supplier: (i.source_collecte_id && sup.get(i.source_collecte_id)) || "", don_pct: i.source_collecte_id ? "100" : "", delivery_mode: i.source_collecte_id ? "Collecte Log" : "", source_collecte_id: i.source_collecte_id };
    });
  }

  async function open(e: Entry) {
    await flush();
    setSelKey(e.key);
    setPhotoUrls([]);
    dirty.current = false;
    setSaveState("idle");
    const saved = dists.find((d) => `${d.beneficiary_id}|${d.event_date}` === e.key);
    let d: Draft;
    if (saved) d = dbToDraft(saved);
    else {
      const mine = drops.filter((c) => `${c.beneficiary_id}|${c.scheduled_date}` === e.key);
      const lines = await linesFromItems(mine.flatMap((c) => c.collecte_items ?? []));
      d = { beneficiaryId: e.beneficiaryId, date: e.date, registered: "", presence: "80", baskets: "", flTarget: "", status: "prevue", receivedOk: false, photoPaths: [], comment: "", lines };
    }
    setDraft(d);
    window.setTimeout(() => detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  }

  useEffect(() => {
    if (!draft?.photoPaths.length) return setPhotoUrls([]);
    signedUrls(supabase, draft.photoPaths).then((u) => setPhotoUrls(u.filter(Boolean)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft?.photoPaths.join("|")]);

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
        fl_target_kg: numOrNull(d.flTarget),
        status: d.status,
        received_ok: d.receivedOk,
        photo_paths: d.photoPaths,
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
            loss_pct: numOrNull(l.loss_pct),
            returned_kg: numOrNull(l.returned_kg),
            redistributed_kg: numOrNull(l.redistributed_kg),
            distributed_kg: numOrNull(l.distributed_kg),
            price: numOrNull(l.price),
            total_cost: numOrNull(l.total_cost),
            supplier: l.supplier || null,
            don_pct: numOrNull(l.don_pct),
            delivery_mode: l.delivery_mode || null,
            eco_label: l.eco_label || null,
            geo_label: l.geo_label || null,
            categorisation: l.categorisation || null,
            source_collecte_id: l.source_collecte_id,
          })),
        );
        if (ins.error) setMsg("Lignes non enregistrées : " + ins.error.message);
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

  async function addPhoto(f: File) {
    if (!cityId || !draft) return;
    setPhotoBusy(true);
    try {
      const path = await uploadPrivatePhoto(supabase, `${cityId}/dist-${draft.beneficiaryId}-${draft.date}`, f);
      edit((d) => ({ ...d, photoPaths: [...d.photoPaths, path] }));
    } catch (e) {
      setMsg("Photo non envoyée : " + (e as Error).message);
    }
    setPhotoBusy(false);
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
    setPhotoUrls([]);
    dirty.current = false;
    setDraft({ beneficiaryId: newPlace, date: newDate, registered: "", presence: "80", baskets: "", flTarget: "", status: "prevue", receivedOk: false, photoPaths: [], comment: "", lines: [] });
    edit((d) => d); // creates it right away
  }

  /* ---------- figures ---------- */
  const fig = useMemo(() => {
    if (!draft) return null;
    const L = draft.lines;
    const weight = L.reduce((a, l) => a + num(l.weight_kg), 0);
    const distributed = L.reduce((a, l) => a + num(l.distributed_kg), 0);
    const cost = L.reduce((a, l) => a + num(l.total_cost), 0);
    const lossKg = L.reduce((a, l) => a + (num(l.weight_kg) * num(l.loss_pct)) / 100, 0);
    const fl = L.filter((l) => l.category === "F&L").reduce((a, l) => a + num(l.distributed_kg), 0);
    const baskets = num(draft.baskets);
    const registered = num(draft.registered);
    return {
      weight, distributed, cost, fl,
      lossPct: weight ? (lossKg / weight) * 100 : 0,
      avgBasket: baskets ? distributed / baskets : 0,
      costPer: baskets ? cost / baskets : 0,
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
        if (k === "nb_colis" || k === "colis_weight_kg") {
          if (n.nb_colis && n.colis_weight_kg) {
            n.weight_kg = String(r2(num(n.nb_colis) * num(n.colis_weight_kg)));
            n.distributed_kg = n.weight_kg;
          }
        }
        if (k === "price" || k === "weight_kg" || k === "nb_colis" || k === "colis_weight_kg") {
          if (n.price && n.weight_kg) n.total_cost = String(r2(num(n.price) * num(n.weight_kg)));
        }
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
        <button type="button" onClick={() => setNewOpen((v) => !v)} className="flex items-center gap-1.5 rounded-[40px] bg-[var(--navy-deep)] px-[17px] py-[9px] font-display text-[13.5px] font-bold text-[var(--panel-fg)]">
          + Nouvelle distribution
        </button>
      </div>

      <DistribTabs />

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

      <div className="grid grid-cols-1 items-start gap-[18px] xl:grid-cols-[340px_1fr]">
        {/* ---- list ---- */}
        <div className="rounded-[18px] border border-[var(--border)] bg-[var(--card)] p-2.5 shadow-[var(--shadow)]">
          <div className="mb-2 flex gap-1 rounded-[40px] bg-[var(--input-bg)] p-1">
            {(
              [
                ["all", "Toutes"],
                ["todo", `À valider${nTodo ? ` (${nTodo})` : ""}`],
                ["done", "Distribuées"],
              ] as ["all" | "todo" | "done", string][]
            ).map(([k, l]) => (
              <button key={k} type="button" onClick={() => setFilter(k)} className={`flex-1 rounded-[40px] px-2 py-1.5 text-[12px] font-semibold ${filter === k ? "bg-[var(--navy-deep)] text-[var(--panel-fg)]" : "text-[var(--slate)]"}`}>
                {l}
              </button>
            ))}
          </div>
          <div className="max-h-[calc(100vh-260px)] overflow-y-auto">
            {loading && <p className="p-4 text-[13px] text-[var(--slate)]">Chargement…</p>}
            {!loading && shown.length === 0 && <p className="p-4 text-[13px] text-[var(--slate)]">Aucune distribution. Planifie une dépose dans un lieu « Distribution Linkee », ou crée-en une avec le bouton en haut.</p>}
            {shown.map((e) => {
              const p = placeById.get(e.beneficiaryId);
              const on = e.key === selKey;
              return (
                <button key={e.key} type="button" onClick={() => open(e)} className={`mb-1 flex w-full items-center gap-3 rounded-xl border-[1.5px] px-3 py-2.5 text-left ${on ? "border-[#2a78d6] bg-[var(--track)]" : "border-transparent hover:bg-[var(--input-bg)]"}`}>
                  <span className="flex h-10 w-10 flex-none flex-col items-center justify-center rounded-[10px] bg-[#2a78d6] text-white">
                    <span className="font-display text-[15px] leading-none font-black">{new Date(e.date + "T00:00:00").getDate()}</span>
                    <span className="text-[9px] font-semibold uppercase">{new Date(e.date + "T00:00:00").toLocaleDateString("fr-FR", { month: "short" })}</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-semibold text-[var(--navy)]">{p?.name ?? "Lieu"}</span>
                    <span className="block text-[11.5px] text-[var(--slate)]">
                      {fmtShort(e.date)}
                      {e.registered != null ? ` · ${e.registered} inscrits` : ""}
                      {e.baskets != null ? ` · ${e.baskets} paniers` : ""}
                    </span>
                  </span>
                  <span className={`flex-none rounded-[40px] px-2 py-0.5 text-[10.5px] font-bold ${e.status === "distribuee" ? "bg-[var(--good-bg)] text-[var(--good)]" : "bg-[var(--warn-bg)] text-[var(--warn)]"}`}>
                    {e.status === "distribuee" ? "Distribuée" : e.planned && !e.saved ? "Au planning" : "À valider"}
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
                        <span className="flex items-center gap-2 rounded-[40px] bg-[var(--good-bg)] px-4 py-2 font-display text-[14px] font-bold text-[var(--good)]">✓ Réceptionnée et distribuée</span>
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

              {/* key figures */}
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
                  <label className={labelCls}>Nombre d&apos;inscrits</label>
                  <input type="number" min={0} className={`${fieldCls} font-display !text-[22px] font-black`} value={draft.registered} onChange={(e) => edit((d) => ({ ...d, registered: e.target.value }))} placeholder="0" />
                  <p className="mt-1.5 text-[11.5px] text-[var(--slate)]">≈ {fig.expected} présents attendus</p>
                </div>
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
                  <label className={labelCls}>Présence estimée</label>
                  <div className="relative">
                    <input type="number" min={0} max={100} className={`${fieldCls} !pr-7 font-display !text-[22px] font-black`} value={draft.presence} onChange={(e) => edit((d) => ({ ...d, presence: e.target.value }))} />
                    <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-[13px] font-bold text-[var(--slate)]">%</span>
                  </div>
                  <p className="mt-1.5 text-[11.5px] text-[var(--slate)]">Réelle : {fig.presence ? `${fmt(fig.presence, 0)} %` : "—"}</p>
                </div>
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
                  <label className={labelCls}>Paniers distribués</label>
                  <input type="number" min={0} className={`${fieldCls} font-display !text-[22px] font-black`} value={draft.baskets} onChange={(e) => edit((d) => ({ ...d, baskets: e.target.value }))} placeholder="0" />
                  <p className="mt-1.5 text-[11.5px] text-[var(--slate)]">Ce que le responsable compte à la fin</p>
                </div>
                <div className="rounded-2xl border-[1.5px] border-[#2a78d6] bg-[var(--card)] p-4">
                  <span className={labelCls}>Poids moyen du colis</span>
                  <div className="font-display text-[26px] leading-tight font-black text-[var(--navy)] tabular-nums">{fig.avgBasket ? `${fmt(fig.avgBasket, 2)} kg` : "—"}</div>
                  <p className="mt-1.5 text-[11.5px] text-[var(--slate)]">{fmt(fig.distributed)} kg distribués</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {[
                  ["Coût par personne", fig.costPer ? eur(fig.costPer) : "—", `${eur(fig.cost)} au total`],
                  ["F&L par personne", fig.flPer ? `${fmt(fig.flPer, 2)} kg` : "—", draft.flTarget ? `cible ${draft.flTarget} kg` : `${fmt(fig.fl)} kg de F&L`],
                  ["Pertes", `${fmt(fig.lossPct, 1)} %`, `sur ${fmt(fig.weight)} kg reçus`],
                  ["Poids total reçu", `${fmt(fig.weight)} kg`, `${draft.lines.length} ligne${draft.lines.length > 1 ? "s" : ""} produit`],
                ].map(([l, v, sub]) => (
                  <div key={l} className="rounded-2xl bg-[var(--track)] px-4 py-3">
                    <div className="text-[11.5px] font-semibold text-[var(--slate)]">{l}</div>
                    <div className="font-display text-[21px] font-black text-[var(--navy)] tabular-nums">{v}</div>
                    <div className="text-[11.5px] text-[var(--slate)]">{sub}</div>
                  </div>
                ))}
              </div>

              {/* photo + notes */}
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
                  <h3 className="mb-2 text-[14.5px] font-semibold text-[var(--navy)]">Photo du colis</h3>
                  <div className="flex flex-wrap gap-2">
                    {photoUrls.map((u, i) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={i} src={u} alt="Colis distribué" className="h-24 w-24 rounded-xl object-cover" />
                    ))}
                    <label className={`flex h-24 min-w-[96px] cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-[#2a78d6] px-3 text-center text-[12px] font-semibold text-[var(--navy)] ${photoBusy ? "opacity-50" : ""}`}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6 text-[#2a78d6]">
                        <path d="M4 8 L7 4 H17 L20 8" />
                        <rect x="3" y="8" width="18" height="12" rx="2" />
                        <circle cx="12" cy="14" r="3.2" />
                      </svg>
                      {photoBusy ? "Envoi…" : "Ajouter une photo"}
                      <input type="file" accept="image/*" hidden disabled={photoBusy} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void addPhoto(f); }} />
                    </label>
                  </div>
                </div>
                <div className="rounded-2xl border-[1.5px] border-[#2a78d6] bg-[var(--card)] p-4">
                  <h3 className="mb-0.5 flex items-center gap-2 text-[14.5px] font-semibold text-[var(--navy)]">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px] text-[#2a78d6]">
                      <path d="M4 5 H20 V16 H10 L5.5 20 V16 H4 Z" />
                    </svg>
                    Commentaire de la distribution
                  </h3>
                  <p className="mb-2 text-[11.5px] text-[var(--slate)]">Affluence, imprévus, retours des bénéficiaires… il apparaît aussi dans l&apos;historique du pilotage.</p>
                  <textarea className={`${fieldCls} min-h-[90px] resize-y`} placeholder="Ex : rupture de pain, forte affluence…" value={draft.comment} onChange={(e) => edit((d) => ({ ...d, comment: e.target.value }))} />
                  <div className="mt-2 flex items-center gap-2">
                    <label className="text-[11.5px] font-semibold text-[var(--slate)]">Cible F&amp;L par personne</label>
                    <input type="number" min={0} step="0.1" className={`${fieldCls} !w-[90px]`} value={draft.flTarget} onChange={(e) => edit((d) => ({ ...d, flTarget: e.target.value }))} placeholder="kg" />
                  </div>
                </div>
              </div>

              {/* products */}
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-[15px] font-semibold text-[var(--navy)]">Produits distribués</h3>
                    <p className="text-[11.5px] text-[var(--slate)]">Pré-rempli avec ce qui est livré au planning ce jour-là. Poids = nb colis × poids d&apos;un colis, coût = prix × poids.</p>
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
                          <td className="px-2.5 py-2 text-right tabular-nums">{fmt(fig.lossPct)}%</td>
                          <td className="px-2.5 py-2 text-right tabular-nums">{fmt(draft.lines.reduce((a, l) => a + num(l.returned_kg), 0))}</td>
                          <td className="px-2.5 py-2 text-right tabular-nums">{fmt(draft.lines.reduce((a, l) => a + num(l.redistributed_kg), 0))}</td>
                          <td className="px-2.5 py-2 text-right tabular-nums">{fmt(fig.distributed)}</td>
                          <td />
                          <td className="px-2.5 py-2 text-right tabular-nums">{fmt(fig.cost, 2)}</td>
                          <td colSpan={COLS.length - 10} />
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
