import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // Las sesiones son links privados tipo capability — no indexar
      disallow: ['/s/', '/host/', '/api/'],
    },
    sitemap: `${process.env.NEXT_PUBLIC_SITE_URL ?? 'https://a-pagar.vercel.app'}/sitemap.xml`,
  }
}
