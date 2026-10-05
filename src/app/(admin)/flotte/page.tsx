"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useCity } from "@/components/admin/CityContext";
import { signedUrls } from "@/lib/photos";
import FleetLiveCard from "@/components/FleetLiveCard";

type CheckItem = { key: string; label: string; intervalDays: number; lastDate: string };
type Invoice = { date: string; fournisseur: string; montant: number; statut: "Payé" | "À payer"; motif: string; kind?: "Devis" | "Facture"; montantHt?: number }; // montant = TTC ; montantHt facultatif (anciennes lignes sans HT)
type Vehicle = {
  id: string;
  cityId?: string;
  name: string;
  plate: string;
  type: string;
  assignedTo: string;
  statut: string;
  checks: CheckItem[];
  revisions: CheckItem[];
  invoices: Invoice[];
  rented?: boolean; // véhicule loué : l'entretien est assuré par le loueur, seules les photos du lundi matin restent à faire
};

type Report = { tourDate: string | null; tourUrls: string[]; receipts: { id: string; date: string; amount: number | null; url: string }[] };
const TODAY = new Date();
const todayIso = () => new Date().toISOString().slice(0, 10);

const defaultChecks = (): CheckItem[] => [
  { key: "huile", label: "Niveau d'huile moteur", intervalDays: 30, lastDate: todayIso() },
  { key: "liquide", label: "Liquide de refroidissement", intervalDays: 30, lastDate: todayIso() },
  { key: "pneus", label: "Pression des pneus", intervalDays: 14, lastDate: todayIso() },
  { key: "laveglace", label: "Niveau de lave-glace", intervalDays: 14, lastDate: todayIso() },
  { key: "eclairage", label: "Éclairage / clignotants", intervalDays: 30, lastDate: todayIso() },
];
const defaultRevisions = (): CheckItem[] => [
  { key: "rev1m", label: "Révision 1 mois (garage)", intervalDays: 30, lastDate: todayIso() },
  { key: "rev3m", label: "Révision 3 mois (garage)", intervalDays: 90, lastDate: todayIso() },
  { key: "karcher", label: "Grand nettoyage (Kärcher + aspirateur)", intervalDays: 15, lastDate: todayIso() },
];

type VehicleRow = { id: string; name: string; plate: string | null; assigned_to: string | null; fiche: Partial<Vehicle> | null; city_id?: string };
const rowToVehicle = (r: VehicleRow): Vehicle => ({
  id: r.id,
  cityId: r.city_id,
  name: r.name,
  plate: r.plate ?? "",
  assignedTo: r.assigned_to ?? "",
  type: r.fiche?.type ?? "Véhicule",
  statut: r.fiche?.statut ?? "En service",
  checks: r.fiche?.checks ?? defaultChecks(),
  revisions: r.fiche?.revisions ?? defaultRevisions(),
  invoices: r.fiche?.invoices ?? [],
  rented: !!r.fiche?.rented,
});

