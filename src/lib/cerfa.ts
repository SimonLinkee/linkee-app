// Reçus fiscaux (Cerfa) : vocabulaire partagé entre l'espace partenaire, la fiche admin et la page Comptabilité.

export type CerfaFrequency = "ponctuel" | "mensuel" | "trimestriel" | "annuel";
export const CERFA_FREQUENCIES: { k: CerfaFrequency; l: string }[] = [
  { k: "ponctuel", l: "Ponctuel" },
  { k: "mensuel", l: "Mensuel" },
  { k: "trimestriel", l: "Trimestriel" },
  { k: "annuel", l: "Annuel" },
];

/** Fréquence d'émission d'une fiche partenaire (clé "cerfaFrequency" du jsonb) ; "ponctuel" par défaut. */
export function cerfaFrequencyOf(fiche: Record<string, unknown> | null | undefined): CerfaFrequency {
  const v = fiche?.cerfaFrequency;
  return CERFA_FREQUENCIES.some((f) => f.k === v) ? (v as CerfaFrequency) : "ponctuel";
}

export type CerfaStatus = "soumise" | "validee" | "emise" | "refusee";
export const CERFA_STATUS_LABEL: Record<CerfaStatus, string> = {
  soumise: "Soumise",
  validee: "Validée",
  emise: "Émise",
  refusee: "Refusée",
};
