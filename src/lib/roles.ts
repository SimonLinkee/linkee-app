export type Role = 'en_attente' | 'admin_principal' | 'admin_local' | 'resp_distribution' | 'logisticien' | 'partenaire' | 'beneficiaire' | 'linker'

// Screen access per role (data rules are enforced again in the database, see migrations 018 and 020):
//   admin_principal   = Superadmin              : everything (mobile version: /mobile, reduced) — can also preview /linker
//   admin_local       = Responsable d'antenne   : Distribution + Stock (edit), Planning (read only)
//   resp_distribution = Resp. Distribution      : Distribution only
//   linker             = Linker (bénévole)       : espace 100% client sous /linker (signup, carte, missions, gamification)
// After sign-in the last two roles land on /version: full PC version or quick mobile entry (/saisie-mobile).
const SUPER_ONLY = ['/dashboard', '/partenaires', '/beneficiaires', '/flotte', '/todo', '/villes-comptes', '/historique', '/journee', '/espace-partenaire', '/mobile', '/links-benevoles', '/linker']
// '/mobile/links' (visibilité des Links Bénévoles) est aussi ouvert au Responsable d'antenne et au Resp.
// Distribution, alors que le reste de '/mobile' reste réservé au Superadmin — d'où l'ajout explicite ici.
const ANTENNE_PATHS = ['/distributions', '/stock', '/planning', '/profil', '/version', '/saisie-mobile', '/links-benevoles', '/mobile/links']
const DISTRIB_PATHS = ['/distributions', '/profil', '/version', '/saisie-mobile', '/mobile/links']
const LINKER_PATHS = ['/linker']

export const ROLE_LABEL: Record<string, string> = {
  admin_principal: 'Superadmin',
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
    case 'admin_local':
    case 'resp_distribution':
      return '/version' // choice between the PC version and the quick mobile entry
    case 'logisticien':
      return '/journee'
    case 'partenaire':
      return '/espace-partenaire'
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
  if (role === 'admin_principal') return [...SUPER_ONLY, ...ANTENNE_PATHS].some((p) => under(path, p))
  if (role === 'admin_local') return ANTENNE_PATHS.some((p) => under(path, p))
  if (role === 'resp_distribution') return DISTRIB_PATHS.some((p) => under(path, p))
  if (role === 'logisticien') return under(path, '/journee')
  if (role === 'partenaire') return under(path, '/espace-partenaire')
  if (role === 'linker') return LINKER_PATHS.some((p) => under(path, p))
  return false
}
