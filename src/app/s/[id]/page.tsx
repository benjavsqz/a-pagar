'use client'
import { use, useState, useRef } from 'react'
import { useSession } from '@/hooks/use-session'
import { usePush } from '@/hooks/use-push'
import { computeParticipantSummary, formatCLP, copyToClipboard } from '@/lib/utils'
import { saveLocalSession, getLocalSession } from '@/lib/local-sessions'
import type { Participant } from '@/types'
import { createClient } from '@/lib/supabase/client'
import { toast, Toaster } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import {
  CheckCircle2, Copy, Upload, Loader2, AlertCircle,
  ArrowRight, Users, CreditCard,
} from 'lucide-react'
import { ItemsClaimList } from '@/components/session/items-claim-list'
import Link from 'next/link'

type Step = 'who' | 'items' | 'transfer' | 'done'

export default function ParticipantPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { data, loading, error, addClaim, removeClaim } = useSession(id)

  const [step, setStep] = useState<Step>('who')
  const [me, setMe] = useState<Participant | null>(null)
  const [nameInput, setNameInput] = useState('')
  const [creating, setCreating] = useState(false)
  const [uploadingComprobante, setUploadingComprobante] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // Subscribe to push notifications once we know who the participant is
  usePush({
    sessionId: id,
    participantId: me?.id,
    role: 'participant',
  })

  // Restore participant from localStorage if returning.
  // Render-phase update (patrón "adjusting state when props change"): corre una
  // sola vez por sesión, así un reload realtime no te saca del paso actual.
  const [restoredFor, setRestoredFor] = useState<string | null>(null)
  if (data && restoredFor !== id) {
    setRestoredFor(id)
    const local = getLocalSession(id)
    if (local?.role === 'participant' && local.participantId) {
      const existing = data.participants.find(p => p.id === local.participantId)
      if (existing) {
        setMe(existing)
        // Check if already paid — skip to done
        const payment = data.payments.find(p => p.participant_id === existing.id)
        setStep(payment ? 'done' : 'items')
      }
    }
  }

  if (loading) return <LoadingScreen />
  if (error || !data) return <ErrorScreen message={error ?? 'Sesión no encontrada'} />

  const { session, items, participants, claims, payments } = data
  const isEqual = session.split_mode === 'equal'

  // ── PASO 1: ¿Quién eres? ───────────────────────────────────────────────────
  if (step === 'who') {
    if (session.status === 'closed') {
      return (
        <ErrorScreen message={`Esta boleta${session.restaurant_name ? ` de ${session.restaurant_name}` : ''} ya fue cerrada por ${session.host_name}.`} />
      )
    }

    const handleJoin = async () => {
      const name = nameInput.trim()
      if (!name) { toast('Ingresa tu nombre', 'error'); return }
      if (participants.some(p => p.name.toLowerCase() === name.toLowerCase())) {
        toast(`Ya hay alguien llamado "${name}" — agrega tu apellido o un apodo`, 'error')
        return
      }
      if (isEqual && session.split_n && participants.length >= session.split_n - 1) {
        toast(`La mesa ya está completa (${session.split_n} personas)`, 'error')
        return
      }
      setCreating(true)
      const supabase = createClient()
      const { data: p, error } = await supabase
        .from('participants')
        .insert({ session_id: id, name })
        .select()
        .single()
      if (error || !p) { toast('Error al unirse', 'error'); setCreating(false); return }

      const participant = p as Participant
      setMe(participant)

      saveLocalSession({
        id,
        role: 'participant',
        restaurantName: session.restaurant_name,
        hostName: session.host_name,
        splitMode: session.split_mode ?? 'items',
        createdAt: session.created_at,
        participantId: participant.id,
        participantName: participant.name,
      })

      setStep(isEqual ? 'transfer' : 'items')
      setCreating(false)
    }

    const existingNames = participants.map(p => p.name)
    const sharePerPerson = isEqual && session.split_total && session.split_n
      ? Math.ceil(session.split_total / session.split_n)
      : 0

    return (
      <div className="min-h-dvh flex flex-col items-center justify-center max-w-sm mx-auto px-5 gap-6">
        <Toaster />
        <div className="pointer-events-none fixed top-0 left-1/2 -translate-x-1/2 w-[500px] h-[300px] bg-[#bff0d8]/45 blur-[100px] rounded-full -z-10" />

        <div className="text-center">
          <div className="flex items-center justify-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-lg bg-[#0bb673] flex items-center justify-center">
              <span className="text-white text-xs font-black leading-none">$</span>
            </div>
            <span className="text-xl font-black tracking-tight">A-Pagar</span>
          </div>
          <h1 className="text-xl font-bold">
            {session.restaurant_name ?? 'Dividiendo la cuenta'}
          </h1>
          <p className="text-sm text-[#6b5f55] mt-1">
            {session.host_name} te invita
            {isEqual ? ' a dividir en partes iguales' : ' a marcar lo que pediste'}
          </p>

          {isEqual && sharePerPerson > 0 && (
            <div className="mt-4 bg-[#7c6cf0]/10 border border-[#7c6cf0]/25 rounded-2xl px-4 py-3">
              <div className="flex items-center justify-center gap-2 mb-1">
                <Users className="w-4 h-4 text-[#7c6cf0]" />
                <span className="text-xs text-[#5b4dc7] font-medium">Tu parte estimada</span>
              </div>
              <p className="money text-2xl font-black text-[#1a1614]">{formatCLP(sharePerPerson)}</p>
              <p className="text-xs text-[#6b5f55] mt-1">
                {formatCLP(session.split_total ?? 0)} ÷ {session.split_n} personas
              </p>
            </div>
          )}
        </div>

        {participants.length > 0 && (
          <div className="w-full">
            <p className="text-xs text-[#6b5f55] mb-2">Ya están adentro:</p>
            <div className="flex flex-wrap gap-2">
              {existingNames.map(name => (
                <span key={name} className="text-xs bg-[#f6f1ea] border border-[#ece2d5] rounded-full px-3 py-1 text-[#4a423b]">
                  {name}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="w-full space-y-3">
          <Input
            label="¿Cómo te llamas?"
            placeholder="Ej: María, Cami, Juanjo..."
            value={nameInput}
            onChange={e => setNameInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleJoin()}
            autoFocus
          />
          <Button fullWidth size="lg" loading={creating} onClick={handleJoin}>
            {isEqual ? 'Entrar y pagar' : 'Entrar'} <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
    )
  }

  if (!me) return <ErrorScreen message="Error cargando tu perfil" />

  const summary = computeParticipantSummary(me, items, claims, payments, session.propina_pct)

  // For equal splits: jump directly to transfer step
  const sharePerPerson = isEqual && session.split_total && session.split_n
    ? Math.ceil(session.split_total / session.split_n)
    : 0
  const myTotal = isEqual ? sharePerPerson : summary.total

  // ── PASO 2: Marcar ítems ───────────────────────────────────────────────────
  if (step === 'items' && !isEqual) {
    return (
      <div className="min-h-dvh flex flex-col max-w-md mx-auto px-4 py-6">
        <Toaster />
        {/* Header */}
        <div className="mb-5">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-6 h-6 rounded-md bg-[#0bb673] flex items-center justify-center">
              <span className="text-white text-[10px] font-black leading-none">$</span>
            </div>
            <span className="text-base font-black tracking-tight text-[#077f4e]">A-Pagar</span>
          </div>
          <h1 className="text-lg font-bold">{session.restaurant_name ?? 'La cuenta'}</h1>
          <p className="text-sm text-[#6b5f55]">
            Marca lo que pediste, {me.name}. ¿Compartiste un plato? Toca <span className="font-medium text-[#077f4e]">Dividir</span> y que el otro también lo tome.
          </p>
        </div>

        {/* Items list */}
        <div className="flex-1">
          <ItemsClaimList
            items={items}
            claims={claims}
            participants={participants}
            meId={me.id}
            open={session.status === 'open'}
            addClaim={addClaim}
            removeClaim={removeClaim}
          />
        </div>

        {/* Sticky total */}
        <div className="sticky bottom-0 pt-4 pb-2 bg-gradient-to-t from-[#fbf3ea] from-70% to-transparent">
          <Card className="p-4 space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-[#6b5f55]">Tu total a pagar</p>
                <p className="money text-2xl font-black text-[#077f4e]">{formatCLP(summary.total)}</p>
                {session.propina_pct > 0 && summary.items.length > 0 && (
                  <p className="text-xs text-[#6b5f55]">
                    {formatCLP(summary.subtotal)} + propina {formatCLP(summary.propina)}
                  </p>
                )}
              </div>
              <div className="text-right text-xs text-[#6b5f55]">
                <p>{summary.items.length} ítem{summary.items.length !== 1 ? 's' : ''}</p>
                <p>de {items.length} en la boleta</p>
              </div>
            </div>
            <Button
              fullWidth
              disabled={summary.items.length === 0}
              onClick={() => setStep('transfer')}
            >
              Ver cómo transferir <ArrowRight className="w-4 h-4" />
            </Button>
          </Card>
        </div>
      </div>
    )
  }

  // ── PASO 3: Transferir ─────────────────────────────────────────────────────
  if (step === 'transfer' || (step === 'items' && isEqual)) {
    const handleCopy = (text: string, label: string) => {
      copyToClipboard(text)
      toast(`${label} copiado 👍`)
    }

    // Parse combined "Banco · Tipo de cuenta" stored in host_bank
    const bankStr = session.host_bank ?? null
    const hasCombined = bankStr?.includes(' · ')
    const bankName = hasCombined ? bankStr!.split(' · ')[0] : bankStr
    const accountType = hasCombined ? bankStr!.split(' · ')[1] : null

    const handleCopyAll = () => {
      const lines = [
        session.host_name && `Nombre: ${session.host_name}`,
        bankName && `Banco: ${bankName}`,
        accountType && `Tipo de cuenta: ${accountType}`,
        session.host_rut && `RUT: ${session.host_rut}`,
        session.host_account && `Nro de cuenta: ${session.host_account}`,
        session.host_email && `Correo: ${session.host_email}`,
        `Monto: ${new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(myTotal)}`,
      ].filter(Boolean).join('\n')
      copyToClipboard(lines)
      toast('Datos copiados 👍')
    }

    const handleComprobanteUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return
      setUploadingComprobante(true)
      try {
        const supabase = createClient()
        const ext = file.name.split('.').pop()
        const path = `${id}/${me.id}.${ext}`
        const { error: uploadError } = await supabase.storage.from('comprobantes').upload(path, file, { upsert: true })
        if (uploadError) throw uploadError
        // Se guarda el PATH (no una URL pública): el bucket es privado y el
        // host genera una signed URL al momento de ver el comprobante
        const { error: payError } = await supabase.from('payments').upsert({
          session_id: id,
          participant_id: me.id,
          amount: myTotal,
          comprobante_url: path,
          paid_at: new Date().toISOString(),
        }, { onConflict: 'session_id,participant_id' })
        if (payError) throw payError
        toast('Comprobante enviado ✓')
        // Notify host
        fetch('/api/push/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: id,
            event: 'payment_received',
            payload: {
              participantName: me.name,
              amount: formatCLP(myTotal),
              url: `/host/${id}`,
            },
          }),
        }).catch(() => {})
        setStep('done')
      } catch (err) {
        console.error(err)
        toast('Error al subir el comprobante', 'error')
      } finally {
        setUploadingComprobante(false)
      }
    }

    const handleMarkAsPaid = async () => {
      setUploadingComprobante(true)
      try {
        const supabase = createClient()
        const { error: payError } = await supabase.from('payments').upsert({
          session_id: id,
          participant_id: me.id,
          amount: myTotal,
          paid_at: new Date().toISOString(),
        }, { onConflict: 'session_id,participant_id' })
        if (payError) throw payError
        // Notify host
        fetch('/api/push/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: id,
            event: 'payment_received',
            payload: {
              participantName: me.name,
              amount: formatCLP(myTotal),
              url: `/host/${id}`,
            },
          }),
        }).catch(() => {})
        setStep('done')
      } catch {
        toast('Error al registrar pago', 'error')
      } finally {
        setUploadingComprobante(false)
      }
    }

    return (
      <div className="min-h-dvh flex flex-col max-w-md mx-auto px-4 py-6 gap-4">
        <Toaster />
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-6 h-6 rounded-md bg-[#0bb673] flex items-center justify-center">
              <span className="text-white text-[10px] font-black leading-none">$</span>
            </div>
            <span className="text-base font-black tracking-tight text-[#077f4e]">A-Pagar</span>
          </div>
          <h1 className="font-display text-xl font-bold">Tu total a pagar</h1>
        </div>

        {/* Total */}
        <Card variant="premium" className="p-4 text-center">
          <p className="text-xs text-[#6b5f55] mb-1">Transferir a {session.host_name}</p>
          <p className="money text-[clamp(1.9rem,9vw,2.25rem)] font-black text-[#077f4e] break-words" style={{ animation: 'pop 0.5s cubic-bezier(0.34,1.56,0.64,1) both' }}>{formatCLP(myTotal)}</p>
          {!isEqual && session.propina_pct > 0 && (
            <p className="text-xs text-[#6b5f55] mt-1">
              {formatCLP(summary.subtotal)} + propina {formatCLP(summary.propina)}
            </p>
          )}
          {isEqual && (
            <p className="text-xs text-[#6b5f55] mt-1">
              1/{session.split_n} del total de {formatCLP(session.split_total ?? 0)}
            </p>
          )}
        </Card>

        {/* Pago de 1 toque — solo si el host dejó un link de pago */}
        {session.host_payment_link && (
          <a
            href={/^https?:\/\//i.test(session.host_payment_link) ? session.host_payment_link : `https://${session.host_payment_link}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 h-14 rounded-full bg-gradient-to-b from-[#0bb673] to-[#089457] text-white font-bold text-base shadow-[0_8px_22px_-6px_rgba(11,182,115,0.55)] active:scale-[0.97] transition-transform"
          >
            <CreditCard className="w-5 h-5" /> Pagar ahora <ArrowRight className="w-4 h-4" />
          </a>
        )}

        {/* Bank details */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm text-[#6b5f55]">Datos para transferir</p>
            <button
              onClick={handleCopyAll}
              className="flex items-center gap-1.5 text-xs text-[#077f4e] hover:text-[#0a8f5c] font-medium transition-colors active:scale-95"
            >
              <Copy className="w-3.5 h-3.5" /> Copiar todo
            </button>
          </div>
          {[
            { label: 'Nombre', value: session.host_name },
            { label: 'Banco', value: bankName },
            { label: 'Tipo de cuenta', value: accountType },
            { label: 'RUT', value: session.host_rut },
            { label: 'Nro de cuenta', value: session.host_account },
            { label: 'Correo', value: session.host_email },
          ].filter(d => d.value).map(({ label, value }) => (
            <button
              key={label}
              onClick={() => handleCopy(value!, label)}
              className="w-full flex items-center justify-between bg-[#ffffff] border border-[#f6f1ea] rounded-xl px-4 py-3 hover:border-[#e0d4c4] active:scale-95 transition-all"
            >
              <div className="text-left">
                <p className="text-xs text-[#6b5f55]">{label}</p>
                <p className="text-sm font-medium">{value}</p>
              </div>
              <Copy className="w-4 h-4 text-[#6b5f55]" />
            </button>
          ))}
        </div>

        {/* Items breakdown — only for per-item mode */}
        {!isEqual && summary.items.length > 0 && (
          <Card className="p-3">
            <p className="text-xs text-[#6b5f55] mb-2">Lo que marcaste</p>
            {summary.items.map(item => (
              <div key={item.id} className="flex justify-between text-sm py-0.5">
                <span className="text-[#4a423b] truncate">{item.name}</span>
                <span className="text-[#6b5f55] shrink-0 ml-2">{formatCLP(item.price_per_person)}</span>
              </div>
            ))}
          </Card>
        )}

        {/* Actions */}
        <div className="space-y-2 mt-auto">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleComprobanteUpload}
          />
          <Button fullWidth size="lg" onClick={() => fileRef.current?.click()} loading={uploadingComprobante}>
            <Upload className="w-4 h-4" /> Adjuntar comprobante
          </Button>
          <Button variant="secondary" fullWidth onClick={handleMarkAsPaid} disabled={uploadingComprobante}>
            Ya transferí (sin comprobante)
          </Button>
          {!isEqual && (
            <button
              onClick={() => setStep('items')}
              className="w-full text-sm text-[#6b5f55] hover:text-[#4a423b] py-2 transition-colors"
            >
              ← Volver a los ítems
            </button>
          )}
        </div>
      </div>
    )
  }

  // ── PASO 4: Listo ──────────────────────────────────────────────────────────
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center max-w-sm mx-auto px-5 gap-6 text-center overflow-hidden">
      <Toaster />

      {/* Success glow */}
      <div className="pointer-events-none fixed inset-0 bg-[#ffd9c7]/40 blur-[120px] -z-10" />

      {/* Sello animado con anillos que se expanden */}
      <div className="relative" style={{ animation: 'pop 0.6s cubic-bezier(0.34,1.56,0.64,1) both' }}>
        <span className="absolute inset-0 rounded-full border border-[#0bb673]/30 animate-ping" style={{ animationDuration: '2s' }} />
        <span className="absolute -inset-3 rounded-full border border-[#0bb673]/15 animate-ping" style={{ animationDuration: '2.6s' }} />
        <div className="relative w-24 h-24 rounded-full bg-[#0bb673]/10 border-2 border-[#0bb673]/30 flex items-center justify-center brand-glow">
          <CheckCircle2 className="w-12 h-12 text-[#077f4e]" />
        </div>
      </div>

      <div style={{ animation: 'fade-up 0.5s cubic-bezier(0.22,1,0.36,1) 0.15s both' }}>
        <h1 className="font-display text-3xl font-black">¡Listo!</h1>
        <p className="text-[#6b5f55] mt-2">
          Le avisamos a {session.host_name} que ya transferiste.
        </p>
        <p className="money text-lg font-bold text-[#1a1614] mt-3">{formatCLP(myTotal)}</p>
        <p className="text-sm text-[#6b5f55]">
          {session.restaurant_name ? `${session.restaurant_name} · ` : ''}{me.name}
        </p>
      </div>

      <div className="w-full space-y-2" style={{ animation: 'fade-up 0.5s cubic-bezier(0.22,1,0.36,1) 0.3s both' }}>
        {!isEqual && (
          <Button variant="secondary" fullWidth onClick={() => setStep('items')}>
            Ver mis ítems
          </Button>
        )}
        <Link href="/" className="block">
          <Button variant="ghost" fullWidth>
            ← Volver al inicio
          </Button>
        </Link>
      </div>
    </div>
  )
}

function LoadingScreen() {
  return (
    <div className="min-h-dvh flex items-center justify-center">
      <Loader2 className="w-8 h-8 text-[#077f4e] animate-spin" />
    </div>
  )
}

function ErrorScreen({ message }: { message: string }) {
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center gap-3 px-4 text-center">
      <AlertCircle className="w-10 h-10 text-[#e5484d]" />
      <p className="font-medium">{message}</p>
      <Link href="/" className="text-sm text-[#6b5f55] hover:text-[#1a1614] transition-colors">← Volver al inicio</Link>
    </div>
  )
}
