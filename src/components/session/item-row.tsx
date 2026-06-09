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
    <div className="flex items-center gap-2">
      {/* Quantity stepper */}
      <div className="flex items-center bg-[#18181b] border border-[#222226] rounded-xl shrink-0">
        <button
          onClick={() => onQuantityChange(Math.max(1, quantity - 1))}
          disabled={quantity <= 1}
          className="w-8 h-10 flex items-center justify-center text-[#8a8a96] hover:text-white disabled:opacity-25 transition-colors"
        >
          <Minus className="w-3 h-3" />
        </button>
        <span className="w-6 text-center text-sm font-bold tabular-nums select-none">
          {quantity}
        </span>
        <button
          onClick={() => onQuantityChange(quantity + 1)}
          className="w-8 h-10 flex items-center justify-center text-[#8a8a96] hover:text-white transition-colors"
        >
          <Plus className="w-3 h-3" />
        </button>
      </div>

      {/* Name */}
      <input
        type="text"
        placeholder="Nombre del ítem"
        value={name}
        onChange={e => onNameChange(e.target.value)}
        className={cn(
          'flex-1 h-10 bg-[#111113] border border-[#222226] rounded-xl px-3 text-sm text-white placeholder:text-[#4a4a54]',
          'focus:outline-none focus:border-[#00DF76]/50 focus:shadow-[0_0_0_3px_rgba(0,223,118,0.06)] transition-all',
        )}
      />

      {/* Unit price */}
      <input
        type="number"
        placeholder="Precio"
        value={price}
        onChange={e => onPriceChange(e.target.value)}
        className="w-24 h-10 bg-[#111113] border border-[#222226] rounded-xl px-3 text-sm text-white placeholder:text-[#4a4a54] focus:outline-none focus:border-[#00DF76]/50 focus:shadow-[0_0_0_3px_rgba(0,223,118,0.06)] transition-all"
      />

      {onRemove && (
        <button
          onClick={onRemove}
          className="p-2 hover:bg-[#18181b] rounded-lg text-[#8a8a96] hover:text-[#ff4d57] transition-colors shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  )
}
