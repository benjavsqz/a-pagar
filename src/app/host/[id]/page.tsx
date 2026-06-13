'use client'
import { use, useEffect, useRef, useState } from 'react'
import { useSession } from '@/hooks/use-session'
import { usePush } from '@/hooks/use-push'
import { ComprobanteLink } from '@/components/session/comprobante-link'
import { computeParticipantSummary, formatCLP, generateSessionLink, copyToClipboard } from '@/lib/utils'
import { saveLocalSession } from '@/lib/local-sessions'
import { toast, Toaster } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Share2, CheckCircle2, Clock, AlertCircle, Copy, ExternalLink,
  ChevronDown, ChevronUp, Loader2, ChevronLeft, Users, Utensils,
} from 'lucide-react'
import Link from 'next/link'

export default function HostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { data, loading, error, confirmPayment, closeSession } = useSession(id)
  const [expandedParticipant, setExpandedParticipant] = useState<string | null>(null)
  const [copiedLink, setCopiedLink] = useState(false)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [closing, setClosing] = useState(false)
  const prevPaymentCount = useRef(0)

  // Subscribe to push notifications as host
  usePush({ sessionId: id, role: 'host' })

  // Notify host when payment count increases
  useEffect(() => {
    if (!data) return
    const newCount = data.payments.length
    if (prevPaymentCount.current > 0 && newCount > prevPaymentCount.current) {
      // El más reciente por fecha — el orden del array no está garantizado
      const latest = [...data.payments].sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
      const participant = data.participants.find(p => p.id === latest?.participant_id)
      if (participant) {
        toast(`💸 ${participant.name} transfirió ${formatCLP(latest.amount)}`)
      }
    }
    prevPaymentCount.current = newCount
  }, [data])

  // Save to localStorage when host visits their own session
  useEffect(() => {
    if (!data) return
    const { session } = data
    saveLocalSession({
      id,
      role: 'host',
      restaurantName: session.restaurant_name,
      hostName: session.host_name,
      splitMode: session.split_mode ?? 'items',
      createdAt: session.created_at,
    })
  }, [id, data])

  if (loading) return <LoadingScreen />
  if (error || !data) return <ErrorScreen message={error ?? 'Error cargando sesión'} />

  const { session, items, participants, claims, payments } = data
  const link = generateSessionLink(id)
  const isEqual = session.split_mode === 'equal'

  const handleCopyLink = async () => {
    await copyToClipboard(link)
    setCopiedLink(true)
    toast('Link copiado 👍')
    setTimeout(() => setCopiedLink(false), 2000)
  }

  const handleConfirmPayment = async (participantId: string) => {
    setConfirmingId(participantId)
    const err = await confirmPayment(participantId)
    setConfirmingId(null)

    if (err) {
      toast(`Error al confirmar: ${err}`, 'error')
      return
    }

    toast('Pago confirmado ✓')

    // Send push to participant
    const participant = participants.find(p => p.id === participantId)
    const paymentRec = payments.find(p => p.participant_id === participantId)
    if (participant) {
      fetch('/api/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: id,
          event: 'payment_confirmed',
          payload: {
            participantId,
            participantName: participant.name,
            hostName: session.host_name,
            amount: formatCLP(paymentRec?.amount ?? 0),
            url: `/s/${id}`,
          },
        }),
      }).catch(() => {})
    }
  }

  const handleCloseSession = async () => {
    if (!window.confirm('¿Cerrar esta boleta? Nadie más podrá unirse.')) return
    setClosing(true)
    const err = await closeSession()
    setClosing(false)
    if (err) {
      toast(`Error al cerrar: ${err}`, 'error')
      return
    }
    toast('Boleta cerrada ✓')
  }

  const handleShareWhatsApp = () => {
    const restaurantText = session.restaurant_name ? `de ${session.restaurant_name}` : 'del restaurant'
    const text = isEqual
      ? `¡Hola! Estoy dividiendo la cuenta ${restaurantText} en partes iguales. Cada uno paga ${formatCLP(Math.ceil((session.split_total ?? 0) / (session.split_n ?? 1)))}. Entra acá para transferir: ${link}`
      : `¡Hola! Estoy dividiendo la cuenta ${restaurantText}. Entra acá y marca lo que pediste: ${link}`
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank')
  }

  const summaries = participants.map(p =>
    computeParticipantSummary(p, items, claims, payments, session.propina_pct)
  )

  // For equal split: each participant owes split_total / split_n
  const sharePerPerson = isEqual && session.split_total && session.split_n
    ? Math.ceil(session.split_total / session.split_n)
    : 0

  const billSubtotal = isEqual
    ? (session.split_total ?? 0)
    : items.reduce((sum, i) => sum + i.price, 0)

  const billTotal = isEqual
    ? (session.split_total ?? 0)
    : Math.ceil(billSubtotal * (1 + session.propina_pct / 100))

  const confirmedCount = isEqual
    ? payments.filter(p => p.confirmed_by_host).length
    : summaries.filter(s => s.payment?.confirmed_by_host).length

  const confirmedAmount = isEqual
    ? payments.filter(p => p.confirmed_by_host).reduce((sum, p) => sum + p.amount, 0)
    : summaries.filter(s => s.payment?.confirmed_by_host).reduce((sum, s) => sum + s.total, 0)

  // For equal splits, target is (n-1) shares — host doesn't pay themselves
  const targetToCollect = isEqual
    ? sharePerPerson * Math.max(0, (session.split_n ?? 1) - 1)
    : billTotal

  const progressPct = targetToCollect > 0
    ? Math.min(100, Math.round((confirmedAmount / targetToCollect) * 100))
    : 0

  const pendingCount = participants.length - confirmedCount

  return (
    <div className="min-h-screen flex flex-col max-w-md mx-auto px-4 py-6 gap-5">
      <Toaster />

      {/* Ambient glow */}
      <div className="pointer-events-none fixed top-0 left-1/2 -translate-x-1/2 w-[500px] h-[300px] bg-[#00DF76]/4 blur-[100px] rounded-full -z-10" />

      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Link
            href="/cuenta"
            aria-label="Volver a mis boletas"
            className="p-2 -ml-2 hover:bg-[#18181b] rounded-xl transition-colors text-[#8a8a96] hover:text-white"
          >
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <div className="w-7 h-7 rounded-lg bg-[#00DF76] flex items-center justify-center">
            <span className="text-black text-xs font-black leading-none">$</span>
          </div>
          <span className="text-xl font-black tracking-tight text-[#00DF76]">A-Pagar</span>
          <span className={`text-xs px-2 py-0.5 rounded-full border ml-1 ${
            session.status === 'open'
              ? 'bg-[#00DF76]/10 text-[#00DF76] border-[#00DF76]/20'
              : 'bg-[#18181b] text-[#8a8a96] border-[#2e2e34]'
          }`}>
            {session.status === 'open' ? 'Activa' : 'Cerrada'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {isEqual
            ? <Users className="w-5 h-5 text-[#8b7cff]" />
            : <Utensils className="w-5 h-5 text-[#8a8a96]" />
          }
          <h1 className="font-display text-2xl font-bold">{session.restaurant_name ?? 'Sin nombre'}</h1>
        </div>
        <p className="text-sm text-[#8a8a96] mt-0.5">
          {participants.length} participante{participants.length !== 1 ? 's' : ''} ·{' '}
          {confirmedCount} pagado{confirmedCount !== 1 ? 's' : ''} ·{' '}
          {pendingCount} pendiente{pendingCount !== 1 ? 's' : ''}
          {isEqual && ` · partes iguales`}
        </p>
      </div>

      {/* Equal split info banner */}
      {isEqual && sharePerPerson > 0 && (
        <div className="bg-[#8b7cff]/10 border border-[#8b7cff]/25 rounded-2xl p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-[#8b7cff]/90 font-medium">Cada persona paga</p>
              <p className="money text-2xl font-black text-white">{formatCLP(sharePerPerson)}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-[#8a8a96]">Total boleta</p>
              <p className="money text-sm font-bold text-[#c0c0c8]">{formatCLP(session.split_total ?? 0)}</p>
              <p className="text-xs text-[#76767f]">÷ {session.split_n} personas</p>
            </div>
          </div>
        </div>
      )}

      {/* Payment progress */}
      <Card variant="premium" className="p-4 space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Cobrado</span>
          <span className="money text-sm font-bold">
            <span className="text-[#00DF76]">{formatCLP(confirmedAmount)}</span>
            <span className="text-[#76767f] font-normal"> / {formatCLP(targetToCollect)}</span>
          </span>
        </div>
        <div className="h-2 bg-[#181b20] rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-[#00DF76] to-[#00f08a] rounded-full transition-all duration-700"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <p className="text-xs text-[#8a8a96]">
          {progressPct}% recaudado · {confirmedCount} confirmado{confirmedCount !== 1 ? 's' : ''}
        </p>
      </Card>

      {/* Share link */}
      <Card className="p-4 space-y-3">
        <p className="text-sm text-[#8a8a96]">Comparte el link con los demás</p>
        <div className="flex items-center gap-2 bg-[#111113] border border-[#222226] rounded-xl px-3 py-2">
          <ExternalLink className="w-4 h-4 text-[#8a8a96] shrink-0" />
          <span className="text-xs text-[#8a8a96] flex-1 truncate">{link}</span>
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleCopyLink}
            className={`flex-1 transition-colors ${copiedLink ? 'text-[#00DF76] border-[#00DF76]/30' : ''}`}
          >
            <Copy className="w-4 h-4" /> {copiedLink ? 'Copiado ✓' : 'Copiar'}
          </Button>
          <Button size="sm" onClick={handleShareWhatsApp} className="flex-1">
            <Share2 className="w-4 h-4" /> WhatsApp
          </Button>
        </div>
      </Card>

      {/* Participants */}
      {participants.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-[#8a8a96] text-sm">Esperando que alguien abra el link...</p>
          <p className="text-xs text-[#76767f] mt-1">Esta pantalla se actualiza automáticamente</p>
        </Card>
      ) : (
        <div className="space-y-3">
          <h2 className="text-xs font-semibold text-[#8a8a96] uppercase tracking-wider">Participantes</h2>
          {isEqual
            ? participants.map(p => {
                const payment = payments.find(pay => pay.participant_id === p.id) ?? null
                return (
                  <EqualParticipantCard
                    key={p.id}
                    name={p.name}
                    amount={sharePerPerson}
                    payment={payment}
                    expanded={expandedParticipant === p.id}
                    onToggle={() => setExpandedParticipant(expandedParticipant === p.id ? null : p.id)}
                    onConfirm={() => handleConfirmPayment(p.id)}
                    isConfirming={confirmingId === p.id}
                  />
                )
              })
            : summaries.map(s => (
                <ParticipantCard
                  key={s.participant.id}
                  summary={s}
                  propinaPct={session.propina_pct}
                  expanded={expandedParticipant === s.participant.id}
                  onToggle={() =>
                    setExpandedParticipant(expandedParticipant === s.participant.id ? null : s.participant.id)
                  }
                  onConfirm={() => handleConfirmPayment(s.participant.id)}
                  isConfirming={confirmingId === s.participant.id}
                />
              ))
          }
        </div>
      )}

      {/* Bill summary */}
      {!isEqual && (
        <Card className="p-4">
          <div className="flex justify-between items-center">
            <span className="text-sm text-[#8a8a96]">Subtotal boleta</span>
            <span className="font-medium">{formatCLP(billSubtotal)}</span>
          </div>
          {session.propina_pct > 0 && (
            <div className="flex justify-between items-center mt-1">
              <span className="text-sm text-[#8a8a96]">+ Propina {session.propina_pct}%</span>
              <span className="text-sm text-[#8a8a96]">{formatCLP(billTotal - billSubtotal)}</span>
            </div>
          )}
          <div className="flex justify-between items-center mt-2 pt-2 border-t border-[#18181b]">
            <span className="text-sm font-semibold">Total</span>
            <span className="font-bold text-[#00DF76]">{formatCLP(billTotal)}</span>
          </div>
        </Card>
      )}

      {/* Close session */}
      {session.status === 'open' && (
        <Button
          variant="secondary"
          fullWidth
          loading={closing}
          onClick={handleCloseSession}
        >
          Cerrar boleta
        </Button>
      )}
    </div>
  )
}

