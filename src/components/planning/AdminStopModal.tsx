"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { uploadPrivatePhoto } from "@/lib/photos";
import { CAT_KEYS, CAT_LABELS, SUBCAT_SELECT, UNIT_LABEL, itemValue, kgFromQuantity, subMap, type SubCat } from "@/lib/stats";

export type AdminStop = { id: string; name: string; kind: string; partnerId: string | null; cat: string };
export type AdminStopSaved = { status: "collecte" | "annule" | "todo"; photoPaths: string[] };

type Row = { denree: string; sub: string; qty: string };
type StockItem = { id: string; name: string; category: string | null; colis: number; upc: number; grammage: number | string };
type DropItem = { key: string; sourceId: string; from: string; denree: string | null; name: string | null; kg: number };

const fieldCls = "w-full rounded-[10px] border-[1.5px] border-[var(--border)] bg-[var(--input-bg)] px-2.5 py-2 text-[13px] font-medium text-[var(--navy)] outline-none focus:border-[var(--turquoise)]";
const labelCls = "mb-1 block text-[11px] font-bold tracking-[0.03em] text-[var(--slate)] uppercase";
const PICKUP = ["partner", "exceptionnel", "demande_client"];

/** Lets the Superadmin do what the logisticien does: mark a stop collected/delivered (goods, weights), cancelled (reason) — and change it afterwards, or put it back to "to do". */
export default function AdminStopModal({ stop, cityId, date, current = "todo", mode = "status", onClose, onSaved }: { stop: AdminStop; cityId: string; date: string; current?: string; mode?: "status" | "data"; onClose: () => void; onSaved: (r: AdminStopSaved) => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [pick, setPick] = useState<"collecte" | "annule" | "todo">(mode === "data" ? "collecte" : current === "annule" ? "annule" : current === "collecte" && stop.kind === "stock" ? "todo" : "collecte");
  const [existingPhotos, setExistingPhotos] = useState<string[]>([]);
  const alreadyDone = current === "collecte";
  const [rows, setRows] = useState<Row[]>([{ denree: "", sub: "", qty: "" }]);
  const [subs, setSubs] = useState<SubCat[]>([]);
  const [stock, setStock] = useState<StockItem[]>([]);
  const [stockCounts, setStockCounts] = useState<Record<string, number>>({});
  const [drops, setDrops] = useState<DropItem[]>([]);
  const [dropChecked, setDropChecked] = useState<Set<string>>(new Set());
  const [motif, setMotif] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const isPickup = PICKUP.includes(stop.kind);

  useEffect(() => {
    (async () => {
      // what is already recorded on this stop (when it is edited after the fact)
      const cur = await supabase.from("collectes").select("motif,photo_paths,collecte_items!collecte_id(denree,name,kg,subcategory_id,quantity,unit,source_collecte_id)").eq("id", stop.id).maybeSingle();
      const rec = cur.data as unknown as { motif: string | null; photo_paths: string[] | null; collecte_items: { denree: string | null; name: string | null; kg: number | string; subcategory_id: string | null; quantity: number | string | null; unit: string | null; source_collecte_id: string | null }[] | null } | null;
      const existing = rec?.collecte_items ?? [];
      setExistingPhotos(rec?.photo_paths ?? []);
      if (current === "annule" && rec?.motif) setMotif(rec.motif);
      if (current === "collecte" && isPickup && existing.length) {
        setRows(existing.map((it) => ({ denree: it.denree ?? "", sub: it.subcategory_id ?? "", qty: it.subcategory_id && it.quantity != null ? String(it.quantity) : String(Number(it.kg)) })));
      }
      if (isPickup && stop.partnerId) {
        const { data } = await supabase.from("partner_subcategories").select(SUBCAT_SELECT).eq("partner_id", stop.partnerId).order("name");
        setSubs(((data ?? []) as unknown as SubCat[]).map((s) => ({ ...s, unit_price: s.unit_price == null ? null : Number(s.unit_price), unit_weight_kg: s.unit_weight_kg == null ? null : Number(s.unit_weight_kg) })));
      }
      if (stop.kind === "stock") {
        const [st, planned] = await Promise.all([
          supabase.from("stock_items").select("id,name,category,colis,upc,grammage").gt("colis", 0).order("name"),
          supabase.from("collectes").select("planned_items").eq("id", stop.id).maybeSingle(),
        ]);
        setStock((st.data ?? []) as StockItem[]);
        const pl = (planned.data?.planned_items ?? []) as { id: string; colis: number }[];
        setStockCounts(Object.fromEntries(pl.map((p) => [p.id, p.colis])));
      }
      if (stop.kind === "dropoff") {
        const { data } = await supabase
          .from("collectes")
          .select("id,label,partners(name),beneficiaries(name),collecte_items!collecte_id(id,denree,name,kg)")
          .eq("city_id", cityId)
          .eq("scheduled_date", date)
          .eq("status", "collecte")
          .eq("source", "planning")
          .in("kind", ["partner", "exceptionnel", "demande_client", "stock"]);
        const list: DropItem[] = [];
        for (const c of (data ?? []) as unknown as { id: string; label: string | null; partners: { name: string } | { name: string }[] | null; beneficiaries: { name: string } | { name: string }[] | null; collecte_items: { id: string; denree: string | null; name: string | null; kg: number | string }[] | null }[]) {
          const p = Array.isArray(c.partners) ? c.partners[0] : c.partners;
          const b = Array.isArray(c.beneficiaries) ? c.beneficiaries[0] : c.beneficiaries;
          for (const it of c.collecte_items ?? []) list.push({ key: it.id, sourceId: c.id, from: p?.name ?? b?.name ?? c.label ?? "Point", denree: it.denree, name: it.name, kg: Number(it.kg) });
        }
        setDrops(list);
        if (current === "collecte" && existing.length) {
          const same = (d: DropItem, it: (typeof existing)[number]) => d.sourceId === it.source_collecte_id && d.denree === it.denree && d.name === it.name && Math.abs(d.kg - Number(it.kg)) < 0.005;
          setDropChecked(new Set(list.filter((d) => existing.some((it) => same(d, it))).map((d) => d.key)));
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const subFor = (r: Row) => subs.find((s) => s.id === r.sub);
  function rowKg(r: Row): number | null {
    const q = parseFloat(r.qty.replace(",", "."));
    if (!Number.isFinite(q) || q <= 0) return null;
    const s = subFor(r);
    return s ? kgFromQuantity(q, s.unit, s.unit_weight_kg) : q;
  }
  const patchRow = (i: number, p: Partial<Row>) => setRows((prev) => prev.map((r, k) => (k === i ? { ...r, ...p } : r)));

  async function save() {
    setErr("");
    setBusy(true);
    try {
      if (pick === "todo") {
        if (alreadyDone && !window.confirm("Remettre cet arrêt « à faire » ? Les poids déjà saisis seront effacés.")) {
          setBusy(false);
          return;
        }
        const wipe = await supabase.from("collecte_items").delete().eq("collecte_id", stop.id);
        if (wipe.error) throw new Error(wipe.error.message);
        const { error } = await supabase.from("collectes").update({ status: "todo", motif: null, done_at: null, logisticien_id: null }).eq("id", stop.id);
        if (error) throw new Error(error.message);
        onSaved({ status: "todo", photoPaths: existingPhotos });
        return;
      }
      if (pick === "annule") {
        if (!motif.trim()) throw new Error("Le motif d'annulation est obligatoire.");
        if (alreadyDone) await supabase.from("collecte_items").delete().eq("collecte_id", stop.id);
        const { error } = await supabase.from("collectes").update({ status: "annule", motif: motif.trim(), done_at: new Date().toISOString() }).eq("id", stop.id);
        if (error) throw new Error(error.message);
        onSaved({ status: "annule", photoPaths: existingPhotos });
        return;
      }
      let items: { denree: string | null; name: string | null; kg: number; subcategory_id?: string | null; quantity?: number | null; unit?: string | null; source_collecte_id?: string | null }[] = [];
      if (stop.kind === "stock") {
        const taken = stock.filter((it) => (stockCounts[it.id] ?? 0) > 0);
        if (taken.length < 1) throw new Error("Indique au moins un produit pris en stock (nombre de colis).");
        const take = await supabase.rpc("take_stock", { p_items: taken.map((it) => ({ id: it.id, colis: stockCounts[it.id] })), p_destination: `Tournée du ${date}`, p_day: date, p_time: null });
        if (take.error) throw new Error("Stock non mis à jour : " + take.error.message);
        items = taken.map((it) => ({ denree: it.category || null, name: it.name, kg: Math.round(((stockCounts[it.id] ?? 0) * it.upc * Number(it.grammage)) / 10) / 100 }));
      } else if (stop.kind === "dropoff") {
        const chosen = drops.filter((d) => dropChecked.has(d.key));
        if (chosen.length < 1) throw new Error("Coche au moins un produit déposé ici.");
        items = chosen.map((d) => ({ denree: d.denree, name: d.name, kg: d.kg, source_collecte_id: d.sourceId }));
      } else {
        const filled = rows.filter((r) => r.denree || r.qty);
        if (filled.length < 1 || filled.some((r) => !r.denree || rowKg(r) == null)) {
          const bad = filled.find((r) => r.sub && subFor(r)?.unit === "unite" && !subFor(r)?.unit_weight_kg);
          throw new Error(bad ? "Le poids d'une unité manque pour cette sous-catégorie (onglet Valorisation RSE de la fiche)." : "Pour chaque ligne, choisis la denrée ET indique la quantité.");
        }
        items = filled.map((r) => {
          const s = subFor(r);
          return { denree: r.denree, name: null, kg: rowKg(r)!, subcategory_id: s?.id ?? null, quantity: parseFloat(r.qty.replace(",", ".")), unit: s?.unit ?? "kg" };
        });
      }
      const photoPaths: string[] = [...existingPhotos];
      for (const f of files) photoPaths.push(await uploadPrivatePhoto(supabase, `${cityId}/${stop.id}`, f));
      const { error } = await supabase.from("collectes").update({ status: "collecte", motif: null, photos_count: photoPaths.length, photo_paths: photoPaths, done_at: new Date().toISOString() }).eq("id", stop.id);
      if (error) throw new Error(error.message);
      if (alreadyDone) await supabase.from("collecte_items").delete().eq("collecte_id", stop.id); // replaced by the corrected lines
      const ins = await supabase.from("collecte_items").insert(items.map((it) => ({ collecte_id: stop.id, ...it })));
      if (ins.error) throw new Error("Poids non enregistrés : " + ins.error.message);
      onSaved({ status: "collecte", photoPaths });
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }

  const total = rows.reduce((s, r) => s + (rowKg(r) ?? 0), 0);
  const subsById = subMap(subs);
  const donValue = rows.reduce((s, r) => {
    const kg = rowKg(r);
    return kg == null ? s : s + itemValue({ kg, subcategory_id: r.sub || null, quantity: parseFloat(r.qty.replace(",", ".")) }, subsById).value;
  }, 0);
  const okLabel = stop.kind === "stock" ? "Pris" : stop.kind === "dropoff" ? "Déposé" : "Collecté";

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/45 p-4" onClick={onClose}>
      <div className="max-h-[92vh] w-full max-w-[560px] overflow-y-auto rounded-[20px] bg-[var(--card)] p-5 shadow-[var(--shadow)]" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-[20px] font-black text-[var(--navy)]">{stop.name}</h3>
            <p className="text-[12px] text-[var(--slate)]">{stop.cat} · {mode === "data" ? "compléter les infos à la place du logisticien — le statut passe à « Réalisée » ensuite" : "changer le statut de l&apos;arrêt"}</p>
          </div>
          <button type="button" onClick={onClose} className="flex h-8 w-8 flex-none items-center justify-center rounded-full border-[1.5px] border-[var(--border)] text-[var(--slate)]" aria-label="Fermer">×</button>
        </div>

        <div className={`mb-3.5 flex gap-2.5 ${mode === "data" ? "hidden" : ""}`}>
          {!(stop.kind === "stock" && alreadyDone) && <button type="button" onClick={() => setPick("collecte")} className={`flex-1 rounded-2xl border-2 px-2 py-2.5 font-display text-[14px] font-bold ${pick === "collecte" ? "border-[var(--good)] bg-[var(--good-bg)] text-[var(--good)]" : "border-[var(--border)] text-[var(--navy)]"}`}>{okLabel}</button>}
          <button type="button" onClick={() => setPick("annule")} className={`flex-1 rounded-2xl border-2 px-2 py-2.5 font-display text-[14px] font-bold ${pick === "annule" ? "border-[var(--critical)] bg-[var(--critical-bg)] text-[var(--critical)]" : "border-[var(--border)] text-[var(--navy)]"}`}>Annulé</button>
          {current !== "todo" && <button type="button" onClick={() => setPick("todo")} className={`flex-1 rounded-2xl border-2 px-2 py-2.5 font-display text-[14px] font-bold ${pick === "todo" ? "border-[var(--navy-deep)] bg-[var(--track)] text-[var(--navy)]" : "border-[var(--border)] text-[var(--navy)]"}`}>À faire</button>}
        </div>

        {pick === "todo" ? (
          <p className="rounded-xl bg-[var(--input-bg)] px-3.5 py-3 text-[13px] leading-[1.5] text-[var(--slate)]">
            L&apos;arrêt redevient « à faire » : le logisticien pourra le refaire dans Ma Journée. Les poids saisis sont effacés.
            {stop.kind === "stock" && alreadyDone ? " Le stock déjà retiré n'est pas remis automatiquement : corrige-le dans Stock si besoin." : ""}
          </p>
        ) : pick === "annule" ? (
          <div>
            {stop.kind === "stock" && alreadyDone && <p className="mb-2 text-[12px] text-[var(--slate)]">Le stock déjà retiré n'est pas remis automatiquement : corrige-le dans Stock si besoin.</p>}
            <label className={labelCls}>Motif de l&apos;annulation</label>
            <textarea value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="Ex : commerce fermé, personne sur place…" className={`${fieldCls} min-h-[84px] resize-y`} />
          </div>
        ) : stop.kind === "stock" ? (
          <div className="flex flex-col gap-2">
            <label className={labelCls}>Produits du stock — nombre de colis pris</label>
            {stock.length === 0 && <p className="text-[12.5px] text-[var(--slate)]">Le stock est vide.</p>}
            {stock.map((it) => (
              <div key={it.id} className="flex items-center gap-2.5 rounded-xl border-[1.5px] border-[var(--border)] bg-[var(--input-bg)] px-3 py-2">
                <span className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-semibold text-[var(--navy)]">{it.name}</div>
                  <div className="text-[11px] text-[var(--slate)]">{it.colis} colis dispo · {it.upc} u/colis</div>
                </span>
                <input type="number" min={0} max={it.colis} value={stockCounts[it.id] ?? 0} onChange={(e) => setStockCounts((p) => ({ ...p, [it.id]: Math.min(it.colis, Math.max(0, parseInt(e.target.value, 10) || 0)) }))} className="w-16 rounded-lg border-[1.5px] border-[var(--border)] bg-[var(--card)] px-2 py-1.5 text-center text-[13px] font-bold text-[var(--navy)]" />
              </div>
            ))}
          </div>
        ) : stop.kind === "dropoff" ? (
          <div className="flex flex-col gap-2">
            <label className={labelCls}>Produits laissés ici (collectés ce jour)</label>
            {drops.length === 0 && <p className="text-[12.5px] text-[var(--slate)]">Aucune collecte réalisée ce jour pour l&apos;instant.</p>}
            {drops.map((d) => (
              <label key={d.key} className="flex cursor-pointer items-center gap-2.5 rounded-xl border-[1.5px] border-[var(--border)] bg-[var(--input-bg)] px-3 py-2 text-[13px] font-semibold text-[var(--navy)]">
                <input type="checkbox" checked={dropChecked.has(d.key)} onChange={() => setDropChecked((p) => { const n = new Set(p); if (n.has(d.key)) n.delete(d.key); else n.add(d.key); return n; })} className="h-4 w-4 accent-[var(--dropoff)]" />
                <span className="flex-1">{d.name ?? d.denree} <span className="font-normal text-[var(--slate)]">({d.from})</span></span>
                <span className="tabular-nums text-[var(--slate)]">{d.kg} kg</span>
              </label>
            ))}
          </div>
        ) : (
          <div>
            <div className="flex flex-col gap-2.5">
              {rows.map((r, i) => {
                const s = subFor(r);
                const catSubs = subs.filter((x) => x.category === r.denree);
                const kg = rowKg(r);
                return (
                  <div key={i} className="rounded-2xl border-[1.5px] border-[var(--border)] bg-[var(--input-bg)] p-3">
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <div>
                        <label className={labelCls}>Denrée</label>
                        <select className={fieldCls} value={r.denree} onChange={(e) => patchRow(i, { denree: e.target.value, sub: "" })}>
                          <option value="">Choisir…</option>
                          {CAT_KEYS.map((k) => <option key={k}>{CAT_LABELS[k]}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className={labelCls}>Sous-catégorie</label>
                        <select className={fieldCls} value={r.sub} disabled={catSubs.length === 0} onChange={(e) => patchRow(i, { sub: e.target.value })}>
                          <option value="">{catSubs.length ? "Aucune" : "— (aucune définie)"}</option>
                          {catSubs.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <input type="number" min={0} step="0.1" placeholder="0" value={r.qty} onChange={(e) => patchRow(i, { qty: e.target.value })} className={fieldCls} />
                      <span className="flex-none rounded-[10px] bg-[var(--track)] px-3 py-2 text-[13px] font-bold text-[var(--navy)]">{s ? UNIT_LABEL[s.unit] : "kg"}</span>
                      {rows.length > 1 && <button type="button" onClick={() => setRows(rows.filter((_, k) => k !== i))} className="flex-none text-[12px] font-bold text-[var(--critical)]">Retirer</button>}
                    </div>
                    {s && s.unit !== "kg" && (
                      <p className={`mt-1.5 text-[11.5px] font-semibold ${s.unit === "unite" && !s.unit_weight_kg ? "text-[var(--critical)]" : "text-[var(--slate)]"}`}>
                        {s.unit === "unite" ? (s.unit_weight_kg ? `1 unité = ${s.unit_weight_kg} kg` : "Poids d'une unité non renseigné") : "1 litre = 1 kg"}
                        {kg != null ? ` → ${Math.round(kg * 100) / 100} kg` : ""}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
            <button type="button" onClick={() => setRows([...rows, { denree: "", sub: "", qty: "" }])} className="mt-2.5 w-full rounded-2xl border-[1.5px] border-dashed border-[var(--turquoise)] px-3 py-2 text-[13px] font-bold text-[var(--navy)]">+ Ajouter une autre denrée</button>
            <div className="mt-2.5 flex items-center justify-between rounded-xl bg-[var(--track)] px-4 py-2">
              <span className="text-[12px] font-bold text-[var(--slate)]">Total</span>
              <span className="font-display text-[18px] font-black text-[var(--navy)]">{Math.round(total * 10) / 10} kg</span>
            </div>
            <div className="mt-2 flex items-center justify-between rounded-xl border-[1.5px] border-[var(--good)] bg-[var(--good-bg)] px-4 py-2.5">
              <span className="text-[12px] font-semibold text-[var(--navy)]">Valeur totale du don</span>
              <span className="font-display text-[20px] font-black text-[var(--navy)] tabular-nums">{donValue.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</span>
            </div>
          </div>
        )}

        {pick === "collecte" && (
          <div className="mt-3.5">
            <label className={labelCls}>Photo (facultatif)</label>
            <input type="file" accept="image/*" multiple onChange={(e) => setFiles(Array.from(e.target.files ?? []))} className="text-[12.5px]" />
            {files.length > 0 && <span className="ml-2 text-[12px] text-[var(--slate)]">{files.length} photo(s)</span>}
          </div>
        )}

        {err && <div className="mt-3 rounded-xl bg-[var(--critical-bg)] px-3.5 py-2.5 text-[12.5px] font-semibold text-[var(--critical)]">{err}</div>}
        <div className="mt-4 flex gap-2.5">
          <button type="button" disabled={busy} onClick={save} className={`rounded-[40px] px-5 py-2.5 font-display text-[14px] font-bold text-white disabled:opacity-60 ${pick === "annule" ? "bg-[var(--critical)]" : pick === "todo" ? "bg-[var(--navy-deep)]" : "bg-[var(--good)]"}`}>
            {busy ? "Enregistrement…" : pick === "annule" ? "Valider l'annulation" : pick === "todo" ? "Remettre à faire" : "Valider"}
          </button>
          <button type="button" onClick={onClose} className="rounded-[40px] border-[1.5px] border-[var(--border)] px-4 py-2.5 font-display text-[14px] font-bold text-[var(--slate)]">Fermer</button>
        </div>
      </div>
    </div>
  );
}
