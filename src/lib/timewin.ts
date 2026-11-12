// Horaires du planning : on raisonne par fenêtres de 30 minutes (« 9h00 – 9h30 ») et par durées de 10 minutes.
// Le calcul des trajets reste précis en interne ; seul l'affichage et la saisie sont arrondis.

const pad = (n: number) => (n < 10 ? "0" + n : "" + n);

export const HALF_HOUR = 30;
/** « 9h00 » à partir d'un nombre de minutes depuis minuit. */
export const hm = (min: number) => `${Math.floor(min / 60)}h${pad(min % 60)}`;
/** « 09:00 » (valeur d'un champ heure / colonne time). */
export const toHHMM = (min: number) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
export const minOf = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
};
export const floor30 = (min: number) => Math.floor(min / HALF_HOUR) * HALF_HOUR;
export const ceil30 = (min: number) => Math.ceil(min / HALF_HOUR) * HALF_HOUR;

/** « 9h00 – 9h30 » : la demi-heure qui contient l'heure donnée. */
export const windowOfMin = (min: number) => `${hm(floor30(min))} – ${hm(floor30(min) + HALF_HOUR)}`;
/** Idem à partir de « HH:MM » ou « HH:MM:SS » (vide si pas d'heure). */
export const windowOf = (hhmm: string | null | undefined) => (hhmm ? windowOfMin(minOf(hhmm.slice(0, 5))) : "");

/** Durée sur place : par tranches de 10 minutes, 10 minutes au minimum. */
export const round10 = (min: number) => Math.max(10, Math.round(min / 10) * 10);
/** Pas suivant (+10) ou précédent (−10) ; une durée « hors tranche » (ex. 15) est d'abord ramenée à la tranche voisine. */
export const step10 = (min: number, dir: 1 | -1) => Math.max(10, min % 10 === 0 ? min + dir * 10 : dir > 0 ? Math.ceil(min / 10) * 10 : Math.floor(min / 10) * 10);
