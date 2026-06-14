'use client'
import { Fragment, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from '@/components/ui/toast'
import { ItemRow } from '@/components/session/item-row'
import { OcrUploader } from '@/components/session/ocr-uploader'
import { formatCLP, formatRut, isValidRut, normalizePaymentLink } from '@/lib/utils'
import { saveLocalSession } from '@/lib/local-sessions'
import { SelectField } from '@/components/ui/select-field'
import {
  Plus, ArrowRight, ChevronLeft, Check, ChevronDown, ChevronUp,
  ScanLine, Users, RefreshCw, Loader2,
} from 'lucide-react'
import Link from 'next/link'

const BANKS = [
  'Banco Estado', 'Banco de Chile', 'BCI', 'Santander', 'BBVA', 'Itaú',
  'Scotiabank', 'Banco Security', 'BICE', 'Banco Consorcio', 'Banco Internacional',
  'Falabella', 'Banco Ripley', 'Coopeuch', 'Mercado Pago', 'MACH', 'Tenpo', 'Otro',
].map(b => ({ value: b, label: b }))

const ACCOUNT_TYPES = [
  { value: 'Cuenta Corriente', label: 'Cuenta Corriente' },
  { value: 'Cuenta Vista', label: 'Cuenta Vista' },
  { value: 'Cuenta RUT', label: 'Cuenta RUT (BancoEstado)' },
  { value: 'Cuenta de Ahorro', label: 'Cuenta de Ahorro' },
  { value: 'Cuenta Digital', label: 'Cuenta Digital (MACH, Mercado Pago…)' },
  { value: 'Otro', label: 'Otro' },
]

/**
 * Genera y registra el token secreto de anfitrión (migración 005).
 * Si la tabla aún no existe (migración sin aplicar), la sesión queda en modo
 * legacy y las acciones de host funcionan sin token.
 */
async function registerHostToken(
  supabase: ReturnType<typeof createClient>,
  sessionId: string,
): Promise<string | undefined> {
  const hostToken = crypto.randomUUID()
  const { error } = await supabase
    .from('session_secrets')
    .insert({ session_id: sessionId, host_token: hostToken })
  if (error) {
    console.warn('No se pudo registrar host_token (¿migración 005 sin aplicar?):', error.message)
    return undefined
  }
  return hostToken
}

// ── Types ────────────────────────────────────────────────────────────────────

type SplitMode = 'items' | 'equal'
type StepItems = 'scan' | 'items' | 'host'
type StepEqual = 'amount' | 'host'

interface DraftItem {
  id: string
  name: string
  price: string
  quantity: number
}

// Cada ítem borrador lleva un id estable para usarlo como key de React (antes
// se usaba el índice, lo que rompía el estado al borrar filas intermedias).
const newDraft = (partial: Partial<DraftItem> = {}): DraftItem => ({
  id: crypto.randomUUID(),
  name: '', price: '', quantity: 1,
  ...partial,
})

// ── Step indicator ────────────────────────────────────────────────────────────

const STEPS_ITEMS: { id: StepItems; label: string }[] = [
  { id: 'scan', label: 'Foto' },
  { id: 'items', label: 'Ítems' },
  { id: 'host', label: 'Datos' },
]

const STEPS_EQUAL: { id: StepEqual; label: string }[] = [
  { id: 'amount', label: 'Monto' },
  { id: 'host', label: 'Datos' },
]

function StepIndicator({ steps, currentId }: { steps: { id: string; label: string }[]; currentId: string }) {
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

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CrearPage() {
  const router = useRouter()

  // Mode selector (null = choosing)
  const [splitMode, setSplitMode] = useState<SplitMode | null>(null)

  // --- "Por ítems" state ---
  const [stepItems, setStepItems] = useState<StepItems>('scan')
  const [items, setItems] = useState<DraftItem[]>([newDraft()])
  const [propina, setPropina] = useState<0 | 10>(10)
  const [restaurantName, setRestaurantName] = useState('')
  const [receiptPreviewUrl, setReceiptPreviewUrl] = useState<string | null>(null)
  const [showReceipt, setShowReceipt] = useState(false)
  const [ocrSubtotal, setOcrSubtotal] = useState<number | null>(null)
  const [ocrImage, setOcrImage] = useState<{ base64: string; mimeType: string } | null>(null)
  const [reanalyzing, setReanalyzing] = useState(false)

  // --- "Partes iguales" state ---
  const [stepEqual, setStepEqual] = useState<StepEqual>('amount')
  const [equalTotal, setEqualTotal] = useState('')
  const [equalN, setEqualN] = useState('')
  const [equalRestaurant, setEqualRestaurant] = useState('')

  // --- Shared host data ---
  const [hostName, setHostName] = useState('')
  const [hostBank, setHostBank] = useState('')
  const [hostAccountType, setHostAccountType] = useState('')
  const [hostAccount, setHostAccount] = useState('')
  const [hostRut, setHostRut] = useState('')
  const [hostEmail, setHostEmail] = useState('')
  const [hostPaymentLink, setHostPaymentLink] = useState('')
  const [loading, setLoading] = useState(false)

  // ── Helpers ────────────────────────────────────────────────────────────────

  const addItem = () => setItems(prev => [...prev, newDraft()])
  const updateItem = (idx: number, field: keyof DraftItem, value: string | number) =>
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: value } : it))
  const removeItem = (idx: number) =>
    setItems(prev => prev.filter((_, i) => i !== idx))

  const mergeOcrItems = (rawItems: Array<{ name: string; price: string }>): DraftItem[] => {
    const merged: DraftItem[] = []
    for (const item of rawItems) {
      const existing = merged.find(g => g.name === item.name && g.price === item.price)
      if (existing) { existing.quantity += 1 }
      else { merged.push(newDraft({ name: item.name, price: item.price })) }
    }
    return merged
  }

  const handleOcrResult = (result: { items: Array<{ name: string; price: string }>; subtotal?: number | null }) => {
    if (result.items.length === 0) return
    setItems(mergeOcrItems(result.items))
    if (result.subtotal) setOcrSubtotal(result.subtotal)
    setStepItems('items')
  }

  // Segunda pasada del OCR, más exhaustiva, cuando la suma no calza con el subtotal.
  const reanalyze = async () => {
    if (!ocrImage || reanalyzing) return
    setReanalyzing(true)
    try {
      const res = await fetch('/api/ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: ocrImage.base64, mimeType: ocrImage.mimeType, thorough: true }),
      })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error ?? 'Error')
      if (!data.items || data.items.length === 0) {
        toast('No se detectaron ítems en la re-lectura', 'error')
        return
      }
      setItems(mergeOcrItems(data.items))
      setOcrSubtotal(data.subtotal ?? null)
      toast(data.mismatch
        ? 'Re-analizada — aún no calza del todo, revisa los ítems'
        : 'Re-analizada ✓ ahora la suma calza')
    } catch {
      toast('No se pudo re-analizar, intenta de nuevo', 'error')
    } finally {
      setReanalyzing(false)
    }
  }

  const subtotal = items.reduce((s, it) => s + (parseInt(it.price) || 0) * (it.quantity || 1), 0)

  // ── Create session (items mode) ────────────────────────────────────────────

  const handleCreateItems = async () => {
    const validItems = items.filter(it => it.name.trim() && parseInt(it.price) > 0)
    if (validItems.length === 0) { toast('Agrega al menos un ítem', 'error'); return }
    if (!hostName.trim()) { toast('Ingresa tu nombre', 'error'); return }
    if (hostRut.trim() && !isValidRut(hostRut)) { toast('El RUT no es válido', 'error'); return }
    const paymentLink = normalizePaymentLink(hostPaymentLink)
    if (hostPaymentLink.trim() && !paymentLink) {
      toast('El link de pago debe ser de un servicio conocido (Mercado Pago, MACH, Fintoc…)', 'error')
      return
    }

    setLoading(true)
    try {
      const supabase = createClient()
      const { data: session, error: sessionErr } = await supabase
        .from('sessions')
        .insert({
          restaurant_name: restaurantName.trim() || null,
          propina_pct: propina,
          host_name: hostName.trim(),
          host_bank: hostBank && hostAccountType ? `${hostBank} · ${hostAccountType}` : (hostBank.trim() || null),
          host_account: hostAccount.trim() || null,
          host_rut: hostRut.trim() || null,
          // Solo se envían si hay valor, para no romper la creación si la
          // migración 006 aún no está aplicada (columna inexistente).
          ...(hostEmail.trim() ? { host_email: hostEmail.trim() } : {}),
          ...(paymentLink ? { host_payment_link: paymentLink } : {}),
          split_mode: 'items',
        })
        .select()
        .single()

      if (sessionErr) throw new Error(sessionErr.message)
      if (!session) throw new Error('No se pudo crear la sesión')

      const hostToken = await registerHostToken(supabase, session.id)

      const dbItems: Array<{ session_id: string; name: string; price: number; position: number }> = []
      let pos = 0
      for (const it of validItems) {
        const qty = Math.max(1, it.quantity)
        for (let i = 0; i < qty; i++) {
          dbItems.push({ session_id: session.id, name: it.name.trim(), price: parseInt(it.price), position: pos++ })
        }
      }
      const { error: itemsErr } = await supabase.from('items').insert(dbItems)
      if (itemsErr) throw new Error(itemsErr.message)

      // El host pasa a ser un participante (is_host) para poder marcar lo que
      // consumió. Se crea vía RPC SECURITY DEFINER que valida el host_token: el
      // cliente NO puede insertar is_host=true directamente (migración 008).
      // Requiere el token; si no hay (migración 005/008 sin aplicar) se omite
      // (modo legacy: el host no es participante y su consumo se asume como resto).
      let hostParticipantId: string | undefined
      if (hostToken) {
        const { data: hostPId, error: hostPErr } = await supabase.rpc('register_host_participant', {
          p_session_id: session.id,
          p_name: hostName.trim(),
          p_token: hostToken,
        })
        if (hostPErr) {
          console.warn('No se pudo crear participante host (¿migración 008 sin aplicar?):', hostPErr.message)
        } else {
          hostParticipantId = (hostPId as string | null) ?? undefined
        }
      }

      saveLocalSession({
        id: session.id,
        role: 'host',
        restaurantName: restaurantName.trim() || null,
        hostName: hostName.trim(),
        splitMode: 'items',
        createdAt: session.created_at,
        hostToken,
        hostParticipantId,
      })

      router.push(`/host/${session.id}`)
    } catch (err) {
      console.error('handleCreateItems error:', err)
      const msg = err instanceof Error ? err.message : (typeof err === 'object' && err !== null && 'message' in err ? (err as { message: string }).message : String(err))
      toast(msg || 'Error al crear la sesión', 'error')
    } finally {
      setLoading(false)
    }
  }

  // ── Create session (equal mode) ────────────────────────────────────────────

  const handleCreateEqual = async () => {
    const total = parseInt(equalTotal.replace(/\D/g, ''))
    const n = parseInt(equalN)
    if (!total || total <= 0) { toast('Ingresa el monto total', 'error'); return }
    if (!n || n < 2) { toast('Ingresa al menos 2 personas', 'error'); return }
    if (!hostName.trim()) { toast('Ingresa tu nombre', 'error'); return }
    if (hostRut.trim() && !isValidRut(hostRut)) { toast('El RUT no es válido', 'error'); return }
    const paymentLink = normalizePaymentLink(hostPaymentLink)
    if (hostPaymentLink.trim() && !paymentLink) {
      toast('El link de pago debe ser de un servicio conocido (Mercado Pago, MACH, Fintoc…)', 'error')
      return
    }

    setLoading(true)
    try {
      const supabase = createClient()
      const { data: session, error: sessionErr } = await supabase
        .from('sessions')
        .insert({
          restaurant_name: equalRestaurant.trim() || null,
          propina_pct: 0,
          host_name: hostName.trim(),
          host_bank: hostBank && hostAccountType ? `${hostBank} · ${hostAccountType}` : (hostBank.trim() || null),
          host_account: hostAccount.trim() || null,
          host_rut: hostRut.trim() || null,
          // Solo se envían si hay valor, para no romper la creación si la
          // migración 006 aún no está aplicada (columna inexistente).
          ...(hostEmail.trim() ? { host_email: hostEmail.trim() } : {}),
          ...(paymentLink ? { host_payment_link: paymentLink } : {}),
          split_mode: 'equal',
          split_total: total,
          split_n: n,
        })
        .select()
        .single()

      if (sessionErr) throw new Error(sessionErr.message)
      if (!session) throw new Error('No se pudo crear la sesión')

      const hostToken = await registerHostToken(supabase, session.id)

      saveLocalSession({
        id: session.id,
        role: 'host',
        restaurantName: equalRestaurant.trim() || null,
        hostName: hostName.trim(),
        splitMode: 'equal',
        createdAt: session.created_at,
        hostToken,
      })

      router.push(`/host/${session.id}`)
    } catch (err) {
      console.error('handleCreateEqual error:', err)
      const msg = err instanceof Error ? err.message : (typeof err === 'object' && err !== null && 'message' in err ? (err as { message: string }).message : String(err))
      toast(msg || 'Error al crear la sesión', 'error')
    } finally {
      setLoading(false)
    }
  }

  // ── Back handlers ─────────────────────────────────────────────────────────

  const goBackItems = () => {
    if (stepItems === 'items') setStepItems('scan')
    else if (stepItems === 'host') setStepItems('items')
    else setSplitMode(null)
  }

  const goBackEqual = () => {
    if (stepEqual === 'host') setStepEqual('amount')
    else setSplitMode(null)
  }

  // ── Mode selector ─────────────────────────────────────────────────────────

  if (splitMode === null) {
    return (
      <div className="min-h-dvh flex flex-col max-w-md mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-8">
          <Link href="/" aria-label="Volver al inicio" className="p-2 -ml-2 hover:bg-[#f6f1ea] rounded-xl transition-colors text-[#6b5f55] hover:text-[#1a1614]">
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[#0bb673] flex items-center justify-center">
              <span className="text-white text-xs font-black leading-none">$</span>
            </div>
            <span className="text-base font-black tracking-tight">A-Pagar</span>
          </div>
        </div>

        <div className="flex-1 flex flex-col justify-center gap-5">
          <div>
            <h1 className="font-display text-2xl font-black">¿Cómo quieres dividir?</h1>
            <p className="text-sm text-[#6b5f55] mt-1">Elige el método que mejor se ajusta a tu situación</p>
          </div>

          <button
            onClick={() => setSplitMode('items')}
            className="w-full text-left p-5 bg-[#ffffff] border border-[#ece2d5] shadow-[0_6px_18px_rgba(150,100,60,0.07)] rounded-2xl hover:border-[#0bb673]/40 lift group"
          >
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-[#0bb673]/10 border border-[#0bb673]/20 flex items-center justify-center shrink-0 group-hover:bg-[#0bb673]/15 transition-colors">
                <ScanLine className="w-6 h-6 text-[#077f4e]" />
              </div>
              <div className="flex-1">
                <p className="font-bold text-base">Por ítems</p>
                <p className="text-sm text-[#6b5f55] mt-1 leading-relaxed">
                  Escanea la boleta y cada uno marca exactamente lo que pidió. Ideal cuando hubo pedidos distintos.
                </p>
              </div>
            </div>
            <div className="flex gap-1.5 flex-wrap mt-4">
              {['Escaneo IA', 'Preciso', 'Con propina'].map(tag => (
                <span key={tag} className="text-[10px] bg-[#0bb673]/8 text-[#077f4e] border border-[#0bb673]/15 px-2 py-0.5 rounded-full">
                  {tag}
                </span>
              ))}
            </div>
          </button>

          <button
            onClick={() => setSplitMode('equal')}
            className="w-full text-left p-5 bg-[#ffffff] border border-[#ece2d5] shadow-[0_6px_18px_rgba(150,100,60,0.07)] rounded-2xl hover:border-[#7c6cf0]/40 lift group"
          >
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-[#7c6cf0]/10 border border-[#7c6cf0]/20 flex items-center justify-center shrink-0 group-hover:bg-[#7c6cf0]/15 transition-colors">
                <Users className="w-6 h-6 text-[#7c6cf0]" />
              </div>
              <div className="flex-1">
                <p className="font-bold text-base">Partes iguales</p>
                <p className="text-sm text-[#6b5f55] mt-1 leading-relaxed">
                  Divide el total en partes iguales entre todos. Ideal cuando cada uno pidió más o menos lo mismo.
                </p>
              </div>
            </div>
            <div className="flex gap-1.5 flex-wrap mt-4">
              {['Rápido', 'Sin ítems', 'Simple'].map(tag => (
                <span key={tag} className="text-[10px] bg-[#7c6cf0]/8 text-[#5b4dc7] border border-[#7c6cf0]/15 px-2 py-0.5 rounded-full">
                  {tag}
                </span>
              ))}
            </div>
          </button>
        </div>
      </div>
    )
  }

  // ── Items flow ────────────────────────────────────────────────────────────

  if (splitMode === 'items') {
    return (
      <div className="min-h-dvh flex flex-col max-w-md mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-2">
          <button
            onClick={goBackItems}
            aria-label="Volver"
            className="p-2 hover:bg-[#f6f1ea] rounded-xl transition-colors text-[#6b5f55] hover:text-[#1a1614]"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <span className="text-base font-black tracking-tight">A-Pagar</span>
            <h1 className="font-bold text-lg leading-tight">Nueva boleta</h1>
          </div>
        </div>

        <StepIndicator steps={STEPS_ITEMS} currentId={stepItems} />

        {stepItems === 'scan' && (
          <div className="flex-1 flex flex-col gap-4">
            <OcrUploader
              onResult={handleOcrResult}
              onPreviewReady={url => setReceiptPreviewUrl(url)}
              onImageReady={setOcrImage}
              onManual={() => setStepItems('items')}
            />
            <div className="relative flex items-center gap-3">
              <div className="flex-1 h-px bg-[#f1e9dd]" />
              <span className="text-xs text-[#6b5f55]">o ingresa manual</span>
              <div className="flex-1 h-px bg-[#f1e9dd]" />
            </div>
            <Button variant="secondary" fullWidth onClick={() => setStepItems('items')}>
              Ingresar ítems a mano
            </Button>
          </div>
        )}

        {stepItems === 'items' && (
          <div className="flex-1 flex flex-col gap-4">
            {receiptPreviewUrl && (
              <div className="rounded-2xl overflow-hidden border border-[#ece2d5] bg-[#ffffff]">
                <button
                  onClick={() => setShowReceipt(v => !v)}
                  className="w-full flex items-center justify-between px-3 py-2.5 text-xs text-[#6b5f55] hover:text-[#1a1614] transition-colors"
                >
                  <span>Tu boleta escaneada</span>
                  {showReceipt ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
                {showReceipt && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={receiptPreviewUrl} alt="Boleta" className="w-full max-h-52 object-contain border-t border-[#ece2d5]" />
                )}
              </div>
            )}

            <Input
              label="Restaurante (opcional)"
              placeholder="Ej: El Toro, La Piojera..."
              value={restaurantName}
              onChange={e => setRestaurantName(e.target.value)}
            />

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[#6b5f55] uppercase tracking-wider">Ítems de la boleta</span>
                <button onClick={addItem} className="flex items-center gap-1 text-xs text-[#077f4e] hover:text-[#0a8f5c] transition-colors">
                  <Plus className="w-3.5 h-3.5" /> Agregar
                </button>
              </div>
              {items.map((item, idx) => (
                <ItemRow
                  key={item.id}
                  name={item.name}
                  price={item.price}
                  quantity={item.quantity}
                  onNameChange={v => updateItem(idx, 'name', v)}
                  onPriceChange={v => updateItem(idx, 'price', v)}
                  onQuantityChange={v => updateItem(idx, 'quantity', v)}
                  onRemove={items.length > 1 ? () => removeItem(idx) : undefined}
                />
              ))}
            </div>

            {/* Propina */}
            <div className="bg-[#ffffff] border border-[#ece2d5] shadow-[0_6px_18px_rgba(150,100,60,0.07)] rounded-2xl p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold">Propina</p>
                  <p className="text-xs text-[#6b5f55] mt-0.5">
                    {propina === 0 ? 'No se agregará propina' : 'Proporcional al consumo de cada uno'}
                  </p>
                </div>
                <div className="flex gap-1.5 bg-[#f6f1ea] border border-[#ece2d5] rounded-full p-1">
                  {([0, 10] as const).map(pct => (
                    <button
                      key={pct}
                      onClick={() => setPropina(pct)}
                      className={`px-3.5 py-1.5 rounded-full text-sm font-semibold transition-all ${
                        propina === pct
                          ? 'bg-[#0bb673] text-white shadow-[0_0_12px_rgba(11,182,115,0.3)]'
                          : 'text-[#6b5f55] hover:text-[#1a1614]'
                      }`}
                    >
                      {pct === 0 ? 'Sin' : `${pct}%`}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Totals */}
            <div className="bg-[#ffffff] border border-[#ece2d5] shadow-[0_6px_18px_rgba(150,100,60,0.07)] rounded-2xl p-4 space-y-2">
              {ocrSubtotal && Math.abs(subtotal - ocrSubtotal) > ocrSubtotal * 0.02 && (
                <div className="flex flex-col gap-2 pb-3 border-b border-[#ece2d5]">
                  <div className="flex items-start gap-2 text-xs text-[#92600a]">
                    <span>⚠</span>
                    <span>La boleta marcaba {formatCLP(ocrSubtotal)} y la suma de ítems da {formatCLP(subtotal)} — puede faltar alguno.</span>
                  </div>
                  {ocrImage && (
                    <button
                      onClick={reanalyze}
                      disabled={reanalyzing}
                      className="self-start flex items-center gap-1.5 text-xs font-semibold text-[#077f4e] bg-[#e7f9f0] hover:bg-[#d6f3e6] disabled:opacity-60 px-3 py-1.5 rounded-full transition-colors tap"
                    >
                      {reanalyzing
                        ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Re-analizando…</>
                        : <><RefreshCw className="w-3.5 h-3.5" /> Volver a analizar con más detalle</>
                      }
                    </button>
                  )}
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-[#6b5f55]">Subtotal boleta</span>
                <span className="font-medium">{formatCLP(subtotal)}</span>
              </div>
              {propina > 0 && (
                <>
                  <div className="flex justify-between text-sm">
                    <span className="text-[#6b5f55]">Propina {propina}%</span>
                    <span className="font-medium text-[#4a423b]">{formatCLP(Math.ceil(subtotal * propina / 100))}</span>
                  </div>
                  <div className="flex justify-between text-sm pt-1 border-t border-[#ece2d5]">
                    <span className="font-semibold">Total con propina</span>
                    <span className="font-bold text-[#077f4e]">{formatCLP(subtotal + Math.ceil(subtotal * propina / 100))}</span>
                  </div>
                </>
              )}
              {propina === 0 && (
                <div className="flex justify-between text-sm pt-1 border-t border-[#ece2d5]">
                  <span className="font-semibold">Total</span>
                  <span className="font-bold text-[#077f4e]">{formatCLP(subtotal)}</span>
                </div>
              )}
            </div>

            <Button fullWidth onClick={() => setStepItems('host')} className="mt-auto">
              Continuar <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        )}

        {stepItems === 'host' && (
          <HostDataForm
            hostName={hostName} setHostName={setHostName}
            hostBank={hostBank} setHostBank={setHostBank}
            hostAccountType={hostAccountType} setHostAccountType={setHostAccountType}
            hostAccount={hostAccount} setHostAccount={setHostAccount}
            hostRut={hostRut} setHostRut={setHostRut}
            hostEmail={hostEmail} setHostEmail={setHostEmail}
            hostPaymentLink={hostPaymentLink} setHostPaymentLink={setHostPaymentLink}
            loading={loading}
            onSubmit={handleCreateItems}
            submitLabel="Generar link para compartir"
          />
        )}
      </div>
    )
  }

  // ── Equal split flow ──────────────────────────────────────────────────────

  const totalNum = parseInt(equalTotal.replace(/\D/g, '')) || 0
  const nNum = parseInt(equalN) || 0
  const sharePerPerson = nNum > 0 ? Math.ceil(totalNum / nNum) : 0

  return (
    <div className="min-h-dvh flex flex-col max-w-md mx-auto px-4 py-6">
      <div className="flex items-center gap-3 mb-2">
        <button
          onClick={goBackEqual}
          aria-label="Volver"
          className="p-2 hover:bg-[#f6f1ea] rounded-xl transition-colors text-[#6b5f55] hover:text-[#1a1614]"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div>
          <span className="text-base font-black tracking-tight">A-Pagar</span>
          <h1 className="font-bold text-lg leading-tight">Partes iguales</h1>
        </div>
      </div>

      <StepIndicator steps={STEPS_EQUAL} currentId={stepEqual} />

      {stepEqual === 'amount' && (
        <div className="flex-1 flex flex-col gap-4">
          <div className="bg-[#ffffff] border border-[#7c6cf0]/20 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <Users className="w-4 h-4 text-[#7c6cf0]" />
              <p className="text-sm font-semibold text-[#7c6cf0]">División en partes iguales</p>
            </div>
            <p className="text-xs text-[#6b5f55] leading-relaxed">
              Ingresa el total de la boleta (incluyendo propina) y cuántas personas son. Cada uno paga exactamente lo mismo.
            </p>
          </div>

          <Input
            label="Restaurante (opcional)"
            placeholder="Ej: Sushi Edo, La Piojera..."
            value={equalRestaurant}
            onChange={e => setEqualRestaurant(e.target.value)}
          />

          <div className="bg-[#ffffff] border border-[#ece2d5] shadow-[0_6px_18px_rgba(150,100,60,0.07)] rounded-2xl p-4 space-y-4">
            <div>
              <label className="block text-xs font-medium text-[#6b5f55] mb-2 uppercase tracking-wider">
                Total de la boleta (con propina)
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#6b5f55] text-sm font-bold">$</span>
                <input
                  type="number"
                  inputMode="numeric"
                  placeholder="0"
                  value={equalTotal}
                  onChange={e => setEqualTotal(e.target.value)}
                  className="w-full bg-[#f6f1ea] border border-[#e0d4c4] rounded-xl pl-8 pr-4 py-3 text-lg font-bold text-[#1a1614] placeholder-[#9a8d82] focus:outline-none focus:border-[#0bb673]/50 transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#6b5f55] mb-2 uppercase tracking-wider">
                ¿Cuántas personas? (incluido tú)
              </label>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setEqualN(n => String(Math.max(2, parseInt(n) - 1 || 2)))}
                  aria-label="Una persona menos"
                  className="w-11 h-11 rounded-xl bg-[#f6f1ea] border border-[#e0d4c4] flex items-center justify-center text-xl font-bold text-[#6b5f55] hover:text-[#1a1614] hover:border-[#c9b8a4] active:scale-95 transition-all"
                >
                  −
                </button>
                <input
                  type="number"
                  inputMode="numeric"
                  min="2"
                  max="30"
                  value={equalN}
                  onChange={e => setEqualN(e.target.value)}
                  placeholder="2"
                  className="flex-1 bg-[#f6f1ea] border border-[#e0d4c4] rounded-xl px-4 py-3 text-lg font-bold text-[#1a1614] text-center placeholder-[#9a8d82] focus:outline-none focus:border-[#0bb673]/50 transition-colors"
                />
                <button
                  onClick={() => setEqualN(n => String(Math.min(30, parseInt(n) + 1 || 3)))}
                  aria-label="Una persona más"
                  className="w-11 h-11 rounded-xl bg-[#f6f1ea] border border-[#e0d4c4] flex items-center justify-center text-xl font-bold text-[#6b5f55] hover:text-[#1a1614] hover:border-[#c9b8a4] active:scale-95 transition-all"
                >
                  +
                </button>
              </div>
            </div>
          </div>

          {/* Live preview */}
          {totalNum > 0 && nNum >= 2 && (
            <div className="bg-gradient-to-br from-[#7c6cf0]/15 to-[#7c6cf0]/5 border border-[#7c6cf0]/25 rounded-2xl p-4">
              <p className="text-xs text-[#5b4dc7] mb-1">Cada persona paga</p>
              <p className="money text-3xl font-black text-[#1a1614]" style={{ animation: 'pop 0.4s cubic-bezier(0.34,1.56,0.64,1) both' }}>{formatCLP(sharePerPerson)}</p>
              <p className="text-xs text-[#6b5f55] mt-1">
                {formatCLP(totalNum)} ÷ {nNum} personas
              </p>
            </div>
          )}

          <Button
            fullWidth
            onClick={() => setStepEqual('host')}
            disabled={!totalNum || nNum < 2}
            className="mt-auto"
          >
            Continuar <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      )}

      {stepEqual === 'host' && (
        <HostDataForm
          hostName={hostName} setHostName={setHostName}
          hostBank={hostBank} setHostBank={setHostBank}
          hostAccountType={hostAccountType} setHostAccountType={setHostAccountType}
          hostAccount={hostAccount} setHostAccount={setHostAccount}
          hostRut={hostRut} setHostRut={setHostRut}
          hostEmail={hostEmail} setHostEmail={setHostEmail}
          hostPaymentLink={hostPaymentLink} setHostPaymentLink={setHostPaymentLink}
          loading={loading}
          onSubmit={handleCreateEqual}
          submitLabel="Generar link para compartir"
          hint={`Cada persona te transferirá ${formatCLP(sharePerPerson)}`}
        />
      )}
    </div>
  )
}

// ── Shared host data form ─────────────────────────────────────────────────────

function HostDataForm({
  hostName, setHostName,
  hostBank, setHostBank,
  hostAccountType, setHostAccountType,
  hostAccount, setHostAccount,
  hostRut, setHostRut,
  hostEmail, setHostEmail,
  hostPaymentLink, setHostPaymentLink,
  loading, onSubmit, submitLabel, hint,
}: {
  hostName: string; setHostName: (v: string) => void
  hostBank: string; setHostBank: (v: string) => void
  hostAccountType: string; setHostAccountType: (v: string) => void
  hostAccount: string; setHostAccount: (v: string) => void
  hostRut: string; setHostRut: (v: string) => void
  hostEmail: string; setHostEmail: (v: string) => void
  hostPaymentLink: string; setHostPaymentLink: (v: string) => void
  loading: boolean
  onSubmit: () => void
  submitLabel: string
  hint?: string
}) {
  return (
    <div className="flex-1 overflow-y-auto flex flex-col gap-4 pb-8">
      <p className="text-sm text-[#6b5f55] leading-relaxed">
        {hint ?? 'Tus datos de transferencia aparecerán para que los demás sepan a dónde pagarte.'}
        {' '}<span className="text-[#8a7d71]">Los campos con * son obligatorios.</span>
      </p>

      <Input
        label="Tu nombre *"
        placeholder="Ej: Benja, Cami..."
        value={hostName}
        onChange={e => setHostName(e.target.value)}
      />

      <p className="text-xs font-semibold text-[#6b5f55] uppercase tracking-wider pt-1">Para que te transfieran</p>

      <SelectField
        label="Banco"
        value={hostBank}
        onChange={setHostBank}
        placeholder="Selecciona tu banco"
        options={BANKS}
      />

      <SelectField
        label="Tipo de cuenta"
        value={hostAccountType}
        onChange={setHostAccountType}
        placeholder="Selecciona el tipo"
        options={ACCOUNT_TYPES}
      />

      <Input
        label="Nro de cuenta"
        placeholder="Ej: 19438685"
        value={hostAccount}
        onChange={e => setHostAccount(e.target.value)}
        inputMode="numeric"
      />

      <Input
        label="RUT"
        placeholder="12.345.678-9"
        value={hostRut}
        onChange={e => setHostRut(formatRut(e.target.value))}
        inputMode="numeric"
      />

      <Input
        label="Correo (opcional)"
        placeholder="tucorreo@ejemplo.cl"
        value={hostEmail}
        onChange={e => setHostEmail(e.target.value)}
        type="email"
        inputMode="email"
      />

      <div>
        <Input
          label="Link de pago (opcional)"
          placeholder="Mercado Pago, MACH, Fintoc, tu alias…"
          value={hostPaymentLink}
          onChange={e => setHostPaymentLink(e.target.value)}
          inputMode="url"
        />
        <p className="text-xs text-[#9a8d82] mt-1.5 px-0.5">
          Si lo pegas, los demás verán un botón “Pagar ahora” que lo abre directo. Igual mostramos tus datos para transferir desde cualquier banco.
        </p>
      </div>

      <Button fullWidth loading={loading} onClick={onSubmit}>
        {submitLabel}
      </Button>
    </div>
  )
}
