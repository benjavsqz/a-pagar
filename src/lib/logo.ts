// Logo A-Pagar — burbuja de chat (compartir) + boleta rasgada (la cuenta) con
// línea de división al centro. Un solo builder reutilizado por el componente
// inline (headers) y por los íconos PNG (favicon/PWA/OG vía data URI).

export type LogoVariant = 'default' | 'light' | 'dark'

const PALETTE: Record<LogoVariant, {
  bg: string; bubble: string; receipt: string; bubbleLines: string; receiptMarks: string
}> = {
  // Marca a color sobre verde de marca (--brand-dim)
  default: { bg: '#0a9c63', bubble: '#f47b5e', receipt: '#f6f1e7', bubbleLines: '#ffffff', receiptMarks: '#0a9c63' },
  // Monocroma verde sobre claro
  light:   { bg: '#ffffff', bubble: '#0a9c63', receipt: '#cfe7dc', bubbleLines: '#ffffff', receiptMarks: '#0a9c63' },
  // Crema sobre verde profundo
  dark:    { bg: '#073d27', bubble: '#f6f1e7', receipt: '#bfe0d0', bubbleLines: '#073d27', receiptMarks: '#073d27' },
}

interface LogoOpts {
  variant?: LogoVariant
  /** Ancho/alto del <svg>. Por defecto 100% para que escale con el contenedor. */
  size?: number | string
  /** Radio del fondo (squircle). 0 = sin esquinas redondeadas. */
  radius?: number
  /** Omitir el fondo (solo la marca, transparente). */
  noBg?: boolean
  /** Fondo a sangre completa (sin margen) — para íconos PNG/maskables. */
  bleed?: boolean
}

export function logoSvg({ variant = 'default', size = '100%', radius = 132, noBg = false, bleed = false }: LogoOpts = {}): string {
  const c = PALETTE[variant]
  const inset = bleed ? 0 : 16
  const wh = bleed ? 512 : 480
  const bg = noBg ? '' : `<rect x="${inset}" y="${inset}" width="${wh}" height="${wh}" rx="${radius}" fill="${c.bg}"/>`
  return `<svg width="${size}" height="${size}" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A-Pagar">
  ${bg}
  <path d="M256 168 Q256 158 266 158 L372 158 Q382 158 382 168 L382 330 L368 348 L354 332 L340 350 L326 333 L312 351 L298 334 L284 351 L270 334 L256 348 Z" fill="${c.receipt}"/>
  <circle cx="352" cy="201" r="12" fill="${c.receiptMarks}"/>
  <rect x="300" y="231" width="46" height="13" rx="6.5" fill="${c.receiptMarks}"/>
  <rect x="300" y="258" width="30" height="13" rx="6.5" fill="${c.receiptMarks}"/>
  <path d="M150 176 Q150 150 176 150 L262 150 Q288 150 288 176 L288 318 Q288 344 262 344 L214 344 L196 378 L186 344 L176 344 Q150 344 150 318 Z" fill="${c.bubble}"/>
  <rect x="176" y="196" width="74" height="16" rx="8" fill="${c.bubbleLines}"/>
  <rect x="176" y="232" width="86" height="16" rx="8" fill="${c.bubbleLines}"/>
  <rect x="176" y="268" width="58" height="16" rx="8" fill="${c.bubbleLines}"/>
</svg>`
}

/** Data URI para usar como <img src> (ImageResponse / OG). */
export function logoDataUri(opts: LogoOpts = {}): string {
  return `data:image/svg+xml,${encodeURIComponent(logoSvg(opts))}`
}
