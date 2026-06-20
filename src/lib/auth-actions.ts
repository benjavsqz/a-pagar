'use server'

import { createClient } from '@/lib/supabase/server'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'

// ─────────────────────────────────────────────────────────────────────────────
// Auth OPCIONAL por magic link / OTP de Supabase. Todo esto es aditivo: si el
// humano no habilitó "Email" en Authentication del dashboard, signInWithOtp
// devuelve error y lo reportamos con un mensaje claro (la UI nunca crashea). El
// flujo anónimo (host_token en localStorage) no depende de nada de aquí.
// ─────────────────────────────────────────────────────────────────────────────

export type AuthResult = { ok: true } | { ok: false; error: string }

/**
 * Envía un magic link al correo. El link vuelve a {origin}/auth/callback?code=...
 * (same-origin, sin tocar CSP). Usa el `origin` real de la request para funcionar
 * igual en local, preview y producción sin envs nuevos.
 */
export async function sendMagicLink(formData: FormData): Promise<AuthResult> {
  const email = String(formData.get('email') ?? '').trim()
  if (!email || !email.includes('@')) {
    return { ok: false, error: 'Ingresa un correo válido.' }
  }

  const h = await headers()
  const origin =
    h.get('origin') ??
    (h.get('host') ? `https://${h.get('host')}` : null)

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      // El humano debe agregar {origin}/auth/callback a las Redirect URLs del
      // dashboard (Authentication → URL Configuration). Si Email auth no está
      // habilitado, esto falla con un error que mostramos tal cual.
      emailRedirectTo: origin ? `${origin}/auth/callback?next=/cuenta` : undefined,
    },
  })

  if (error) {
    return {
      ok: false,
      error:
        'No se pudo enviar el correo. Si el problema persiste, puede que el inicio de sesión por correo aún no esté habilitado.',
    }
  }
  return { ok: true }
}

/** Cierra la sesión de la cuenta. No afecta el historial local ni el host_token. */
export async function signOut(): Promise<void> {
  const supabase = await createClient()
  await supabase.auth.signOut()
  revalidatePath('/cuenta')
}
