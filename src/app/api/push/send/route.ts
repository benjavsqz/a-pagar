import { NextRequest, NextResponse } from 'next/server'
import webpush from 'web-push'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  // Initialize VAPID at runtime so env vars are available
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT!,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  )
  try {
    const { sessionId, event, payload } = await req.json()
    // event: 'payment_received' | 'payment_confirmed'
    // payload: { participantName, amount, url }

    if (!sessionId || !event) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }

    const supabase = await createClient()

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
