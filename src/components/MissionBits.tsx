// Small shared pieces for the missions (admin TODO page and the logisticien's "Mes missions").

export type MissionStatus = "a_faire" | "en_cours" | "fait";
export const STATUS_LABEL: Record<MissionStatus, string> = { a_faire: "À faire", en_cours: "En cours", fait: "Terminée" };

export const IMPORTANCE_LABEL: Record<number, string> = { 1: "Faible", 2: "Modérée", 3: "Importante", 4: "Très importante", 5: "Critique" };
export const IMPORTANCE_COLOR: Record<number, string> = { 1: "var(--muted)", 2: "var(--good)", 3: "var(--warn)", 4: "var(--cat-2)", 5: "var(--critical)" };

/** Importance as five dots + "4/5". */
export function ImportanceDots({ level, showLabel = false }: { level: number; showLabel?: boolean }) {
  const color = IMPORTANCE_COLOR[level] ?? "var(--muted)";
  return (
    <span className="inline-flex items-center gap-1.5" title={`Importance ${level}/5 — ${IMPORTANCE_LABEL[level]}`}>
      <span className="inline-flex gap-[3px]">
        {[1, 2, 3, 4, 5].map((n) => (
          <span key={n} className="h-2.5 w-2.5 rounded-full" style={{ background: n <= level ? color : "var(--track)" }} />
        ))}
      </span>
      <span className="text-[12px] font-bold tabular-nums" style={{ color }}>
        {level}/5{showLabel ? ` · ${IMPORTANCE_LABEL[level]}` : ""}
      </span>
    </span>
  );
}

/** Text + colour for a deadline ("dans 3 jours", "en retard de 2 jours"…). */
export function deadlineInfo(iso: string | null, done: boolean) {
  if (!iso) return { text: "Sans deadline", color: "var(--slate)", bg: "var(--track)" };
  const d = new Date(iso + "T00:00:00");
  const days = Math.round((d.getTime() - new Date(new Date().toDateString()).getTime()) / 86400000);
  const label = d.toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
  if (done) return { text: label, color: "var(--slate)", bg: "var(--track)" };
  if (days < 0) return { text: `${label} · en retard de ${-days} j`, color: "var(--critical)", bg: "var(--critical-bg)" };
  if (days === 0) return { text: `${label} · aujourd'hui`, color: "var(--critical)", bg: "var(--critical-bg)" };
  if (days <= 3) return { text: `${label} · dans ${days} j`, color: "var(--warn)", bg: "var(--warn-bg)" };
  return { text: `${label} · dans ${days} j`, color: "var(--slate)", bg: "var(--track)" };
}
