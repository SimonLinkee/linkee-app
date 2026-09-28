export type Role = 'en_attente' | 'admin_principal' | 'admin_local' | 'logisticien' | 'partenaire' | 'beneficiaire'

const ADMIN_PATHS = ['/dashboard', '/partenaires', '/beneficiaires', '/planning', '/stock', '/flotte', '/profil']

export function homeForRole(role: string): string {
  switch (role) {
    case 'admin_principal':
    case 'admin_local':
      return '/dashboard'
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

/** Which routes a role may open. Admins can also preview the mobile spaces. */
export function isAllowed(role: string, path: string): boolean {
  const isAdmin = role === 'admin_principal' || role === 'admin_local'
  if (under(path, '/api')) return true // API routes check the caller's role themselves
  if (under(path, '/villes-comptes')) return role === 'admin_principal'
  if (ADMIN_PATHS.some((p) => under(path, p))) return isAdmin
  if (under(path, '/journee')) return isAdmin || role === 'logisticien'
  if (under(path, '/espace-partenaire')) return isAdmin || role === 'partenaire'
  if (under(path, '/en-attente')) return true
  return false
}
