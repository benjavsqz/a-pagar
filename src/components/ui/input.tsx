'use client'
import { cn } from '@/lib/utils'
import { type InputHTMLAttributes, forwardRef, useId } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  prefix?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, prefix, className, id, ...props }, ref) => {
    const autoId = useId()
    const inputId = id ?? autoId
    return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={inputId} className="text-xs font-medium text-[#6b5f55] uppercase tracking-wider">
          {label}
        </label>
      )}
      <div className="relative flex items-center">
        {prefix && (
          <span className="absolute left-3.5 text-[#8a7d71] text-sm select-none">{prefix}</span>
        )}
        <input
          ref={ref}
          id={inputId}
          className={cn(
            'w-full h-12 bg-[#ffffff] border border-[#ece2d5] rounded-xl text-[#1a1614] placeholder:text-[#8a7d71] text-sm transition-all focus:outline-none focus:border-[#0bb673]/55 focus:bg-[#ffffff] focus:shadow-[0_0_0_3px_rgba(11,182,115,0.1)]',
            prefix ? 'pl-9 pr-3.5' : 'px-3.5',
            error && 'border-[#e5484d]/50 focus:border-[#e5484d]/50 focus:shadow-[0_0_0_3px_rgba(255,77,87,0.08)]',
            className,
          )}
          {...props}
        />
      </div>
      {error && <p className="text-xs text-[#e5484d]">{error}</p>}
    </div>
    )
  }
)
Input.displayName = 'Input'
