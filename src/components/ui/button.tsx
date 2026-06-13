'use client'
import { cn } from '@/lib/utils'
import { type ButtonHTMLAttributes, forwardRef } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'destructive'
type Size = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
  fullWidth?: boolean
}

const variantClass: Record<Variant, string> = {
  primary:
    'bg-gradient-to-b from-[#0bb673] to-[#089457] hover:from-[#0cc47c] hover:to-[#0a9c63] text-white font-bold shadow-[0_8px_22px_-6px_rgba(11,182,115,0.55)] hover:shadow-[0_10px_28px_-6px_rgba(11,182,115,0.7)]',
  secondary:
    'bg-white hover:bg-[#fbf7f1] text-[#1a1614] border border-[#e0d4c4] hover:border-[#d3c4b1] shadow-[0_2px_6px_rgba(150,100,60,0.08)]',
  ghost:
    'hover:bg-[#f6ede1] text-[#7a6e64] hover:text-[#1a1614]',
  destructive:
    'bg-[#e5484d] hover:bg-[#ef5b60] text-white font-semibold',
}

const sizeClass: Record<Size, string> = {
  sm: 'h-9 px-4 text-sm rounded-full',
  md: 'h-11 px-5 text-sm rounded-full',
  lg: 'h-14 px-7 text-base rounded-full',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', loading, fullWidth, className, children, disabled, ...props }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center gap-2 transition-all duration-200 active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none select-none',
        variantClass[variant],
        sizeClass[size],
        fullWidth && 'w-full',
        className,
      )}
      {...props}
    >
      {loading && (
        <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin shrink-0" />
      )}
      {children}
    </button>
  )
)
Button.displayName = 'Button'
