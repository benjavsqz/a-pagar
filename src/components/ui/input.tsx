'use client'
import { cn } from '@/lib/utils'
import { type InputHTMLAttributes, forwardRef } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  prefix?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, prefix, className, ...props }, ref) => (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label className="text-xs font-medium text-[#8a8a96] uppercase tracking-wider">
          {label}
        </label>
      )}
      <div className="relative flex items-center">
        {prefix && (
          <span className="absolute left-3.5 text-[#4a4a54] text-sm select-none">{prefix}</span>
        )}
        <input
          ref={ref}
          className={cn(
            'w-full h-12 bg-[#111113] border border-[#222226] rounded-xl text-white placeholder:text-[#4a4a54] text-sm transition-all focus:outline-none focus:border-[#00DF76]/50 focus:bg-[#111113] focus:shadow-[0_0_0_3px_rgba(0,223,118,0.08)]',
            prefix ? 'pl-9 pr-3.5' : 'px-3.5',
            error && 'border-[#ff4d57]/50 focus:border-[#ff4d57]/50 focus:shadow-[0_0_0_3px_rgba(255,77,87,0.08)]',
            className,
          )}
          {...props}
        />
      </div>
      {error && <p className="text-xs text-[#ff4d57]">{error}</p>}
    </div>
  )
)
Input.displayName = 'Input'
