"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useCity } from "@/components/admin/CityContext";

type Item = { id: string; name: string; category: string | null; grammage: number; colis: number; upc: number; kg: number };
type Dest = { id: string | null; name: string };
type OutLine = { uid: string; productId: string; colis: string };

const CATS = ["Secs", "Fruits et légumes", "Produits frais", "Plats préparés", "Boulangerie"];
const NEW = "__new__";
const OTHER = "Autre bénéficiaire / à préciser";
const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const r2 = (n: number) => Math.round(n * 100) / 100;
const field = "h-[52px] w-full rounded-2xl border-2 border-[var(--border)] bg-[var(--input-bg)] px-4 text-[16px] font-medium text-[var(--navy)] outline-none focus:border-[var(--turquoise)]";
const label = "mb-1.5 block text-[13px] font-bold text-[var(--navy)]";
const uid = () => Math.random().toString(36).slice(2, 9);

/** Superadmin mobile stock: see what is in the warehouse, record an entry, plan an exit. */
export default function MobileStock() {
  const supabase = useMemo(() => createClient(), []);
  const { cityId } = useCity();
  const [items, setItems] = useState<Item[]>([]);
  const [dests, setDests] = useState<Dest[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"" | "in" | "out">("");
  const [msg, setMsg] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  // entry
  const [inProduct, setInProduct] = useState("");
  const [inName, setInName] = useState("");
  const [inCat, setInCat] = useState(CATS[0]);
  const [inUpc, setInUpc] = useState("1");
  const [inGram, setInGram] = useState("");
  const [inColis, setInColis] = useState("");
  // exit
  const [outDest, setOutDest] = useState("");
  const [outDate, setOutDate] = useState(todayIso());
  const [outTime, setOutTime] = useState("");
  const [lines, setLines] = useState<OutLine[]>([{ uid: uid(), productId: "", colis: "" }]);

  async function reload() {
    if (!cityId) return;
    const { data, error } = await supabase.from("stock_items").select("id,name,category,grammage,colis,upc,kg").eq("city_id", cityId).order("name");
    if (error) setMsg(error.message);
    setItems(((data ?? []) as { id: string; name: string; category: string | null; grammage: number | string; colis: number; upc: number; kg: number | string }[]).map((r) => ({ ...r, grammage: Number(r.grammage), kg: Number(r.kg) })));
  }
  useEffect(() => {
    if (!cityId) return;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      setUserId(auth.user?.id ?? null);
      const { data: bs } = await supabase.from("beneficiaries").select("id,name").eq("city_id", cityId).eq("active", true).is("deleted_at", null).order("name");
      const d: Dest[] = [...((bs ?? []) as Dest[]), { id: null, name: OTHER }];
      setDests(d);
      setOutDest(d[0].name);
      await reload();
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, cityId]);

  const totalKg = r2(items.reduce((a, i) => a + i.kg, 0));
  const inExisting = items.find((i) => i.id === inProduct);

  async function saveIn() {
    setMsg(null);
    setOk(null);
    if (!cityId) return;
    const n = parseInt(inColis, 10);
    if (!n || n < 1) return setMsg("Indique le nombre de colis.");
    if (inExisting) {
      const kgAdd = r2((n * inExisting.upc * inExisting.grammage) / 1000);
      const up = await supabase.from("stock_items").update({ colis: inExisting.colis + n, kg: r2(inExisting.kg + kgAdd), updated_at: new Date().toISOString() }).eq("id", inExisting.id);
      if (up.error) return setMsg("Entrée impossible : " + up.error.message);
      const mv = await supabase.from("stock_movements").insert({ city_id: cityId, type: "entree", day: todayIso(), created_by: userId, items: [{ id: inExisting.id, produit: inExisting.name, colis: n, unites: n * inExisting.upc, kg: kgAdd }] });
      if (mv.error) setMsg("Stock mis à jour, mais historique non enregistré : " + mv.error.message);
      setOk(`${n} colis de « ${inExisting.name} » ajoutés.`);
    } else {
      if (!inName.trim()) return setMsg("Donne un nom au produit.");
      const upc = parseInt(inUpc, 10) || 1;
      const gram = parseFloat(inGram) || 0;
      const kg = r2((n * upc * gram) / 1000);
      const ins = await supabase.from("stock_items").insert({ city_id: cityId, name: inName.trim(), category: inCat, provenance: "Saisie manuelle", grammage: gram, colis: n, upc, kg }).select("id").single();
      if (ins.error) return setMsg("Ajout impossible : " + ins.error.message);
      const mv = await supabase.from("stock_movements").insert({ city_id: cityId, type: "entree", day: todayIso(), created_by: userId, items: [{ id: ins.data.id, produit: inName.trim(), colis: n, unites: n * upc, kg }] });
      if (mv.error) setMsg("Produit ajouté, mais historique non enregistré : " + mv.error.message);
      setOk(`« ${inName.trim()} » ajouté au stock (${n} colis).`);
    }
    setInColis("");
    setInName("");
    setInGram("");
    setInProduct("");
    await reload();
  }

  async function saveOut() {
    setMsg(null);
    setOk(null);
    if (!cityId) return;
    const valid = lines.filter((l) => l.productId && parseInt(l.colis, 10) > 0);
    if (!valid.length) return setMsg("Ajoute au moins un produit et un nombre de colis.");
    const planned = [];
    for (const l of valid) {
      const it = items.find((x) => x.id === l.productId)!;
      const n = parseInt(l.colis, 10);
      if (n > it.colis) return setMsg(`Il ne reste que ${it.colis} colis pour ${it.name}.`);
      const units = n * it.upc;
      planned.push({ id: it.id, name: it.name, category: it.category ?? "", colis: n, unites: units, kg: r2((units * it.grammage) / 1000) });
    }
    const dest = dests.find((d) => d.name === outDest);
    const summary = planned.map((p) => `${p.name} (${p.colis} colis)`).join(", ");
    // same as the PC version: two stops are planned (pick-up at the depot, drop-off at the beneficiary); the stock goes down when the logisticien confirms
    const { error } = await supabase.from("collectes").insert([
      { city_id: cityId, kind: "stock", label: `Sortie de stock — ${outDest}`, scheduled_date: outDate, scheduled_time: outTime || null, sort_order: 98, status: "todo", duration_min: 15, planned_items: planned, comment: `À prendre au dépôt pour ${outDest} : ${summary}` },
      { city_id: cityId, kind: "dropoff", beneficiary_id: dest?.id ?? null, label: dest?.id ? null : outDest, scheduled_date: outDate, scheduled_time: outTime || null, sort_order: 99, status: "todo", duration_min: 10, comment: `Livraison du stock : ${summary}` },
    ]);
    if (error) return setMsg("Planification impossible : " + error.message);
    setOk(`Sortie planifiée le ${new Date(outDate + "T00:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })} pour ${outDest}.`);
    setLines([{ uid: uid(), productId: "", colis: "" }]);
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-[28px] leading-tight font-black text-[var(--navy)]">Stock</h1>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-[var(--card)] p-3.5 shadow-[var(--shadow)]">
          <div className="text-[12px] font-semibold text-[var(--slate)]">Références</div>
          <div className="font-display text-[28px] font-black text-[var(--navy)]">{items.length}</div>
        </div>
        <div className="rounded-2xl bg-[var(--card)] p-3.5 shadow-[var(--shadow)]">
          <div className="text-[12px] font-semibold text-[var(--slate)]">Poids total</div>
          <div className="font-display text-[28px] font-black text-[var(--navy)]">{totalKg} kg</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button type="button" onClick={() => { setMode(mode === "in" ? "" : "in"); setMsg(null); setOk(null); }} className={`h-[72px] rounded-2xl font-display text-[22px] font-black ${mode === "in" ? "bg-[var(--good)] text-white" : "border-2 border-[var(--good)] text-[var(--good)]"}`}>＋ Entrée</button>
        <button type="button" onClick={() => { setMode(mode === "out" ? "" : "out"); setMsg(null); setOk(null); }} className={`h-[72px] rounded-2xl font-display text-[22px] font-black ${mode === "out" ? "bg-[#b97600] text-white" : "border-2 border-[#b97600] text-[#b97600]"}`}>－ Sortie</button>
      </div>

      {msg && <div className="rounded-xl bg-[var(--critical-bg)] px-3.5 py-2.5 text-[13px] font-semibold text-[var(--critical)]">{msg}</div>}
      {ok && <div className="rounded-xl bg-[var(--good-bg)] px-3.5 py-2.5 text-[13px] font-semibold text-[var(--good)]">{ok}</div>}

      {mode === "in" && (
        <div className="flex flex-col gap-3.5 rounded-[20px] border-2 border-[var(--good)] bg-[var(--card)] p-4">
          <h2 className="font-display text-[21px] font-extrabold text-[var(--navy)]">Entrée de stock</h2>
          <div>
            <span className={label}>Produit</span>
            <select className={field} value={inProduct} onChange={(e) => setInProduct(e.target.value)}>
              <option value="">➕ Nouveau produit</option>
              {items.map((i) => <option key={i.id} value={i.id}>{i.name} ({i.colis} colis)</option>)}
            </select>
          </div>
          {!inExisting && (
            <>
              <div>
                <span className={label}>Nom du produit</span>
                <input className={field} value={inName} onChange={(e) => setInName(e.target.value)} />
              </div>
              <div>
                <span className={label}>Catégorie</span>
                <select className={field} value={inCat} onChange={(e) => setInCat(e.target.value)}>{CATS.map((c) => <option key={c}>{c}</option>)}</select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className={label}>Unités par colis</span>
                  <input type="number" inputMode="numeric" className={field} value={inUpc} onChange={(e) => setInUpc(e.target.value)} />
                </div>
                <div>
                  <span className={label}>Grammage (g)</span>
                  <input type="number" inputMode="decimal" className={field} value={inGram} onChange={(e) => setInGram(e.target.value)} />
                </div>
              </div>
            </>
          )}
          <div>
            <span className={label}>Nombre de colis reçus</span>
            <input type="number" inputMode="numeric" className={`${field} !h-[62px] text-center font-display !text-[28px] font-black`} value={inColis} onChange={(e) => setInColis(e.target.value)} placeholder="0" />
          </div>
          <button type="button" onClick={saveIn} className="h-[58px] rounded-2xl bg-[var(--good)] font-display text-[19px] font-bold text-white">Enregistrer l&apos;entrée</button>
        </div>
      )}

      {mode === "out" && (
        <div className="flex flex-col gap-3.5 rounded-[20px] border-2 border-[#b97600] bg-[var(--card)] p-4">
          <h2 className="font-display text-[21px] font-extrabold text-[var(--navy)]">Sortie de stock</h2>
          <div>
            <span className={label}>Destination</span>
            <select className={field} value={outDest} onChange={(e) => setOutDest(e.target.value)}>{dests.map((d) => <option key={d.name}>{d.name}</option>)}</select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className={label}>Jour</span>
              <input type="date" className={field} value={outDate} onChange={(e) => setOutDate(e.target.value)} />
            </div>
            <div>
              <span className={label}>Heure</span>
              <input type="time" className={field} value={outTime} onChange={(e) => setOutTime(e.target.value)} />
            </div>
          </div>
          {lines.map((l, i) => {
            const it = items.find((x) => x.id === l.productId);
            return (
              <div key={l.uid} className="flex flex-col gap-2 rounded-2xl bg-[var(--input-bg)] p-3">
                <select className={field} value={l.productId} onChange={(e) => setLines(lines.map((x, k) => (k === i ? { ...x, productId: e.target.value } : x)))}>
                  <option value="">Produit…</option>
                  {items.filter((x) => x.colis > 0).map((x) => <option key={x.id} value={x.id}>{x.name} ({x.colis} dispo)</option>)}
                </select>
                <div className="flex items-center gap-2">
                  <input type="number" inputMode="numeric" className={`${field} text-center font-display !text-[22px] font-black`} value={l.colis} onChange={(e) => setLines(lines.map((x, k) => (k === i ? { ...x, colis: e.target.value } : x)))} placeholder="Colis" />
                  {lines.length > 1 && <button type="button" onClick={() => setLines(lines.filter((_, k) => k !== i))} aria-label="Retirer" className="flex h-[52px] w-[52px] flex-none items-center justify-center rounded-2xl bg-[var(--critical-bg)] text-[22px] text-[var(--critical)]">×</button>}
                </div>
                {it && <span className="text-[12px] text-[var(--slate)]">{it.upc} unités par colis · {it.colis} colis disponibles</span>}
              </div>
            );
          })}
          <button type="button" onClick={() => setLines([...lines, { uid: uid(), productId: "", colis: "" }])} className="h-[52px] rounded-2xl border-2 border-dashed border-[#b97600] text-[15px] font-bold text-[#b97600]">+ Ajouter un produit</button>
          <button type="button" onClick={saveOut} className="h-[58px] rounded-2xl bg-[#b97600] font-display text-[19px] font-bold text-white">Planifier la sortie</button>
          <p className="text-center text-[12px] text-[var(--slate)]">La sortie apparaît dans le planning du jour choisi ; le stock diminue quand le logisticien confirme la prise.</p>
        </div>
      )}

      <h2 className="mt-2 font-display text-[19px] font-extrabold text-[var(--navy)]">En stock</h2>
      {loading && <p className="py-4 text-center text-[14px] text-[var(--slate)]">Chargement…</p>}
      {!loading && items.length === 0 && <p className="py-4 text-center text-[14px] text-[var(--slate)]">Le stock est vide.</p>}
      <div className="flex flex-col gap-2">
        {items.map((i) => (
          <div key={i.id} className="flex items-center justify-between gap-3 rounded-2xl border-2 border-[var(--border)] bg-[var(--card)] px-4 py-3">
            <span className="min-w-0">
              <span className="block truncate text-[16px] font-bold text-[var(--navy)]">{i.name}</span>
              <span className="block text-[12.5px] text-[var(--slate)]">{i.category} · {i.upc} u/colis</span>
            </span>
            <span className="flex-none text-right">
              <span className="block font-display text-[22px] font-black text-[var(--navy)]">{i.colis}</span>
              <span className="block text-[11.5px] text-[var(--slate)]">colis · {r2(i.kg)} kg</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
