import type { MetadataRoute } from 'next'

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://a-pagar.vercel.app'

export default function sitemap(): MetadataRoute.Sitemap {
  // Solo indexar páginas con contenido editorial real.
  // /crear es una ruta de acción (formulario vacío) — se excluye para no
  // desperdiciar crawl budget en una página sin contenido SEO propio.
  // /cuenta, /s/[id] y /host/[id] son privadas/dinámicas — excluidas.
  return [
    {
      url: BASE,
      changeFrequency: 'monthly',
      priority: 1,
      lastModified: new Date('2026-06-13'),
    },
    {
      url: `${BASE}/privacidad`,
      changeFrequency: 'yearly',
      priority: 0.3,
      lastModified: new Date('2026-06-01'),
    },
  ]
}
