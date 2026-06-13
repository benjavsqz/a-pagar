import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'A-Pagar — Divide la cuenta sin caos',
    short_name: 'A-Pagar',
    description: 'Sube la foto de la boleta, comparte el link y cada uno paga su parte. Sin apps.',
    start_url: '/',
    display: 'standalone',
    background_color: '#fbf3ea',
    theme_color: '#fbf3ea',
    orientation: 'portrait',
    categories: ['finance', 'utilities'],
    icons: [
      {
        src: '/icon',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/apple-icon',
        sizes: '180x180',
        type: 'image/png',
      },
    ],
    screenshots: [
      {
        src: '/icon',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  }
}
