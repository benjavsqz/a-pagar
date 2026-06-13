'use client'
import { useId } from 'react'
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
  const selectId = useId()
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label && (
        <label htmlFor={selectId} className="text-xs font-medium text-[#9a9aa6] uppercase tracking-wider">
          {label}
        </label>
      )}
      <div className="relative">
        <select
          id={selectId}
          value={value}
          onChange={e => onChange(e.target.value)}
          className={cn(
            'w-full h-12 bg-[#101216] border border-[#23262d] rounded-xl text-sm transition-all',
            'focus:outline-none focus:border-[#00DF76]/55 focus:shadow-[0_0_0_3px_rgba(0,223,118,0.1)]',
            'appearance-none pl-3.5 pr-10 cursor-pointer',
            value ? 'text-white' : 'text-[#7c7c86]',
          )}
        >
          {placeholder && (
            <option value="" disabled className="text-[#7c7c86]">{placeholder}</option>
          )}
          {options.map(opt => (
            <option key={opt.value} value={opt.value} className="bg-[#101216] text-white">
              {opt.label}
            </option>
          ))}
        </select>
        <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9a9aa6] pointer-events-none" />
      </div>
    </div>
  )
}
