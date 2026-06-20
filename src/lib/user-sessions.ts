import { createClient } from '@/lib/supabase/client'
import type { SupabaseClient } from '@supabase/supabase-js'

// Helpers (lado cliente) para el índice personal de boletas por cuenta — tabla
// `user_sessions` de la migración 016. Solo funcionan si hay sesión iniciada; la
// RLS garantiza que un usuario solo ve/inserta/borra sus propias filas. Esto NO
// otorga permisos de host: es un marcador "guardé esta boleta en mi cuenta".

type Client = SupabaseClient

/** Lista los session_id que el usuario actual guardó en su cuenta. */
export async function getAccountSessionIds(supabase?: Client): Promise<string[]> {
  const sb = supabase ?? createClient()
  const { data, error } = await sb.from('user_sessions').select('session_id')
  if (error || !data) return []
  return data.map((r: { session_id: string }) => r.session_id)
}

/**
 * Vincula (upsert) los session_id dados a la cuenta del usuario. Idempotente: la PK
 * (user_id, session_id) evita duplicados. Devuelve cuántos quedaron vinculados (o
 * null si falló). `user_id` se rellena con el usuario autenticado; la RLS rechaza
 * cualquier intento de escribir filas de otro usuario.
 */
export async function linkSessionsToAccount(
  sessionIds: string[],
  supabase?: Client
): Promise<number | null> {
  if (sessionIds.length === 0) return 0
  const sb = supabase ?? createClient()

  const { data: userData } = await sb.auth.getUser()
  const userId = userData.user?.id
  if (!userId) return null

  const rows = Array.from(new Set(sessionIds)).map(session_id => ({
    user_id: userId,
    session_id,
  }))

  const { error } = await sb
    .from('user_sessions')
    .upsert(rows, { onConflict: 'user_id,session_id', ignoreDuplicates: true })

  if (error) return null
  return rows.length
}

/** Quita una boleta del índice personal (no borra la boleta, solo el marcador). */
export async function unlinkSessionFromAccount(
  sessionId: string,
  supabase?: Client
): Promise<boolean> {
  const sb = supabase ?? createClient()
  const { error } = await sb.from('user_sessions').delete().eq('session_id', sessionId)
  return !error
}
