import { cn } from '@/lib/utils'

type Variant = 'default' | 'elevated' | 'premium' | 'tonal'

const variantClass: Record<Variant, string> = {
  // Plana blanca — para listas densas
  default: 'bg-[var(--surface)] border border-[var(--border)]',
  // Con sombra — superficie interactiva/primaria
  elevated: 'bg-[var(--surface)] border border-[var(--border)] shadow-[0_10px_30px_rgba(150,100,60,0.13),0_2px_8px_rgba(150,100,60,0.06)]',
  // Highlight + sombra cálida — para tarjetas "héroe"
  premium: 'card-premium',
  // Tonal crema, sin sombra — info pasiva (resúmenes, totales) → crea jerarquía
  tonal: 'surface-tonal',
}

export function Card({
  className,
  children,
  variant = 'default',
}: {
  className?: string
  children: React.ReactNode
  variant?: Variant
}) {
  return (
    <div className={cn('rounded-2xl', variantClass[variant], className)}>
      {children}
    </div>
  )
}
