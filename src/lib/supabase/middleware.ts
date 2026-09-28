import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { homeForRole, isAllowed } from '@/lib/roles'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // refreshes the session cookie if needed — required for Server Components
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const path = request.nextUrl.pathname
  const redirectTo = (to: string) => {
    const url = request.nextUrl.clone()
    url.pathname = to
    url.search = ''
    const res = NextResponse.redirect(url)
    // keep refreshed auth cookies on the redirect
    supabaseResponse.cookies.getAll().forEach((c) => res.cookies.set(c))
    return res
  }

  if (!user) {
    return path === '/login' ? supabaseResponse : redirectTo('/login')
  }

  // Signed in: the profile (readable by its owner through RLS) tells us the role.
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  const role = profile?.role ?? 'en_attente'
  const home = homeForRole(role)

  if (path === '/' || path === '/login') return redirectTo(home)
  if (!isAllowed(role, path)) return redirectTo(home)

  return supabaseResponse
}
