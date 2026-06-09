import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  try {
    const { subscription, sessionId, participantId, role } = await req.json()

    if (!subscription?.endpoint || !sessionId || !role) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }

    const supabase = await createClient()
    await supabase.from('push_subscriptions').upsert({
      session_id: sessionId,
      participant_id: participantId ?? null,
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
