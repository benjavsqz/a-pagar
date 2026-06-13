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
    <div className="bg-[#ffffff] border border-[#ece2d5] rounded-xl p-3 space-y-2">
      {/* Row 1: Name */}
      <input
        type="text"
        placeholder="Nombre del ítem"
        value={name}
        onChange={e => onNameChange(e.target.value)}
        className={cn(
          'w-full h-9 bg-[#f6f1ea] border border-[#f1e9dd] rounded-lg px-3 text-sm text-[#1a1614] placeholder:text-[#8a7d71]',
          'focus:outline-none focus:border-[#0bb673]/50 focus:shadow-[0_0_0_3px_rgba(11,182,115,0.06)] transition-all',
        )}
      />
      {/* Row 2: Qty + Price + Remove */}
      <div className="flex items-center gap-2">
        {/* Quantity stepper */}
        <div className="flex items-center bg-[#f6f1ea] border border-[#f1e9dd] rounded-lg shrink-0">
          <button
            onClick={() => onQuantityChange(Math.max(1, quantity - 1))}
            disabled={quantity <= 1}
            aria-label="Disminuir cantidad"
            className="w-8 h-8 flex items-center justify-center text-[#6b5f55] hover:text-[#1a1614] disabled:opacity-25 transition-colors"
          >
            <Minus className="w-3 h-3" />
          </button>
          <span className="w-6 text-center text-xs font-bold tabular-nums select-none text-[#4a423b]">
            {quantity}
          </span>
          <button
            onClick={() => onQuantityChange(quantity + 1)}
            aria-label="Aumentar cantidad"
            className="w-8 h-8 flex items-center justify-center text-[#6b5f55] hover:text-[#1a1614] transition-colors"
          >
            <Plus className="w-3 h-3" />
          </button>
        </div>

        {/* Unit price */}
        <div className="relative flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8a7d71] text-xs pointer-events-none">$</span>
          <input
            type="number"
            inputMode="numeric"
            placeholder="0"
            value={price}
            onChange={e => onPriceChange(e.target.value)}
            className="w-full h-8 bg-[#f6f1ea] border border-[#f1e9dd] rounded-lg pl-6 pr-3 text-sm text-[#1a1614] placeholder:text-[#8a7d71] focus:outline-none focus:border-[#0bb673]/50 focus:shadow-[0_0_0_3px_rgba(11,182,115,0.06)] transition-all"
          />
        </div>

        {/* Remove or spacer */}
        {onRemove ? (
          <button
            onClick={onRemove}
            aria-label="Eliminar ítem"
            className="p-1.5 hover:bg-[#f6f1ea] rounded-lg text-[#8a7d71] hover:text-[#e5484d] transition-colors shrink-0"
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
