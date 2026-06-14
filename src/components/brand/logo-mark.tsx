import { logoSvg, type LogoVariant } from '@/lib/logo'

/**
 * Marca A-Pagar como SVG inline. Dimensiona con className (ej. "w-9 h-9").
 * El SVG llena el contenedor (width/height 100%).
 */
export function LogoMark({
  variant = 'default',
  radius = 132,
  noBg = false,
  className,
}: {
  variant?: LogoVariant
  radius?: number
  noBg?: boolean
  className?: string
}) {
  return (
    <span
      className={className}
      style={{ display: 'inline-flex', lineHeight: 0 }}
      dangerouslySetInnerHTML={{ __html: logoSvg({ variant, radius, noBg }) }}
    />
  )
}
