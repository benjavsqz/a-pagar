'use client'
import { useState } from 'react'
import { getLocalSession } from '@/lib/local-sessions'
import { toast } from '@/components/ui/toast'
import { ExternalLink, Loader2 } from 'lucide-react'

/**
 * Abre el comprobante de transferencia.
 * - Valores nuevos: path en el bucket privado → la signed URL la genera el
 *   servidor tras validar el host_token (no el cliente con la anon key).
 * - Valores legacy: URL pública completa guardada antes de la migración 005.
 */
export function ComprobanteLink({ value, sessionId }: { value: string; sessionId: string }) {
  const [loading, setLoading] = useState(false)

  const handleOpen = async () => {
    if (value.startsWith('http')) {
      window.open(value, '_blank', 'noopener,noreferrer')
      return
    }
    setLoading(true)
    try {
      const token = getLocalSession(sessionId)?.hostToken ?? null
      const res = await fetch('/api/comprobante', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, path: value, token }),
      })
      const data = await res.json()
      if (!res.ok || !data.url) throw new Error(data.error ?? 'Sin URL')
      window.open(data.url, '_blank', 'noopener,noreferrer')
    } catch (err) {
      console.error('Error generando signed URL:', err)
      toast('No se pudo abrir el comprobante', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleOpen}
      disabled={loading}
      className="flex items-center gap-2 text-xs text-blue-400 hover:text-blue-300 disabled:opacity-50 transition-colors"
    >
      {loading
        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
        : <ExternalLink className="w-3.5 h-3.5" />
      } Ver comprobante
    </button>
  )
}
