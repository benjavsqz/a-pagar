import type { Metadata, Viewport } from 'next'
import { Plus_Jakarta_Sans, Geist_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { Toaster } from '@/components/ui/toast'
import { PwaInstallBanner } from '@/components/pwa-install-banner'
import { StructuredData } from '@/components/structured-data'
import './globals.css'

// Cuerpo + titulares — redondeada, cálida, "app de amigos"
const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-jakarta',
  display: 'swap',
})

// Montos en plata — mono con tabular figures, estilo boleta
const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-geist-mono',
  display: 'swap',
})

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://a-pagar.vercel.app'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  alternates: {
    canonical: '/',
  },
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
    images: ['/opengraph-image'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'A-Pagar — Divide la cuenta sin caos',
    description: 'Foto de la boleta → link por WhatsApp → cada uno paga su parte.',
    images: ['/opengraph-image'],
  },
}

export const viewport: Viewport = {
  themeColor: '#fbf3ea',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-CL" className={`h-full ${jakarta.variable} ${geistMono.variable}`}>
      <body className="min-h-full flex flex-col bg-[#fbf3ea] text-[#1a1614] antialiased font-sans">
        <StructuredData />
        {children}
        <Toaster />
        <PwaInstallBanner />
        <Analytics />
      </body>
    </html>
  )
}
