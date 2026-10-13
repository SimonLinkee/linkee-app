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

/* ---------- Envoi des Cerfa par mail (migration 064) ---------- */

export const CERFA_SEND_DAY_DEFAULT = 10; // jour du mois d'envoi automatique, si rien n'est réglé sur la fiche

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

/** Réglage d'envoi automatique d'une fiche : activé par défaut dès qu'il y a une fréquence (mensuel, trimestriel, annuel), sauf si désactivé. */
export function cerfaAutoSendOf(fiche: Record<string, unknown> | null | undefined): { enabled: boolean; day: number; to: string } {
  const freq = cerfaFrequencyOf(fiche);
  const explicit = fiche?.cerfaAutoSend;
  const day = Math.min(28, Math.max(1, Number(fiche?.cerfaSendDay) || CERFA_SEND_DAY_DEFAULT));
  return { enabled: freq !== "ponctuel" && explicit !== false, day, to: typeof fiche?.cerfaSendTo === "string" ? fiche.cerfaSendTo : "" };
}

/** Adresse choisie pour l'envoi : celle de la fiche si elle est valide, sinon le premier contact administratif disponible. */
export function cerfaDefaultRecipient(fiche: Record<string, unknown> | null | undefined): CerfaRecipient | null {
  const all = cerfaRecipients(fiche);
  const wanted = cerfaAutoSendOf(fiche).to;
  return all.find((r) => wanted && r.email.toLowerCase() === wanted.toLowerCase()) ?? all[0] ?? null;
}

const ymd = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/**
 * Prochaine échéance d'envoi automatique, à partir de la date d'émission (AAAA-MM-JJ) :
 * mensuel = le « jour d'envoi » de chaque mois · trimestriel = ce jour en janvier, avril, juillet, octobre · annuel = ce jour en janvier.
 * C'est la première échéance qui tombe le jour de l'émission ou après. « Ponctuel » : jamais d'envoi automatique (null).
 */
export function nextCerfaDue(issuedYmd: string, freq: CerfaFrequency, day: number): string | null {
  if (freq === "ponctuel") return null;
  const [y0, m0] = issuedYmd.split("-").map(Number);
  const d = Math.min(28, Math.max(1, day));
  const months = freq === "mensuel" ? [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] : freq === "trimestriel" ? [0, 3, 6, 9] : [0];
  for (let y = y0; y <= y0 + 2; y++) {
    for (const m of months) {
      if (y === y0 && m < m0 - 1) continue;
      const cand = ymd(y, m, d);
      if (cand >= issuedYmd) return cand;
    }
  }
  return null;
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
