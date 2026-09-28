"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import { CityProvider, useCity } from "@/components/admin/CityContext";
import PhotoStrip from "@/components/PhotoStrip";
import { STATUS_UI, distribStatus, isoToday } from "@/lib/distributions";

/* ---------------- types & helpers ---------------- */
type Place = { id: string; name: string };
type Assoc = { id: string; name: string };
type Entry = { key: string; beneficiaryId: string; date: string; closed: boolean };
type Inter = { associationId: string; comment: string; photoPaths: string[] };
type Draft = {
  id?: string;
  registered: string;
  baskets: string;
  volunteers: string;
  coordinators: string;
  photoPaths: string[];
  eventPhotos: string[];
  interventions: Inter[];
  closed: boolean;
  lineKg: number | null; // total of the lines already stored for this distribution (null = none yet)
};
type DayItem = { denree: string | null; name: string | null; kg: number | string };
type DayCollecte = { id: string; name: string; status: string; items: DayItem[]; kg: number };

const DENREE_TO_CAT: Record<string, string> = { "Fruits et légumes": "F&L", Boulangerie: "Boulang", Secs: "Sec", "Produits frais": "Frais", "Plats préparés": "Plats préparés" };
const num = (s: string) => {
  const v = parseFloat(String(s).replace(",", "."));
  return Number.isFinite(v) ? v : 0;
};
const intOrNull = (s: string) => (s.trim() === "" ? null : Math.round(num(s)));
const r1 = (n: number) => Math.round(n * 10) / 10;
const isoAdd = (days: number) => {
  const d = new Date(Date.now() + days * 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const fmtDay = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
const first = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));
const blank = (): Draft => ({ registered: "", baskets: "", volunteers: "", coordinators: "", photoPaths: [], eventPhotos: [], interventions: [], closed: false, lineKg: null });

const bigInput = "h-[58px] w-full rounded-2xl border-2 border-[var(--good)]/45 bg-[var(--good-bg)] px-4 text-center font-display text-[28px] font-black text-[var(--navy)] outline-none focus:border-[var(--good)]";

