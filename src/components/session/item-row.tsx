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
    <div className="bg-[var(--surface)] border border-[var(--line)] rounded-xl p-3 space-y-2">
      {/* Row 1: Name */}
      <input
        type="text"
        placeholder="Nombre del ítem"
        value={name}
        onChange={e => onNameChange(e.target.value)}
        className={cn(
          'w-full h-9 bg-[var(--fill)] border border-[var(--fill-2)] rounded-lg px-3 text-sm text-[var(--text)] placeholder:text-[var(--text-2)]',
          'focus:outline-none focus:border-[#0bb673]/50 focus:shadow-[0_0_0_3px_rgba(11,182,115,0.06)] transition-[border-color,box-shadow]',
        )}
      />
      {/* Row 2: Qty + Price + Remove */}
      <div className="flex items-center gap-2">
        {/* Quantity stepper */}
        <div className="flex items-center bg-[var(--fill)] border border-[var(--fill-2)] rounded-lg shrink-0">
          <button
            onClick={() => onQuantityChange(Math.max(1, quantity - 1))}
            disabled={quantity <= 1}
            aria-label="Disminuir cantidad"
            className="w-10 h-10 flex items-center justify-center text-[var(--text-2)] hover:text-[var(--text)] disabled:opacity-25 transition-colors"
          >
            <Minus className="w-3 h-3" />
          </button>
          <span className="w-6 text-center text-xs font-bold tabular-nums select-none text-[var(--text-1)]">
            {quantity}
          </span>
          <button
            onClick={() => onQuantityChange(quantity + 1)}
            aria-label="Aumentar cantidad"
            className="w-10 h-10 flex items-center justify-center text-[var(--text-2)] hover:text-[var(--text)] transition-colors"
          >
            <Plus className="w-3 h-3" />
          </button>
        </div>

        {/* Unit price */}
        <div className="relative flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-3)] text-xs pointer-events-none">$</span>
          <input
            type="number"
            inputMode="numeric"
            placeholder="0"
            value={price}
            onChange={e => onPriceChange(e.target.value)}
            className="w-full h-8 bg-[var(--fill)] border border-[var(--fill-2)] rounded-lg pl-6 pr-3 text-sm text-[var(--text)] placeholder:text-[var(--text-2)] focus:outline-none focus:border-[#0bb673]/50 focus:shadow-[0_0_0_3px_rgba(11,182,115,0.06)] transition-[border-color,box-shadow]"
          />
        </div>

        {/* Remove or spacer */}
        {onRemove ? (
          <button
            onClick={onRemove}
            aria-label="Eliminar ítem"
            className="w-10 h-10 flex items-center justify-center hover:bg-[var(--fill)] rounded-lg text-[var(--text-2)] hover:text-[#c0282d] transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        ) : (
          <div className="w-10 shrink-0" />
        )}
      </div>
    </div>
  )
}