// ── Equal split participant card ──────────────────────────────────────────────

function EqualParticipantCard({
  name, amount, payment, expanded, onToggle, onConfirm, isConfirming,
}: {
  name: string
  amount: number
  payment: { confirmed_by_host: boolean; comprobante_url?: string | null } | null
  expanded: boolean
  onToggle: () => void
  onConfirm: () => void
  isConfirming: boolean
}) {
  const isPaid = !!payment
  const isConfirmed = payment?.confirmed_by_host ?? false

  const statusColor = isConfirmed ? 'text-[#00DF76]' : isPaid ? 'text-yellow-500' : 'text-[#8a8a96]'
  const StatusIcon = isConfirmed ? CheckCircle2 : isPaid ? Clock : Clock
  const statusLabel = isConfirmed ? 'Pagado ✓' : isPaid ? 'Transferido — confirmar' : 'Pendiente'

  return (
    <Card className="overflow-hidden">
      <button className="w-full p-4 flex items-center gap-3 text-left" onClick={onToggle}>
        <div className="w-9 h-9 rounded-full bg-[#18181b] flex items-center justify-center font-bold text-sm shrink-0">
          {name.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium">{name}</span>
            <StatusIcon className={`w-4 h-4 ${statusColor}`} />
          </div>
          <p className="text-xs text-[#8a8a96] truncate">{statusLabel}</p>
        </div>
        <div className="text-right shrink-0 flex flex-col items-end">
          <p className="money font-bold text-sm">{formatCLP(amount)}</p>
          {expanded ? <ChevronUp className="w-4 h-4 text-[#8a8a96]" /> : <ChevronDown className="w-4 h-4 text-[#8a8a96]" />}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-[#18181b] pt-3 space-y-2">
          <div className="flex justify-between font-bold text-sm">
            <span>Su parte</span>
            <span className="text-[#00DF76]">{formatCLP(amount)}</span>
          </div>
          {payment?.comprobante_url && (
            <ComprobanteLink value={payment.comprobante_url} />
          )}
          {isPaid && !isConfirmed && (
            <Button size="sm" fullWidth onClick={onConfirm} loading={isConfirming} className="mt-2">
              <CheckCircle2 className="w-4 h-4" /> Confirmar pago recibido
            </Button>
          )}
          {isConfirmed && (
            <div className="flex items-center gap-2 text-[#00DF76] text-sm mt-2">
              <CheckCircle2 className="w-4 h-4" /> Pago confirmado
            </div>
          )}
        </div>
      )}
    </Card>
  )
}

