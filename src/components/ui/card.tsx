import { cn } from '@/lib/utils'

type Variant = 'default' | 'elevated' | 'premium'

const variantClass: Record<Variant, string> = {
  // Plana — para listas densas
  default: 'bg-white border border-[#ece2d5]',
  // Con sombra — separa del fondo
  elevated: 'bg-white border border-[#ece2d5] shadow-[0_8px_24px_rgba(150,100,60,0.1)]',
  // Highlight + sombra cálida — para tarjetas "héroe"
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
