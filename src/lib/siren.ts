// Recherche d'entreprises via l'API publique du gouvernement (recherche-entreprises.api.gouv.fr) — gratuite,
// sans clé, CORS ouvert. Utilisée pour compléter automatiquement les infos comptables à partir d'un SIREN.

export type SirenInfo = {
  raisonSociale: string | null;
  siret: string | null;
  adresseSiege: string | null;
  formeJuridiqueCode: string | null;
  formeJuridique: string | null; // libellé si connu, sinon "Code <code>"
  codeNaf: string | null;
  libelleNaf: string | null; // libellé si connu (liste non exhaustive), sinon null
  dateCreation: string | null;
  tva: string | null;
  fetchedAt: string;
  notFound?: boolean;
};

export const isValidSiren = (v: string) => /^\d{9}$/.test(v.trim());

/** N° de TVA intracommunautaire français : FR + clé + SIREN, clé = (12 + 3 × (SIREN mod 97)) mod 97. */
export function tvaFromSiren(siren: string): string {
  const n = parseInt(siren, 10);
  const key = (12 + 3 * (n % 97)) % 97;
  return `FR${String(key).padStart(2, "0")}${siren}`;
}

// Listes non exhaustives (les cas les plus fréquents chez les partenaires/bénéficiaires Linkee) — un code non
// répertorié s'affiche tel quel plutôt que d'inventer un libellé.
const FORME_JURIDIQUE: Record<string, string> = {
  "1000": "Entrepreneur individuel",
  "5202": "Société en nom collectif",
  "5306": "Société en commandite simple",
  "5307": "Société en commandite par actions",
  "5308": "SARL unipersonnelle (EURL)",
  "5385": "Société d'exercice libéral à forme de SARL",
  "5410": "SARL",
  "5498": "SA à conseil d'administration",
  "5499": "SA à directoire",
  "5710": "SAS",
  "5720": "SASU",
  "6220": "Société civile immobilière",
  "9220": "Association déclarée",
  "9221": "Association déclarée d'insertion par l'économique",
  "9222": "Association intermédiaire",
  "9223": "Groupement de coopération sociale et médico-sociale",
  "9230": "Association déclarée reconnue d'utilité publique",
  "9240": "Congrégation",
  "9260": "Fondation",
  "9300": "Autre personne morale de droit privé",
};
const NAF_LABEL: Record<string, string> = {
  "10.13A": "Préparation industrielle de produits à base de viande",
  "10.13B": "Charcuterie",
  "10.39B": "Autre transformation et conservation de légumes",
  "10.61B": "Autres activités du travail des grains",
  "10.71B": "Cuisson de produits de boulangerie",
  "10.71C": "Boulangerie et boulangerie-pâtisserie",
  "10.89Z": "Fabrication d'autres produits alimentaires n.c.a.",
  "11.07B": "Production de boissons rafraîchissantes",
  "46.31Z": "Commerce de gros de fruits et légumes",
  "46.32A": "Commerce de gros de viandes de boucherie",
  "46.33Z": "Commerce de gros de produits laitiers, œufs, huiles et matières grasses comestibles",
  "46.38B": "Commerce de gros alimentaire spécialisé divers",
  "46.39A": "Commerce de gros de produits surgelés",
  "46.39B": "Commerce de gros alimentaire non spécialisé",
  "47.11A": "Commerce de détail de produits surgelés",
  "47.11B": "Commerce d'alimentation générale",
  "47.11C": "Supérettes",
  "47.11D": "Supermarchés",
  "47.11F": "Hypermarchés",
  "47.21Z": "Commerce de détail de fruits et légumes en magasin spécialisé",
  "47.22Z": "Commerce de détail de viandes et de produits à base de viande",
  "47.24Z": "Commerce de détail de pain, pâtisserie et confiserie",
  "55.10Z": "Hôtels et hébergement similaire",
  "56.10A": "Restauration traditionnelle",
  "56.10B": "Cafétérias et autres libres-services",
  "56.10C": "Restauration de type rapide",
  "56.21Z": "Services des traiteurs",
  "56.29A": "Restauration collective sous contrat",
  "56.29B": "Autres services de restauration n.c.a.",
  "88.10C": "Aide à domicile",
  "88.99B": "Action sociale sans hébergement n.c.a.",
  "94.91Z": "Activités des organisations religieuses",
  "94.99Z": "Autres organisations fonctionnant par adhésion volontaire",
};

type ApiResult = {
  nom_complet?: string;
  nom_raison_sociale?: string;
  nature_juridique?: string;
  activite_principale?: string;
  date_creation?: string;
  siege?: { siret?: string; adresse?: string };
};

/** Interroge recherche-entreprises.api.gouv.fr et renvoie les infos utiles, ou notFound si rien ne correspond. */
export async function lookupSiren(siren: string): Promise<SirenInfo> {
  const now = new Date().toISOString();
  try {
    const res = await fetch(`https://recherche-entreprises.api.gouv.fr/search?q=${siren}`);
    if (!res.ok) return { raisonSociale: null, siret: null, adresseSiege: null, formeJuridiqueCode: null, formeJuridique: null, codeNaf: null, libelleNaf: null, dateCreation: null, tva: null, fetchedAt: now, notFound: true };
    const json = await res.json();
    const r: ApiResult | undefined = (json?.results ?? []).find((x: ApiResult & { siren?: string }) => x.siren === siren) ?? json?.results?.[0];
    if (!r) return { raisonSociale: null, siret: null, adresseSiege: null, formeJuridiqueCode: null, formeJuridique: null, codeNaf: null, libelleNaf: null, dateCreation: null, tva: null, fetchedAt: now, notFound: true };
    const naf = r.activite_principale ?? null;
    const formeCode = r.nature_juridique ?? null;
    return {
      raisonSociale: r.nom_complet ?? r.nom_raison_sociale ?? null,
      siret: r.siege?.siret ?? null,
      adresseSiege: r.siege?.adresse ?? null,
      formeJuridiqueCode: formeCode,
      formeJuridique: formeCode ? (FORME_JURIDIQUE[formeCode] ?? `Code ${formeCode}`) : null,
      codeNaf: naf,
      libelleNaf: naf ? (NAF_LABEL[naf] ?? null) : null,
      dateCreation: r.date_creation ?? null,
      tva: tvaFromSiren(siren),
      fetchedAt: now,
    };
  } catch {
    return { raisonSociale: null, siret: null, adresseSiege: null, formeJuridiqueCode: null, formeJuridique: null, codeNaf: null, libelleNaf: null, dateCreation: null, tva: null, fetchedAt: now, notFound: true };
  }
}
