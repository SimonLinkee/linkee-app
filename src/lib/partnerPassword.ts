// Mot de passe des comptes partenaires : le nom du partenaire suivi de « Linkee2027 » (ex. « Boulangerie Les Délices » →
// « BoulangerieLesDelicesLinkee2027 »). Il se calcule à partir du nom, rien n'est stocké : le Superadmin et le Responsable d'antenne
// le voient dans la fiche du partenaire et peuvent le (ré)appliquer au compte. Le partenaire ne le modifie pas lui-même.
export const PARTNER_PASSWORD_SUFFIX = "Linkee2027";

export function partnerPassword(name: string): string {
  const words = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase());
  const base = (words.join("") || "Partenaire").slice(0, 48);
  return base + PARTNER_PASSWORD_SUFFIX;
}
