'use client'
import { Fragment } from 'react'
import { Check } from 'lucide-react'

export function StepIndicator({ steps, currentId }: { steps: { id: string; label: string }[]; currentId: string }) {
  const currentIndex = steps.findIndex(s => s.id === currentId)
  return (
    <div className="flex items-center mb-7">
      {steps.map((step, idx) => (
        <Fragment key={step.id}>
          <div className="flex flex-col items-center gap-1.5">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-[transform,background-color,color] duration-300 ${
              idx < currentIndex
                ? 'bg-[#0bb673] text-white'
                : idx === currentIndex
                ? 'bg-[#0bb673] text-white shadow-[0_0_16px_rgba(11,182,115,0.35)]'
                : 'bg-[var(--fill)] text-[var(--text-2)] border border-[var(--line)]'
            }`}>
              {idx < currentIndex ? <Check className="w-3.5 h-3.5" /> : <span>{idx + 1}</span>}
            </div>
            <span className={`text-xs font-medium transition-colors ${
              idx <= currentIndex ? 'text-[var(--text)]' : 'text-[var(--text-2)]'
            }`}>
              {step.label}
            </span>
          </div>
          {idx < steps.length - 1 && (
            <div className={`flex-1 h-px mx-2 mb-5 transition-colors duration-500 ${
              idx < currentIndex ? 'bg-[#0bb673]/50' : 'bg-[var(--line)]'
            }`} />
          )}
        </Fragment>
      ))}
    </div>
  )
}
