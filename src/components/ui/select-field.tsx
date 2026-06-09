'use client'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SelectFieldProps {
  label?: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
  placeholder?: string
  className?: string
}

export function SelectField({ label, value, onChange, options, placeholder, className }: SelectFieldProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label && (
        <label className="text-xs font-medium text-[#8a8a96] uppercase tracking-wider">
          {label}
        </label>
      )}
      <div className="relative">
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          className={cn(
            'w-full h-12 bg-[#111113] border border-[#222226] rounded-xl text-sm transition-all',
            'focus:outline-none focus:border-[#00DF76]/50 focus:shadow-[0_0_0_3px_rgba(0,223,118,0.08)]',
            'appearance-none pl-3.5 pr-10 cursor-pointer',
            value ? 'text-white' : 'text-[#4a4a54]',
          )}
        >
          {placeholder && (
            <option value="" disabled className="text-[#4a4a54]">{placeholder}</option>
          )}
          {options.map(opt => (
            <option key={opt.value} value={opt.value} className="bg-[#111113] text-white">
              {opt.label}
            </option>
          ))}
        </select>
        <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8a8a96] pointer-events-none" />
      </div>
    </div>
  )
}
