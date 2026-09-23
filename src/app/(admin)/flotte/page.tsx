"use client";

import { useState } from "react";

type CheckItem = { key: string; label: string; intervalDays: number; lastDate: string };
type Invoice = { date: string; fournisseur: string; montant: number; statut: "Payé" | "À payer"; motif: string };
type Vehicle = {
  id: string;
  name: string;
  plate: string;
  type: string;
  assignedTo: string;
  statut: string;
  checks: CheckItem[];
  revisions: CheckItem[];
  invoices: Invoice[];
};

const TODAY = new Date("2026-09-15");
const LOGISTICIENS = [
  { id: "", name: "Non assigné" },
  { id: "akram", name: "Akram" },
];

const INITIAL_VEHICLES: Vehicle[] = [
  {
    id: "v1", name: "Renault Master", plate: "EH-482-QT", type: "Camion principal", assignedTo: "akram", statut: "En service",
    checks: [
      { key: "huile", label: "Niveau d'huile moteur", intervalDays: 30, lastDate: "2026-07-28" },
      { key: "liquide", label: "Liquide de refroidissement", intervalDays: 30, lastDate: "2026-08-25" },
      { key: "pneus", label: "Pression des pneus", intervalDays: 14, lastDate: "2026-09-08" },
      { key: "laveglace", label: "Niveau de lave-glace", intervalDays: 14, lastDate: "2026-09-01" },
      { key: "eclairage", label: "Éclairage / clignotants", intervalDays: 30, lastDate: "2026-08-20" },
    ],
    revisions: [
      { key: "rev1m", label: "Révision 1 mois (garage)", intervalDays: 30, lastDate: "2026-08-15" },
      { key: "rev3m", label: "Révision 3 mois (garage)", intervalDays: 90, lastDate: "2026-06-15" },
      { key: "karcher", label: "Grand nettoyage (Kärcher + aspirateur)", intervalDays: 15, lastDate: "2026-08-28" },
    ],
    invoices: [
      { date: "2026-09-02", fournisseur: "Garage Mermoz Auto", montant: 184.5, statut: "Payé", motif: "Révision 1 mois" },
      { date: "2026-09-10", fournisseur: "Total Energies", montant: 96.2, statut: "À payer", motif: "Carburant" },
      { date: "2026-08-28", fournisseur: "Station Lavage Pro", montant: 35.0, statut: "Payé", motif: "Grand nettoyage" },
      { date: "2026-09-12", fournisseur: "Point S Vénissieux", montant: 212.0, statut: "À payer", motif: "Pneus avant" },
    ],
  },
  {
    id: "v2", name: "Kangoo utilitaire", plate: "FL-091-XZ", type: "Véhicule d'appoint", assignedTo: "", statut: "En réserve",
    checks: [
      { key: "huile", label: "Niveau d'huile moteur", intervalDays: 30, lastDate: "2026-09-05" },
      { key: "liquide", label: "Liquide de refroidissement", intervalDays: 30, lastDate: "2026-09-05" },
      { key: "pneus", label: "Pression des pneus", intervalDays: 14, lastDate: "2026-09-10" },
      { key: "laveglace", label: "Niveau de lave-glace", intervalDays: 14, lastDate: "2026-09-10" },
      { key: "eclairage", label: "Éclairage / clignotants", intervalDays: 30, lastDate: "2026-09-05" },
    ],
    revisions: [
      { key: "rev1m", label: "Révision 1 mois (garage)", intervalDays: 30, lastDate: "2026-09-01" },
      { key: "rev3m", label: "Révision 3 mois (garage)", intervalDays: 90, lastDate: "2026-07-01" },
      { key: "karcher", label: "Grand nettoyage (Kärcher + aspirateur)", intervalDays: 15, lastDate: "2026-09-06" },
    ],
    invoices: [],
  },
];

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
  return [...v.checks, ...v.revisions].filter((it) => status(it).level === "overdue").length;
}

const statusPillCls: Record<string, string> = {
  ok: "bg-[var(--good-bg)] text-[var(--good)]",
  soon: "bg-[var(--warn-bg)] text-[var(--warn)]",
  overdue: "bg-[var(--critical-bg)] text-[var(--critical)]",
};

