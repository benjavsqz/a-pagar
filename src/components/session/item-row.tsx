'use client'
import { X, Minus, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ItemRowProps {
  name: string
  price: string
  quantity: number
  onNameChange: (v: string) => void
  onPriceChange: (v: string) => void
  onQuantityChange: (v: number) => void
  onRemove?: () => void
}

export function ItemRow({
  name, price, quantity,
  onNameChange, onPriceChange, onQuantityChange, onRemove,
}: ItemRowProps) {
  return (
    <div className="bg-[#111113] border border-[#222226] rounded-xl p-3 space-y-2">
      {/* Row 1: Name */}
      <input
        type="text"
        placeholder="Nombre del ítem"
        value={name}
        onChange={e => onNameChange(e.target.value)}
        className={cn(
          'w-full h-9 bg-[#0d0d0f] border border-[#1e1e22] rounded-lg px-3 text-sm text-white placeholder:text-[#4a4a54]',
          'focus:outline-none focus:border-[#00DF76]/50 focus:shadow-[0_0_0_3px_rgba(0,223,118,0.06)] transition-all',
        )}
      />
      {/* Row 2: Qty + Price + Remove */}
      <div className="flex items-center gap-2">
        {/* Quantity stepper */}
        <div className="flex items-center bg-[#0d0d0f] border border-[#1e1e22] rounded-lg shrink-0">
          <button
            onClick={() => onQuantityChange(Math.max(1, quantity - 1))}
            disabled={quantity <= 1}
            className="w-8 h-8 flex items-center justify-center text-[#8a8a96] hover:text-white disabled:opacity-25 transition-colors"
          >
            <Minus className="w-3 h-3" />
          </button>
          <span className="w-6 text-center text-xs font-bold tabular-nums select-none text-[#c0c0c8]">
            {quantity}
          </span>
          <button
            onClick={() => onQuantityChange(quantity + 1)}
            className="w-8 h-8 flex items-center justify-center text-[#8a8a96] hover:text-white transition-colors"
          >
            <Plus className="w-3 h-3" />
          </button>
        </div>

        {/* Unit price */}
        <div className="relative flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#4a4a54] text-xs pointer-events-none">$</span>
          <input
            type="number"
            inputMode="numeric"
            placeholder="0"
            value={price}
            onChange={e => onPriceChange(e.target.value)}
            className="w-full h-8 bg-[#0d0d0f] border border-[#1e1e22] rounded-lg pl-6 pr-3 text-sm text-white placeholder:text-[#4a4a54] focus:outline-none focus:border-[#00DF76]/50 focus:shadow-[0_0_0_3px_rgba(0,223,118,0.06)] transition-all"
          />
        </div>

        {/* Remove or spacer */}
        {onRemove ? (
          <button
            onClick={onRemove}
            className="p-1.5 hover:bg-[#18181b] rounded-lg text-[#4a4a54] hover:text-[#ff4d57] transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        ) : (
          <div className="w-7 shrink-0" />
        )}
      </div>
    </div>
  )
}
