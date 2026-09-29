// Créneaux de collecte structurés (partenaires) : jour + heure de début + heure de fin, plusieurs créneaux
// possibles par jour (ex. certains partenaires ont un passage le matin ET un autre l'après-midi le même jour).
// Même vocabulaire de jours que les horaires d'ouverture des bénéficiaires (lun..dim), pour rester cohérent
// avec le reste de l'app (planning, Links Bénévoles).

export type Slot = { open: string; close: string };
export type Creneaux = Record<string, Slot[]>;

export const CRENEAUX_DAYS = [
  { k: "lun", l: "Lundi" },
  { k: "mar", l: "Mardi" },
  { k: "mer", l: "Mercredi" },
  { k: "jeu", l: "Jeudi" },
  { k: "ven", l: "Vendredi" },
  { k: "sam", l: "Samedi" },
  { k: "dim", l: "Dimanche" },
];

/** "Vendredi 14:30–17:00 / Mardi 09:00–10:00" — vide si aucun créneau renseigné. */
export function formatCreneaux(c: Creneaux | undefined | null): string {
  if (!c) return "";
  const parts: string[] = [];
  for (const d of CRENEAUX_DAYS) {
    for (const s of c[d.k] ?? []) parts.push(`${d.l} ${s.open}–${s.close}`);
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

/** Les créneaux du partenaire pour le jour de la semaine d'une date donnée. */
export function slotsForDate(c: Creneaux | undefined | null, dateIso: string): Slot[] {
  if (!c) return [];
  return c[creneauxDayKey(dateIso)] ?? [];
}
