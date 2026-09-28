"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useCity } from "@/components/admin/CityContext";

type StockItem = {
  id: string;
  produit: string;
  categorie: string;
  provenance: string;
  grammage: number;
  colis: number;
  upc: number;
  poids: number;
  ddm: string;
  dlc: string;
};
type MoveItem = { produit: string; colis: number; unites: number; kg: number };
type HistoryEntry = { id: string; type: "sortie" | "entree"; date: string; time: string; destination: string; items: MoveItem[] };
type OutLine = { uid: string; productId: string | null; colisCount: number };
type DbStock = { id: string; name: string; category: string | null; provenance: string | null; grammage: number | string; colis: number; upc: number; kg: number | string; ddm: string | null; dlc: string | null };
type Dest = { id: string | null; name: string };
type DbMove = { id: string; type: "sortie" | "entree"; day: string; time: string | null; destination: string | null; items: MoveItem[] };

const TODAY = new Date();
const todayIso = () => new Date().toISOString().slice(0, 10);
const CATEGORIES = ["Secs", "Fruits et légumes", "Produits frais", "Plats préparés", "Boulangerie"];
const STOCK_COLS = "id,name,category,provenance,grammage,colis,upc,kg,ddm,dlc";
const toItem = (r: DbStock): StockItem => ({
  id: r.id, produit: r.name, categorie: r.category ?? CATEGORIES[0], provenance: r.provenance ?? "", grammage: Number(r.grammage), colis: r.colis,
  upc: r.upc, poids: Number(r.kg), ddm: r.ddm ?? "", dlc: r.dlc ?? "",
});
const toMove = (r: DbMove): HistoryEntry => ({ id: r.id, type: r.type, date: r.day, time: r.time ? r.time.slice(0, 5) : "", destination: r.destination ?? "", items: r.items ?? [] });

