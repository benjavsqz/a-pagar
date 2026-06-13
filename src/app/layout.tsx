import type { Metadata, Viewport } from 'next'
import { Manrope, Sora, Geist_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { Toaster } from '@/components/ui/toast'
import { PwaInstallBanner } from '@/components/pwa-install-banner'
import './globals.css'

// Cuerpo / UI — geométrica, limpia, "premium fintech"
const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-manrope',
  display: 'swap',
})

// Display / titulares — más carácter para los headlines
const sora = Sora({
  subsets: ['latin'],
  variable: '--font-sora',
  display: 'swap',
})

// Montos en plata — mono con tabular figures, estilo caja registradora
const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-geist-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://a-pagar.vercel.app'),
  title: 'A-Pagar — Divide la cuenta sin caos',
  description: 'Sube la foto de la boleta, comparte el link por WhatsApp y cada uno marca lo que pidió. Sin apps, sin cuentas.',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'A-Pagar',
  },
  openGraph: {
    title: 'A-Pagar — Divide la cuenta sin caos',
    description: 'Foto de la boleta → link por WhatsApp → cada uno paga su parte.',
    type: 'website',
    locale: 'es_CL',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'A-Pagar — Divide la cuenta sin caos',
    description: 'Foto de la boleta → link por WhatsApp → cada uno paga su parte.',
  },
}

export const viewport: Viewport = {
  themeColor: '#080809',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`h-full ${manrope.variable} ${sora.variable} ${geistMono.variable}`}>
      <body className="min-h-full flex flex-col bg-[#08090b] text-[#f4f4f6] antialiased font-sans">
        {children}
        <Toaster />
        <PwaInstallBanner />
        <Analytics />
      </body>
    </html>
  )
}
