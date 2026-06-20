'use client'
import { useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'

interface ConfirmDialogProps {
  open: boolean
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  /** 'danger' tiñe el botón de confirmar como destructivo. */
  tone?: 'default' | 'danger'
  loading?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/**
 * Diálogo de confirmación accesible (reemplaza window.confirm, que rompe la
 * experiencia y no es estilizable — audits/04-ux-a11y.md, SEV-1). Atrapa foco
 * básico, cierra con Escape y bloquea scroll de fondo.
 */
export function ConfirmDialog({
  open, title, description,
  confirmLabel = 'Confirmar', cancelLabel = 'Cancelar',
  tone = 'default', loading = false,
  onConfirm, onCancel,
}: ConfirmDialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    confirmRef.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onCancel])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40 fade-in"
      onClick={onCancel}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby={description ? 'confirm-desc' : undefined}
        className="w-full max-w-sm bg-[var(--surface)] rounded-2xl shadow-xl p-5 scale-in"
        onClick={e => e.stopPropagation()}
      >
        <h2 id="confirm-title" className="font-display text-lg font-bold text-[var(--text)]">{title}</h2>
        {description && (
          <p id="confirm-desc" className="text-sm text-[var(--text-2)] mt-1.5">{description}</p>
        )}
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 mt-5">
          <Button variant="secondary" onClick={onCancel} disabled={loading}>{cancelLabel}</Button>
          <Button
            ref={confirmRef}
            variant={tone === 'danger' ? 'destructive' : 'primary'}
            onClick={onConfirm}
            loading={loading}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
