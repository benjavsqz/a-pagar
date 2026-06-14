import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(req: NextRequest) {
  try {
    const { subscription, sessionId, participantId, role } = await req.json()

    // Validación de formato: sin esto cualquiera registraba endpoints arbitrarios
    // en sesiones ajenas (audits/01-seguridad.md, push subscribe sin validación).
    if (
      !subscription?.endpoint ||
      typeof subscription.endpoint !== 'string' ||
      !/^https:\/\//.test(subscription.endpoint) ||
      !subscription.keys?.p256dh ||
      !subscription.keys?.auth ||
      !UUID_RE.test(sessionId ?? '') ||
      (role !== 'host' && role !== 'participant')
    ) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }

    const supabase = createAdminClient() ?? await createClient()

    // La sesión debe existir; un participante solo puede suscribirse si su
    // participantId pertenece realmente a esa sesión.
    const { data: sess } = await supabase
      .from('sessions')
      .select('id')
      .eq('id', sessionId)
      .maybeSingle()
    if (!sess) {
      return NextResponse.json({ error: 'Sesión no encontrada' }, { status: 404 })
    }

    if (role === 'participant') {
      if (!UUID_RE.test(participantId ?? '')) {
        return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
      }
      const { data: part } = await supabase
        .from('participants')
        .select('id')
        .eq('id', participantId)
        .eq('session_id', sessionId)
        .maybeSingle()
      if (!part) {
        return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
      }
    }

    await supabase.from('push_subscriptions').upsert({
      session_id: sessionId,
      participant_id: role === 'participant' ? participantId : null,
      role,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
    }, { onConflict: 'endpoint' })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('subscribe error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