function fmtDate(iso: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtDateLong(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
}
function daysUntil(iso: string) {
  if (!iso) return null;
  return Math.round((new Date(iso).getTime() - TODAY.getTime()) / 86400000);
}
function fmtNum(n: number) {
  return (Math.round(n * 100) / 100).toLocaleString("fr-FR");
}

const inputCls = "w-full rounded-[10px] border-[1.5px] border-[var(--border)] bg-[var(--input-bg)] px-2.5 py-2 text-[13px] font-medium text-[var(--navy)] outline-none focus:border-[var(--turquoise)]";
const labelCls = "mb-[5px] block text-[11px] font-bold tracking-[0.03em] text-[var(--slate)] uppercase";

export default function StockPage() {
  const supabase = useMemo(() => createClient(), []);
  const [stock, setStock] = useState<StockItem[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const { cityId, city, depotAddress } = useCity(); // the page remounts when the city changes
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [destinations, setDestinations] = useState<Dest[]>([{ id: null, name: "Autre bénéficiaire / à préciser" }]);
  const [outDay, setOutDay] = useState<string | null>(null);
  const [planned, setPlanned] = useState<{ id: string; label: string | null; scheduled_date: string; planned_items: { name: string; colis: number }[] | null }[]>([]);
  async function loadPlanned() {
    const { data } = await supabase
      .from("collectes")
      .select("id,label,scheduled_date,planned_items")
      .eq("city_id", cityId ?? "")
      .eq("kind", "stock")
      .eq("status", "todo")
      .not("planned_items", "is", null)
      .order("scheduled_date");
    setPlanned((data ?? []) as typeof planned);
  }
  const [toast, setToast] = useState<string | null>(null);
  const [tab, setTab] = useState<"out" | "in" | "history">("out");
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<StockItem | null>(null);

  const [outLines, setOutLines] = useState<OutLine[]>([{ uid: "ol0", productId: null, colisCount: 1 }]);
  const [outDestination, setOutDestination] = useState("Autre bénéficiaire / à préciser");
  const [outDate, setOutDate] = useState(todayIso());
  const [outTime, setOutTime] = useState("15:30");
  const [outError, setOutError] = useState("");
  const [outConfirm, setOutConfirm] = useState<{ name: string; sub: string; items: MoveItem[] } | null>(null);
  let outLineSeq = outLines.length;

  const [inProduit, setInProduit] = useState("");
  const [inCategorie, setInCategorie] = useState(CATEGORIES[0]);
  const [inProvenance, setInProvenance] = useState("");
  const [inGrammage, setInGrammage] = useState("");
  const [inColis, setInColis] = useState("1");
  const [inUpc, setInUpc] = useState("1");
  const [inPoids, setInPoids] = useState("");
  const [inPoidsTouched, setInPoidsTouched] = useState(false);
  const [inDdm, setInDdm] = useState("");
  const [inDlc, setInDlc] = useState("");
  const [inDate, setInDate] = useState(todayIso());

  function showToast(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(null), 3200);
  }

  async function reload() {
    const [s, m] = await Promise.all([
      supabase.from("stock_items").select(STOCK_COLS).eq("city_id", cityId ?? "").order("name"),
      supabase.from("stock_movements").select("id,type,day,time,destination,items").eq("city_id", cityId ?? "").order("created_at", { ascending: false }).limit(300),
    ]);
    if (s.error) showToast("Chargement impossible : " + s.error.message);
    const items = ((s.data ?? []) as unknown as DbStock[]).map(toItem);
    setStock(items);
    setHistory(((m.data ?? []) as unknown as DbMove[]).map(toMove));
    setOutLines((prev) => prev.map((l) => (l.productId && items.some((x) => x.id === l.productId) ? l : { ...l, productId: items[0]?.id ?? null })));
  }

  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      setUserId(auth.user?.id ?? null);
      const { data: bs } = await supabase.from("beneficiaries").select("id,name").eq("city_id", cityId ?? "").eq("active", true).order("name");
      const dest: Dest[] = [...((bs ?? []) as Dest[]), { id: null, name: "Autre bénéficiaire / à préciser" }];
      setDestinations(dest);
      setOutDestination(dest[0].name);
      await reload();
      await loadPlanned();
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  const totalPoids = stock.reduce((s, it) => s + it.poids, 0);
  const totalUnites = stock.reduce((s, it) => s + it.colis * it.upc, 0);
  const soonDlc = stock.filter((it) => {
    const d = daysUntil(it.dlc);
    return d !== null && d <= 30;
  });

  const filteredStock = stock.filter((it) => {
    const matchSearch = it.produit.toLowerCase().includes(search.toLowerCase());
    const matchCat = !catFilter || it.categorie === catFilter;
    return matchSearch && matchCat;
  });

  function startEdit(it: StockItem) {
    setEditingId(it.id);
    setEditDraft({ ...it });
  }
  async function saveEdit() {
    if (!editDraft) return;
    const { error } = await supabase
      .from("stock_items")
      .update({
        name: editDraft.produit, category: editDraft.categorie, provenance: editDraft.provenance || null, grammage: editDraft.grammage, colis: editDraft.colis,
        upc: editDraft.upc, kg: editDraft.poids, ddm: editDraft.ddm || null, dlc: editDraft.dlc || null, updated_at: new Date().toISOString(),
      })
      .eq("id", editDraft.id);
    if (error) return showToast("Modification impossible : " + error.message);
    setStock((prev) => prev.map((it) => (it.id === editDraft.id ? editDraft : it)));
    setEditingId(null);
    setEditDraft(null);
  }

  function computedInPoids() {
    if (inPoidsTouched) return inPoids;
    const colis = parseFloat(inColis) || 0;
    const upc = parseFloat(inUpc) || 0;
    const gram = parseFloat(inGrammage) || 0;
    return String(Math.round((colis * upc * gram) / 10) / 100);
  }

  function addOutLine() {
    const uid = "ol" + outLineSeq;
    outLineSeq += 1;
    setOutLines((prev) => [...prev, { uid, productId: stock[0]?.id ?? null, colisCount: 1 }]);
  }
  function removeOutLine(uid: string) {
    setOutLines((prev) => prev.filter((l) => l.uid !== uid));
  }
  function updateOutLine(uid: string, patch: Partial<OutLine>) {
    setOutLines((prev) => prev.map((l) => (l.uid === uid ? { ...l, ...patch } : l)));
  }

  function outLineDerived(line: OutLine) {
    const it = stock.find((x) => x.id === line.productId);
    const maxColis = it ? it.colis : 0;
    const colisCount = Math.min(line.colisCount, maxColis || 1) || 1;
    const units = it ? colisCount * it.upc : 0;
    const kg = it ? Math.round(units * it.grammage) / 1000 : 0;
    return { it, maxColis, colisCount, units, kg };
  }

  const outSummary = outLines.reduce(
    (acc, line) => {
      const { it, colisCount } = outLineDerived(line);
      if (!it) return acc;
      const units = colisCount * it.upc;
      const kg = Math.round(units * it.grammage) / 1000;
      return { count: acc.count + 1, units: acc.units + units, kg: acc.kg + kg };
    },
    { count: 0, units: 0, kg: 0 }
  );

  function validateOut() {
    const validLines = outLines.filter((l) => stock.some((x) => x.id === l.productId));
    if (!validLines.length) {
      setOutError("Ajoutez au moins un produit à sortir.");
      return;
    }
    for (const line of validLines) {
      const it = stock.find((x) => x.id === line.productId)!;
      if (line.colisCount > it.colis) {
        setOutError(`Il ne reste que ${it.colis} colis pour ${it.produit}.`);
        return;
      }
    }
    setOutError("");

    if (!cityId) return setOutError("Aucune ville n'est associée à ton compte.");

    // The outflow is PLANNED: two stops land in the Planning of the chosen day (pick-up at the depot, drop-off at the
    // beneficiary). The stock is decreased when the logisticien confirms he took the boxes (take_stock, migration 006).
    const day = outDate || todayIso();
    const time = outTime || null;
    const planned = validLines.map((l) => {
      const it = stock.find((x) => x.id === l.productId)!;
      const units = l.colisCount * it.upc;
      return { id: it.id, name: it.produit, category: it.categorie, colis: l.colisCount, unites: units, kg: Math.round((units * it.grammage) / 10) / 100 };
    });
    const totalUnits = planned.reduce((s, x) => s + x.unites, 0);
    const totalKg = planned.reduce((s, x) => s + x.kg, 0);
    const summaryText = planned.map((p) => `${p.name} (${p.colis} colis)`).join(", ");
    const dest = destinations.find((d) => d.name === outDestination);
    const dateLabel = new Date(day + "T00:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "2-digit", month: "long" });

    supabase
      .from("collectes")
      .insert([
        {
          city_id: cityId, kind: "stock", label: `Sortie de stock — ${outDestination}`, scheduled_date: day, scheduled_time: time, sort_order: 98, status: "todo",
          duration_min: 15, planned_items: planned, comment: `À prendre au dépôt pour ${outDestination} : ${summaryText}`,
        },
        {
          city_id: cityId, kind: "dropoff", beneficiary_id: dest?.id ?? null, label: dest?.id ? null : outDestination, scheduled_date: day, scheduled_time: time, sort_order: 99, status: "todo",
          duration_min: 10, comment: `Livraison du stock : ${summaryText}`,
        },
      ])
      .then(async ({ error }) => {
        if (error) return setOutError("Planification impossible : " + error.message + " (la migration 009 est-elle passée ?)");
        setOutDay(day);
        setOutConfirm({
          name: `Sortie planifiée — ${outDestination}`,
          sub: `${dateLabel}${time ? ` vers ${time}` : ""} · ${planned.length} produit(s) · ${fmtNum(totalUnits)} unités · ${fmtNum(totalKg)} kg`,
          items: planned.map((p) => ({ produit: p.name, colis: p.colis, unites: p.unites, kg: p.kg })),
        });
        setOutLines([{ uid: "ol" + Date.now(), productId: stock[0]?.id ?? null, colisCount: 1 }]);
        await loadPlanned();
      });
  }

  async function validateIn() {
    if (!inProduit.trim()) return;
    if (!cityId) return showToast("Aucune ville n'est associée à ton compte.");
    const newItem = {
      city_id: cityId,
      name: inProduit.trim(),
      category: inCategorie,
      provenance: inProvenance.trim() || "Saisie manuelle",
      grammage: parseFloat(inGrammage) || 0,
      colis: parseInt(inColis, 10) || 0,
      upc: parseInt(inUpc, 10) || 1,
      kg: parseFloat(computedInPoids()) || 0,
      ddm: inDdm || null,
      dlc: inDlc || null,
    };
    const ins = await supabase.from("stock_items").insert(newItem).select("id").single();
    if (ins.error) return showToast("Ajout impossible : " + ins.error.message);
    const mv = await supabase.from("stock_movements").insert({
      city_id: cityId, type: "entree", day: inDate || todayIso(), created_by: userId,
      items: [{ produit: newItem.name, colis: newItem.colis, unites: newItem.colis * newItem.upc, kg: newItem.kg }],
    });
    if (mv.error) showToast("Produit ajouté, mais historique non enregistré : " + mv.error.message);
    await reload();
    setInProduit("");
    setInProvenance("");
    setInGrammage("");
    setInColis("1");
    setInUpc("1");
    setInPoids("");
    setInPoidsTouched(false);
    setInDdm("");
    setInDlc("");
  }

  const historyByDate = history.reduce<Record<string, HistoryEntry[]>>((acc, h) => {
    (acc[h.date] = acc[h.date] || []).push(h);
    return acc;
  }, {});
  const sortedDates = Object.keys(historyByDate).sort().reverse();

  return (
    <div>
      <h1 className="font-display text-[32px] leading-none font-black">Stock</h1>
      <p className="mb-[18px] text-[13.5px] text-[var(--slate)]">Entrepôt Linkee {city ? `de ${city.name}` : ""} — {depotAddress}.</p>

      <div className="mb-[18px] flex flex-wrap gap-3.5">
        <div className="min-w-[130px] rounded-[14px] border border-[var(--border)] bg-[var(--card)] px-[18px] py-3 shadow-[var(--shadow)]">
          <span className="mb-1 block text-[10.5px] font-bold tracking-[0.03em] text-[var(--slate)] uppercase">Références</span>
          <span className="font-display text-[22px] font-black text-[var(--navy)]">{stock.length}</span>
        </div>
        <div className="min-w-[130px] rounded-[14px] border border-[var(--border)] bg-[var(--card)] px-[18px] py-3 shadow-[var(--shadow)]">
          <span className="mb-1 block text-[10.5px] font-bold tracking-[0.03em] text-[var(--slate)] uppercase">Unités en stock</span>
          <span className="font-display text-[22px] font-black text-[var(--navy)]">{fmtNum(totalUnites)}</span>
        </div>
        <div className="min-w-[130px] rounded-[14px] border border-[var(--border)] bg-[var(--card)] px-[18px] py-3 shadow-[var(--shadow)]">
          <span className="mb-1 block text-[10.5px] font-bold tracking-[0.03em] text-[var(--slate)] uppercase">Poids total</span>
          <span className="font-display text-[22px] font-black text-[var(--navy)]">{fmtNum(totalPoids)} kg</span>
        </div>
      </div>

      {soonDlc.length > 0 && (
        <div className="mb-[18px] flex items-center gap-2.5 rounded-2xl bg-[var(--warn-bg)] px-4 py-[11px] text-[12.5px] font-semibold text-[var(--warn)]">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-[17px] w-[17px] flex-none">
            <path d="M12 9 V13 M12 17 H12.01" />
            <path d="M10.3 3.9 L1.8 18.5 A1.8 1.8 0 0 0 3.35 21.2 H20.65 A1.8 1.8 0 0 0 22.2 18.5 L13.7 3.9 A1.8 1.8 0 0 0 10.3 3.9 Z" />
          </svg>
          <span>
            <strong>{soonDlc.length} référence(s)</strong> à DLC proche ou dépassée : {soonDlc.map((it) => it.produit).join(", ")}.
          </span>
        </div>
      )}

      <div className="mb-4 flex w-fit rounded-[40px] border border-[var(--border)] bg-[var(--card)] p-[3px] shadow-[var(--shadow)]">
        {(
          [
            ["out", "Sortie du stock", "text-[var(--critical)]"],
            ["in", "Entrée du stock", "text-[var(--good)]"],
            ["history", "Historique", ""],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 rounded-[40px] px-[18px] py-2.5 font-display text-[13.5px] font-bold ${
              tab === key ? (key === "out" ? "bg-[var(--critical)] text-white" : key === "in" ? "bg-[var(--good)] text-white" : "bg-[var(--navy-deep)] text-[var(--panel-fg)]") : "text-[var(--slate)]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "out" && (
        <div className="mb-[22px] rounded-[18px] border border-[var(--border)] bg-[var(--card)] p-5 shadow-[var(--shadow)]">
          <h3 className="mb-0.5 font-display text-base font-extrabold">Sortie du stock</h3>
          <p className="mb-4 text-xs text-[var(--slate)]">Ajoutez un ou plusieurs produits : la quantité proposée reste toujours un multiple du colisage, pour ne jamais défaire un colis entamé.</p>

          {outLines.map((line) => {
            const { it, maxColis, colisCount, units, kg } = outLineDerived(line);
            return (
              <div key={line.uid} className="mb-2 flex flex-wrap items-center gap-2.5 rounded-xl border-[1.5px] border-[var(--border)] bg-[var(--input-bg)] px-3 py-2.5">
                <select
                  value={line.productId ?? ""}
                  onChange={(e) => updateOutLine(line.uid, { productId: e.target.value, colisCount: 1 })}
                  className="min-w-[170px] flex-1 rounded-[10px] border-[1.5px] border-[var(--border)] bg-[var(--input-bg)] px-2.5 py-2 text-[13px] text-[var(--navy)] outline-none focus:border-[var(--turquoise)]"
                >
                  {stock.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.produit}
                    </option>
                  ))}
                </select>
                <span className="flex-none text-[11px] whitespace-nowrap text-[var(--slate)]">{it ? `${it.colis} colis dispo · ${it.upc} u/colis` : ""}</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => updateOutLine(line.uid, { colisCount: Math.max(1, colisCount - 1) })}
                    className="flex h-[26px] w-[26px] items-center justify-center rounded-full border-[1.5px] border-[var(--border)] bg-[var(--input-bg)] text-sm font-bold text-[var(--navy)] hover:border-[var(--turquoise)] hover:text-[var(--turquoise)]"
                  >
                    –
                  </button>
                  <input
                    type="number"
                    min={1}
                    max={maxColis}
                    value={colisCount}
                    onChange={(e) => updateOutLine(line.uid, { colisCount: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                    className="w-[46px] rounded-[8px] border-[1.5px] border-[var(--border)] bg-[var(--input-bg)] px-1 py-1.5 text-center text-[12.5px] font-bold text-[var(--navy)]"
                  />
                  <button
                    type="button"
                    onClick={() => updateOutLine(line.uid, { colisCount: colisCount + 1 })}
                    className="flex h-[26px] w-[26px] items-center justify-center rounded-full border-[1.5px] border-[var(--border)] bg-[var(--input-bg)] text-sm font-bold text-[var(--navy)] hover:border-[var(--turquoise)] hover:text-[var(--turquoise)]"
                  >
                    +
                  </button>
                </div>
                <span className="flex-none text-xs font-bold whitespace-nowrap text-[var(--navy)]">
                  = {fmtNum(units)} u · {fmtNum(kg)} kg
                </span>
                <button
                  type="button"
                  onClick={() => removeOutLine(line.uid)}
                  title="Retirer ce produit"
                  className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-full border-[1.5px] border-[var(--border)] bg-[var(--card)] text-[var(--slate)] hover:border-[var(--critical)] hover:bg-[var(--critical-bg)] hover:text-[var(--critical)]"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
                    <path d="M6 6 L18 18 M18 6 L6 18" />
                  </svg>
                </button>
              </div>
            );
          })}
          <button
            type="button"
            onClick={addOutLine}
            className="mb-4 inline-flex items-center gap-1.5 rounded-[11px] border-[1.5px] border-dashed border-[var(--border)] bg-[var(--card)] px-3.5 py-2.5 text-[12.5px] font-bold text-[var(--navy)] hover:border-[var(--exc-accent)] hover:text-[var(--exc-accent)]"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
              <path d="M12 5 V19 M5 12 H19" />
            </svg>
            Ajouter un produit à sortir
          </button>

          <div className="mb-4 flex flex-wrap gap-6 rounded-xl bg-[var(--track)] px-[18px] py-[13px]">
            <div className="text-xs text-[var(--slate)]">
              Produits
              <strong className="block font-display text-[19px] font-extrabold text-[var(--navy)]">{outSummary.count}</strong>
            </div>
            <div className="text-xs text-[var(--slate)]">
              Unités totales
              <strong className="block font-display text-[19px] font-extrabold text-[var(--navy)]">{fmtNum(outSummary.units)}</strong>
            </div>
            <div className="text-xs text-[var(--slate)]">
              Poids total
              <strong className="block font-display text-[19px] font-extrabold text-[var(--navy)]">{fmtNum(outSummary.kg)} kg</strong>
            </div>
          </div>

          <div className="mb-3.5 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className={labelCls}>Destination (bénéficiaire)</label>
              <select value={outDestination} onChange={(e) => setOutDestination(e.target.value)} className={inputCls}>
                {destinations.map((d) => (
                  <option key={d.name}>{d.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Jour de la sortie (Planning)</label>
              <input type="date" value={outDate} onChange={(e) => setOutDate(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Créneau horaire</label>
              <input type="time" value={outTime} onChange={(e) => setOutTime(e.target.value)} className={inputCls} />
            </div>
          </div>
          {outError && <p className="mb-2 text-xs text-[var(--critical)]">{outError}</p>}
          <button type="button" onClick={validateOut} className="rounded-[40px] bg-[var(--critical)] px-5 py-2.5 font-display text-sm font-bold text-white">
            Planifier la sortie du stock
          </button>
          <p className="mt-2 text-[11.5px] text-[var(--slate)]">Cela ajoute une prise au dépôt et une dépose chez le bénéficiaire dans le Planning du jour choisi.</p>
          {planned.length > 0 && (
            <div className="mt-4 rounded-xl border border-dashed border-[var(--stock-accent)] bg-[var(--stock-accent-bg)] px-4 py-3">
              <div className="mb-1 text-[12px] font-bold text-[var(--stock-accent)]">Sorties planifiées, en attente du logisticien ({planned.length})</div>
              {planned.map((p) => (
                <div key={p.id} className="text-[12px] text-[var(--navy)]">
                  <strong>{new Date(p.scheduled_date + "T00:00:00").toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}</strong> — {p.label?.replace("Sortie de stock — ", "")} : {(p.planned_items ?? []).map((i) => `${i.name} (${i.colis} colis)`).join(", ")}
                </div>
              ))}
            </div>
          )}

          {outConfirm && (
            <div className="mt-4 rounded-2xl bg-[var(--good-bg)] p-4">
              <div className="mb-2.5 flex items-center gap-2 text-[13px] font-bold text-[var(--good)]">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-[17px] w-[17px]">
                  <path d="M20 6 L9 17 L4 12" />
                </svg>
                <span>Sortie planifiée — 2 arrêts ajoutés au Planning (prise au dépôt, puis dépose)</span>
              </div>
              <div className="flex items-center gap-3 rounded-2xl border-[1.5px] border-l-4 border-[var(--stock-accent)] bg-[var(--card)] px-3.5 py-3">
                <span className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-full bg-[var(--stock-accent-bg)] text-[var(--stock-accent)]">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className="h-[17px] w-[17px]">
                    <rect x="4" y="3.5" width="16" height="17" rx="1.5" />
                    <path d="M4 9.5 H20 M4 14.5 H20" />
                  </svg>
                </span>
                <span className="min-w-0 flex-1">
                  <div className="text-[13.5px] font-bold text-[var(--navy)]">{outConfirm.name}</div>
                  <div className="text-[11.5px] text-[var(--slate)]">{outConfirm.sub}</div>
                </span>
                <span className="flex-none rounded-[40px] bg-[var(--stock-accent-bg)] px-2 py-1 text-[9.5px] font-bold text-[var(--stock-accent)] uppercase">Stock</span>
              </div>
              <div className="mt-2.5 flex flex-col gap-1.5">
                {outConfirm.items.map((it, idx) => (
                  <label key={idx} className="flex items-center gap-2 text-xs text-[var(--navy)]">
                    <input type="checkbox" checked disabled readOnly />
                    {it.produit} — {fmtNum(it.unites)} unités ({it.colis} colis)
                  </label>
                ))}
              </div>
              <p className="mt-2.5 text-[11.5px] leading-[1.5] text-[var(--slate)]">
                Le stock sera décompté quand le logisticien confirmera avoir pris les colis ; le mouvement apparaîtra alors dans l&apos;onglet Historique.
              </p>
              {outDay && (
                <a href={`/planning?date=${outDay}`} className="mt-2.5 inline-flex rounded-[40px] bg-[var(--navy-deep)] px-4 py-2 font-display text-[13px] font-bold text-[var(--panel-fg)]">
                  Voir dans le Planning
                </a>
              )}
            </div>
          )}
        </div>
      )}

      {tab === "in" && (
        <div className="mb-[22px] rounded-[18px] border border-[var(--border)] bg-[var(--card)] p-5 shadow-[var(--shadow)]">
          <h3 className="mb-0.5 font-display text-base font-extrabold">Entrée du stock</h3>
          <p className="mb-4 text-xs text-[var(--slate)]">Ajoute une nouvelle ligne dans le tableau — pour une réception, une régularisation ou un premier référencement.</p>
          <div className="mb-3.5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className={labelCls}>Produit</label>
              <input value={inProduit} onChange={(e) => setInProduit(e.target.value)} placeholder="Ex : Riz basmati 1kg" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Catégorie</label>
              <select value={inCategorie} onChange={(e) => setInCategorie(e.target.value)} className={inputCls}>
                {CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Provenance</label>
              <input value={inProvenance} onChange={(e) => setInProvenance(e.target.value)} placeholder="Ex : Carrefour Part-Dieu" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Grammage (g / ml par unité)</label>
              <input type="number" min={0} value={inGrammage} onChange={(e) => setInGrammage(e.target.value)} placeholder="Ex : 500" className={inputCls} />
            </div>
          </div>
          <div className="mb-3.5 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className={labelCls}>Colis</label>
              <input type="number" min={0} value={inColis} onChange={(e) => setInColis(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Unités par colis</label>
              <input type="number" min={1} value={inUpc} onChange={(e) => setInUpc(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Poids total (kg)</label>
              <input
                type="number"
                min={0}
                value={inPoidsTouched ? inPoids : computedInPoids()}
                onChange={(e) => {
                  setInPoidsTouched(true);
                  setInPoids(e.target.value);
                }}
                placeholder="Calculé automatiquement"
                className={inputCls}
              />
            </div>
          </div>
          <div className="mb-3.5 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className={labelCls}>DDM (optionnel)</label>
              <input type="date" value={inDdm} onChange={(e) => setInDdm(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>DLC (optionnel)</label>
              <input type="date" value={inDlc} onChange={(e) => setInDlc(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Date de réception</label>
              <input type="date" value={inDate} onChange={(e) => setInDate(e.target.value)} className={inputCls} />
            </div>
          </div>
          <button type="button" onClick={validateIn} className="rounded-[40px] bg-[var(--good)] px-5 py-2.5 font-display text-sm font-bold text-white">
            Ajouter au stock
          </button>
        </div>
      )}

      {tab === "history" && (
        <div className="mb-[22px] rounded-[18px] border border-[var(--border)] bg-[var(--card)] p-5 shadow-[var(--shadow)]">
          <h3 className="mb-0.5 font-display text-base font-extrabold">Historique des mouvements</h3>
          <p className="mb-4 text-xs text-[var(--slate)]">Sorties et entrées de stock, regroupées par date, avec leur contenu détaillé.</p>
          {sortedDates.length === 0 ? (
            <p className="text-[12.5px] text-[var(--slate)]">Aucun mouvement enregistré pour l&apos;instant.</p>
          ) : (
            sortedDates.map((d) => (
              <div key={d} className="mb-5 last:mb-0">
                <h4 className="mb-2 border-b border-[var(--border)] pb-1.5 font-display text-sm font-extrabold text-[var(--navy)] capitalize">{fmtDateLong(d)}</h4>
                {historyByDate[d].map((h) => {
                  const isOut = h.type === "sortie";
                  const totalUnits = h.items.reduce((s, x) => s + x.unites, 0);
                  const totalKg = h.items.reduce((s, x) => s + x.kg, 0);
                  return (
                    <div key={h.id} className="flex items-start gap-3 py-2.5">
                      <span className={`flex h-8 w-8 flex-none items-center justify-center rounded-full ${isOut ? "bg-[var(--critical-bg)] text-[var(--critical)]" : "bg-[var(--good-bg)] text-[var(--good)]"}`}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-[15px] w-[15px]">
                          {isOut ? <path d="M12 4 V16 M6 10 L12 16 L18 10 M4 20 H20" /> : <path d="M12 20 V8 M6 14 L12 8 L18 14 M4 4 H20" />}
                        </svg>
                      </span>
                      <div className="min-w-0 flex-1">
                        <span className="text-[13px] font-bold text-[var(--navy)]">{isOut ? `Sortie — ${h.destination}` : "Entrée de stock"}</span>
                        {h.time && <span className="ml-1 text-[11.5px] font-semibold text-[var(--slate)]">{h.time}</span>}
                        <div className="mt-0.5 text-[11.5px] text-[var(--slate)]">
                          {h.items.length} produit(s) · {fmtNum(totalUnits)} unités · {fmtNum(totalKg)} kg
                        </div>
                        <div className="mt-0.5 text-[11.5px] text-[var(--muted)]">{h.items.map((it) => `${it.produit} (${it.colis} colis)`).join(", ")}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="relative max-w-[280px] flex-1">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="pointer-events-none absolute top-1/2 left-3 h-[15px] w-[15px] -translate-y-1/2 text-[var(--slate)]">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21 L16.5 16.5" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un produit..."
            className="w-full rounded-[40px] border border-[var(--border)] bg-[var(--card)] py-[9px] pr-3 pl-[34px] text-[13px] text-[var(--navy)] outline-none focus:border-[var(--turquoise)]"
          />
        </div>
        <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)} className="cursor-pointer rounded-[40px] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-[12.5px] font-semibold text-[var(--navy)]">
          <option value="">Toutes catégories</option>
          {CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </div>

      <div className="overflow-x-auto rounded-[18px] border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow)]">
        <table className="w-full min-w-[980px] border-collapse text-[12.5px]">
          <thead>
            <tr>
              {["Produit", "Catégorie", "Provenance", "Grammage", "Colis", "U./colis", "Unités", "Poids (kg)", "DDM", "DLC", ""].map((h) => (
                <th key={h} className="border-b border-[var(--border)] px-2.5 py-3 text-left text-[10px] font-bold tracking-[0.03em] text-[var(--muted)] uppercase whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredStock.map((it) => {
              const unites = it.colis * it.upc;
              const lowStock = it.colis <= 2;
              const dDlc = daysUntil(it.dlc);
              const dlcClass = dDlc !== null && dDlc < 0 ? "dlc-over" : dDlc !== null && dDlc <= 30 ? "dlc-soon" : "";
              const alertLevel = dDlc !== null && dDlc < 0 ? "over" : dDlc !== null && dDlc <= 30 ? "warn" : "";

              if (editingId === it.id && editDraft) {
                return (
                  <tr key={it.id}>
                    <td className="border-b border-[var(--border)] p-1.5">
                      <input value={editDraft.produit} onChange={(e) => setEditDraft({ ...editDraft, produit: e.target.value })} className="w-full rounded-md border-[1.5px] border-[var(--turquoise)] bg-[var(--input-bg)] px-1.5 py-1 text-xs text-[var(--navy)]" />
                    </td>
                    <td className="border-b border-[var(--border)] p-1.5">
                      <select value={editDraft.categorie} onChange={(e) => setEditDraft({ ...editDraft, categorie: e.target.value })} className="w-full rounded-md border-[1.5px] border-[var(--turquoise)] bg-[var(--input-bg)] px-1.5 py-1 text-xs text-[var(--navy)]">
                        {CATEGORIES.map((c) => (
                          <option key={c}>{c}</option>
                        ))}
                      </select>
                    </td>
                    <td className="border-b border-[var(--border)] p-1.5">
                      <input value={editDraft.provenance} onChange={(e) => setEditDraft({ ...editDraft, provenance: e.target.value })} className="w-full rounded-md border-[1.5px] border-[var(--turquoise)] bg-[var(--input-bg)] px-1.5 py-1 text-xs text-[var(--navy)]" />
                    </td>
                    <td className="border-b border-[var(--border)] p-1.5">
                      <input type="number" value={editDraft.grammage} onChange={(e) => setEditDraft({ ...editDraft, grammage: +e.target.value || 0 })} className="w-full rounded-md border-[1.5px] border-[var(--turquoise)] bg-[var(--input-bg)] px-1.5 py-1 text-xs text-[var(--navy)]" />
                    </td>
                    <td className="border-b border-[var(--border)] p-1.5">
                      <input type="number" value={editDraft.colis} onChange={(e) => setEditDraft({ ...editDraft, colis: +e.target.value || 0 })} className="w-full rounded-md border-[1.5px] border-[var(--turquoise)] bg-[var(--input-bg)] px-1.5 py-1 text-xs text-[var(--navy)]" />
                    </td>
                    <td className="border-b border-[var(--border)] p-1.5">
                      <input type="number" value={editDraft.upc} onChange={(e) => setEditDraft({ ...editDraft, upc: +e.target.value || 0 })} className="w-full rounded-md border-[1.5px] border-[var(--turquoise)] bg-[var(--input-bg)] px-1.5 py-1 text-xs text-[var(--navy)]" />
                    </td>
                    <td className="border-b border-[var(--border)] px-2.5 py-2 text-right tabular-nums">{fmtNum(editDraft.colis * editDraft.upc)}</td>
                    <td className="border-b border-[var(--border)] p-1.5">
                      <input type="number" step={0.1} value={editDraft.poids} onChange={(e) => setEditDraft({ ...editDraft, poids: +e.target.value || 0 })} className="w-full rounded-md border-[1.5px] border-[var(--turquoise)] bg-[var(--input-bg)] px-1.5 py-1 text-xs text-[var(--navy)]" />
                    </td>
                    <td className="border-b border-[var(--border)] p-1.5">
                      <input type="date" value={editDraft.ddm} onChange={(e) => setEditDraft({ ...editDraft, ddm: e.target.value })} className="w-full rounded-md border-[1.5px] border-[var(--turquoise)] bg-[var(--input-bg)] px-1.5 py-1 text-xs text-[var(--navy)]" />
                    </td>
                    <td className="border-b border-[var(--border)] p-1.5">
                      <input type="date" value={editDraft.dlc} onChange={(e) => setEditDraft({ ...editDraft, dlc: e.target.value })} className="w-full rounded-md border-[1.5px] border-[var(--turquoise)] bg-[var(--input-bg)] px-1.5 py-1 text-xs text-[var(--navy)]" />
                    </td>
                    <td className="border-b border-[var(--border)] px-2.5 py-2">
                      <div className="flex gap-1.5">
                        <button type="button" onClick={saveEdit} className="flex h-[26px] w-[26px] items-center justify-center rounded-full border-[1.5px] border-[var(--good)] bg-[var(--good-bg)] text-[var(--good)]">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
                            <path d="M20 6 L9 17 L4 12" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(null);
                            setEditDraft(null);
                          }}
                          className="flex h-[26px] w-[26px] items-center justify-center rounded-full border-[1.5px] border-[var(--border)] bg-[var(--input-bg)] text-[var(--slate)]"
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
                            <path d="M6 6 L18 18 M18 6 L6 18" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              }

              return (
                <tr key={it.id} className={lowStock ? "shadow-[inset_3px_0_0_var(--critical)]" : ""}>
                  <td className="max-w-[190px] truncate border-b border-[var(--border)] px-2.5 py-2 font-semibold text-[var(--navy)]" title={it.produit}>
                    {alertLevel && (
                      <span className={`mr-1.5 inline-flex -translate-y-px ${alertLevel === "over" ? "text-[var(--critical)]" : "text-[var(--warn)]"}`} title={alertLevel === "over" ? "DLC dépassée" : "DLC dans moins d'un mois"}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-[13px] w-[13px]">
                          <path d="M12 9 V13 M12 17 H12.01" />
                          <path d="M10.3 3.9 L1.8 18.5 A1.8 1.8 0 0 0 3.35 21.2 H20.65 A1.8 1.8 0 0 0 22.2 18.5 L13.7 3.9 A1.8 1.8 0 0 0 10.3 3.9 Z" />
                        </svg>
                      </span>
                    )}
                    {it.produit}
                  </td>
                  <td className="border-b border-[var(--border)] px-2.5 py-2">
                    <span className="rounded-[40px] bg-[var(--track)] px-2 py-[3px] text-[10.5px] font-semibold whitespace-nowrap text-[var(--slate)]">{it.categorie}</span>
                  </td>
                  <td className="border-b border-[var(--border)] px-2.5 py-2 text-[var(--navy)]">{it.provenance || "—"}</td>
                  <td className="border-b border-[var(--border)] px-2.5 py-2 text-right text-[var(--navy)] tabular-nums">{it.grammage} g</td>
                  <td className="border-b border-[var(--border)] px-2.5 py-2 text-right text-[var(--navy)] tabular-nums">{it.colis}</td>
                  <td className="border-b border-[var(--border)] px-2.5 py-2 text-right text-[var(--navy)] tabular-nums">{it.upc}</td>
                  <td className="border-b border-[var(--border)] px-2.5 py-2 text-right text-[var(--navy)] tabular-nums">{fmtNum(unites)}</td>
                  <td className="border-b border-[var(--border)] px-2.5 py-2 text-right text-[var(--navy)] tabular-nums">{fmtNum(it.poids)}</td>
                  <td className="border-b border-[var(--border)] px-2.5 py-2 text-[var(--navy)]">{fmtDate(it.ddm)}</td>
                  <td className="border-b border-[var(--border)] px-2.5 py-2">
                    {dlcClass ? (
                      <span className={`inline-block rounded-[5px] px-1.5 py-[3px] font-bold underline decoration-2 underline-offset-2 ${dlcClass === "dlc-over" ? "bg-[var(--critical-bg)] text-[var(--critical)]" : "bg-[var(--warn-bg)] text-[var(--warn)]"}`}>
                        {fmtDate(it.dlc)}
                      </span>
                    ) : (
                      <span className="text-[var(--navy)]">{fmtDate(it.dlc)}</span>
                    )}
                  </td>
                  <td className="border-b border-[var(--border)] px-2.5 py-2">
                    <button
                      type="button"
                      onClick={() => startEdit(it)}
                      title="Modifier"
                      className="flex h-[26px] w-[26px] items-center justify-center rounded-full border-[1.5px] border-[var(--border)] bg-[var(--input-bg)] text-[var(--slate)] hover:border-[var(--turquoise)] hover:text-[var(--turquoise)]"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
                        <path d="M4 20 L4.8 16.5 L16 5.3 C 16.8 4.5, 18 4.5, 18.8 5.3 L18.7 5.2 C 19.5 6, 19.5 7.2, 18.7 8 L7.5 19.2 Z M14 7 L17 10" />
                      </svg>
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {loading && <p className="p-4 text-[13px] text-[var(--slate)]">Chargement…</p>}
        {!loading && stock.length === 0 && <p className="p-4 text-[13px] text-[var(--slate)]">Aucun produit en stock — utilise l&apos;onglet « Entrée du stock » pour ajouter le premier.</p>}
      </div>
      {toast && <div className="fixed bottom-[26px] left-1/2 z-[999] max-w-[420px] -translate-x-1/2 rounded-[14px] bg-[var(--navy-deep)] px-[18px] py-3 text-center text-[13px] font-semibold text-[var(--panel-fg)] shadow-[var(--shadow)]">{toast}</div>}
    </div>
  );
}
