import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    // id estable: identidad de la PWA entre deploys (recomendado por la spec).
    id: '/',
    name: 'A-Pagar — Divide la cuenta sin caos',
    short_name: 'A-Pagar',
    description: 'Sube la foto de la boleta, comparte el link y cada uno paga su parte. Sin apps.',
    start_url: '/',
    display: 'standalone',
    background_color: '#faf2e7',
    theme_color: '#faf2e7',
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
        // Maskable con safe-zone propia (ver app/icon-maskable.tsx): Android
        // ya no recorta el logo dentro de la máscara.
        src: '/icon-maskable',
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
    // Atajos de la PWA (long-press del ícono en Android / menú en escritorio).
    shortcuts: [
      {
        name: 'Dividir una boleta',
        short_name: 'Dividir',
        description: 'Crear una nueva cuenta para dividir',
        url: '/crear',
      },
      {
        name: 'Mis boletas',
        short_name: 'Mis boletas',
        description: 'Ver las boletas de este dispositivo',
        url: '/cuenta',
      },
    ],
    // NOTA: el campo `screenshots` se quitó a propósito — antes apuntaba al
    // ícono 512² (no una captura real), lo que degradaba el install dialog
    // enriquecido de Chrome. Reincorporar con capturas reales (form_factor
    // 'narrow' y 'wide') cuando estén disponibles.
  }
}