// ── Items participant card ────────────────────────────────────────────────────

function ParticipantCard({
  summary, propinaPct, expanded, onToggle, onConfirm, isConfirming,
}: {
  summary: ReturnType<typeof computeParticipantSummary>
  propinaPct: number
  expanded: boolean
  onToggle: () => void
  onConfirm: () => void
  isConfirming: boolean
}) {
  const { participant, items, total, payment } = summary
  const hasMarked = items.length > 0
  const isPaid = !!payment
  const isConfirmed = payment?.confirmed_by_host ?? false

  const statusColor = isConfirmed ? 'text-[#00DF76]' : isPaid ? 'text-yellow-500' : 'text-[#8a8a96]'
  const StatusIcon = isConfirmed ? CheckCircle2 : isPaid ? Clock : hasMarked ? AlertCircle : Clock
  const statusLabel = isConfirmed
    ? 'Pagado ✓'
    : isPaid
    ? 'Transferido — confirmar'
    : hasMarked
    ? 'Marcó ítems — sin transferir'
    : 'Sin abrir el link'

  return (
    <Card className="overflow-hidden">
      <button className="w-full p-4 flex items-center gap-3 text-left" onClick={onToggle}>
        <div className="w-9 h-9 rounded-full bg-[#18181b] flex items-center justify-center font-bold text-sm shrink-0">
          {participant.name.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium">{participant.name}</span>
            <StatusIcon className={`w-4 h-4 ${statusColor}`} />
          </div>
          <p className="text-xs text-[#8a8a96] truncate">{statusLabel}</p>
        </div>
        <div className="text-right shrink-0 flex flex-col items-end">
          <p className="money font-bold text-sm">{formatCLP(total)}</p>
          {expanded ? <ChevronUp className="w-4 h-4 text-[#8a8a96]" /> : <ChevronDown className="w-4 h-4 text-[#8a8a96]" />}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-[#18181b] pt-3 space-y-2">
          {items.length === 0 ? (
            <p className="text-xs text-[#8a8a96]">No ha marcado nada aún.</p>
          ) : (
            items.map(item => (
              <div key={item.id} className="flex justify-between text-sm">
                <span className="text-[#c0c0c8]">{item.name}</span>
                <span className="text-[#8a8a96]">
                  {formatCLP(item.price_per_person)}
                  {item.claims.length > 1 && <span className="text-xs text-[#76767f] ml-1">÷{item.claims.length}</span>}
                </span>
              </div>
            ))
          )}
          {propinaPct > 0 && items.length > 0 && (
            <div className="flex justify-between text-sm border-t border-[#18181b] pt-2 text-[#8a8a96]">
              <span>Propina {propinaPct}%</span>
              <span>{formatCLP(summary.propina)}</span>
            </div>
          )}
          <div className="flex justify-between font-bold text-sm">
            <span>Total</span>
            <span className="text-[#00DF76]">{formatCLP(total)}</span>
          </div>
          {payment?.comprobante_url && (
            <div className="mt-2">
              <ComprobanteLink value={payment.comprobante_url} />
            </div>
          )}
          {isPaid && !isConfirmed && (
            <Button size="sm" fullWidth onClick={onConfirm} loading={isConfirming} className="mt-2">
              <CheckCircle2 className="w-4 h-4" /> Confirmar pago recibido
            </Button>
          )}
          {isConfirmed && (
            <div className="flex items-center gap-2 text-[#00DF76] text-sm mt-2">
              <CheckCircle2 className="w-4 h-4" /> Pago confirmado
            </div>
          )}
        </div>
      )}
    </Card>
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
