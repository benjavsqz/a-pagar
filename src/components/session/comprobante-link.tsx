'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from '@/components/ui/toast'
import { ExternalLink, Loader2 } from 'lucide-react'

/**
 * Abre el comprobante de transferencia.
 * - Valores nuevos: path dentro del bucket privado → genera signed URL (1 h).
 * - Valores legacy: URL pública completa guardada antes de la migración 005.
 */
export function ComprobanteLink({ value }: { value: string }) {
  const [loading, setLoading] = useState(false)

  const handleOpen = async () => {
    if (value.startsWith('http')) {
      window.open(value, '_blank', 'noopener,noreferrer')
      return
    }
    setLoading(true)
    try {
      const supabase = createClient()
      const { data, error } = await supabase.storage
        .from('comprobantes')
        .createSignedUrl(value, 60 * 60)
      if (error || !data?.signedUrl) throw error ?? new Error('Sin URL')
      window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
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
