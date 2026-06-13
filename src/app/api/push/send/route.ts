import { NextRequest, NextResponse } from 'next/server'
import webpush from 'web-push'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const EVENTS = ['payment_received', 'payment_confirmed'] as const
type PushEvent = (typeof EVENTS)[number]

// Acota un campo de texto que viene del cliente antes de meterlo en una notificación
const clean = (v: unknown, max = 60): string =>
  typeof v === 'string' ? v.slice(0, max) : ''

export async function POST(req: NextRequest) {
  if (!process.env.VAPID_SUBJECT || !process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    return NextResponse.json({ error: 'Push no configurado' }, { status: 500 })
  }
  // Initialize VAPID at runtime so env vars are available
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  )
  try {
    const body = await req.json()
    const sessionId = clean(body.sessionId, 40)
    const event = body.event as PushEvent
    const rawPayload = (typeof body.payload === 'object' && body.payload !== null ? body.payload : {}) as Record<string, unknown>
    const payload = {
      participantId: clean(rawPayload.participantId, 40),
      participantName: clean(rawPayload.participantName),
      hostName: clean(rawPayload.hostName),
      amount: clean(rawPayload.amount, 20),
      url: clean(rawPayload.url, 100),
    }

    // sessionId debe ser un UUID y el evento uno conocido
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!UUID_RE.test(sessionId) || !EVENTS.includes(event)) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }
    // La URL de destino solo puede ser una ruta interna de la app
    if (payload.url && !/^\/(s|host)\/[0-9a-f-]+$/i.test(payload.url)) {
      payload.url = '/'
    }

    // Preferimos el cliente admin (service-role) para poder cerrar la lectura
    // pública de push_subscriptions; si la key no está, caemos al anon.
    const supabase = createAdminClient() ?? await createClient()

    // Autorización sin auth: solo se permite notificar eventos que correspondan
    // a un estado REAL en la DB. Sin esto, cualquiera con la anon key podía
    // disparar notificaciones arbitrarias (audits/01-seguridad.md, crítico push).
    if (!payload.participantId) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }
    const { data: pay } = await supabase
      .from('payments')
      .select('confirmed_by_host')
      .eq('session_id', sessionId)
      .eq('participant_id', payload.participantId)
      .maybeSingle()
    if (!pay) {
      // No hay pago registrado para ese participante → notificación no legítima
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }
    if (event === 'payment_confirmed' && pay.confirmed_by_host !== true) {
      // Solo se notifica "confirmado" si el host realmente lo confirmó en la DB
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    // Determine which role to notify
    const targetRole = event === 'payment_received' ? 'host' : 'participant'

    let query = supabase
      .from('push_subscriptions')
      .select('*')
      .eq('session_id', sessionId)
      .eq('role', targetRole)

    // For participant confirmation, only notify that specific participant
    if (event === 'payment_confirmed' && payload.participantId) {
      query = query.eq('participant_id', payload.participantId)
    }

    const { data: subs } = await query
    if (!subs || subs.length === 0) return NextResponse.json({ ok: true, sent: 0 })

    const notifications = {
      payment_received: {
        title: '💸 Nuevo pago recibido',
        body: `${payload.participantName} te transfirió ${payload.amount}. Confirma cuando lo recibas.`,
      },
      payment_confirmed: {
        title: '✅ ¡Pago confirmado!',
        body: `Tu pago de ${payload.amount} fue confirmado por ${payload.hostName}.`,
      },
    } as const

    const notif = notifications[event as keyof typeof notifications]
    if (!notif) return NextResponse.json({ error: 'Unknown event' }, { status: 400 })

    const results = await Promise.allSettled(
      subs.map(sub =>
        webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify({ ...notif, url: payload.url ?? '/' })
        )
      )
    )

    const sent = results.filter(r => r.status === 'fulfilled').length
    return NextResponse.json({ ok: true, sent })
  } catch (err) {
    console.error('send-push error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