function status(item: CheckItem) {
  const last = new Date(item.lastDate);
  const daysSince = Math.round((TODAY.getTime() - last.getTime()) / 86400000);
  const pct = daysSince / item.intervalDays;
  if (pct > 1) return { level: "overdue" as const, text: `EN RETARD · ${daysSince - item.intervalDays}j` };
  if (pct > 0.8) return { level: "soon" as const, text: `Bientôt · ${item.intervalDays - daysSince}j restants` };
  return { level: "ok" as const, text: `À jour · ${item.intervalDays - daysSince}j restants` };
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtEur(n: number) {
  return n.toFixed(2).replace(".", ",") + " €";
}
function overdueCount(v: Vehicle) {
  if (v.rented) return 0; // véhicule loué : pas de suivi d'entretien
  return [...v.checks, ...v.revisions].filter((it) => status(it).level === "overdue").length;
}

const statusPillCls: Record<string, string> = {
  ok: "bg-[var(--good-bg)] text-[var(--good)]",
  soon: "bg-[var(--warn-bg)] text-[var(--warn)]",
  overdue: "bg-[var(--critical-bg)] text-[var(--critical)]",
};

export default function FlottePage() {
  const supabase = useMemo(() => createClient(), []);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [currentId, setCurrentId] = useState("");
  const [loading, setLoading] = useState(true);
  const { cityId, isAll, cities } = useCity(); // cityId is null in the national view; the page remounts when the city changes
  const [logisticiens, setLogisticiens] = useState<{ id: string; name: string }[]>([{ id: "", name: "Non assigné" }]);
  const [toast, setToast] = useState<string | null>(null);
  const [reports, setReports] = useState<Record<string, Report>>({});
  const saveTimer = useRef<number | null>(null);
  const [openSections, setOpenSections] = useState<Set<string>>(new Set(["checks"]));
  const [autosaveVisible, setAutosaveVisible] = useState(false);
  const [docModal, setDocModal] = useState<{ v: Vehicle; inv: Invoice } | null>(null);

  const current = vehicles.find((v) => v.id === currentId);
  const totalOverdue = vehicles.reduce((sum, v) => sum + overdueCount(v), 0);
  const LOGISTICIENS = logisticiens;

  function showToast(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(null), 3200);
  }
  function flashAutosave() {
    setAutosaveVisible(true);
    window.setTimeout(() => setAutosaveVisible(false), 1600);
  }

  useEffect(() => {
    (async () => {
      // one city, or every city in the national view
      let vq = supabase.from("vehicles").select("id,name,plate,assigned_to,fiche,city_id").order("created_at");
      let lq = supabase.from("profiles").select("id,full_name,email").eq("role", "logisticien").order("full_name");
      if (cityId) {
        vq = vq.eq("city_id", cityId);
        lq = lq.eq("city_id", cityId);
      }
      const [v, l] = await Promise.all([vq, lq]);
      if (v.error) showToast("Chargement impossible : " + v.error.message);
      let list = ((v.data ?? []) as unknown as VehicleRow[]).map(rowToVehicle);
      // what the logisticien declared from his app (checks done, tour photos, receipts)
      if (list.length) {
        const ev = await supabase.from("vehicle_events").select("id,vehicle_id,kind,key,amount,photos,created_at").in("vehicle_id", list.map((x) => x.id)).order("created_at");
        const events = (ev.data ?? []) as { id: string; vehicle_id: string; kind: string; key: string | null; amount: number | null; photos: string[]; created_at: string }[];
        list = list.map((veh) => {
          const mine = events.filter((e) => e.vehicle_id === veh.id);
          const bump = (items: CheckItem[]) =>
            items.map((it) => {
              const last = mine.filter((e) => e.kind === "check" && e.key === it.key).map((e) => e.created_at.slice(0, 10)).sort().pop();
              return last && last > it.lastDate ? { ...it, lastDate: last } : it;
            });
          return { ...veh, checks: bump(veh.checks), revisions: bump(veh.revisions) };
        });
        const rep: Record<string, Report> = {};
        for (const veh of list) {
          const mine = events.filter((e) => e.vehicle_id === veh.id);
          const tour = mine.filter((e) => e.kind === "tour").pop();
          const receipts = mine.filter((e) => e.kind === "receipt").reverse();
          const paths = [...(tour?.photos ?? []), ...receipts.map((r) => r.photos[0]).filter(Boolean)];
          const urls = await signedUrls(supabase, paths);
          const urlOf = (p: string) => urls[paths.indexOf(p)] ?? "";
          rep[veh.id] = {
            tourDate: tour?.created_at ?? null,
            tourUrls: (tour?.photos ?? []).map(urlOf).filter(Boolean),
            receipts: receipts.map((r) => ({ id: r.id, date: r.created_at, amount: r.amount, url: r.photos[0] ? urlOf(r.photos[0]) : "" })),
          };
        }
        setReports(rep);
      }
      setVehicles(list);
      if (list[0]) setCurrentId(list[0].id);
      setLogisticiens([{ id: "", name: "Non assigné" }, ...((l.data ?? []) as { id: string; full_name: string | null; email: string | null }[]).map((p) => ({ id: p.id, name: p.full_name || p.email || "Logisticien" }))]);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  function persist(v: Vehicle) {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(async () => {
      const { error } = await supabase
        .from("vehicles")
        .update({ name: v.name, plate: v.plate, assigned_to: v.assignedTo || null, fiche: { type: v.type, statut: v.statut, checks: v.checks, revisions: v.revisions, invoices: v.invoices, ...(v.rented ? { rented: true } : {}) } })
        .eq("id", v.id);
      if (error) showToast("Enregistrement impossible : " + error.message);
      else flashAutosave();
    }, 700);
  }

  async function addVehicle() {
    if (!cityId) return showToast(isAll ? "Choisis d'abord une ville dans le menu pour y ajouter un véhicule." : "Aucune ville n'est associée à ton compte.");
    const fiche = { type: "Véhicule", statut: "En service", checks: defaultChecks(), revisions: defaultRevisions(), invoices: [] };
    const { data, error } = await supabase.from("vehicles").insert({ city_id: cityId, name: "Nouveau véhicule", plate: "", fiche }).select("id,name,plate,assigned_to,fiche").single();
    if (error || !data) return showToast("Création impossible : " + (error?.message ?? "erreur"));
    const v = rowToVehicle(data as unknown as VehicleRow);
    setVehicles((prev) => [...prev, v]);
    setCurrentId(v.id);
  }
  // Retire un véhicule de la flotte (sa fiche, ses contrôles, devis & factures et l'historique de ses photos)
  async function deleteVehicle(v: Vehicle) {
    if (!window.confirm(`Supprimer « ${v.name}${v.plate ? ` (${v.plate})` : ""} » de la flotte ?\n\nSa fiche, ses contrôles, révisions, devis & factures et l'historique de ses photos seront supprimés. Cette action est définitive.`)) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current); // pas d'enregistrement en attente sur un véhicule supprimé
    const { data, error } = await supabase.from("vehicles").delete().eq("id", v.id).select("id");
    if (error || !data?.length) return showToast("Suppression impossible : " + (error?.message ?? "la base l'a refusée (droits insuffisants ?)"));
    const rest = vehicles.filter((x) => x.id !== v.id);
    setVehicles(rest);
    setCurrentId(rest[0]?.id ?? "");
    showToast(`« ${v.name} » a été retiré de la flotte.`);
  }
  function toggleSection(key: string) {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }
  function updateCurrent(updater: (v: Vehicle) => Vehicle) {
    const cur = vehicles.find((v) => v.id === currentId);
    if (!cur) return;
    const next = updater(cur);
    setVehicles((prev) => prev.map((v) => (v.id === currentId ? next : v)));
    persist(next);
  }
  function markDone(group: "checks" | "revisions", idx: number) {
    updateCurrent((v) => ({
      ...v,
      [group]: v[group].map((it, i) => (i === idx ? { ...it, lastDate: todayIso() } : it)),
    }));
  }
  function toggleInvoice(idx: number) {
    updateCurrent((v) => ({
      ...v,
      invoices: v.invoices.map((inv, i) => (i === idx ? { ...inv, statut: inv.statut === "Payé" ? "À payer" : "Payé" } : inv)),
    }));
  }
  function updateInvoice(idx: number, patch: Partial<Invoice>) {
    updateCurrent((v) => ({ ...v, invoices: v.invoices.map((inv, i) => (i === idx ? { ...inv, ...patch } : inv)) }));
  }
  /** Le HT et le TTC se calculent l'un l'autre (TVA 20 %) tant que l'autre est vide ou resté cohérent ; sinon chacun reste libre (autre taux de TVA, remise…). */
  function setAmount(idx: number, field: "ht" | "ttc", value: number) {
    const inv = current?.invoices[idx];
    if (!inv) return;
    const r2 = (n: number) => Math.round(n * 100) / 100;
    if (field === "ht") {
      const follow = !inv.montant || inv.montantHt == null || r2(inv.montantHt * 1.2) === inv.montant;
      updateInvoice(idx, { montantHt: value, ...(follow ? { montant: r2(value * 1.2) } : {}) });
    } else {
      const follow = inv.montantHt == null || !inv.montantHt || r2(inv.montantHt * 1.2) === inv.montant;
      updateInvoice(idx, { montant: value, ...(follow ? { montantHt: r2(value / 1.2) } : {}) });
    }
  }
  function deleteInvoice(idx: number) {
    const inv = current?.invoices[idx];
    if (!inv || !window.confirm(`Supprimer cette ligne (${inv.kind ?? "Facture"} — ${inv.fournisseur}, ${inv.motif}) ?`)) return;
    updateCurrent((v) => ({ ...v, invoices: v.invoices.filter((_, i) => i !== idx) }));
  }
  function addInvoice() {
    updateCurrent((v) => ({
      ...v,
      invoices: [...v.invoices, { date: todayIso(), fournisseur: "Nouveau fournisseur", montant: 0, montantHt: 0, statut: "À payer", motif: "À préciser", kind: "Facture" }],
    }));
    setOpenSections((prev) => new Set(prev).add("invoices"));
  }

  function CheckRows({ group }: { group: "checks" | "revisions" }) {
    return (
      <>
        {(current?.[group] ?? []).map((it, idx) => {
          const s = status(it);
          return (
            <div key={it.key} className="flex items-center gap-3 border-b border-[var(--border)] py-2.5 last:border-none">
              <div className="flex-1">
                <div className="text-[13px] font-semibold text-[var(--navy)]">{it.label}</div>
                <div className="text-[11px] text-[var(--slate)]">
                  Dernier contrôle : {fmtDate(it.lastDate)} · intervalle {it.intervalDays}j
                </div>
              </div>
              <span className={`flex-none rounded-[40px] px-2.5 py-[5px] text-[10.5px] font-bold tracking-[0.02em] whitespace-nowrap uppercase ${statusPillCls[s.level]}`}>{s.text}</span>
              <button
                type="button"
                onClick={() => markDone(group, idx)}
                className="flex-none rounded-[40px] border-[1.5px] border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-[11.5px] font-bold text-[var(--navy)] hover:border-[var(--turquoise)] hover:text-[var(--turquoise)]"
              >
                Fait aujourd&apos;hui
              </button>
            </div>
          );
        })}
      </>
    );
  }

  if (!current) {
    return (
      <div>
        <h1 className="font-display text-[32px] leading-none font-black">Flotte logistique</h1>
        <p className="mb-[18px] text-[13.5px] text-[var(--slate)]">Véhicules, contrôles d&apos;entretien et suivi devis/factures.</p>
        <div className="rounded-[18px] border border-dashed border-[var(--border)] bg-[var(--card)] px-6 py-10 text-center text-[13px] text-[var(--slate)]">
          {loading ? "Chargement…" : "Aucun véhicule pour l'instant."}
          {!loading && !isAll && (
            <div className="mt-3">
              <button type="button" onClick={addVehicle} className="rounded-[40px] bg-[var(--navy-deep)] px-[18px] py-2.5 font-display text-[13.5px] font-bold text-[var(--panel-fg)]">
                + Ajouter un véhicule
              </button>
            </div>
          )}
        </div>
        {toast && <div className="fixed bottom-[26px] left-1/2 z-[999] max-w-[420px] -translate-x-1/2 rounded-[14px] bg-[var(--navy-deep)] px-[18px] py-3 text-center text-[13px] font-semibold text-[var(--panel-fg)] shadow-[var(--shadow)]">{toast}</div>}
      </div>
    );
  }

  return (
    <div>
      <h1 className="font-display text-[32px] leading-none font-black">Flotte logistique</h1>
      <p className="mb-[18px] text-[13.5px] text-[var(--slate)]">Véhicules, contrôles d&apos;entretien et suivi devis/factures — remonté automatiquement depuis l&apos;app du logisticien.</p>

      {/* expérimentation : position du camion de Lyon (tracker Invoxia) */}
      {(["Lyon"] as const).map((n) => (isAll || cityId === cities.find((c) => c.name === n)?.id) && <FleetLiveCard key={n} city={n} />)}

      <div
        className={`mb-5 flex items-center gap-3 rounded-2xl px-[18px] py-3.5 text-[13.5px] font-semibold ${
          totalOverdue === 0 ? "bg-[var(--good-bg)] text-[var(--good)]" : "bg-[var(--critical-bg)] text-[var(--critical)]"
        }`}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 flex-none">
          <path d="M12 9 V13 M12 17 H12.01" />
          <path d="M10.3 3.9 L1.8 18.5 A1.8 1.8 0 0 0 3.35 21.2 H20.65 A1.8 1.8 0 0 0 22.2 18.5 L13.7 3.9 A1.8 1.8 0 0 0 10.3 3.9 Z" />
        </svg>
        {totalOverdue === 0 ? (
          <span>
            Tous les véhicules sont <strong>à jour</strong> sur leurs contrôles et révisions.
          </span>
        ) : (
          <span>
            <strong>
              {totalOverdue} échéance{totalOverdue > 1 ? "s" : ""} dépassée{totalOverdue > 1 ? "s" : ""}
            </strong>{" "}
            sur la flotte — voir le détail dans chaque fiche véhicule.
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 items-start gap-[18px] xl:grid-cols-[300px_1fr]">
        <div className="rounded-[18px] border border-[var(--border)] bg-[var(--card)] p-2.5 shadow-[var(--shadow)]">
          {vehicles.map((v) => {
            const overdue = overdueCount(v);
            const assignedName = LOGISTICIENS.find((l) => l.id === v.assignedTo)?.name || "Non assigné";
            return (
              <div
                key={v.id}
                onClick={() => setCurrentId(v.id)}
                className={`flex cursor-pointer items-center gap-[11px] rounded-xl border-[1.5px] px-2.5 py-[11px] ${
                  v.id === currentId ? "border-[var(--turquoise)] bg-[var(--track)]" : "border-transparent hover:bg-[var(--input-bg)]"
                }`}
              >
                <span className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-xl bg-[var(--navy-deep)] text-[var(--panel-fg)]">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className="h-[19px] w-[19px]">
                    <path d="M2 16 V8.5 L5 5 H12 V16" />
                    <path d="M12 9 H16 L19.5 12.5 V16" />
                    <path d="M1 16 H21" />
                    <circle cx="6.5" cy="16" r="2.2" />
                    <circle cx="16.5" cy="16" r="2.2" />
                  </svg>
                </span>
                <span className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-bold text-[var(--navy)]">{v.name}</div>
                  <div className="text-[11px] text-[var(--slate)]">
                    {v.plate} · {assignedName}
                    {isAll && v.cityId && (
                      <span className="ml-1.5 inline-flex items-center gap-1 rounded-[40px] px-1.5 py-px align-middle text-[9.5px] font-bold text-white" style={{ background: cities.find((c) => c.id === v.cityId)?.color ?? "var(--slate)" }}>
                        {cities.find((c) => c.id === v.cityId)?.name ?? "?"}
                      </span>
                    )}
                  </div>
                </span>
                {overdue > 0 && <span title={`${overdue} échéance(s) dépassée(s)`} className="h-[9px] w-[9px] flex-none rounded-full bg-[var(--critical)]" />}
              </div>
            );
          })}
          {isAll ? (
            <p className="mt-1 px-2 py-2 text-[11.5px] text-[var(--slate)]">Vue nationale : choisis une ville dans le menu pour y ajouter un véhicule.</p>
          ) : (
            <button type="button" onClick={addVehicle} className="mt-1 w-full rounded-xl border-[1.5px] border-dashed border-[var(--border)] px-3 py-2.5 text-[12.5px] font-bold text-[var(--navy)] hover:border-[var(--turquoise)] hover:text-[var(--turquoise)]">
              + Ajouter un véhicule
            </button>
          )}
        </div>

        <div className="rounded-[20px] border border-[var(--border)] bg-[var(--card)] px-7 pt-[26px] pb-[30px] shadow-[var(--shadow)]">
          <div className="mb-5 flex flex-wrap items-center gap-[18px]">
            <span className="flex h-[60px] w-[60px] flex-none items-center justify-center rounded-[18px] bg-[var(--navy-deep)] text-[var(--panel-fg)]">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7">
                <path d="M2 16 V8.5 L5 5 H12 V16" />
                <path d="M12 9 H16 L19.5 12.5 V16" />
                <path d="M1 16 H21" />
                <circle cx="6.5" cy="16" r="2.2" />
                <circle cx="16.5" cy="16" r="2.2" />
              </svg>
            </span>
            <div className="min-w-[220px] flex-1">
              <input
                value={current.name}
                onChange={(e) => updateCurrent((v) => ({ ...v, name: e.target.value }))}
                className="w-full rounded-lg border-b-[1.5px] border-transparent bg-transparent px-1 py-0.5 font-display text-[26px] font-black text-[var(--navy)] outline-none hover:border-b-[var(--turquoise)] hover:bg-[var(--input-bg)] focus:border-b-[var(--turquoise)] focus:bg-[var(--input-bg)]"
              />
              <div>
                <span
                  contentEditable
                  suppressContentEditableWarning
                  onBlur={(e) => updateCurrent((v) => ({ ...v, plate: e.currentTarget.textContent?.trim() || v.plate }))}
                  className="mt-1.5 inline-block rounded-md bg-[var(--navy)] px-2.5 py-[3px] font-display text-[12.5px] font-bold tracking-[0.04em] text-white"
                >
                  {current.plate}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => deleteVehicle(current)}
              title="Supprimer ce véhicule de la flotte"
              className="flex h-9 w-9 flex-none items-center justify-center rounded-full text-[var(--muted)] hover:bg-[var(--critical-bg)] hover:text-[var(--critical)]"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
                <path d="M4 7 H20 M9 7 V4.5 A1 1 0 0 1 10 3.5 H14 A1 1 0 0 1 15 4.5 V7 M6.5 7 L7.3 19.5 A2 2 0 0 0 9.3 21.4 H14.7 A2 2 0 0 0 16.7 19.5 L17.5 7" />
              </svg>
            </button>
            <label className="flex flex-none cursor-pointer items-center gap-2 text-[12.5px] font-semibold text-[var(--navy)]" title="Un véhicule loué n'a pas de suivi d'entretien : seules les photos du lundi matin restent actives.">
              <input type="checkbox" checked={!!current.rented} onChange={(e) => updateCurrent((v) => ({ ...v, rented: e.target.checked }))} className="h-4 w-4 accent-[var(--turquoise)]" />
              Véhicule loué
            </label>
            <div className="flex flex-none items-center gap-2.5">
              <label className="text-[11.5px] font-bold tracking-[0.03em] text-[var(--slate)] uppercase">Attribué à</label>
              <select
                value={current.assignedTo}
                onChange={(e) => updateCurrent((v) => ({ ...v, assignedTo: e.target.value }))}
                className="rounded-[10px] border-[1.5px] border-[var(--border)] bg-[var(--input-bg)] px-2.5 py-2 text-[13px] font-semibold text-[var(--navy)]"
              >
                {LOGISTICIENS.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className={`mb-3.5 flex items-center gap-1.5 text-[11.5px] font-semibold text-[var(--good)] transition-opacity ${autosaveVisible ? "opacity-100" : "opacity-0"}`}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" className="h-[13px] w-[13px]">
              <path d="M20 6 L9 17 L4 12" />
            </svg>
            Modifications enregistrées
          </div>

          {(() => {
            const rep = reports[current.id];
            if (current.rented && (!rep || (!rep.tourDate && rep.receipts.length === 0))) {
              return (
                <div className="mb-3 rounded-[14px] border border-dashed border-[var(--turquoise)] bg-[var(--input-bg)] p-4">
                  <h4 className="mb-1 font-display text-[14px] font-extrabold text-[var(--navy)]">Photos du lundi matin</h4>
                  <p className="text-[12.5px] text-[var(--slate)]">Pas encore de photos : le logisticien les ajoute chaque lundi matin depuis l&apos;onglet Camion de son app.</p>
                </div>
              );
            }
            if (!rep || (!rep.tourDate && rep.receipts.length === 0)) return null;
            return (
              <div className="mb-3 rounded-[14px] border border-dashed border-[var(--turquoise)] bg-[var(--input-bg)] p-4">
                <h4 className="mb-2 font-display text-[14px] font-extrabold text-[var(--navy)]">{current.rented && !rep.receipts.length ? "Photos du lundi matin" : "Remonté par le logisticien"}</h4>
                {rep.tourDate && (
                  <div className="mb-3">
                    <div className="mb-1.5 text-[11.5px] font-semibold text-[var(--slate)]">
                      Dernier état des lieux : {new Date(rep.tourDate).toLocaleDateString("fr-FR", { weekday: "long", day: "2-digit", month: "long" })}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {rep.tourUrls.map((u, i) => (
                        <a key={i} href={u} target="_blank" rel="noopener noreferrer">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={u} alt={`Tour du camion ${i + 1}`} className="h-16 w-20 rounded-lg object-cover" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}
                {rep.receipts.length > 0 && (
                  <div>
                    <div className="mb-1.5 text-[11.5px] font-semibold text-[var(--slate)]">Tickets et factures photographiés</div>
                    <div className="flex flex-wrap gap-2.5">
                      {rep.receipts.map((r) => (
                        <a key={r.id} href={r.url} target="_blank" rel="noopener noreferrer" className="flex w-[74px] flex-col items-center gap-1 text-[11px] font-bold text-[var(--navy)]">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          {r.url ? <img src={r.url} alt="Ticket" className="h-[74px] w-[74px] rounded-lg object-cover" /> : <span className="h-[74px] w-[74px] rounded-lg bg-[var(--track)]" />}
                          {r.amount != null ? fmtEur(Number(r.amount)) : "— €"}
                          <span className="text-[10px] font-normal text-[var(--slate)]">{new Date(r.date).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}</span>
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {current.rented && (
            <p className="mb-2.5 rounded-[14px] bg-[var(--track)] px-4 py-3 text-[12.5px] font-semibold text-[var(--slate)]">
              Véhicule loué : l&apos;entretien est assuré par le loueur, il n&apos;y a rien à suivre ici. Restent actifs : les photos du lundi matin et les devis &amp; factures (frais à gérer).
            </p>
          )}
          <div className={current.rented ? "pointer-events-none opacity-45 grayscale select-none" : ""} aria-disabled={current.rented || undefined} inert={current.rented || undefined}>
          {(
            [
              ["checks", "Contrôles & niveaux"],
              ["revisions", "Révisions garage"],
            ] as const
          ).map(([key, title]) => {
            const badge = current[key].filter((it) => status(it).level === "overdue").length;
            const open = openSections.has(key);
            return (
              <div key={key} className="mb-2.5 overflow-hidden rounded-[14px] border border-[var(--border)]">
                <button type="button" onClick={() => toggleSection(key)} className="flex w-full items-center justify-between bg-[var(--input-bg)] px-4 py-[13px] text-left">
                  <div className="flex items-center gap-2.5">
                    <h4 className="font-display text-[15px] font-extrabold text-[var(--navy)]">{title}</h4>
                    {badge > 0 && <span className="rounded-[40px] bg-[var(--critical-bg)] px-2 py-0.5 text-[10.5px] font-bold text-[var(--critical)]">{badge}</span>}
                  </div>
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={`h-[15px] w-[15px] text-[var(--slate)] transition-transform ${open ? "rotate-180" : ""}`}
                  >
                    <path d="M6 9 L12 15 L18 9" />
                  </svg>
                </button>
                {open && (
                  <div className="border-t border-[var(--border)] p-4">
                    <CheckRows group={key} />
                    {key === "checks" && (
                      <p className="mt-2.5 text-[11.5px] text-[var(--slate)]">
                        Ces dates sont renseignées par le logisticien depuis l&apos;onglet Camion de son app — le tableau de bord se met à jour automatiquement.
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          </div>

          <div className="mb-2.5 overflow-hidden rounded-[14px] border border-[var(--border)]">
            <button type="button" onClick={() => toggleSection("invoices")} className="flex w-full items-center justify-between bg-[var(--input-bg)] px-4 py-[13px] text-left">
              <h4 className="font-display text-[15px] font-extrabold text-[var(--navy)]">Devis &amp; factures</h4>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className={`h-[15px] w-[15px] text-[var(--slate)] transition-transform ${openSections.has("invoices") ? "rotate-180" : ""}`}
              >
                <path d="M6 9 L12 15 L18 9" />
              </svg>
            </button>
            {openSections.has("invoices") && (
              <div className="border-t border-[var(--border)] p-4">
                <div className="mb-3 flex flex-wrap gap-[18px]">
                  <div className="text-xs text-[var(--slate)]">
                    À payer (TTC)
                    <strong className="block font-display text-[19px] font-extrabold text-[var(--navy)]">
                      {fmtEur(current.invoices.filter((i) => i.statut === "À payer").reduce((s, i) => s + i.montant, 0))}
                    </strong>
                  </div>
                  <div className="text-xs text-[var(--slate)]">
                    Payé (TTC)
                    <strong className="block font-display text-[19px] font-extrabold text-[var(--navy)]">
                      {fmtEur(current.invoices.filter((i) => i.statut === "Payé").reduce((s, i) => s + i.montant, 0))}
                    </strong>
                  </div>
                  <div className="text-xs text-[var(--slate)]">
                    Documents
                    <strong className="block font-display text-[19px] font-extrabold text-[var(--navy)]">{current.invoices.length}</strong>
                  </div>
                </div>
                {current.invoices.length === 0 ? (
                  <p className="text-[12.5px] text-[var(--slate)]">Aucun document pour l&apos;instant.</p>
                ) : (
                  <div className="overflow-x-auto">
                  <table className="w-full min-w-[820px] border-collapse text-[12.5px]">
                    <thead>
                      <tr>
                        {["Date", "Type", "Fournisseur", "Motif / intitulé", "Montant HT", "Montant TTC", "Statut", ""].map((h) => (
                          <th key={h} className="border-b border-[var(--border)] px-1 pb-2 text-left text-[10.5px] font-bold tracking-[0.03em] text-[var(--muted)] uppercase">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {current.invoices.map((inv, idx) => {
                        const cell = "border-b border-[var(--border)] px-1 py-1.5";
                        const field = "w-full rounded-lg border border-transparent bg-transparent px-1.5 py-1.5 text-[12.5px] text-[var(--navy)] hover:border-[var(--border)] focus:border-[var(--turquoise)] focus:bg-[var(--input-bg)] focus:outline-none";
                        return (
                          <tr key={idx}>
                            <td className={cell}>
                              <input type="date" aria-label="Date" defaultValue={inv.date} key={"d" + idx + inv.date} onBlur={(e) => e.target.value && e.target.value !== inv.date && updateInvoice(idx, { date: e.target.value })} className={field + " w-[128px]"} />
                            </td>
                            <td className={cell}>
                              <select aria-label="Devis ou facture" value={inv.kind ?? (inv.motif.toLowerCase().includes("devis") ? "Devis" : "Facture")} onChange={(e) => updateInvoice(idx, { kind: e.target.value as "Devis" | "Facture" })} className={field + " w-[88px]"}>
                                <option>Facture</option>
                                <option>Devis</option>
                              </select>
                            </td>
                            <td className={cell}>
                              <input type="text" aria-label="Fournisseur" defaultValue={inv.fournisseur} key={"f" + idx + inv.fournisseur} onBlur={(e) => e.target.value.trim() !== inv.fournisseur && updateInvoice(idx, { fournisseur: e.target.value.trim() })} className={field} />
                            </td>
                            <td className={cell}>
                              <input type="text" aria-label="Motif" defaultValue={inv.motif} key={"m" + idx + inv.motif} onBlur={(e) => e.target.value.trim() !== inv.motif && updateInvoice(idx, { motif: e.target.value.trim() })} className={field} />
                            </td>
                            <td className={cell}>
                              <input type="number" min={0} step="0.01" aria-label="Montant HT" placeholder="—" defaultValue={inv.montantHt ?? ""} key={"h" + idx + (inv.montantHt ?? "")} onBlur={(e) => e.target.value !== "" && Number(e.target.value) !== inv.montantHt && setAmount(idx, "ht", Math.max(0, Number(e.target.value)))} className={field + " w-[92px] text-right tabular-nums"} />
                            </td>
                            <td className={cell}>
                              <input type="number" min={0} step="0.01" aria-label="Montant TTC" defaultValue={inv.montant} key={"t" + idx + inv.montant} onBlur={(e) => e.target.value !== "" && Number(e.target.value) !== inv.montant && setAmount(idx, "ttc", Math.max(0, Number(e.target.value)))} className={field + " w-[92px] text-right font-bold tabular-nums"} />
                            </td>
                            <td className={cell}>
                              <button type="button" onClick={() => toggleInvoice(idx)} title="Changer le statut">
                                <span
                                  className={`rounded-[40px] px-2.5 py-1 text-[10.5px] font-bold uppercase ${
                                    inv.statut === "Payé" ? "bg-[var(--good-bg)] text-[var(--good)]" : "bg-[var(--warn-bg)] text-[var(--warn)]"
                                  }`}
                                >
                                  {inv.statut}
                                </span>
                              </button>
                            </td>
                            <td className={cell + " whitespace-nowrap"}>
                              <button
                                type="button"
                                onClick={() => setDocModal({ v: current, inv })}
                                title="Voir le document"
                                className="mr-1 inline-flex h-7 w-7 items-center justify-center rounded-full border-[1.5px] border-[var(--border)] bg-[var(--card)] text-[var(--slate)] hover:border-[var(--turquoise)] hover:text-[var(--turquoise)]"
                              >
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                                  <path d="M1.5 12 C 4 6.5, 8 4, 12 4 C 16 4, 20 6.5, 22.5 12 C 20 17.5, 16 20, 12 20 C 8 20, 4 17.5, 1.5 12 Z" />
                                  <circle cx="12" cy="12" r="3" />
                                </svg>
                              </button>
                              <button
                                type="button"
                                onClick={() => deleteInvoice(idx)}
                                title="Supprimer cette ligne"
                                className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[var(--muted)] hover:bg-[var(--critical-bg)] hover:text-[var(--critical)]"
                              >
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-[15px] w-[15px]">
                                  <path d="M4 7 H20 M9 7 V4.5 A1 1 0 0 1 10 3.5 H14 A1 1 0 0 1 15 4.5 V7 M6.5 7 L7.3 19.5 A2 2 0 0 0 9.3 21.4 H14.7 A2 2 0 0 0 16.7 19.5 L17.5 7" />
                                </svg>
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  </div>
                )}
                <button
                  type="button"
                  onClick={addInvoice}
                  className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-[11px] border-[1.5px] border-dashed border-[var(--border)] bg-[var(--input-bg)] py-2.5 text-[12.5px] font-bold text-[var(--navy)] hover:border-[var(--turquoise)] hover:text-[var(--turquoise)]"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                    <path d="M12 5 V19 M5 12 H19" />
                  </svg>
                  Ajouter un devis / une facture
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {docModal && (
        <div
          className="fixed inset-0 z-[1000] flex items-center justify-center bg-[rgba(0,22,65,0.55)] p-6"
          onClick={(e) => {
            if (e.target === e.currentTarget) setDocModal(null);
          }}
        >
          <div className="relative max-h-[85vh] w-full max-w-[420px] overflow-y-auto rounded-md bg-white p-8 pt-8 pb-6 text-[#1a1a1a] shadow-[0_30px_70px_rgba(0,0,0,0.4)]">
            <button
              type="button"
              onClick={() => setDocModal(null)}
              className="absolute top-3.5 right-3.5 flex h-[30px] w-[30px] items-center justify-center rounded-full bg-[#F1EAE0] text-[#333]"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                <path d="M6 6 L18 18 M18 6 L6 18" />
              </svg>
            </button>
            <div className="mb-5 flex items-end justify-between border-b-2 border-[#001641] pb-3.5">
              <span className="font-script text-[22px] text-[#001641]">linkee</span>
              <span className="font-display text-[13px] font-extrabold tracking-[0.08em] text-[#4D5C7A]">
                {(docModal.inv.kind ?? (docModal.inv.motif.toLowerCase().includes("devis") ? "Devis" : "Facture")).toUpperCase()}
              </span>
            </div>
            <div className="mb-5 grid grid-cols-2 gap-x-2.5 gap-y-3.5 text-xs text-[#4D5C7A]">
              <div>
                <strong className="mb-0.5 block text-[10.5px] font-bold tracking-[0.03em] text-[#001641] uppercase">Fournisseur</strong>
                {docModal.inv.fournisseur}
              </div>
              <div>
                <strong className="mb-0.5 block text-[10.5px] font-bold tracking-[0.03em] text-[#001641] uppercase">Date</strong>
                {fmtDate(docModal.inv.date)}
              </div>
              <div>
                <strong className="mb-0.5 block text-[10.5px] font-bold tracking-[0.03em] text-[#001641] uppercase">Véhicule</strong>
                {docModal.v.name} — {docModal.v.plate}
              </div>
              <div>
                <strong className="mb-0.5 block text-[10.5px] font-bold tracking-[0.03em] text-[#001641] uppercase">Motif</strong>
                {docModal.inv.motif}
              </div>
            </div>
            <table className="mb-3.5 w-full border-collapse text-[13px]">
              <tbody>
                <tr>
                  <td className="border-b border-[#EADFD2] py-2.5 text-[#1a1a1a]">{docModal.inv.motif}</td>
                  <td className="border-b border-[#EADFD2] py-2.5 text-right font-bold text-[#1a1a1a]">{fmtEur(docModal.inv.montant)}</td>
                </tr>
              </tbody>
            </table>
            {docModal.inv.montantHt != null && docModal.inv.montantHt > 0 && (
              <div className="mb-2 flex justify-between text-[12px] text-[#4D5C7A]">
                <span>Total HT {fmtEur(docModal.inv.montantHt)}</span>
                <span>TVA {fmtEur(Math.max(0, docModal.inv.montant - docModal.inv.montantHt))}</span>
              </div>
            )}
            <div className="mb-3.5 flex items-baseline justify-between border-t-2 border-[#001641] pt-2.5 font-display text-xl font-black text-[#001641]">
              <span>Total TTC</span>
              <span>{fmtEur(docModal.inv.montant)}</span>
            </div>
            <span
              className={`mb-[18px] inline-block rounded-[40px] px-3 py-1.5 text-[11px] font-bold uppercase ${
                docModal.inv.statut === "Payé" ? "bg-[#E4F4E1] text-[#0ca30c]" : "bg-[#FBF0DC] text-[#c98500]"
              }`}
            >
              {docModal.inv.statut}
            </span>
            <p className="border-t border-dashed border-[#EADFD2] pt-3.5 text-[11px] leading-[1.5] text-[#9AA3B8] italic">
              Aperçu généré à partir des informations saisies pour cette maquette. Dans l&apos;app réelle, la photo ou le PDF réellement importé par le logisticien (Supabase Storage) s&apos;affichera
              ici.
            </p>
          </div>
        </div>
      )}
      {toast && <div className="fixed bottom-[26px] left-1/2 z-[999] max-w-[420px] -translate-x-1/2 rounded-[14px] bg-[var(--navy-deep)] px-[18px] py-3 text-center text-[13px] font-semibold text-[var(--panel-fg)] shadow-[var(--shadow)]">{toast}</div>}
    </div>
  );
}
