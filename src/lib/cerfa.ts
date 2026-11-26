// Reçus fiscaux (Cerfa) : vocabulaire partagé entre l'espace partenaire, la fiche admin et la page Comptabilité.

export type CerfaFrequency = "inconnu" | "ponctuel" | "mensuel" | "trimestriel" | "annuel";
export const CERFA_FREQUENCIES: { k: CerfaFrequency; l: string }[] = [
  { k: "inconnu", l: "Inconnue (à définir avec le partenaire)" },
  { k: "ponctuel", l: "Ponctuel" },
  { k: "mensuel", l: "Mensuel" },
  { k: "trimestriel", l: "Trimestriel" },
  { k: "annuel", l: "Annuel" },
];

/** Une fréquence qui déclenche la création automatique des demandes de Cerfa (mois, trimestre, année civils). */
export const isAutoFrequency = (f: CerfaFrequency) => f === "mensuel" || f === "trimestriel" || f === "annuel";

/** Fréquence d'émission d'une fiche partenaire (clé "cerfaFrequency" du jsonb) ; « inconnue » tant qu'elle n'est pas définie avec le partenaire. */
export function cerfaFrequencyOf(fiche: Record<string, unknown> | null | undefined): CerfaFrequency {
  const v = fiche?.cerfaFrequency;
  return CERFA_FREQUENCIES.some((f) => f.k === v) ? (v as CerfaFrequency) : "inconnu";
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
  period_start?: string | null; // demande automatique (migration 087)
  period_end?: string | null;
  auto?: boolean;
  cerfa_request_documents: { document_id: string; active: boolean; documents: { name: string } | { name: string }[] | null }[] | null;
};
export const CERFA_REQUEST_SELECT_BASE = "id,partner_id,total_value,status,refusal_comment,created_at,issued_at,cerfa_path,cerfa_name,cerfa_request_documents(document_id,active,documents(name))";
export const CERFA_REQUEST_SELECT = CERFA_REQUEST_SELECT_BASE + ",period_start,period_end,auto";

export const cerfaDocNames = (r: CerfaRequestRow): string[] =>
  (r.cerfa_request_documents ?? []).map((d) => (Array.isArray(d.documents) ? d.documents[0]?.name : d.documents?.name) ?? "Document");

export const fmtEuro = (n: number | string) => `${(Number(n) || 0).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

/** Ouvre le Cerfa émis (coffre privé "cerfa") via un lien temporaire. */
export async function openCerfa(supabase: import("@supabase/supabase-js").SupabaseClient, path: string) {
  const { data, error } = await supabase.storage.from("cerfa").createSignedUrl(path, 120);
  if (error || !data) throw new Error(error?.message ?? "Ouverture impossible");
  window.open(data.signedUrl, "_blank", "noopener");
}

/* ---------- Envoi des Cerfa par mail (migration 064) ---------- */

type FicheContact = { type?: string; nom?: string; mail?: string };
export type CerfaRecipient = { email: string; label: string };

const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;
export const isEmail = (s: string) => EMAIL_RE.test(s.trim());

/** Adresses où envoyer le Cerfa d'un partenaire : contact « administratif » d'abord, puis comptable / financier, puis les autres, puis l'adresse du compte. */
export function cerfaRecipients(fiche: Record<string, unknown> | null | undefined): CerfaRecipient[] {
  const contacts = (Array.isArray(fiche?.contacts) ? fiche!.contacts : []) as FicheContact[];
  const rank = (t?: string) => (/admin/i.test(t ?? "") ? 0 : /compta|financ/i.test(t ?? "") ? 1 : 2);
  const out: CerfaRecipient[] = [];
  const seen = new Set<string>();
  const add = (email: string | undefined, label: string) => {
    const e = (email ?? "").trim();
    if (!e || !isEmail(e) || seen.has(e.toLowerCase())) return;
    seen.add(e.toLowerCase());
    out.push({ email: e, label });
  };
  [...contacts].filter((c) => c.mail).sort((a, b) => rank(a.type) - rank(b.type)).forEach((c) => add(c.mail, [c.nom, c.type].filter(Boolean).join(" · ") || "Contact"));
  add(typeof fiche?.portalEmail === "string" ? fiche.portalEmail : undefined, "Adresse du compte partenaire");
  return out;
}

/** Réglage d'envoi automatique d'une fiche : le Cerfa part par mail dès que la comptabilité l'a déposé. Activé par défaut pour une fréquence mensuelle, trimestrielle ou annuelle, sauf si désactivé. */
export function cerfaAutoSendOf(fiche: Record<string, unknown> | null | undefined): { enabled: boolean; to: string } {
  const explicit = fiche?.cerfaAutoSend;
  return { enabled: isAutoFrequency(cerfaFrequencyOf(fiche)) && explicit !== false, to: typeof fiche?.cerfaSendTo === "string" ? fiche.cerfaSendTo : "" };
}

/** Adresse choisie pour l'envoi : celle de la fiche si elle est valide, sinon le premier contact administratif disponible. */
export function cerfaDefaultRecipient(fiche: Record<string, unknown> | null | undefined): CerfaRecipient | null {
  const all = cerfaRecipients(fiche);
  const wanted = cerfaAutoSendOf(fiche).to;
  return all.find((r) => wanted && r.email.toLowerCase() === wanted.toLowerCase()) ?? all[0] ?? null;
}

/** Date AAAA-MM-JJ à Paris d'un instant (émission, jour courant). */
export const parisYmd = (d: Date | string) => new Date(d).toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });

export const fmtLongDate = (iso: string) => new Date(iso.length > 10 ? iso : iso + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" });

/** Texte du mail, modifiable avant l'envoi manuel ; le même est utilisé pour l'envoi automatique. */
export function defaultCerfaMessage(amount: number | string, issuedAt: string | null): string {
  const when = issuedAt ? ` Il a été émis le ${fmtLongDate(issuedAt)}.` : "";
  return `Bonjour,\n\nVeuillez trouver ci-joint votre reçu fiscal (Cerfa) d'un montant de ${fmtEuro(amount)} pour vos dons de produits à Linkee.${when}\n\nMerci pour votre engagement contre le gaspillage alimentaire !\n\nL'équipe Linkee`;
}

export type CerfaMailRow = { id: string; request_id: string; to_email: string; mode: "manuel" | "auto"; status: "envoye" | "erreur"; error: string | null; sent_at: string };
