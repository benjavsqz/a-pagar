'use client'
import { use, useEffect, useRef, useState } from 'react'
import { useSession } from '@/hooks/use-session'
import { usePush } from '@/hooks/use-push'
import { ComprobanteLink } from '@/components/session/comprobante-link'
import { ItemsClaimList } from '@/components/session/items-claim-list'
import { computeParticipantSummary, formatCLP, generateSessionLink, copyToClipboard } from '@/lib/utils'
import { saveLocalSession } from '@/lib/local-sessions'
import { toast, Toaster } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Share2, CheckCircle2, Clock, AlertCircle, Copy, ExternalLink,
  ChevronDown, ChevronUp, Loader2, ChevronLeft, Users, Utensils, Bell,
} from 'lucide-react'
import Link from 'next/link'

export default function HostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { data, loading, error, confirmPayment, closeSession, addClaim, removeClaim } = useSession(id)
  const [expandedParticipant, setExpandedParticipant] = useState<string | null>(null)
  const [copiedLink, setCopiedLink] = useState(false)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [closing, setClosing] = useState(false)
  const [showMyItems, setShowMyItems] = useState(false)
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

  // El host es un participante marcado is_host: marca su consumo (cuenta para
  // dividir ÷N) pero NO se le cobra ni aparece en la lista de quienes deben pagar.
  const hostParticipant = participants.find(p => p.is_host) ?? null
  const guests = participants.filter(p => !p.is_host)

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

  const summaries = guests.map(p =>
    computeParticipantSummary(p, items, claims, payments, session.propina_pct)
  )

  // Lo que el propio host marcó (para resumen "tu consumo no se cobra")
  const hostSummary = hostParticipant
    ? computeParticipantSummary(hostParticipant, items, claims, payments, session.propina_pct)
    : null

  // Recordatorio al grupo: lista de quienes aún no transfieren + montos + link.
  // No guardamos teléfonos, así que abre WhatsApp para enviarlo al chat del grupo.
  const handleRemindPending = () => {
    const pending = isEqual
      ? guests
          .filter(p => !payments.some(pay => pay.participant_id === p.id))
          .map(p => ({ name: p.name, amount: sharePerPerson }))
      : summaries
          .filter(s => !s.payment)
          .map(s => ({ name: s.participant.name, amount: s.total }))

    if (pending.length === 0) return
    const restaurantText = session.restaurant_name ? ` de ${session.restaurant_name}` : ''
    const lines = pending
      .map(p => p.amount > 0 ? `• ${p.name}: ${formatCLP(p.amount)}` : `• ${p.name}: aún sin marcar lo suyo`)
      .join('\n')
    const text = `¡Hola! 🧾 Recordatorio de la cuenta${restaurantText} — aún faltan por transferir:\n${lines}\n\nPaguen su parte acá 👉 ${link}`
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank')
  }

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

  // Lo que el host espera cobrar = lo que los DEMÁS deben.
  // - Partes iguales: (n-1) cuotas (el host no se cobra a sí mismo)
  // - Por ítems: la suma de lo que marcaron los participantes (lo que el host
  //   consumió queda sin reclamar y no se cobra → así el progreso sí llega a 100%)
  const claimedTotal = summaries.reduce((sum, s) => sum + s.total, 0)
  const targetToCollect = isEqual
    ? sharePerPerson * Math.max(0, (session.split_n ?? 1) - 1)
    : claimedTotal

  const progressPct = targetToCollect > 0
    ? Math.min(100, Math.round((confirmedAmount / targetToCollect) * 100))
    : 0

  const pendingCount = guests.length - confirmedCount

  // Cuántos aún no han transferido (sin registro de pago)
  const unpaidCount = isEqual
    ? guests.filter(p => !payments.some(pay => pay.participant_id === p.id)).length
    : summaries.filter(s => !s.payment).length

  return (
    <div className="min-h-dvh flex flex-col max-w-md mx-auto px-4 py-6 gap-5">
      <Toaster />

      {/* Ambient glow */}
      <div className="pointer-events-none fixed top-0 left-1/2 -translate-x-1/2 w-[500px] h-[300px] bg-[#bff0d8]/45 blur-[100px] rounded-full -z-10" />

      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Link
            href="/cuenta"
            aria-label="Volver a mis boletas"
            className="p-2 -ml-2 hover:bg-[#f6f1ea] rounded-xl transition-colors text-[#6b5f55] hover:text-[#1a1614]"
          >
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <div className="w-7 h-7 rounded-lg bg-[#0bb673] flex items-center justify-center">
            <span className="text-white text-xs font-black leading-none">$</span>
          </div>
          <span className="text-xl font-black tracking-tight text-[#077f4e]">A-Pagar</span>
          <span className={`text-xs px-2 py-0.5 rounded-full border ml-1 ${
            session.status === 'open'
              ? 'bg-[#0bb673]/10 text-[#077f4e] border-[#0bb673]/20'
              : 'bg-[#f6f1ea] text-[#6b5f55] border-[#e0d4c4]'
          }`}>
            {session.status === 'open' ? 'Activa' : 'Cerrada'}
          </span>
        </div>

        <div className="flex items-center gap-2.5">
          <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${isEqual ? 'bg-[#eeebfd]' : 'bg-[#e7f9f0]'}`}>
            {isEqual
              ? <Users className="w-4 h-4 text-[#5b4dc7]" />
              : <Utensils className="w-4 h-4 text-[#077f4e]" />
            }
          </div>
          <h1 className="font-display text-2xl font-bold">{session.restaurant_name ?? 'Sin nombre'}</h1>
        </div>
        <p className="text-sm text-[#6b5f55] mt-0.5">
          {guests.length} participante{guests.length !== 1 ? 's' : ''} ·{' '}
          {confirmedCount} pagado{confirmedCount !== 1 ? 's' : ''} ·{' '}
          {pendingCount} pendiente{pendingCount !== 1 ? 's' : ''}
          {isEqual && ` · partes iguales`}
        </p>
      </div>

      {/* Equal split info banner */}
      {isEqual && sharePerPerson > 0 && (
        <div className="bg-[#7c6cf0]/10 border border-[#7c6cf0]/25 rounded-2xl p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-[#5b4dc7] font-medium">Cada persona paga</p>
              <p className="money text-2xl font-black text-[#1a1614]">{formatCLP(sharePerPerson)}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-[#6b5f55]">Total boleta</p>
              <p className="money text-sm font-bold text-[#4a423b]">{formatCLP(session.split_total ?? 0)}</p>
              <p className="text-xs text-[#6b5f55]">÷ {session.split_n} personas</p>
            </div>
          </div>
        </div>
      )}

      {/* Payment progress */}
      <Card variant="premium" className="p-4 space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Cobrado</span>
          <span className="money text-sm font-bold">
            <span className="text-[#077f4e]">{formatCLP(confirmedAmount)}</span>
            <span className="text-[#6b5f55] font-normal"> / {formatCLP(targetToCollect)}</span>
          </span>
        </div>
        <div className="h-2 bg-[#f6f1ea] rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-[#0bb673] to-[#0cc47c] rounded-full transition-all duration-700"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <p className="text-xs text-[#6b5f55]">
          {progressPct}% recaudado · {confirmedCount} confirmado{confirmedCount !== 1 ? 's' : ''}
        </p>
      </Card>

      {/* Share link */}
      <Card className="p-4 space-y-3">
        <p className="text-sm text-[#6b5f55]">Comparte el link con los demás</p>
        <div className="flex items-center gap-2 bg-[#ffffff] border border-[#ece2d5] shadow-[0_6px_18px_rgba(150,100,60,0.07)] rounded-xl px-3 py-2">
          <ExternalLink className="w-4 h-4 text-[#6b5f55] shrink-0" />
          <span className="text-xs text-[#6b5f55] flex-1 truncate">{link}</span>
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleCopyLink}
            className={`flex-1 transition-colors ${copiedLink ? 'text-[#077f4e] border-[#0bb673]/30' : ''}`}
          >
            <Copy className="w-4 h-4" /> {copiedLink ? 'Copiado ✓' : 'Copiar'}
          </Button>
          <Button size="sm" onClick={handleShareWhatsApp} className="flex-1">
            <Share2 className="w-4 h-4" /> WhatsApp
          </Button>
        </div>
      </Card>

      {/* Mis ítems — el host marca lo que consumió (solo modo por ítems) */}
      {!isEqual && hostParticipant && (
        <Card className="overflow-hidden">
          <button
            onClick={() => setShowMyItems(v => !v)}
            className="w-full p-4 flex items-center gap-3 text-left"
          >
            <div className="w-9 h-9 rounded-xl bg-[#e7f9f0] flex items-center justify-center shrink-0">
              <Utensils className="w-4 h-4 text-[#077f4e]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm">Lo que consumí yo</p>
              <p className="text-xs text-[#6b5f55] truncate">
                {hostSummary && hostSummary.items.length > 0
                  ? `${hostSummary.items.length} ítem${hostSummary.items.length !== 1 ? 's' : ''} · ${formatCLP(hostSummary.total)} — no se te cobra`
                  : 'Marca tus platos para repartir bien los compartidos'}
              </p>
            </div>
            {showMyItems
              ? <ChevronUp className="w-4 h-4 text-[#6b5f55] shrink-0" />
              : <ChevronDown className="w-4 h-4 text-[#6b5f55] shrink-0" />}
          </button>
          {showMyItems && (
            <div className="px-4 pb-4 border-t border-[#f6f1ea] pt-3">
              {items.length === 0 ? (
                <p className="text-xs text-[#6b5f55]">No hay ítems en esta boleta.</p>
              ) : (
                <ItemsClaimList
                  items={items}
                  claims={claims}
                  participants={participants}
                  meId={hostParticipant.id}
                  open={session.status === 'open'}
                  addClaim={addClaim}
                  removeClaim={removeClaim}
                />
              )}
            </div>
          )}
        </Card>
      )}

      {/* Participants */}
      {guests.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-[#6b5f55] text-sm">Esperando que alguien abra el link...</p>
          <p className="text-xs text-[#6b5f55] mt-1">Esta pantalla se actualiza automáticamente</p>
        </Card>
      ) : (
        <div className="space-y-3">
          <h2 className="text-xs font-semibold text-[#6b5f55] uppercase tracking-wider">Participantes</h2>
          <div className="space-y-3 stagger">
          {isEqual
            ? guests.map(p => {
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
        </div>
      )}

      {/* Bill summary */}
      {!isEqual && (
        <Card className="p-4">
          <div className="flex justify-between items-center">
            <span className="text-sm text-[#6b5f55]">Subtotal boleta</span>
            <span className="font-medium">{formatCLP(billSubtotal)}</span>
          </div>
          {session.propina_pct > 0 && (
            <div className="flex justify-between items-center mt-1">
              <span className="text-sm text-[#6b5f55]">+ Propina {session.propina_pct}%</span>
              <span className="text-sm text-[#6b5f55]">{formatCLP(billTotal - billSubtotal)}</span>
            </div>
          )}
          <div className="flex justify-between items-center mt-2 pt-2 border-t border-[#f6f1ea]">
            <span className="text-sm font-semibold">Total</span>
            <span className="font-bold text-[#077f4e]">{formatCLP(billTotal)}</span>
          </div>
        </Card>
      )}

      {/* Recordar a los que faltan */}
      {session.status === 'open' && unpaidCount > 0 && (
        <Button variant="secondary" fullWidth onClick={handleRemindPending}>
          <Bell className="w-4 h-4" /> Recordar a los que faltan ({unpaidCount})
        </Button>
      )}

      {/* Close session */}
      {session.status === 'open' && (
        <Button
          variant="ghost"
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

  const statusColor = isConfirmed ? 'text-[#077f4e]' : isPaid ? 'text-[#b45309]' : 'text-[#6b5f55]'
  const StatusIcon = isConfirmed ? CheckCircle2 : isPaid ? Clock : Clock
  const statusLabel = isConfirmed ? 'Pagado ✓' : isPaid ? 'Transferido — confirmar' : 'Pendiente'

  return (
    <Card className="overflow-hidden">
      <button className="w-full p-4 flex items-center gap-3 text-left" onClick={onToggle}>
        <div className="w-9 h-9 rounded-full bg-[#e7f9f0] text-[#077f4e] flex items-center justify-center font-bold text-sm shrink-0">
          {name.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium">{name}</span>
            <StatusIcon className={`w-4 h-4 ${statusColor}`} />
          </div>
          <p className="text-xs text-[#6b5f55] truncate">{statusLabel}</p>
        </div>
        <div className="text-right shrink-0 flex flex-col items-end">
          <p className="money font-bold text-sm">{formatCLP(amount)}</p>
          {expanded ? <ChevronUp className="w-4 h-4 text-[#6b5f55]" /> : <ChevronDown className="w-4 h-4 text-[#6b5f55]" />}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-[#f6f1ea] pt-3 space-y-2">
          <div className="flex justify-between font-bold text-sm">
            <span>Su parte</span>
            <span className="text-[#077f4e]">{formatCLP(amount)}</span>
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
            <div className="flex items-center gap-2 text-[#077f4e] text-sm mt-2">
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

  const statusColor = isConfirmed ? 'text-[#077f4e]' : isPaid ? 'text-[#b45309]' : 'text-[#6b5f55]'
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
        <div className="w-9 h-9 rounded-full bg-[#e7f9f0] text-[#077f4e] flex items-center justify-center font-bold text-sm shrink-0">
          {participant.name.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium">{participant.name}</span>
            <StatusIcon className={`w-4 h-4 ${statusColor}`} />
          </div>
          <p className="text-xs text-[#6b5f55] truncate">{statusLabel}</p>
        </div>
        <div className="text-right shrink-0 flex flex-col items-end">
          <p className="money font-bold text-sm">{formatCLP(total)}</p>
          {expanded ? <ChevronUp className="w-4 h-4 text-[#6b5f55]" /> : <ChevronDown className="w-4 h-4 text-[#6b5f55]" />}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-[#f6f1ea] pt-3 space-y-2">
          {items.length === 0 ? (
            <p className="text-xs text-[#6b5f55]">No ha marcado nada aún.</p>
          ) : (
            items.map(item => (
              <div key={item.id} className="flex justify-between text-sm">
                <span className="text-[#4a423b]">{item.name}</span>
                <span className="text-[#6b5f55]">
                  {formatCLP(item.price_per_person)}
                  {item.claims.length > 1 && <span className="text-xs text-[#6b5f55] ml-1">÷{item.claims.length}</span>}
                </span>
              </div>
            ))
          )}
          {propinaPct > 0 && items.length > 0 && (
            <div className="flex justify-between text-sm border-t border-[#f6f1ea] pt-2 text-[#6b5f55]">
              <span>Propina {propinaPct}%</span>
              <span>{formatCLP(summary.propina)}</span>
            </div>
          )}
          <div className="flex justify-between font-bold text-sm">
            <span>Total</span>
            <span className="text-[#077f4e]">{formatCLP(total)}</span>
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
            <div className="flex items-center gap-2 text-[#077f4e] text-sm mt-2">
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
