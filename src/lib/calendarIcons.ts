// Pictogrammes de priorité des entrées du calendrier (colonne calendar_events.icon, migration 059).
export const CAL_ICONS = [
  { k: "attention", e: "⚠️", l: "Attention" },
  { k: "drapeau", e: "🚩", l: "Drapeau" },
  { k: "epingle", e: "📌", l: "Épinglé" },
  { k: "fait", e: "✅", l: "Fait" },
  { k: "info", e: "ℹ️", l: "Info" },
] as const;

export type CalIconKey = (typeof CAL_ICONS)[number]["k"];

export const iconOf = (k: string | null | undefined) => CAL_ICONS.find((i) => i.k === k) ?? null;

/** Lien saisi par un utilisateur : on ajoute https:// s'il manque, et on n'accepte QUE http(s) (jamais javascript: ni data:). */
export function safeLink(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(t) ? t : "https://" + t;
  try {
    const u = new URL(withScheme);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}
