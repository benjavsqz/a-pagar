'use client'
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Camera, Upload, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react'
import { compressImage } from '@/lib/compress-image'

interface DraftItem { name: string; price: string }

interface OcrResult {
  items: DraftItem[]
  subtotal?: number | null
  extractedTotal?: number
  mismatch?: boolean
}

interface OcrUploaderProps {
  onResult: (result: OcrResult) => void
  onPreviewReady?: (url: string) => void
  onManual?: () => void
}

type Status = 'idle' | 'compressing' | 'processing' | 'retrying' | 'done' | 'error'

const STATUS_MESSAGES: Record<Status, string> = {
  idle: '',
  compressing: 'Optimizando imagen...',
  processing: 'Leyendo boleta con IA...',
  retrying: 'Gemini ocupado, reintentando...',
  done: '',
  error: '',
}

export function OcrUploader({ onResult, onPreviewReady, onManual }: OcrUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [status, setStatus] = useState<Status>('idle')
  const [detectedCount, setDetectedCount] = useState(0)
  const [errorMsg, setErrorMsg] = useState('')
  const [mismatch, setMismatch] = useState<{ extracted: number; subtotal: number } | null>(null)

  const processFile = async (file: File) => {
    const url = URL.createObjectURL(file)
    setPreview(url)
    setStatus('compressing')
    setErrorMsg('')
    setMismatch(null)
    onPreviewReady?.(url)

    let retryTimer: ReturnType<typeof setTimeout> | undefined
    try {
      // Compress before sending — phone cameras produce 3–8 MB, Gemini prefers <2 MB
      const { base64, mimeType } = await compressImage(file)

      setStatus('processing')
      // After 8s without response, Gemini is likely retrying — update message
      retryTimer = setTimeout(() => setStatus('retrying'), 8000)

      const res = await fetch('/api/ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64, mimeType }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? 'Error del servidor')
      }

      clearTimeout(retryTimer)
      const data = await res.json()
      if (data.error) throw new Error(data.error)

      setDetectedCount(data.items.length)
      if (data.mismatch && data.subtotal && data.extractedTotal) {
        setMismatch({ extracted: data.extractedTotal, subtotal: data.subtotal })
      }
      setStatus('done')
      onResult(data)
    } catch (err) {
      clearTimeout(retryTimer)
      console.error('OCR error:', err)
      setErrorMsg(err instanceof Error ? err.message : 'Error desconocido')
      setStatus('error')
    }
  }

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processFile(file)
    e.target.value = '' // allow re-selecting the same file
  }

  const retry = () => {
    setPreview(null)
    setStatus('idle')
    setErrorMsg('')
    setTimeout(() => inputRef.current?.click(), 50)
  }

  const isProcessing = status === 'compressing' || status === 'processing' || status === 'retrying'

  return (
    <div className="flex flex-col gap-3">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFile}
      />

      {/* Upload zone */}
      {!preview ? (
        <button
          onClick={() => inputRef.current?.click()}
          className="w-full h-48 bg-[#111113] border-2 border-dashed border-[#222226] rounded-2xl flex flex-col items-center justify-center gap-3 hover:border-[#00DF76]/40 hover:bg-[#111113]/80 transition-all active:scale-[0.98]"
        >
          <div className="w-14 h-14 rounded-full bg-[#18181b] flex items-center justify-center">
            <Camera className="w-7 h-7 text-[#00DF76]" />
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold">Sacar foto o subir imagen</p>
            <p className="text-xs text-[#8a8a96] mt-0.5">Apunta al total de la boleta</p>
          </div>
        </button>
      ) : (
        <div className="relative w-full rounded-2xl overflow-hidden bg-[#111113] border border-[#222226]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="Boleta" className="w-full max-h-64 object-contain" />

          {isProcessing && (
            <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center gap-4">
              <Loader2 className="w-9 h-9 text-[#00DF76] animate-spin" />
              <div className="text-center">
                <p className="text-sm font-semibold">{STATUS_MESSAGES[status]}</p>
                <p className="text-xs text-[#8a8a96] mt-1">Esto toma unos segundos</p>
              </div>
              {/* Step dots */}
              <div className="flex items-center gap-2">
                {(['compressing', 'processing'] as const).map((s, idx) => {
                  const activeIdx = status === 'compressing' ? 0 : 1
                  return (
                    <div
                      key={s}
                      className={`w-2 h-2 rounded-full transition-all ${
                        idx === activeIdx
                          ? 'bg-[#00DF76] scale-125'
                          : idx < activeIdx
                          ? 'bg-[#00DF76]/50'
                          : 'bg-[#2e2e34]'
                      }`}
                    />
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Success */}
      {status === 'done' && (
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2 text-xs text-[#00DF76]">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>{detectedCount} ítem{detectedCount !== 1 ? 's' : ''} detectado{detectedCount !== 1 ? 's' : ''} — revisa abajo</span>
          </div>
          <button
            onClick={retry}
            className="text-xs text-[#8a8a96] hover:text-[#c0c0c8] flex items-center gap-1 transition-colors"
          >
            <Upload className="w-3 h-3" /> Otra foto
          </button>
        </div>
      )}

      {/* Mismatch warning */}
      {mismatch && (
        <div className="flex items-start gap-2 text-xs text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-3">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            La boleta dice <strong>{new Intl.NumberFormat('es-CL', {style:'currency',currency:'CLP',maximumFractionDigits:0}).format(mismatch.subtotal)}</strong> pero
            solo detecté <strong>{new Intl.NumberFormat('es-CL', {style:'currency',currency:'CLP',maximumFractionDigits:0}).format(mismatch.extracted)}</strong>.
            {' '}Revisa que todos los ítems estén incluidos abajo y agrega los que falten.
          </span>
        </div>
      )}

      {/* Error */}
      {status === 'error' && (
        <div className="space-y-3">
          <div className="flex items-start gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl p-3">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              {errorMsg.includes('GOOGLE_AI_API_KEY')
                ? 'Falta configurar GOOGLE_AI_API_KEY en .env.local (obtén una gratis en aistudio.google.com)'
                : errorMsg.includes('403') || errorMsg.includes('invalid')
                ? 'API key inválida — verifica en aistudio.google.com'
                : errorMsg.includes('429')
                ? 'Límite de uso alcanzado — espera unos minutos e intenta de nuevo'
                : errorMsg.includes('GEMINI_OVERLOADED') || errorMsg.includes('503') || errorMsg.includes('high demand') || errorMsg.includes('overloaded')
                ? 'Gemini está muy saturado ahora. Espera 15–30 segundos y reintenta — es temporal.'
                : `Error al leer la boleta: ${errorMsg}`}
            </span>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={retry} className="flex-1">
              Reintentar
            </Button>
            {onManual && (
              <Button variant="ghost" size="sm" onClick={onManual} className="flex-1">
                Ingresar manual
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