export default function FlottePage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>(INITIAL_VEHICLES);
  const [currentId, setCurrentId] = useState("v1");
  const [openSections, setOpenSections] = useState<Set<string>>(new Set(["checks"]));
  const [autosaveVisible, setAutosaveVisible] = useState(false);
  const [docModal, setDocModal] = useState<{ v: Vehicle; inv: Invoice } | null>(null);

  const current = vehicles.find((v) => v.id === currentId)!;
  const totalOverdue = vehicles.reduce((sum, v) => sum + overdueCount(v), 0);

  function flashAutosave() {
    setAutosaveVisible(true);
    window.setTimeout(() => setAutosaveVisible(false), 1600);
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
    setVehicles((prev) => prev.map((v) => (v.id === currentId ? updater(v) : v)));
    flashAutosave();
  }
  function markDone(group: "checks" | "revisions", idx: number) {
    updateCurrent((v) => ({
      ...v,
      [group]: v[group].map((it, i) => (i === idx ? { ...it, lastDate: "2026-09-15" } : it)),
    }));
  }
  function toggleInvoice(idx: number) {
    updateCurrent((v) => ({
      ...v,
      invoices: v.invoices.map((inv, i) => (i === idx ? { ...inv, statut: inv.statut === "Payé" ? "À payer" : "Payé" } : inv)),
    }));
  }
  function addInvoice() {
    updateCurrent((v) => ({
      ...v,
      invoices: [...v.invoices, { date: "2026-09-15", fournisseur: "Nouveau fournisseur", montant: 0, statut: "À payer", motif: "À préciser" }],
    }));
    setOpenSections((prev) => new Set(prev).add("invoices"));
  }

  function CheckRows({ group }: { group: "checks" | "revisions" }) {
    return (
      <>
        {current[group].map((it, idx) => {
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

  return (
    <div>
      <h1 className="font-display text-[32px] leading-none font-black">Flotte logistique</h1>
      <p className="mb-[18px] text-[13.5px] text-[var(--slate)]">Véhicules, contrôles d&apos;entretien et suivi devis/factures — remonté automatiquement depuis l&apos;app du logisticien.</p>

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
                  </div>
                </span>
                {overdue > 0 && <span title={`${overdue} échéance(s) dépassée(s)`} className="h-[9px] w-[9px] flex-none rounded-full bg-[var(--critical)]" />}
              </div>
            );
          })}
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
                    À payer
                    <strong className="block font-display text-[19px] font-extrabold text-[var(--navy)]">
                      {fmtEur(current.invoices.filter((i) => i.statut === "À payer").reduce((s, i) => s + i.montant, 0))}
                    </strong>
                  </div>
                  <div className="text-xs text-[var(--slate)]">
                    Payé (30j)
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
                  <table className="w-full border-collapse text-[12.5px]">
                    <thead>
                      <tr>
                        {["Date", "Fournisseur", "Motif", "Montant", "Statut", ""].map((h) => (
                          <th key={h} className="border-b border-[var(--border)] px-1 pb-2 text-left text-[10.5px] font-bold tracking-[0.03em] text-[var(--muted)] uppercase">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {current.invoices.map((inv, idx) => (
                        <tr key={idx}>
                          <td className="border-b border-[var(--border)] px-1 py-2.5 text-[var(--navy)]">{fmtDate(inv.date)}</td>
                          <td className="border-b border-[var(--border)] px-1 py-2.5 text-[var(--navy)]">{inv.fournisseur}</td>
                          <td className="border-b border-[var(--border)] px-1 py-2.5 text-[var(--navy)]">{inv.motif}</td>
                          <td className="border-b border-[var(--border)] px-1 py-2.5 text-right font-bold text-[var(--navy)] tabular-nums">{fmtEur(inv.montant)}</td>
                          <td className="border-b border-[var(--border)] px-1 py-2.5">
                            <button type="button" onClick={() => toggleInvoice(idx)}>
                              <span
                                className={`rounded-[40px] px-2.5 py-1 text-[10.5px] font-bold uppercase ${
                                  inv.statut === "Payé" ? "bg-[var(--good-bg)] text-[var(--good)]" : "bg-[var(--warn-bg)] text-[var(--warn)]"
                                }`}
                              >
                                {inv.statut}
                              </span>
                            </button>
                          </td>
                          <td className="border-b border-[var(--border)] px-1 py-2.5">
                            <button
                              type="button"
                              onClick={() => setDocModal({ v: current, inv })}
                              title="Voir le document"
                              className="flex h-7 w-7 items-center justify-center rounded-full border-[1.5px] border-[var(--border)] bg-[var(--card)] text-[var(--slate)] hover:border-[var(--turquoise)] hover:text-[var(--turquoise)]"
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                                <path d="M1.5 12 C 4 6.5, 8 4, 12 4 C 16 4, 20 6.5, 22.5 12 C 20 17.5, 16 20, 12 20 C 8 20, 4 17.5, 1.5 12 Z" />
                                <circle cx="12" cy="12" r="3" />
                              </svg>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
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
                {docModal.inv.motif.toLowerCase().includes("devis") ? "DEVIS" : "FACTURE"}
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
            <div className="mb-3.5 flex items-baseline justify-between border-t-2 border-[#001641] pt-2.5 font-display text-xl font-black text-[#001641]">
              <span>Total</span>
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
    </div>
  );
}
