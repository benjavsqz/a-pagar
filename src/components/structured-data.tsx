/**
 * StructuredData — JSON-LD para la landing de A-Pagar.
 * Se inyecta como Server Component desde layout.tsx.
 * Tipo SoftwareApplication (schema.org) para que Google entienda
 * que es una aplicación web gratuita de finanzas personales.
 */

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://a-pagar.vercel.app'

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'SoftwareApplication',
      name: 'A-Pagar',
      description:
        'Sube la foto de la boleta, comparte el link por WhatsApp y cada uno marca lo que pidió. Sin apps, sin cuentas.',
      applicationCategory: 'FinanceApplication',
      operatingSystem: 'Web',
      url: SITE_URL,
      inLanguage: 'es-CL',
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'CLP',
      },
    },
    {
      '@type': 'Organization',
      name: 'A-Pagar',
      url: SITE_URL,
      contactPoint: {
        '@type': 'ContactPoint',
        email: 'benjavsqueza@gmail.com',
        contactType: 'customer support',
      },
    },
  ],
}

export function StructuredData() {
  return (
    <script
      type="application/ld+json"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD estático sin input de usuario
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  )
}
