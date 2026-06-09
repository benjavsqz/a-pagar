import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import { Toaster } from '@/components/ui/toast'
import { PwaInstallBanner } from '@/components/pwa-install-banner'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

export const metadata: Metadata = {
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
}

export const viewport: Viewport = {
  themeColor: '#080809',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`h-full ${inter.variable}`}>
      <body className="min-h-full flex flex-col bg-[#080809] text-[#f0f0f2] antialiased font-sans">
        {children}
        <Toaster />
        <PwaInstallBanner />
      </body>
    </html>
  )
}
