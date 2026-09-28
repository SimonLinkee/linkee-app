"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { CAT_KEYS, CAT_LABELS, SUBCAT_SELECT, UNIT_LABEL, isCollectKind, itemValue, kgFromQuantity, subMap, type SubCat, type Unit } from "@/lib/stats";
import { DOC_ACCEPT, DOC_SELECT, openDocument, uploadDocument, type DocRow } from "@/lib/documents";

type Item = { id: string; denree: string | null; kg: number | string; subcategory_id: string | null; quantity: number | string | null; unit: string | null };
type Row = { id: string; scheduled_date: string; scheduled_time: string | null; kind: string; status: string; source: string; motif: string | null; collecte_items: Item[] | null };

const CAT_COLOR: Record<string, string> = Object.fromEntries(CAT_KEYS.map((k, i) => [CAT_LABELS[k], `var(--cat-${i + 1})`]));
const fmtDay = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
const fmtEur = (n: number) => n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
const fmtKg = (n: number) => (Math.round(n * 10) / 10).toLocaleString("fr-FR") + " kg";
const isoOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const fieldCls = "w-full rounded-[10px] border-[1.5px] border-[var(--border)] bg-[var(--input-bg)] px-2.5 py-2 text-[13px] font-medium text-[var(--navy)] outline-none focus:border-[var(--turquoise)]";
const labelCls = "mb-1 block text-[11px] font-bold tracking-[0.03em] text-[var(--slate)] uppercase";

type Preset = "30" | "90" | "365" | "all" | "custom";

