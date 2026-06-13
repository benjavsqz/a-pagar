import { cn } from '@/lib/utils'

type Variant = 'default' | 'elevated' | 'premium'

const variantClass: Record<Variant, string> = {
  // Plana — para listas densas
  default: 'bg-[#101216] border border-[#23262d]',
  // Con sombra — separa del fondo
  elevated: 'bg-[#101216] border border-[#23262d] shadow-[0_4px_16px_rgba(0,0,0,0.35),0_1px_3px_rgba(0,0,0,0.4)]',
  // Highlight sutil arriba + sombra — para tarjetas "héroe"
  premium: 'card-premium',
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
