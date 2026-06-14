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
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 ${
              idx < currentIndex
                ? 'bg-[#0bb673] text-white'
                : idx === currentIndex
                ? 'bg-[#0bb673] text-white shadow-[0_0_16px_rgba(11,182,115,0.35)]'
                : 'bg-[#f6f1ea] text-[#6b5f55] border border-[#ece2d5]'
            }`}>
              {idx < currentIndex ? <Check className="w-3.5 h-3.5" /> : <span>{idx + 1}</span>}
            </div>
            <span className={`text-xs font-medium transition-colors ${
              idx <= currentIndex ? 'text-[#1a1614]' : 'text-[#6b5f55]'
            }`}>
              {step.label}
            </span>
          </div>
          {idx < steps.length - 1 && (
            <div className={`flex-1 h-px mx-2 mb-5 transition-colors duration-500 ${
              idx < currentIndex ? 'bg-[#0bb673]/50' : 'bg-[#ece2d5]'
            }`} />
          )}
        </Fragment>
      ))}
    </div>
  )
}
