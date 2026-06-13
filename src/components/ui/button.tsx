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
    'bg-gradient-to-b from-[#00f08a] to-[#00DF76] hover:from-[#16ff9a] hover:to-[#00e882] text-[#001b0e] font-bold shadow-[0_4px_20px_-4px_rgba(0,223,118,0.45)] hover:shadow-[0_6px_28px_-4px_rgba(0,223,118,0.6)]',
  secondary:
    'bg-[#181b20] hover:bg-[#20242b] text-white border border-[#30343d] hover:border-[#3e434d]',
  ghost:
    'hover:bg-[#181b20] text-[#9a9aa6] hover:text-white',
  destructive:
    'bg-[#ff5468] hover:bg-[#ff6878] text-white font-semibold',
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
