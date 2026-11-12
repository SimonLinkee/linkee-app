"use client";

import { hm, toHHMM } from "@/lib/timewin";

/** Choix d'une heure par demi-heure (« 9h00 », « 9h30 »…) au lieu d'un champ à la minute près.
 * `value` est au format « HH:MM » ; une valeur déjà enregistrée hors demi-heure (ex. 09:12) reste affichée telle quelle. */
export default function HalfHourSelect({
  value,
  onChange,
  from = 5 * 60,
  to = 22 * 60,
  allowEmpty = false,
  disabled = false,
  className = "",
  ariaLabel,
}: {
  value: string;
  onChange: (hhmm: string) => void;
  from?: number;
  to?: number;
  allowEmpty?: boolean;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
}) {
  const v = value ? value.slice(0, 5) : "";
  const opts: number[] = [];
  for (let m = from; m <= to; m += 30) opts.push(m);
  const extra = v && !opts.some((m) => toHHMM(m) === v) ? v : null;
  return (
    <select value={v} disabled={disabled} aria-label={ariaLabel} onChange={(e) => onChange(e.target.value)} className={className}>
      {allowEmpty && <option value="">—</option>}
      {extra && <option value={extra}>{extra.replace(":", "h")}</option>}
      {opts.map((m) => (
        <option key={m} value={toHHMM(m)}>
          {hm(m)}
        </option>
      ))}
    </select>
  );
}
