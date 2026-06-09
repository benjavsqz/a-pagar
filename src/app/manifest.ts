import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'A-Pagar — Divide la cuenta sin caos',
    short_name: 'A-Pagar',
    description: 'Sube la foto de la boleta, comparte el link y cada uno paga su parte. Sin apps.',
    start_url: '/',
    display: 'standalone',
    background_color: '#0a0a0a',
    theme_color: '#0a0a0a',
    orientation: 'portrait',
    categories: ['finance', 'utilities'],
  }
}
