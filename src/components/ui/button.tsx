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
    'bg-[#00DF76] hover:bg-[#00f080] text-black font-bold shadow-[0_0_24px_rgba(0,223,118,0.25)] hover:shadow-[0_0_32px_rgba(0,223,118,0.35)]',
  secondary:
    'bg-[#18181b] hover:bg-[#222226] text-white border border-[#2e2e34] hover:border-[#3e3e46]',
  ghost:
    'hover:bg-[#18181b] text-[#8a8a96] hover:text-white',
  destructive:
    'bg-[#ff4d57] hover:bg-[#ff6570] text-white font-semibold',
}

const sizeClass: Record<Size, string> = {
  sm: 'h-8 px-4 text-sm rounded-full',
  md: 'h-11 px-5 text-sm rounded-full',
  lg: 'h-14 px-7 text-base rounded-full',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', loading, fullWidth, className, children, disabled, ...props }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center gap-2 transition-all duration-150 active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none select-none',
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
