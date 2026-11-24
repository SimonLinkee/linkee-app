"use client";

import HalfHourSelect from "@/components/HalfHourSelect";
import { CRENEAUX_DAYS, type Creneaux, type Slot } from "@/lib/creneaux";

const inputCls =
  "rounded-[11px] border-[1.5px] border-[var(--border)] bg-[var(--input-bg)] px-2 py-1.5 text-xs font-medium text-[var(--navy)] outline-none focus:border-[var(--turquoise)]";

/** Jours + plages horaires (plusieurs par jour possibles, au choix toutes les semaines ou une semaine sur deux). */
export default function CreneauxEditor({ value, onChange, disabled = false, emptyLabel = "Aucun créneau" }: { value: Creneaux; onChange: (v: Creneaux) => void; disabled?: boolean; emptyLabel?: string }) {
  function addSlot(day: string) {
    onChange({ ...value, [day]: [...(value[day] ?? []), { open: "09:00", close: "13:00" }] });
  }
  function updateSlot(day: string, i: number, patch: Partial<Slot>) {
    onChange({ ...value, [day]: (value[day] ?? []).map((s, idx) => (idx === i ? { ...s, ...patch } : s)) });
  }
  function removeSlot(day: string, i: number) {
    onChange({ ...value, [day]: (value[day] ?? []).filter((_, idx) => idx !== i) });
  }
  return (
    <div className="flex flex-col overflow-hidden rounded-[14px] border border-[var(--border)]">
      {CRENEAUX_DAYS.map((d) => {
        const slots = value[d.k] ?? [];
        return (
          <div key={d.k} className="border-b border-[var(--border)] bg-[var(--card)] px-3 py-2.5 last:border-b-0">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[12.5px] font-bold text-[var(--navy)]">{d.l}</span>
              {!disabled && (
                <button type="button" onClick={() => addSlot(d.k)} className="flex-none rounded-[40px] border-[1.5px] border-dashed border-[var(--border)] px-2.5 py-1 text-[11px] font-bold text-[var(--slate)] hover:border-[var(--turquoise)] hover:text-[var(--turquoise)]">
                  + Créneau
                </button>
              )}
            </div>
            {slots.length === 0 ? (
              <p className="mt-1 text-[11px] text-[var(--muted)]">{emptyLabel}</p>
            ) : (
              <div className="mt-1.5 flex flex-col gap-1.5">
                {slots.map((s, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-2">
                    <HalfHourSelect className={inputCls} value={s.open} onChange={(v) => updateSlot(d.k, i, { open: v })} disabled={disabled} />
                    <span className="text-[11px] text-[var(--muted)]">à</span>
                    <HalfHourSelect className={inputCls} value={s.close} onChange={(v) => updateSlot(d.k, i, { close: v })} disabled={disabled} />
                    <select
                      className={inputCls}
                      disabled={disabled}
                      value={s.weekParity ?? "toutes"}
                      onChange={(e) => updateSlot(d.k, i, { weekParity: e.target.value === "toutes" ? undefined : (e.target.value as "even" | "odd") })}
                    >
                      <option value="toutes">Toutes les semaines</option>
                      <option value="even">Une semaine sur deux — semaines paires</option>
                      <option value="odd">Une semaine sur deux — semaines impaires</option>
                    </select>
                    {!disabled && (
                      <button type="button" onClick={() => removeSlot(d.k, i)} title="Supprimer ce créneau" className="ml-1 flex h-6 w-6 flex-none items-center justify-center rounded-full border-[1.5px] border-[var(--border)] text-[var(--slate)] hover:border-[var(--critical)] hover:bg-[var(--critical-bg)] hover:text-[var(--critical)]">
                        ×
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
