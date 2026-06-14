import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Genera una signed URL para ver un comprobante. Antes el cliente la generaba
 * con la anon key, así que cualquiera que conociera el path podía abrir el
 * comprobante de otro (audits/01-seguridad.md). Ahora se valida el host_token
 * contra session_secrets y se firma con el admin client, TTL corto (10 min).
 */
export async function POST(req: NextRequest) {
  try {
    const { sessionId, path, token } = await req.json()

    if (!UUID_RE.test(sessionId ?? '') || typeof path !== 'string' || !path) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }
    // El path siempre vive bajo la carpeta de la sesión: `${sessionId}/...`
    if (!path.startsWith(`${sessionId}/`)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    const admin = createAdminClient()
    if (!admin) {
      // Sin service-role no podemos validar el token de forma segura.
      return NextResponse.json({ error: 'Comprobantes no disponibles' }, { status: 500 })
    }

    const { data: secret } = await admin
      .from('session_secrets')
      .select('host_token')
      .eq('session_id', sessionId)
      .maybeSingle()
    if (!secret || !UUID_RE.test(token ?? '') || secret.host_token !== token) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    const { data, error } = await admin.storage
      .from('comprobantes')
      .createSignedUrl(path, 60 * 10)
    if (error || !data?.signedUrl) {
      return NextResponse.json({ error: 'No se pudo generar el enlace' }, { status: 500 })
    }

    return NextResponse.json({ url: data.signedUrl })
  } catch (err) {
    console.error('comprobante error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
