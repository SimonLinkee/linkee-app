// Créneaux de collecte structurés (partenaires) : jour + heure de début + heure de fin, plusieurs créneaux
// possibles par jour (ex. certains partenaires ont un passage le matin ET un autre l'après-midi le même jour).
// Même vocabulaire de jours que les horaires d'ouverture des bénéficiaires (lun..dim), pour rester cohérent
// avec le reste de l'app (planning, Links Bénévoles).

// weekParity absent = toutes les semaines ; "even"/"odd" = une semaine sur deux, selon la parité du numéro
// de semaine ISO de la date (semaine 40 = paire, 41 = impaire, etc. — vérifiable sur n'importe quel calendrier).
export type Slot = { open: string; close: string; weekParity?: "even" | "odd" };
export type Creneaux = Record<string, Slot[]>;

/** Numéro de semaine ISO-8601 (1-53) d'une date ISO. */
export function isoWeekNumber(dateIso: string): number {
  const d = new Date(dateIso + "T00:00:00");
  d.setDate(d.getDate() + 4 - (d.getDay() || 7)); // jeudi de cette semaine ISO
  const yearStart = new Date(d.getFullYear(), 0, 1);
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}
const weekParityOf = (dateIso: string): "even" | "odd" => (isoWeekNumber(dateIso) % 2 === 0 ? "even" : "odd");

export const CRENEAUX_DAYS = [
  { k: "lun", l: "Lundi" },
  { k: "mar", l: "Mardi" },
  { k: "mer", l: "Mercredi" },
  { k: "jeu", l: "Jeudi" },
  { k: "ven", l: "Vendredi" },
  { k: "sam", l: "Samedi" },
  { k: "dim", l: "Dimanche" },
];

/** "Vendredi 14:30–17:00 / Mardi 09:00–10:00 (semaines paires)" — vide si aucun créneau renseigné. */
export function formatCreneaux(c: Creneaux | undefined | null): string {
  if (!c) return "";
  const parts: string[] = [];
  for (const d of CRENEAUX_DAYS) {
    for (const s of c[d.k] ?? []) parts.push(`${d.l} ${s.open}–${s.close}${s.weekParity ? ` (semaines ${s.weekParity === "even" ? "paires" : "impaires"})` : ""}`);
  }
  return parts.join(" / ");
}

export function hasAnyCreneau(c: Creneaux | undefined | null): boolean {
  if (!c) return false;
  return CRENEAUX_DAYS.some((d) => (c[d.k] ?? []).length > 0);
}

/** Clé de jour (lun..dim) à partir d'une date ISO (YYYY-MM-DD). */
export function creneauxDayKey(dateIso: string): string {
  const jsDay = new Date(dateIso + "T00:00:00").getDay(); // 0=dimanche..6=samedi
  return CRENEAUX_DAYS[(jsDay + 6) % 7].k;
}

/** Les créneaux applicables pour une date donnée : bon jour de la semaine, et bonne parité de semaine
 * pour les créneaux "une semaine sur deux". */
export function slotsForDate(c: Creneaux | undefined | null, dateIso: string): Slot[] {
  if (!c) return [];
  const all = c[creneauxDayKey(dateIso)] ?? [];
  const parity = weekParityOf(dateIso);
  return all.filter((s) => !s.weekParity || s.weekParity === parity);
}
