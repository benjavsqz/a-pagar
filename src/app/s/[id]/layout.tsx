import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Metadata dinámica para la preview de WhatsApp: "Benja te invita a dividir
// la cuenta de La Piojera". Los links de sesión son privados → noindex.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const fallback: Metadata = {
    title: 'Te invitaron a dividir la cuenta — A-Pagar',
    robots: { index: false, follow: false },
  }
  if (!UUID_RE.test(id)) return fallback

  try {
    const supabase = await createClient()
    const { data: session } = await supabase
      .from('sessions')
      .select('host_name, restaurant_name')
      .eq('id', id)
      .single()
    if (!session) return fallback

    const restaurant = session.restaurant_name ? ` de ${session.restaurant_name}` : ''
    const title = `${session.host_name} te invita a dividir la cuenta${restaurant}`
    return {
      title: `${title} — A-Pagar`,
      description: 'Marca lo que pediste, mira tu total con propina y transfiere tu parte. Sin apps, sin cuentas.',
      robots: { index: false, follow: false },
      // La imagen OG la aporta el archivo co-localizado opengraph-image.tsx
      // (dinámica por sesión); no fijamos images aquí para no pisarla.
      openGraph: {
        title,
        description: 'Entra, marca lo que pediste y paga tu parte.',
      },
      twitter: {
        card: 'summary_large_image',
        title,
        description: 'Entra, marca lo que pediste y paga tu parte.',
      },
    }
  } catch {
    return fallback
  }
}

export default function SessionLayout({ children }: { children: React.ReactNode }) {
  return children
}
