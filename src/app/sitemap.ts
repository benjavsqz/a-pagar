import type { MetadataRoute } from 'next'

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://a-pagar.vercel.app'

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: BASE, changeFrequency: 'monthly', priority: 1 },
    { url: `${BASE}/crear`, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${BASE}/privacidad`, changeFrequency: 'yearly', priority: 0.2 },
  ]
}
