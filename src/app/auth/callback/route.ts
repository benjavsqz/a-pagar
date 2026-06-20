import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// Callback del magic link / OTP (Supabase Auth). Es SAME-ORIGIN: el correo enlaza
// a {origin}/auth/callback?code=... y aquí canjeamos el code por una sesión (cookies
// vía @supabase/ssr). Todo opcional: si nadie inicia sesión, esta ruta no se usa y
// el flujo anónimo (host_token) sigue funcionando igual que siempre.
//
// Degradación con gracia: si falta el code o el canje falla (p. ej. Email auth no
// está habilitado en el dashboard), redirige a /cuenta con ?auth_error=1 para que
// la UI muestre un aviso claro en vez de crashear.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  // `next` solo puede ser una ruta interna (empieza con "/") para evitar open-redirect.
  const nextParam = searchParams.get('next')
  const next = nextParam && nextParam.startsWith('/') ? nextParam : '/cuenta'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/cuenta?auth_error=1`)
}