function Step({ n, title, sub, children }: { n: number; title: string; sub?: string; children: ReactNode }) {
  return (
    <section className="rounded-[20px] border-2 border-[var(--border)] bg-[var(--card)] p-4 shadow-[var(--shadow)]">
      <div className="mb-3.5 flex items-start gap-2.5">
        <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-[#2a78d6] font-display text-[16px] font-black text-white">{n}</span>
        <div className="min-w-0">
          <h2 className="font-display text-[19px] leading-tight font-extrabold text-[var(--navy)]">{title}</h2>
          {sub && <p className="mt-0.5 text-[12px] leading-[1.4] text-[var(--slate)]">{sub}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-bold text-[var(--navy)]">{label}</span>
      <input type="number" inputMode="numeric" min={0} pattern="[0-9]*" value={value} onChange={(e) => onChange(e.target.value)} placeholder="0" className={bigInput} />
    </label>
  );
}

function Page() {
  const supabase = useMemo(() => createClient(), []);
  const { ready, cityId, city } = useCity();
  const [places, setPlaces] = useState<Place[]>([]);
  const [assocs, setAssocs] = useState<Assoc[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [selKey, setSelKey] = useState("");
  const [d, setD] = useState<Draft>(blank());
  const [day, setDay] = useState<DayCollecte[]>([]);
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [msg, setMsg] = useState<string | null>(null);
  const dRef = useRef(d);
  dRef.current = d;
  const dirty = useRef({ fields: false, inters: false });
  const timer = useRef<number | null>(null);
  const lock = useRef<Promise<unknown>>(Promise.resolve());
  const keyRef = useRef("");
  keyRef.current = selKey;
  const dirtyKey = useRef(""); // the distribution the unsaved changes belong to (the selection may already have moved on)

  const [benId, date] = selKey.split("|");
  const place = places.find((p) => p.id === benId);

  /* ---------- lists: Linkee places, distributions of the last / next two weeks ---------- */
  useEffect(() => {
    if (!ready || !cityId) return;
    (async () => {
      const from = isoAdd(-14);
      const to = isoAdd(14);
      const b = await supabase.from("beneficiaries").select("id,name,category,fiche").eq("city_id", cityId).order("name");
      const pl = ((b.data ?? []) as { id: string; name: string; category: string | null; fiche: { pinned?: boolean } | null }[]).filter((x) => x.category === "Distribution Linkee" || x.fiche?.pinned).map((x) => ({ id: x.id, name: x.name }));
      setPlaces(pl);
      const ids = pl.map((p) => p.id);
      const [ds, cs, as] = await Promise.all([
        supabase.from("distributions").select("beneficiary_id,event_date,status").eq("city_id", cityId).gte("event_date", from).lte("event_date", to),
        ids.length ? supabase.from("collectes").select("beneficiary_id,scheduled_date").eq("city_id", cityId).eq("kind", "dropoff").eq("source", "planning").in("beneficiary_id", ids).gte("scheduled_date", from).lte("scheduled_date", to).neq("status", "annule") : Promise.resolve({ data: [] }),
        supabase.from("associations").select("id,name").eq("city_id", cityId).eq("archived", false).order("name"),
      ]);
      setAssocs((as.data ?? []) as Assoc[]);
      const map = new Map<string, Entry>();
      for (const x of (ds.data ?? []) as { beneficiary_id: string; event_date: string; status: string }[]) map.set(`${x.beneficiary_id}|${x.event_date}`, { key: `${x.beneficiary_id}|${x.event_date}`, beneficiaryId: x.beneficiary_id, date: x.event_date, closed: x.status === "distribuee" });
      for (const x of (cs.data ?? []) as { beneficiary_id: string; scheduled_date: string }[]) {
        const k = `${x.beneficiary_id}|${x.scheduled_date}`;
        if (!map.has(k)) map.set(k, { key: k, beneficiaryId: x.beneficiary_id, date: x.scheduled_date, closed: false });
      }
      const list = Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
      setEntries(list);
      // default: today's distribution, else the oldest one not closed yet, else the next one
      const today = isoToday();
      const pick = list.find((e) => e.date === today) ?? list.find((e) => !e.closed && e.date < today) ?? list.find((e) => e.date > today) ?? list[list.length - 1];
      if (pick) setSelKey(pick.key);
      setLoading(false);
    })();
  }, [supabase, ready, cityId]);

  /* ---------- open one distribution ---------- */
  async function loadSelected() {
    if (!cityId || !benId || !date) return;
    dirty.current = { fields: false, inters: false };
    setState("idle");
    const [dq, cq] = await Promise.all([
      supabase.from("distributions").select("id,registered,baskets,volunteers_total,coordinators,photo_paths,event_photo_paths,status,distribution_lines(weight_kg),distribution_interventions(association_id,comment,photo_paths)").eq("beneficiary_id", benId).eq("event_date", date).maybeSingle(),
      supabase.from("collectes").select("id,status,partners(name),collecte_items!collecte_id(denree,name,kg)").eq("city_id", cityId).eq("scheduled_date", date).eq("source", "planning").in("kind", ["partner", "exceptionnel", "demande_client"]).neq("status", "annule").order("sort_order"),
    ]);
    const row = dq.data as unknown as { id: string; registered: number | null; baskets: number | null; volunteers_total: number | null; coordinators: number | null; photo_paths: string[] | null; event_photo_paths: string[] | null; status: string; distribution_lines: { weight_kg: number | string | null }[] | null; distribution_interventions: { association_id: string; comment: string | null; photo_paths: string[] | null }[] | null } | null;
    if (row) {
      const lines = row.distribution_lines ?? [];
      setD({
        id: row.id,
        registered: row.registered == null ? "" : String(row.registered),
        baskets: row.baskets == null ? "" : String(row.baskets),
        volunteers: row.volunteers_total == null ? "" : String(row.volunteers_total),
        coordinators: row.coordinators == null ? "" : String(row.coordinators),
        photoPaths: row.photo_paths ?? [],
        eventPhotos: row.event_photo_paths ?? [],
        interventions: (row.distribution_interventions ?? []).map((i) => ({ associationId: i.association_id, comment: i.comment ?? "", photoPaths: i.photo_paths ?? [] })),
        closed: row.status === "distribuee",
        lineKg: lines.length ? r1(lines.reduce((a, l) => a + num(String(l.weight_kg ?? 0)), 0)) : null,
      });
    } else setD(blank());
    setDay(
      ((cq.data ?? []) as unknown as { id: string; status: string; partners: { name: string } | { name: string }[] | null; collecte_items: DayItem[] | null }[]).map((c) => {
        const items = c.collecte_items ?? [];
        return { id: c.id, name: first(c.partners)?.name ?? "Collecte", status: c.status, items, kg: r1(items.reduce((a, i) => a + (Number(i.kg) || 0), 0)) };
      }),
    );
  }
  useEffect(() => {
    void flush().then(loadSelected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selKey, cityId]);

  /* ---------- saving: the same tables as the PC version, so nothing is duplicated ---------- */
  function change(fn: (x: Draft) => Draft, inters = false) {
    dirty.current.fields = true;
    if (inters) dirty.current.inters = true;
    dirtyKey.current = keyRef.current;
    setD((x) => fn(x));
    setState("idle");
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void save(), 900);
  }
  async function flush() {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
    if (dirty.current.fields || dirty.current.inters) await save();
  }
  function save(extra: Record<string, unknown> = {}): Promise<unknown> {
    lock.current = lock.current.then(async () => {
      const cur = dRef.current;
      const [b, dt] = (dirtyKey.current || keyRef.current).split("|");
      const forced = Object.keys(extra).length > 0;
      if (!cityId || !b || !dt || (!dirty.current.fields && !dirty.current.inters && !forced)) return;
      const doInters = dirty.current.inters;
      dirty.current = { fields: false, inters: false };
      setState("saving");
      const up = await supabase
        .from("distributions")
        .upsert(
          { city_id: cityId, beneficiary_id: b, event_date: dt, registered: intOrNull(cur.registered), baskets: intOrNull(cur.baskets), volunteers_total: intOrNull(cur.volunteers), coordinators: intOrNull(cur.coordinators), photo_paths: cur.photoPaths, event_photo_paths: cur.eventPhotos, ...extra },
          { onConflict: "beneficiary_id,event_date" },
        )
        .select("id")
        .single();
      if (up.error || !up.data) {
        setState("idle");
        dirty.current.fields = true;
        return setMsg("Enregistrement impossible : " + (up.error?.message ?? "erreur"));
      }
      const id = up.data.id as string;
      if (doInters) {
        await supabase.from("distribution_interventions").delete().eq("distribution_id", id);
        if (cur.interventions.length) {
          const ii = await supabase.from("distribution_interventions").insert(cur.interventions.map((i) => ({ distribution_id: id, association_id: i.associationId, comment: i.comment || null, photo_paths: i.photoPaths })));
          if (ii.error) setMsg("Associations non enregistrées : " + ii.error.message);
        }
      }
      if (!cur.id) setD((x) => (x.id ? x : { ...x, id }));
      setState("saved");
    });
    return lock.current;
  }

  const dayKg = r1(day.filter((c) => c.status === "collecte").reduce((a, c) => a + c.kg, 0));

  /** Confirms the total of the day's collections: stored as product lines, exactly like the PC table ("Ajouter les collectes du jour"). */
  async function validateTotal() {
    if (!cityId || !benId || !date) return;
    const items = day.filter((c) => c.status === "collecte").flatMap((c) => c.items.map((i) => ({ ...i, source: c.id, supplier: c.name })));
    if (!items.length) return setMsg("Aucune collecte terminée ce jour-là pour l'instant.");
    await flush();
    dirtyKey.current = keyRef.current;
    dirty.current.fields = true;
    await save();
    const { data } = await supabase.from("distributions").select("id").eq("beneficiary_id", benId).eq("event_date", date).single();
    const id = data?.id as string | undefined;
    if (!id) return setMsg("Enregistrement impossible.");
    await supabase.from("distribution_lines").delete().eq("distribution_id", id);
    const ins = await supabase.from("distribution_lines").insert(
      items.map((i, idx) => ({
        distribution_id: id,
        sort_order: idx,
        category: (i.denree && DENREE_TO_CAT[i.denree]) || "Autre",
        product: i.name || i.denree || null,
        weight_kg: Math.round((Number(i.kg) || 0) * 100) / 100,
        supplier: i.supplier,
        don_pct: 100,
        delivery_mode: "Collecte Log",
        source_collecte_id: i.source,
      })),
    );
    if (ins.error) return setMsg("Total non enregistré : " + ins.error.message);
    setD((x) => ({ ...x, id, lineKg: dayKg }));
    setState("saved");
  }

  async function closeDistribution() {
    if (!window.confirm("Clôturer cette distribution : bien réceptionnée et distribuée ?")) return;
    await flush();
    dirtyKey.current = keyRef.current;
    dirty.current.fields = true;
    await save({ status: "distribuee", received_ok: true, validated_at: new Date().toISOString() });
    setD((x) => ({ ...x, closed: true }));
  }

  const status = date ? distribStatus(date, d.closed) : "avenir";
  const folder = `${cityId}/dist-${benId}-${date}`;
  const free = assocs.filter((a) => !d.interventions.some((i) => i.associationId === a.id));

  return (
    <div className="mx-auto min-h-screen max-w-[520px] px-4 pt-4 pb-24">
      <header className="mb-4 flex items-center justify-between">
        <div className="flex items-end gap-0.5">
          <span className="font-script text-[26px] text-[var(--navy)]">linkee</span>
          <svg width="30" height="11" viewBox="0 0 40 14" fill="none" aria-hidden="true" className="mb-1">
            <path d="M2 3 C 10 13, 30 13, 38 3" stroke="var(--turquoise)" strokeWidth={4} strokeLinecap="round" />
          </svg>
        </div>
        <span className="flex items-center gap-3 text-[12px] font-semibold text-[var(--slate)]">
          {city && <span className="rounded-[40px] px-2.5 py-1 text-white" style={{ background: city.color }}>{city.name}</span>}
          <Link href="/version" className="underline">Changer de version</Link>
        </span>
      </header>

      {msg && (
        <div className="mb-3 flex items-start justify-between gap-3 rounded-xl bg-[var(--critical-bg)] px-3.5 py-2.5 text-[13px] font-semibold text-[var(--critical)]">
          <span>{msg}</span>
          <button type="button" onClick={() => setMsg(null)} aria-label="Fermer">×</button>
        </div>
      )}

      {!ready || loading ? (
        <p className="py-10 text-center text-[14px] text-[var(--slate)]">Chargement…</p>
      ) : !cityId ? (
        <p className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--card)] px-4 py-8 text-center text-[14px] text-[var(--slate)]">Choisis d&apos;abord une ville sur la version PC.</p>
      ) : entries.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--card)] px-4 py-8 text-center text-[14px] text-[var(--slate)]">Aucune distribution ces deux dernières semaines ni les deux prochaines. Planifie une dépose dans un lieu « Distribution Linkee » depuis la version PC.</p>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="rounded-[20px] bg-[#2a78d6] p-4 text-white">
            <label className="mb-1.5 block text-[11px] font-bold tracking-[0.06em] uppercase opacity-85">Distribution</label>
            <select value={selKey} onChange={(e) => setSelKey(e.target.value)} className="h-12 w-full rounded-xl border-0 bg-white px-3 text-[15px] font-bold text-[#0a1a3f]">
              {entries.map((e) => (
                <option key={e.key} value={e.key}>
                  {places.find((p) => p.id === e.beneficiaryId)?.name ?? "Lieu"} — {fmtDay(e.date)}
                  {e.closed ? " · clôturée" : ""}
                </option>
              ))}
            </select>
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <span className="font-display text-[20px] font-black">{place?.name}</span>
              <span className="rounded-[40px] px-2.5 py-0.5 text-[12px] font-bold" style={{ background: STATUS_UI[status].bg, color: status === "encours" ? "#fff" : STATUS_UI[status].fg }}>{STATUS_UI[status].label}</span>
            </div>
            <div className="text-[12.5px] opacity-90">
              {date ? fmtDay(date) : ""} · {state === "saving" ? "Enregistrement…" : state === "saved" ? "Enregistré ✓" : "Les modifications s'enregistrent toutes seules"}
            </div>
          </div>

          <Step n={1} title="Chiffres de la distribution">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Inscrits" value={d.registered} onChange={(v) => change((x) => ({ ...x, registered: v }))} />
              <Field label="Paniers distribués" value={d.baskets} onChange={(v) => change((x) => ({ ...x, baskets: v }))} />
              <Field label="Bénévoles (total)" value={d.volunteers} onChange={(v) => change((x) => ({ ...x, volunteers: v }))} />
              <Field label="dont coordinateurs" value={d.coordinators} onChange={(v) => change((x) => ({ ...x, coordinators: v }))} />
            </div>
            {num(d.registered) > 0 && num(d.baskets) > 0 && <p className="mt-3 text-center text-[13px] text-[var(--slate)]">Taux de présence : <strong className="text-[var(--navy)]">{Math.round((num(d.baskets) / num(d.registered)) * 100)} %</strong></p>}
            {num(d.coordinators) > num(d.volunteers) && <p className="mt-2 text-center text-[12.5px] font-semibold text-[var(--critical)]">Les coordinateurs sont compris dans le total des bénévoles.</p>}
          </Step>

          <Step n={2} title="Collectes du jour" sub="Vérifie les kilos puis valide le total.">
            {day.length === 0 ? (
              <p className="rounded-xl border border-dashed border-[var(--border)] px-3 py-4 text-center text-[13px] text-[var(--slate)]">Aucune collecte prévue ce jour-là.</p>
            ) : (
              <div className="flex flex-col">
                {day.map((c) => (
                  <div key={c.id} className="flex items-center justify-between gap-3 border-b border-[var(--border)] py-3 last:border-b-0">
                    <span className="min-w-0 truncate text-[15px] font-semibold text-[var(--navy)]">{c.name}</span>
                    <span className={`flex-none font-display text-[20px] font-black tabular-nums ${c.status === "collecte" ? "text-[var(--navy)]" : "text-[var(--slate)]"}`}>{c.status === "collecte" ? `${c.kg} kg` : "à faire"}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-3 flex items-center justify-between rounded-2xl bg-[var(--track)] px-4 py-3">
              <span className="text-[14px] font-bold text-[var(--slate)]">Total collecté</span>
              <span className="font-display text-[28px] font-black text-[var(--navy)] tabular-nums">{dayKg} kg</span>
            </div>
            {d.lineKg != null && d.lineKg === dayKg ? (
              <div className="mt-3 flex h-14 items-center justify-center rounded-2xl bg-[var(--good-bg)] font-display text-[17px] font-bold text-[var(--good)]">✓ Total validé : {d.lineKg} kg</div>
            ) : (
              <>
                {d.lineKg != null && <p className="mt-2 text-center text-[12.5px] text-[var(--slate)]">Total enregistré : {d.lineKg} kg — les collectes ont changé depuis.</p>}
                <button type="button" onClick={validateTotal} disabled={dayKg <= 0} className="mt-3 h-14 w-full rounded-2xl bg-[var(--good)] font-display text-[18px] font-bold text-white disabled:opacity-45">
                  {d.lineKg != null ? `Mettre à jour : ${dayKg} kg` : `Valider le total de ${dayKg} kg`}
                </button>
              </>
            )}
          </Step>

          <Step n={3} title="Photos" sub="Prends une photo avec l'appareil ou choisis-en dans ta galerie.">
            <h3 className="mb-2 text-[14px] font-bold text-[var(--navy)]">Photos des colis</h3>
            <PhotoStrip paths={d.photoPaths} folder={folder} onChange={(p) => change((x) => ({ ...x, photoPaths: p }))} accent="var(--cat-4)" size={96} label="Ajouter des photos" />
            <h3 className="mt-5 mb-2 text-[14px] font-bold text-[var(--navy)]">Photos de la distribution</h3>
            <PhotoStrip paths={d.eventPhotos} folder={folder} onChange={(p) => change((x) => ({ ...x, eventPhotos: p }))} accent="#2a78d6" size={96} label="Ajouter des photos" />
          </Step>

          <Step n={4} title="Associations présentes" sub="Choisis dans la liste des associations partenaires.">
            <select
              value=""
              onChange={(e) => {
                const id = e.target.value;
                if (id) change((x) => (x.interventions.some((i) => i.associationId === id) ? x : { ...x, interventions: [...x.interventions, { associationId: id, comment: "", photoPaths: [] }] }), true);
              }}
              className="h-14 w-full rounded-2xl border-2 border-[var(--good)]/45 bg-[var(--good-bg)] px-3 text-[16px] font-semibold text-[var(--navy)]"
            >
              <option value="">{free.length ? "Ajouter une association…" : assocs.length ? "Toutes les associations sont ajoutées" : "Aucune association dans le Village associatif"}</option>
              {free.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
            {d.interventions.length > 0 && (
              <div className="mt-3 flex flex-col gap-2">
                {d.interventions.map((i) => (
                  <div key={i.associationId} className="flex items-center justify-between gap-3 rounded-2xl bg-[var(--track)] px-4 py-3">
                    <span className="min-w-0 truncate text-[15px] font-semibold text-[var(--navy)]">{assocs.find((a) => a.id === i.associationId)?.name ?? "Association"}</span>
                    <button type="button" onClick={() => change((x) => ({ ...x, interventions: x.interventions.filter((k) => k.associationId !== i.associationId) }), true)} aria-label="Retirer" className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-[var(--card)] text-[22px] text-[var(--slate)]">×</button>
                  </div>
                ))}
              </div>
            )}
          </Step>

          {d.closed ? (
            <div className="flex h-14 items-center justify-center rounded-2xl bg-[var(--good-bg)] font-display text-[17px] font-bold text-[var(--good)]">✓ Distribution clôturée</div>
          ) : (
            <button type="button" onClick={closeDistribution} className="h-16 w-full rounded-2xl bg-[var(--navy-deep)] font-display text-[19px] font-bold text-[var(--panel-fg)] shadow-[var(--shadow)]">
              Bien réceptionné et distribué
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function SaisieMobilePage() {
  return (
    <CityProvider>
      <Page />
    </CityProvider>
  );
}
