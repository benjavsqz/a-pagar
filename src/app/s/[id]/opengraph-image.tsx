import { ImageResponse } from 'next/og'
import { createClient } from '@/lib/supabase/server'
import { logoDataUri } from '@/lib/logo'

export const alt = 'Te invitaron a dividir la cuenta — A-Pagar'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// OG dinámica por sesión: la preview de WhatsApp/redes muestra quién invita y a
// qué cuenta, no la imagen genérica (audits/07-seo-perf-i18n.md).
export default async function SessionOg({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  let hostName = ''
  let restaurant = ''
  if (UUID_RE.test(id)) {
    try {
      const supabase = await createClient()
      const { data } = await supabase
        .from('sessions')
        .select('host_name, restaurant_name')
        .eq('id', id)
        .single()
      hostName = data?.host_name ?? ''
      restaurant = data?.restaurant_name ?? ''
    } catch {
      // cae a textos por defecto
    }
  }

  const title = hostName
    ? `${hostName} te invita a dividir la cuenta`
    : 'Te invitaron a dividir la cuenta'

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', background: '#faf2e7', padding: 80, gap: 28,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img width={70} height={70} src={logoDataUri({ radius: 18 })} alt="" />
          <span style={{ color: '#1a1614', fontSize: 44, fontWeight: 900, letterSpacing: -1 }}>A-Pagar</span>
        </div>
        <span style={{ color: '#1a1614', fontSize: 60, fontWeight: 800, textAlign: 'center', lineHeight: 1.1 }}>
          {title}
        </span>
        {restaurant && (
          <span style={{ color: '#0a8f5c', fontSize: 46, fontWeight: 700, textAlign: 'center' }}>
            {restaurant}
          </span>
        )}
        <span style={{ color: '#6b5f55', fontSize: 28, textAlign: 'center' }}>
          Marca lo que pediste y transfiere tu parte. Sin apps, sin cuentas.
        </span>
      </div>
    ),
    { ...size }
  )
}
