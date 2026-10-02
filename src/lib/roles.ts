export type Role = 'en_attente' | 'admin_principal' | 'comptabilite' | 'admin_local' | 'resp_distribution' | 'logisticien' | 'partenaire' | 'beneficiaire' | 'linker'

/** Superadmin or Comptabilité: same data rights (see migration 043). Account management stays Superadmin-only. */
export const isSuper = (role: string | null | undefined) => role === 'admin_principal' || role === 'comptabilite'

/** Peut administrer (modifier) sa ville : Superadmin, Comptabilité et Responsable d'antenne (pour SA ville — la base le garantit). */
export const canAdminCity = (role: string | null | undefined) => isSuper(role) || role === 'admin_local'

// Screen access per role (data rules are enforced again in the database, see migrations 018 and 020):
//   admin_principal   = Superadmin              : everything (mobile version: /mobile, reduced) — can also preview /linker
//   comptabilite      = Comptabilité            : same screens as the Superadmin except "Villes & comptes"; lands on /comptabilite (Cerfa follow-up)
//   admin_local       = Responsable d'antenne   : pilote SA ville comme un admin (migration 047) — tout sauf "Villes & comptes",
//                                                 "Historique & sauvegardes" et les autres villes
//   resp_distribution = Resp. Distribution      : Distribution only
//   linker             = Linker (bénévole)       : espace 100% client sous /linker (signup, carte, missions, gamification)
// After sign-in the last two roles land on /version: full PC version or quick mobile entry (/saisie-mobile).
const SUPER_ONLY = ['/dashboard', '/partenaires', '/beneficiaires', '/flotte', '/todo', '/villes-comptes', '/historique', '/journee', '/espace-partenaire', '/espace-beneficiaire', '/mobile', '/links-benevoles', '/linker', '/valeur-des-dons', '/comptabilite']
const COMPTA_PATHS = SUPER_ONLY.filter((p) => p !== '/villes-comptes')
// '/mobile/links' (visibilité des Links Bénévoles) est aussi ouvert au Responsable d'antenne et au Resp.
// Distribution, alors que le reste de '/mobile' reste réservé au Superadmin — d'où l'ajout explicite ici.
// '/valeur-des-dons' (valeur par défaut par type de partenaire, ex-"barèmes") est aussi gérée par le Responsable d'antenne (cf. RLS baremes_write).
// Écrans du Responsable d'antenne (pour sa ville uniquement : règles d'accès de la base, voir migration 047).
// '/comptabilite' : il y valide / refuse les demandes de Cerfa de son antenne ; l'émission du Cerfa reste réservée à la
// Comptabilité et au Superadmin, y compris côté base.
const ANTENNE_PATHS = ['/dashboard', '/partenaires', '/beneficiaires', '/planning', '/distributions', '/stock', '/flotte', '/todo', '/links-benevoles', '/valeur-des-dons', '/comptabilite', '/profil', '/version', '/saisie-mobile', '/mobile']
const DISTRIB_PATHS = ['/distributions', '/profil', '/version', '/saisie-mobile', '/mobile/links']
const LINKER_PATHS = ['/linker']

export const ROLE_LABEL: Record<string, string> = {
  admin_principal: 'Superadmin',
  comptabilite: 'Comptabilité',
  admin_local: "Responsable d'antenne",
  resp_distribution: 'Resp. Distribution',
  logisticien: 'Logisticien',
  partenaire: 'Partenaire',
  beneficiaire: 'Bénéficiaire',
  linker: 'Linker (bénévole)',
  en_attente: 'En attente',
}

export function homeForRole(role: string): string {
  switch (role) {
    case 'admin_principal':
      return '/version' // choice between the PC version and the mobile version
    case 'comptabilite':
      return '/comptabilite'
    case 'admin_local':
    case 'resp_distribution':
      return '/version' // choice between the PC version and the quick mobile entry
    case 'logisticien':
      return '/journee'
    case 'partenaire':
      return '/espace-partenaire'
    case 'beneficiaire':
      return '/espace-beneficiaire'
    case 'linker':
      return '/linker/accueil'
    default:
      return '/en-attente'
  }
}

function under(path: string, base: string) {
  return path === base || path.startsWith(base + '/')
}

/** Which routes a role may open. The Superadmin can also preview the mobile and Linker spaces. */
export function isAllowed(role: string, path: string): boolean {
  if (under(path, '/api')) return true // API routes check the caller's role themselves
  if (under(path, '/en-attente')) return true
  // the Linker intro page and the self-signup flow are reachable while still "en_attente" (or logged out — see middleware.ts)
  if (path === '/linker' || under(path, '/linker/inscription')) return true
  // readable by anyone, logged in or not (see middleware.ts for the logged-out case)
  if (path === '/politique-de-confidentialite') return true
  // « Remontées » (bugs, questions, suggestions) : ouvert à tous les rôles actifs (le Linker a sa propre version sous /linker)
  if (role !== 'en_attente' && under(path, '/remontees')) return true
  // version mobile de « Remontées APP » : Superadmin uniquement (comme /remontees-app), même si /mobile est ouvert aux autres
  if (under(path, '/mobile/remontees-app') && role !== 'admin_principal') return false
  // '/remontees-app' : réservé au vrai Superadmin (la Comptabilité n'y a pas accès, y compris côté base)
  if (role === 'admin_principal') return [...SUPER_ONLY, ...ANTENNE_PATHS, '/remontees-app'].some((p) => under(path, p))
  if (role === 'comptabilite') return [...COMPTA_PATHS, ...ANTENNE_PATHS].some((p) => under(path, p))
  if (role === 'admin_local') return ANTENNE_PATHS.some((p) => under(path, p))
  if (role === 'resp_distribution') return DISTRIB_PATHS.some((p) => under(path, p))
  if (role === 'logisticien') return under(path, '/journee')
  if (role === 'partenaire') return under(path, '/espace-partenaire')
  if (role === 'beneficiaire') return under(path, '/espace-beneficiaire')
  if (role === 'linker') return LINKER_PATHS.some((p) => under(path, p))
  return false
}
