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
export const CERFA_STATUS_STYLE: Record<CerfaStatus, { bg: string; fg: string }> = {
  soumise: { bg: "var(--track)", fg: "var(--slate)" },
  validee: { bg: "rgba(42,120,214,.16)", fg: "#2a78d6" },
  emise: { bg: "var(--good-bg)", fg: "var(--good)" },
  refusee: { bg: "var(--critical-bg)", fg: "var(--critical)" },
};

/** Une demande de Cerfa avec ses documents, telle que lue par le partenaire (et plus tard la Comptabilité). */
export type CerfaRequestRow = {
  id: string;
  partner_id: string;
  total_value: number | string;
  status: CerfaStatus;
  refusal_comment: string | null;
  created_at: string;
  issued_at: string | null;
  cerfa_path: string | null;
  cerfa_name: string | null;
  cerfa_request_documents: { document_id: string; active: boolean; documents: { name: string } | { name: string }[] | null }[] | null;
};
export const CERFA_REQUEST_SELECT = "id,partner_id,total_value,status,refusal_comment,created_at,issued_at,cerfa_path,cerfa_name,cerfa_request_documents(document_id,active,documents(name))";

export const cerfaDocNames = (r: CerfaRequestRow): string[] =>
  (r.cerfa_request_documents ?? []).map((d) => (Array.isArray(d.documents) ? d.documents[0]?.name : d.documents?.name) ?? "Document");

export const fmtEuro = (n: number | string) => `${(Number(n) || 0).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

/** Ouvre le Cerfa émis (coffre privé "cerfa") via un lien temporaire. */
export async function openCerfa(supabase: import("@supabase/supabase-js").SupabaseClient, path: string) {
  const { data, error } = await supabase.storage.from("cerfa").createSignedUrl(path, 120);
  if (error || !data) throw new Error(error?.message ?? "Ouverture impossible");
  window.open(data.signedUrl, "_blank", "noopener");
}