/** Admin view of a partner's collections: upcoming planned ones, history with values, manual volume entry. */
export default function PartnerCollectes({ partnerId, cityId }: { partnerId: string; cityId: string | null }) {
  const supabase = useMemo(() => createClient(), []);
  const fileInput = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [subs, setSubs] = useState<SubCat[]>([]);
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [preset, setPreset] = useState<Preset>("90");
  const [from, setFrom] = useState(isoOf(new Date(Date.now() - 90 * 86400000)));
  const [to, setTo] = useState(isoOf(new Date()));

  // manual entry form
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fDate, setFDate] = useState(isoOf(new Date()));
  const [fCat, setFCat] = useState(CAT_LABELS.secs);
  const [fSub, setFSub] = useState("");
  const [fQty, setFQty] = useState("");
  const [fUnit, setFUnit] = useState<Unit>("kg");
  const [fFile, setFFile] = useState<File | null>(null);

  async function load() {
    const { data: auth } = await supabase.auth.getUser();
    setUserId(auth.user?.id ?? null);
    const [c, s, d] = await Promise.all([
      supabase
        .from("collectes")
        .select("id,scheduled_date,scheduled_time,kind,status,source,motif,collecte_items!collecte_id(id,denree,kg,subcategory_id,quantity,unit)")
        .eq("partner_id", partnerId)
        .order("scheduled_date", { ascending: false })
        .limit(1500),
      supabase.from("partner_subcategories").select(SUBCAT_SELECT).eq("partner_id", partnerId).order("created_at"),
      supabase.from("documents").select(DOC_SELECT).eq("partner_id", partnerId).not("collecte_id", "is", null),
    ]);
    if (c.error) setMsg("Chargement impossible : " + c.error.message + " (la migration 013 est-elle passée ?)");
    setRows(((c.data ?? []) as unknown as Row[]).filter((r) => isCollectKind(r.kind)));
    setSubs(((s.data ?? []) as unknown as SubCat[]).map((x) => ({ ...x, unit_price: x.unit_price == null ? null : Number(x.unit_price), unit_weight_kg: x.unit_weight_kg == null ? null : Number(x.unit_weight_kg) })));
    setDocs((d.data ?? []) as unknown as DocRow[]);
    setLoading(false);
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partnerId]);

  const subsById = useMemo(() => subMap(subs), [subs]);
  const today = isoOf(new Date());

  function choosePreset(p: Preset) {
    setPreset(p);
    if (p === "all") return;
    if (p === "custom") return;
    setFrom(isoOf(new Date(Date.now() - Number(p) * 86400000)));
    setTo(today);
  }

  const upcoming = rows.filter((r) => r.status === "todo" && r.scheduled_date >= today && r.source !== "manual").sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date));
  const inPeriod = rows.filter((r) => !(r.status === "todo" && r.scheduled_date >= today) && r.status !== "todo").filter((r) => preset === "all" || (r.scheduled_date >= from && r.scheduled_date <= to));

  const enriched = inPeriod.map((r) => {
    const items = r.collecte_items ?? [];
    const kgByCat: Record<string, number> = {};
    let value = 0;
    let kg = 0;
    for (const it of items) {
      const k = Number(it.kg) || 0;
      kg += k;
      const cat = it.denree ?? "Autre";
      kgByCat[cat] = (kgByCat[cat] ?? 0) + k;
      value += itemValue(it, subsById).value;
    }
    return { r, kgByCat, value, kg, docs: docs.filter((d) => d.collecte_id === r.id) };
  });
  const done = enriched.filter((e) => e.r.status === "collecte");
  const totalKg = done.reduce((s, e) => s + e.kg, 0);
  const totalValue = done.reduce((s, e) => s + e.value, 0);

  // manual form derived values
  const catSubs = subs.filter((s) => s.category === fCat);
  const sub = subs.find((s) => s.id === fSub);
  const unit: Unit = sub ? sub.unit : fUnit;
  const qtyNum = parseFloat(fQty.replace(",", "."));
  const kgResult = Number.isFinite(qtyNum) && qtyNum > 0 ? kgFromQuantity(qtyNum, unit, sub?.unit_weight_kg ?? null) : null;
  const needWeight = sub?.unit === "unite" && !sub.unit_weight_kg;

  async function submitManual() {
    setMsg(null);
    if (!cityId) return setMsg("Aucune ville sélectionnée.");
    if (!fDate) return setMsg("Choisis la date de la collecte.");
    if (kgResult == null || kgResult <= 0) return setMsg(needWeight ? "Renseigne d'abord le poids d'une unité dans l'onglet Valorisation RSE." : "Indique une quantité.");
    setBusy(true);
    try {
      const col = await supabase
        .from("collectes")
        .insert({ city_id: cityId, kind: "partner", partner_id: partnerId, scheduled_date: fDate, status: "collecte", source: "manual", sort_order: 0, duration_min: 0, done_at: new Date(fDate + "T12:00:00").toISOString() })
        .select("id")
        .single();
      if (col.error || !col.data) throw new Error(col.error?.message ?? "Création impossible");
      const it = await supabase.from("collecte_items").insert({ collecte_id: col.data.id, denree: fCat, kg: kgResult, subcategory_id: sub?.id ?? null, quantity: qtyNum, unit });
      if (it.error) throw new Error(it.error.message);
      if (fFile) await uploadDocument(supabase, { partnerId, file: fFile, source: "admin", userId, collecteId: col.data.id as string });
      setOpen(false);
      setFQty("");
      setFFile(null);
      setFSub("");
      await load();
    } catch (e) {
      setMsg((e as Error).message);
    }
    setBusy(false);
  }

  const originBadge = (r: Row) => {
    if (r.status === "annule") return { t: "Annulée", bg: "var(--critical-bg)", fg: "var(--critical)" };
    if (r.source === "manual") return { t: "Saisie manuelle", bg: "var(--client-req-bg)", fg: "var(--client-req)" };
    if (r.kind !== "partner") return { t: "Exceptionnelle", bg: "var(--exc-accent-bg)", fg: "var(--exc-accent)" };
    return { t: "Planifiée", bg: "var(--track)", fg: "var(--slate)" };
  };

  return (
    <div>
      {msg && <div className="mb-3 rounded-xl bg-[var(--critical-bg)] px-3.5 py-2.5 text-[12.5px] font-semibold text-[var(--critical)]">{msg}</div>}

      <div className="mb-4 rounded-2xl border border-[var(--border)] bg-[var(--input-bg)] px-4 py-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-[12px] font-bold tracking-[0.03em] text-[var(--slate)] uppercase">Prochaines collectes planifiées</span>
          <a href="/planning" className="text-[12px] font-bold text-[var(--turquoise)]">Ouvrir le Planning →</a>
        </div>
        {upcoming.length === 0 ? (
          <p className="text-[12.5px] text-[var(--slate)]">Aucune collecte planifiée pour ce partenaire.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {upcoming.slice(0, 8).map((r) => (
              <a key={r.id} href={`/planning?date=${r.scheduled_date}`} className="rounded-[40px] border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-[12px] font-semibold text-[var(--navy)] hover:border-[var(--turquoise)]">
                {fmtDay(r.scheduled_date)}
                {r.scheduled_time ? ` · ${r.scheduled_time.slice(0, 5)}` : ""}
                {r.kind !== "partner" ? " · exceptionnelle" : ""}
              </a>
            ))}
            {upcoming.length > 8 && <span className="self-center text-[12px] text-[var(--slate)]">+ {upcoming.length - 8} autres</span>}
          </div>
        )}
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2.5">
        <div className="flex rounded-[40px] border border-[var(--border)] bg-[var(--card)] p-[3px]">
          {(
            [
              ["30", "30 jours"],
              ["90", "3 mois"],
              ["365", "12 mois"],
              ["all", "Tout"],
              ["custom", "Dates"],
            ] as [Preset, string][]
          ).map(([k, l]) => (
            <button key={k} type="button" onClick={() => choosePreset(k)} className={`rounded-[40px] px-3.5 py-1.5 font-display text-[12.5px] font-bold ${preset === k ? "bg-[var(--navy-deep)] text-[var(--panel-fg)]" : "text-[var(--slate)]"}`}>
              {l}
            </button>
          ))}
        </div>
        {preset === "custom" && (
          <div className="flex items-center gap-1.5">
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={`${fieldCls} !w-auto`} />
            <span className="text-[12px] text-[var(--slate)]">→</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={`${fieldCls} !w-auto`} />
          </div>
        )}
        <button type="button" onClick={() => setOpen((v) => !v)} className="ml-auto flex items-center gap-1.5 rounded-[40px] border-[1.5px] border-[var(--client-req)] px-4 py-2 font-display text-[13px] font-bold text-[var(--client-req)]">
          + Ajouter un volume collecté
        </button>
      </div>

      {open && (
        <div className="mb-4 rounded-2xl border-[1.5px] border-[var(--client-req)] bg-[var(--card)] p-4">
          <h4 className="mb-0.5 font-display text-[15px] font-extrabold text-[var(--navy)]">Saisie manuelle d&apos;un volume</h4>
          <p className="mb-3 text-[11.5px] text-[var(--slate)]">Compte dans les statistiques et la Valorisation RSE comme une collecte normale, avec le tag « saisie manuelle ». Elle n&apos;apparaît pas dans le Planning.</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Date</label>
              <input type="date" className={fieldCls} value={fDate} onChange={(e) => setFDate(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Catégorie</label>
              <select className={fieldCls} value={fCat} onChange={(e) => { setFCat(e.target.value); setFSub(""); }}>
                {CAT_KEYS.map((k) => (
                  <option key={k}>{CAT_LABELS[k]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Sous-catégorie (facultatif)</label>
              <select className={fieldCls} value={fSub} onChange={(e) => setFSub(e.target.value)}>
                <option value="">Aucune — catégorie entière</option>
                {catSubs.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.unit_price != null ? ` — ${s.unit_price} € / ${UNIT_LABEL[s.unit]}` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Quantité</label>
              <div className="flex gap-2">
                <input type="number" min={0} step="0.01" className={fieldCls} value={fQty} onChange={(e) => setFQty(e.target.value)} placeholder="Ex : 24" />
                {sub ? (
                  <span className="flex flex-none items-center rounded-[10px] bg-[var(--track)] px-3 text-[13px] font-bold text-[var(--navy)]">{UNIT_LABEL[sub.unit]}</span>
                ) : (
                  <select className={`${fieldCls} !w-[100px]`} value={fUnit} onChange={(e) => setFUnit(e.target.value as Unit)}>
                    <option value="kg">kg</option>
                    <option value="litre">litre</option>
                  </select>
                )}
              </div>
            </div>
          </div>
          {sub?.unit === "unite" && (
            <p className={`mt-2.5 rounded-xl px-3 py-2 text-[12px] font-semibold ${needWeight ? "bg-[var(--critical-bg)] text-[var(--critical)]" : "bg-[var(--warn-bg)] text-[var(--navy)]"}`}>
              {needWeight ? "Le poids d'une unité n'est pas renseigné pour cette sous-catégorie : ajoute-le dans l'onglet « Valorisation RSE »." : `1 unité = ${sub.unit_weight_kg} kg${kgResult != null ? ` → ${fmtKg(kgResult)} au total` : ""}`}
            </p>
          )}
          {unit === "litre" && kgResult != null && <p className="mt-2.5 text-[12px] text-[var(--slate)]">1 litre compte pour 1 kg dans les statistiques → {fmtKg(kgResult)}.</p>}
          <div className="mt-3">
            <label className={labelCls}>Justificatif (facultatif)</label>
            <div className="flex flex-wrap items-center gap-2.5">
              <button type="button" onClick={() => fileInput.current?.click()} className="rounded-[40px] border-[1.5px] border-dashed border-[var(--border)] px-3.5 py-2 text-[12.5px] font-bold text-[var(--navy)]">
                {fFile ? "Changer le fichier" : "Joindre un fichier"}
              </button>
              <span className="text-[12px] text-[var(--slate)]">{fFile ? fFile.name : "Pense à joindre la facture ou le bon de don : il sera aussi rangé dans « Mes documents »."}</span>
              <input ref={fileInput} type="file" hidden accept={DOC_ACCEPT} onChange={(e) => { setFFile(e.target.files?.[0] ?? null); e.target.value = ""; }} />
            </div>
          </div>
          <div className="mt-4 flex gap-2.5">
            <button type="button" disabled={busy} onClick={submitManual} className="rounded-[40px] bg-[var(--client-req)] px-5 py-2.5 font-display text-[13.5px] font-bold text-white disabled:opacity-60">
              {busy ? "Enregistrement…" : "Enregistrer le volume"}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="rounded-[40px] border-[1.5px] border-[var(--border)] px-4 py-2.5 font-display text-[13.5px] font-bold text-[var(--slate)]">
              Annuler
            </button>
          </div>
        </div>
      )}

      <div className="mb-3 grid grid-cols-3 gap-2.5">
        {[
          ["Collectes", String(done.length)],
          ["Volume", fmtKg(totalKg)],
          ["Valeur des dons", fmtEur(totalValue)],
        ].map(([l, v]) => (
          <div key={l} className="rounded-xl bg-[var(--track)] px-3.5 py-2.5">
            <div className="text-[10.5px] font-bold tracking-[0.03em] text-[var(--slate)] uppercase">{l}</div>
            <div className="font-display text-[19px] font-black text-[var(--navy)]">{v}</div>
          </div>
        ))}
      </div>

      {loading && <p className="text-[13px] text-[var(--slate)]">Chargement…</p>}
      {!loading && enriched.length === 0 && <p className="rounded-xl border border-dashed border-[var(--border)] px-4 py-6 text-center text-[13px] text-[var(--slate)]">Aucune collecte sur cette période.</p>}
      <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)]">
        {enriched.map(({ r, kgByCat, value, docs: dd }) => {
          const b = originBadge(r);
          return (
            <div key={r.id} className="flex flex-wrap items-start gap-x-4 gap-y-1.5 border-b border-[var(--border)] px-4 py-3 last:border-none">
              <div className="w-[128px] flex-none">
                <div className="text-[13px] font-bold text-[var(--navy)]">{fmtDay(r.scheduled_date)}</div>
                <span className="mt-1 inline-block rounded-[40px] px-2 py-px text-[10.5px] font-bold" style={{ background: b.bg, color: b.fg }}>
                  {b.t}
                </span>
              </div>
              <div className="min-w-[180px] flex-1">
                {r.status === "annule" ? (
                  <span className="text-[12.5px] text-[var(--slate)]">Motif : {r.motif || "non précisé"}</span>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(kgByCat).map(([cat, kg]) => (
                      <span key={cat} className="flex items-center gap-1.5 rounded-[40px] bg-[var(--input-bg)] px-2.5 py-1 text-[11.5px] font-semibold text-[var(--navy)]">
                        <span className="h-2 w-2 rounded-full" style={{ background: CAT_COLOR[cat] ?? "var(--slate)" }} />
                        {cat} · {fmtKg(kg)}
                      </span>
                    ))}
                  </div>
                )}
                {dd.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {dd.map((d) => (
                      <button key={d.id} type="button" onClick={() => openDocument(supabase, d.storage_path).catch((e) => setMsg((e as Error).message))} className="rounded-[40px] bg-[var(--good-bg)] px-2.5 py-0.5 text-[11px] font-bold text-[var(--good)]">
                        {d.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {r.status === "collecte" && <div className="w-[100px] flex-none text-right font-display text-[15px] font-extrabold text-[var(--navy)]">{fmtEur(value)}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
