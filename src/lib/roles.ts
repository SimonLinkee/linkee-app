export type Role = 'en_attente' | 'admin_principal' | 'admin_local' | 'resp_distribution' | 'logisticien' | 'partenaire' | 'beneficiaire'

// Screen access per role (data rules are enforced again in the database, see migration 018):
//   admin_principal   = Superadmin              : everything (mobile version: /mobile, reduced)
//   admin_local       = Responsable d'antenne   : Distribution + Stock (edit), Planning (read only)
//   resp_distribution = Resp. Distribution      : Distribution only
// After sign-in the last two roles land on /version: full PC version or quick mobile entry (/saisie-mobile).
const SUPER_ONLY = ['/dashboard', '/partenaires', '/beneficiaires', '/flotte', '/todo', '/villes-comptes', '/historique', '/journee', '/espace-partenaire', '/mobile']
const ANTENNE_PATHS = ['/distributions', '/stock', '/planning', '/profil', '/version', '/saisie-mobile']
const DISTRIB_PATHS = ['/distributions', '/profil', '/version', '/saisie-mobile']

export const ROLE_LABEL: Record<string, string> = {
  admin_principal: 'Superadmin',
  admin_local: "Responsable d'antenne",
  resp_distribution: 'Resp. Distribution',
  logisticien: 'Logisticien',
  partenaire: 'Partenaire',
  beneficiaire: 'Bénéficiaire',
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
    default:
      return '/en-attente'
  }
}

function under(path: string, base: string) {
  return path === base || path.startsWith(base + '/')
}

/** Which routes a role may open. The Superadmin can also preview the mobile spaces. */
export function isAllowed(role: string, path: string): boolean {
  if (under(path, '/api')) return true // API routes check the caller's role themselves
  if (under(path, '/en-attente')) return true
  if (role === 'admin_principal') return [...SUPER_ONLY, ...ANTENNE_PATHS].some((p) => under(path, p))
  if (role === 'admin_local') return ANTENNE_PATHS.some((p) => under(path, p))
  if (role === 'resp_distribution') return DISTRIB_PATHS.some((p) => under(path, p))
  if (role === 'logisticien') return under(path, '/journee')
  if (role === 'partenaire') return under(path, '/espace-partenaire')
  return false
}