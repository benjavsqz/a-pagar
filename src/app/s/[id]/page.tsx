'use client'
import { use, useState, useRef, useEffect } from 'react'
import { useSession } from '@/hooks/use-session'
import { computeParticipantSummary, formatCLP, copyToClipboard } from '@/lib/utils'
import { saveLocalSession, getLocalSession } from '@/lib/local-sessions'
import type { Participant } from '@/types'
import { createClient } from '@/lib/supabase/client'
import { toast, Toaster } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import {
  CheckCircle2, Circle, Copy, Upload, Loader2, AlertCircle,
  ArrowRight, Users, ChevronLeft,
} from 'lucide-react'
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

  // Restore participant from localStorage if returning
  useEffect(() => {
    if (!data) return
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
  }, [id, data])

  if (loading) return <LoadingScreen />
  if (error || !data) return <ErrorScreen message={error ?? 'Sesión no encontrada'} />

  const { session, items, participants, claims, payments } = data
  const isEqual = session.split_mode === 'equal'

  // ── PASO 1: ¿Quién eres? ───────────────────────────────────────────────────
  if (step === 'who') {
    const handleJoin = async () => {
      if (!nameInput.trim()) { toast('Ingresa tu nombre', 'error'); return }
      setCreating(true)
      const supabase = createClient()
      const { data: p, error } = await supabase
        .from('participants')
        .insert({ session_id: id, name: nameInput.trim() })
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
      <div className="min-h-screen flex flex-col items-center justify-center max-w-sm mx-auto px-5 gap-6">
        <Toaster />
        <div className="pointer-events-none fixed top-0 left-1/2 -translate-x-1/2 w-[500px] h-[300px] bg-[#00DF76]/4 blur-[100px] rounded-full -z-10" />

        <div className="text-center">
          <div className="flex items-center justify-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-lg bg-[#00DF76] flex items-center justify-center">
              <span className="text-black text-xs font-black leading-none">$</span>
            </div>
            <span className="text-xl font-black tracking-tight">A-Pagar</span>
          </div>
          <h1 className="text-xl font-bold">
            {session.restaurant_name ?? 'Dividiendo la cuenta'}
          </h1>
          <p className="text-sm text-[#8a8a96] mt-1">
            {session.host_name} te invita
            {isEqual ? ' a dividir en partes iguales' : ' a marcar lo que pediste'}
          </p>

          {isEqual && sharePerPerson > 0 && (
            <div className="mt-4 bg-[#8b5cf6]/10 border border-[#8b5cf6]/25 rounded-2xl px-4 py-3">
              <div className="flex items-center justify-center gap-2 mb-1">
                <Users className="w-4 h-4 text-[#8b5cf6]" />
                <span className="text-xs text-[#8b5cf6]/80 font-medium">Tu parte estimada</span>
              </div>
              <p className="text-2xl font-black text-white">{formatCLP(sharePerPerson)}</p>
              <p className="text-xs text-[#4a4a54] mt-1">
                {formatCLP(session.split_total ?? 0)} ÷ {session.split_n} personas
              </p>
            </div>
          )}
        </div>

        {participants.length > 0 && (
          <div className="w-full">
            <p className="text-xs text-[#8a8a96] mb-2">Ya están adentro:</p>
            <div className="flex flex-wrap gap-2">
              {existingNames.map(name => (
                <span key={name} className="text-xs bg-[#18181b] border border-[#222226] rounded-full px-3 py-1 text-[#c0c0c8]">
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

  const myClaimedItemIds = new Set(
    claims.filter(c => c.participant_id === me.id).map(c => c.item_id)
  )
  const summary = computeParticipantSummary(me, items, claims, payments, session.propina_pct)

  // For equal splits: jump directly to transfer step
  const sharePerPerson = isEqual && session.split_total && session.split_n
    ? Math.ceil(session.split_total / session.split_n)
    : 0
  const myTotal = isEqual ? sharePerPerson : summary.total

  // ── PASO 2: Marcar ítems ───────────────────────────────────────────────────
  if (step === 'items' && !isEqual) {
    const itemGroups: Array<{ name: string; units: typeof items }> = Object.values(
      items.reduce((map, item) => {
        if (!map[item.name]) map[item.name] = { name: item.name, units: [] }
        map[item.name].units.push(item)
        return map
      }, {} as Record<string, { name: string; units: typeof items }>)
    )

    const handleToggle = async (groupUnits: typeof items) => {
      const myUnit = groupUnits.find(u => myClaimedItemIds.has(u.id))
      if (myUnit) {
        await removeClaim(myUnit.id, me.id)
      } else {
        const unclaimed = groupUnits.find(u => !claims.some(c => c.item_id === u.id))
        await addClaim((unclaimed ?? groupUnits[0]).id, me.id)
      }
    }

    return (
      <div className="min-h-screen flex flex-col max-w-md mx-auto px-4 py-6">
        <Toaster />
        {/* Header */}
        <div className="mb-5">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-6 h-6 rounded-md bg-[#00DF76] flex items-center justify-center">
              <span className="text-black text-[10px] font-black leading-none">$</span>
            </div>
            <span className="text-base font-black tracking-tight text-[#00DF76]">A-Pagar</span>
          </div>
          <h1 className="text-lg font-bold">{session.restaurant_name ?? 'La cuenta'}</h1>
          <p className="text-sm text-[#8a8a96]">Marca lo que pediste, {me.name}</p>
        </div>

        {/* Items list */}
        <div className="flex-1 space-y-2">
          {itemGroups.map(({ name, units }) => {
            const isMulti = units.length > 1
            const isMine = units.some(u => myClaimedItemIds.has(u.id))

            if (!isMulti) {
              const item = units[0]
              const itemClaims = claims.filter(c => c.item_id === item.id)
              const claimers = participants.filter(p => itemClaims.some(c => c.participant_id === p.id))
              const pricePerPerson = itemClaims.length > 0
                ? Math.ceil(item.price / itemClaims.length)
                : item.price

              return (
                <button
                  key={item.id}
                  onClick={() => handleToggle(units)}
                  className={`w-full flex items-center gap-3 p-3.5 rounded-2xl border transition-all active:scale-95 ${
                    isMine
                      ? 'bg-[#00DF76]/10 border-[#00DF76]/40'
                      : 'bg-[#111113] border-[#18181b] hover:border-[#2e2e34]'
                  }`}
                >
                  {isMine
                    ? <CheckCircle2 className="w-5 h-5 text-[#00DF76] shrink-0" />
                    : <Circle className="w-5 h-5 text-[#4a4a54] shrink-0" />
                  }
                  <div className="flex-1 text-left min-w-0">
                    <p className={`text-sm font-medium truncate ${isMine ? 'text-white' : 'text-[#c0c0c8]'}`}>
                      {item.name}
                    </p>
                    {claimers.length > 1 && (
                      <p className="text-xs text-[#8a8a96] mt-0.5">
                        Compartido con {claimers.filter(p => p.id !== me.id).map(p => p.name).join(', ')}
                      </p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`text-sm font-bold ${isMine ? 'text-[#00DF76]' : 'text-[#8a8a96]'}`}>
                      {formatCLP(pricePerPerson)}
                    </p>
                    {itemClaims.length > 1 && <p className="text-xs text-[#4a4a54]">÷ {itemClaims.length}</p>}
                  </div>
                </button>
              )
            }

            const unitPrice = units[0].price
            const myUnit = units.find(u => myClaimedItemIds.has(u.id))

            return (
              <button
                key={name}
                onClick={() => handleToggle(units)}
                className={`w-full text-left p-3.5 rounded-2xl border transition-all active:scale-95 ${
                  isMine
                    ? 'bg-[#00DF76]/10 border-[#00DF76]/40'
                    : 'bg-[#111113] border-[#18181b] hover:border-[#2e2e34]'
                }`}
              >
                <div className="flex items-center gap-3">
                  {isMine
                    ? <CheckCircle2 className="w-5 h-5 text-[#00DF76] shrink-0" />
                    : <Circle className="w-5 h-5 text-[#4a4a54] shrink-0" />
                  }
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate ${isMine ? 'text-white' : 'text-[#c0c0c8]'}`}>
                      {name}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-xs font-semibold bg-[#222226] text-[#8a8a96] px-2 py-0.5 rounded-full">×{units.length}</span>
                    <p className={`text-sm font-bold mt-0.5 ${isMine ? 'text-[#00DF76]' : 'text-[#8a8a96]'}`}>
                      {formatCLP(unitPrice)} c/u
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-2.5 ml-8">
                  {units.map((unit, idx) => {
                    const unitClaims = claims.filter(c => c.item_id === unit.id)
                    const unitClaimers = participants.filter(p => unitClaims.some(c => c.participant_id === p.id))
                    const isMyUnit = myUnit?.id === unit.id
                    const isShared = unitClaims.length > 1
                    const chipLabel = isMyUnit
                      ? 'Tú' + (isShared ? ` + ${unitClaimers.filter(p => p.id !== me.id).map(p => p.name.split(' ')[0]).join('+')}` : '')
                      : unitClaimers.length > 0
                      ? unitClaimers.map(p => p.name.split(' ')[0]).join('+')
                      : `Libre ${idx + 1}`

                    return (
                      <span
                        key={unit.id}
                        className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                          isMyUnit
                            ? 'bg-[#00DF76] text-black'
                            : unitClaimers.length > 0
                            ? 'bg-[#222226] text-[#c0c0c8]'
                            : 'border border-dashed border-[#2e2e34] text-[#4a4a54]'
                        }`}
                      >
                        {chipLabel}
                      </span>
                    )
                  })}
                </div>
              </button>
            )
          })}
        </div>

        {/* Sticky total */}
        <div className="sticky bottom-0 pt-4 pb-2 bg-gradient-to-t from-[#080809] from-70% to-transparent">
          <Card className="p-4 space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-[#8a8a96]">Tu total a pagar</p>
                <p className="text-2xl font-black text-[#00DF76]">{formatCLP(summary.total)}</p>
                {session.propina_pct > 0 && summary.items.length > 0 && (
                  <p className="text-xs text-[#8a8a96]">
                    {formatCLP(summary.subtotal)} + propina {formatCLP(summary.propina)}
                  </p>
                )}
              </div>
              <div className="text-right text-xs text-[#8a8a96]">
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

    const handleCopyAll = () => {
      const lines = [
        session.host_name && `Nombre: ${session.host_name}`,
        session.host_bank && `Banco: ${session.host_bank}`,
        session.host_rut && `RUT: ${session.host_rut}`,
        session.host_account && `Cuenta: ${session.host_account}`,
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
        const { data: urlData } = supabase.storage.from('comprobantes').getPublicUrl(path)
        await supabase.from('payments').upsert({
          session_id: id,
          participant_id: me.id,
          amount: myTotal,
          comprobante_url: urlData.publicUrl,
          paid_at: new Date().toISOString(),
        })
        toast('Comprobante enviado ✓')
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
        await supabase.from('payments').upsert({
          session_id: id,
          participant_id: me.id,
          amount: myTotal,
          paid_at: new Date().toISOString(),
        })
        setStep('done')
      } catch {
        toast('Error al registrar pago', 'error')
      } finally {
        setUploadingComprobante(false)
      }
    }

    return (
      <div className="min-h-screen flex flex-col max-w-md mx-auto px-4 py-6 gap-4">
        <Toaster />
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-6 h-6 rounded-md bg-[#00DF76] flex items-center justify-center">
              <span className="text-black text-[10px] font-black leading-none">$</span>
            </div>
            <span className="text-base font-black tracking-tight text-[#00DF76]">A-Pagar</span>
          </div>
          <h1 className="text-xl font-bold">Tu total a pagar</h1>
        </div>

        {/* Total */}
        <Card className="p-4 text-center">
          <p className="text-xs text-[#8a8a96] mb-1">Transferir a {session.host_name}</p>
          <p className="text-4xl font-black text-[#00DF76]">{formatCLP(myTotal)}</p>
          {!isEqual && session.propina_pct > 0 && (
            <p className="text-xs text-[#8a8a96] mt-1">
              {formatCLP(summary.subtotal)} + propina {formatCLP(summary.propina)}
            </p>
          )}
          {isEqual && (
            <p className="text-xs text-[#8a8a96] mt-1">
              1/{session.split_n} del total de {formatCLP(session.split_total ?? 0)}
            </p>
          )}
        </Card>

        {/* Bank details */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm text-[#8a8a96]">Datos para transferir</p>
            <button
              onClick={handleCopyAll}
              className="flex items-center gap-1.5 text-xs text-[#00DF76] hover:text-[#00b868] font-medium transition-colors active:scale-95"
            >
              <Copy className="w-3.5 h-3.5" /> Copiar todo
            </button>
          </div>
          {[
            { label: 'Nombre', value: session.host_name },
            { label: 'Banco', value: session.host_bank },
            { label: 'RUT', value: session.host_rut },
            { label: 'Cuenta', value: session.host_account },
          ].filter(d => d.value).map(({ label, value }) => (
            <button
              key={label}
              onClick={() => handleCopy(value!, label)}
              className="w-full flex items-center justify-between bg-[#111113] border border-[#18181b] rounded-xl px-4 py-3 hover:border-[#2e2e34] active:scale-95 transition-all"
            >
              <div className="text-left">
                <p className="text-xs text-[#8a8a96]">{label}</p>
                <p className="text-sm font-medium">{value}</p>
              </div>
              <Copy className="w-4 h-4 text-[#8a8a96]" />
            </button>
          ))}
        </div>

        {/* Items breakdown — only for per-item mode */}
        {!isEqual && summary.items.length > 0 && (
          <Card className="p-3">
            <p className="text-xs text-[#8a8a96] mb-2">Lo que marcaste</p>
            {summary.items.map(item => (
              <div key={item.id} className="flex justify-between text-sm py-0.5">
                <span className="text-[#c0c0c8] truncate">{item.name}</span>
                <span className="text-[#8a8a96] shrink-0 ml-2">{formatCLP(item.price_per_person)}</span>
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
              className="w-full text-sm text-[#8a8a96] hover:text-[#c0c0c8] py-2 transition-colors"
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
    <div className="min-h-screen flex flex-col items-center justify-center max-w-sm mx-auto px-5 gap-6 text-center">
      <Toaster />

      {/* Success glow */}
      <div className="pointer-events-none fixed inset-0 bg-[#00DF76]/4 blur-[120px] -z-10" />

      <div className="w-24 h-24 rounded-full bg-[#00DF76]/10 border-2 border-[#00DF76]/30 flex items-center justify-center">
        <CheckCircle2 className="w-12 h-12 text-[#00DF76]" />
      </div>

      <div>
        <h1 className="text-3xl font-black">¡Listo!</h1>
        <p className="text-[#8a8a96] mt-2">
          Le avisamos a {session.host_name} que ya transferiste.
        </p>
        <p className="text-lg font-bold text-white mt-3">{formatCLP(myTotal)}</p>
        <p className="text-sm text-[#4a4a54]">
          {session.restaurant_name ? `${session.restaurant_name} · ` : ''}{me.name}
        </p>
      </div>

      <div className="w-full space-y-2">
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
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="w-8 h-8 text-[#00DF76] animate-spin" />
    </div>
  )
}

function ErrorScreen({ message }: { message: string }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3 px-4 text-center">
      <AlertCircle className="w-10 h-10 text-red-500" />
      <p className="font-medium">{message}</p>
      <Link href="/" className="text-sm text-[#8a8a96] hover:text-white transition-colors">← Volver al inicio</Link>
    </div>
  )
}
