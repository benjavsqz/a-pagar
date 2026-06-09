import { cn } from '@/lib/utils'

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn('bg-[#111113] border border-[#222226] rounded-2xl', className)}>
      {children}
    </div>
  )
}
