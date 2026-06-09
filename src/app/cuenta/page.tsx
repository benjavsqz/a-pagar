'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatCLP } from '@/lib/utils'
import { getLocalSessions, type LocalSessionEntry } from '@/lib/local-sessions'
import { Button } from '@/components/ui/button'
import {
  ChevronLeft, Plus, Loader2, Utensils, CheckCircle2,
  Clock, Users, ArrowUpRight, TrendingUp, Share2,
} from 'lucide-react'
import type { Session } from '@/types'

// ── Enriched session data ────────────────────────────────────────────────────

interface SessionCard {
  local: LocalSessionEntry
  session: Session | null
  itemsTotal: number
  participantCount: number
  confirmedAmount: number
  confirmedCount: number
  myPayment: { amount: number; confirmed: boolean } | null
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function CuentaPage() {
  const router = useRouter()
  const [cards, setCards] = useState<SessionCard[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      const locals = getLocalSessions()
      if (locals.length === 0) { setLoading(false); return }

      const ids = locals.map(l => l.id)
      const supabase = createClient()

      const [sessionsRes, itemsRes, participantsRes, paymentsRes] = await Promise.all([
        supabase.from('sessions').select('*').in('id', ids),
        supabase.from('items').select('session_id, price').in('session_id', ids),
        supabase.from('participants').select('session_id, id').in('session_id', ids),
        supabase.from('payments').select('session_id, participant_id, amount, confirmed_by_host').in('session_id', ids),
      ])

      const sessMap = Object.fromEntries(
        (sessionsRes.data ?? []).map(s => [s.id, s as Session])
      )

      const itemTotals: Record<string, number> = {}
      for (const item of itemsRes.data ?? []) {
        itemTotals[item.session_id] = (itemTotals[item.session_id] ?? 0) + item.price
      }

      const participantCounts: Record<string, number> = {}
      for (const p of participantsRes.data ?? []) {
        participantCounts[p.session_id] = (participantCounts[p.session_id] ?? 0) + 1
      }

      const confirmedAmounts: Record<string, number> = {}
      const confirmedCounts: Record<string, number> = {}
      for (const pay of paymentsRes.data ?? []) {
        if (pay.confirmed_by_host) {
          confirmedAmounts[pay.session_id] = (confirmedAmounts[pay.session_id] ?? 0) + pay.amount
          confirmedCounts[pay.session_id] = (confirmedCounts[pay.session_id] ?? 0) + 1
        }
      }

      const built: SessionCard[] = locals.map(local => {
        const session = sessMap[local.id] ?? null
        let myPayment: { amount: number; confirmed: boolean } | null = null

        if (local.role === 'participant' && local.participantId) {
          const pay = (paymentsRes.data ?? []).find(
            p => p.session_id === local.id && p.participant_id === local.participantId
          )
          if (pay) myPayment = { amount: pay.amount, confirmed: pay.confirmed_by_host }
        }

        // For equal-split, total comes from session.split_total
        const itemsTotal = session?.split_mode === 'equal'
          ? (session.split_total ?? 0)
          : (itemTotals[local.id] ?? 0)

        return {
          local,
          session,
          itemsTotal,
          participantCount: participantCounts[local.id] ?? 0,
          confirmedAmount: confirmedAmounts[local.id] ?? 0,
          confirmedCount: confirmedCounts[local.id] ?? 0,
          myPayment,
        }
      })

      setCards(built)
      setLoading(false)
    }
    load()
  }, [])

  const hostCards = cards.filter(c => c.local.role === 'host')
  const participantCards = cards.filter(c => c.local.role === 'participant')

  const activeHost = hostCards.filter(c => c.session?.status !== 'closed')
  const completedHost = hostCards.filter(c => c.session?.status === 'closed')

  // Total por cobrar (confirmed by host across all active sessions)
  const pendingToCollect = activeHost.reduce((sum, c) => {
    const total = c.itemsTotal
    const propina = c.session ? Math.ceil(total * c.session.propina_pct / 100) : 0
    const billTotal = total + propina
    return sum + (billTotal - c.confirmedAmount)
  }, 0)

  const isEmpty = cards.length === 0

  return (
    <div className="min-h-screen flex flex-col max-w-md mx-auto px-4 py-6 pb-24">
      {/* Ambient glow */}
      <div className="pointer-events-none fixed top-0 left-1/2 -translate-x-1/2 w-[500px] h-[300px] bg-[#00DF76]/4 blur-[100px] rounded-full -z-10" />

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => router.push('/')}
          className="p-2 -ml-2 hover:bg-[#18181b] rounded-xl transition-colors text-[#8a8a96] hover:text-white"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-[#00DF76] flex items-center justify-center">
            <span className="text-black text-xs font-black leading-none">$</span>
          </div>
          <span className="text-base font-black tracking-tight">A-Pagar</span>
        </div>
        <h1 className="text-xl font-bold ml-1">Mis boletas</h1>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-7 h-7 text-[#00DF76] animate-spin" />
        </div>
      ) : isEmpty ? (
        <EmptyState />
      ) : (
        <div className="space-y-6">
          {/* Summary card — only when there are active host sessions */}
          {activeHost.length > 0 && pendingToCollect > 0 && (
            <div className="bg-gradient-to-br from-[#00DF76]/15 to-[#00DF76]/5 border border-[#00DF76]/25 rounded-2xl p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-[#00DF76]/80 font-medium uppercase tracking-wider">Por cobrar</p>
                  <p className="text-3xl font-black text-[#00DF76] mt-0.5">{formatCLP(pendingToCollect)}</p>
                  <p className="text-xs text-[#8a8a96] mt-1">
                    en {activeHost.length} boleta{activeHost.length !== 1 ? 's' : ''} activa{activeHost.length !== 1 ? 's' : ''}
                  </p>
                </div>
                <div className="w-10 h-10 rounded-full bg-[#00DF76]/15 flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-[#00DF76]" />
                </div>
              </div>
            </div>
          )}

          {/* Active sessions (host) */}
          {activeHost.length > 0 && (
            <Section title="Activas" count={activeHost.length}>
              {activeHost.map(card => (
                <HostSessionCard key={card.local.id} card={card} />
              ))}
            </Section>
          )}

          {/* Completed sessions (host) */}
          {completedHost.length > 0 && (
            <Section title="Completadas" count={completedHost.length}>
              {completedHost.map(card => (
                <HostSessionCard key={card.local.id} card={card} />
              ))}
            </Section>
          )}

          {/* Participant sessions */}
          {participantCards.length > 0 && (
            <Section title="Donde participé" count={participantCards.length}>
              {participantCards.map(card => (
                <ParticipantSessionCard key={card.local.id} card={card} />
              ))}
            </Section>
          )}
        </div>
      )}

      {/* Floating + button */}
      <Link href="/crear" className="fixed bottom-6 right-4 z-50">
        <button className="w-14 h-14 bg-[#00DF76] rounded-full flex items-center justify-center shadow-[0_4px_24px_rgba(0,223,118,0.4)] hover:bg-[#00c96a] active:scale-95 transition-all">
          <Plus className="w-6 h-6 text-black" strokeWidth={2.5} />
        </button>
      </Link>
    </div>
  )
}

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-[#8a8a96] uppercase tracking-wider">{title}</span>
        <span className="text-xs bg-[#18181b] border border-[#222226] rounded-full px-2 py-0.5 text-[#4a4a54]">
          {count}
        </span>
      </div>
      {children}
    </div>
  )
}

// ── Host session card ─────────────────────────────────────────────────────────

function HostSessionCard({ card }: { card: SessionCard }) {
  const { local, session, itemsTotal, participantCount, confirmedAmount, confirmedCount } = card
  const propinaPct = session?.propina_pct ?? 0
  const propina = session?.split_mode === 'equal' ? 0 : Math.ceil(itemsTotal * propinaPct / 100)
  const billTotal = itemsTotal + propina
  const progressPct = billTotal > 0 ? Math.min(100, Math.round((confirmedAmount / billTotal) * 100)) : 0
  const isActive = session?.status !== 'closed'
  const isEqual = session?.split_mode === 'equal'
  const date = new Date(local.createdAt).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })

  return (
    <Link href={`/host/${local.id}`}>
      <div className="bg-[#111113] border border-[#222226] rounded-2xl p-4 hover:border-[#2e2e34] active:scale-[0.98] transition-all">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#18181b] flex items-center justify-center shrink-0">
              {isEqual
                ? <Users className="w-4 h-4 text-[#8a8a96]" />
                : <Utensils className="w-4 h-4 text-[#8a8a96]" />
              }
            </div>
            <div>
              <p className="font-semibold text-sm leading-tight">
                {local.restaurantName ?? 'Sin nombre'}
              </p>
              <p className="text-xs text-[#4a4a54] mt-0.5">
                {date} · {participantCount} persona{participantCount !== 1 ? 's' : ''}
                {isEqual && ' · partes iguales'}
              </p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full border ${
              isActive
                ? 'bg-[#00DF76]/10 text-[#00DF76] border-[#00DF76]/20'
                : 'bg-[#18181b] text-[#4a4a54] border-[#222226]'
            }`}>
              {isActive ? 'Activa' : 'Cerrada'}
            </span>
          </div>
        </div>

        {billTotal > 0 && (
          <>
            <div className="flex items-center justify-between mb-1.5 text-xs">
              <span className="text-[#8a8a96]">
                {confirmedCount}/{participantCount} pagaron
              </span>
              <span>
                <span className="font-bold text-[#00DF76]">{formatCLP(confirmedAmount)}</span>
                <span className="text-[#4a4a54]"> / {formatCLP(billTotal)}</span>
              </span>
            </div>
            <div className="h-1.5 bg-[#1a1a1e] rounded-full overflow-hidden">
              <div
                className="h-full bg-[#00DF76] rounded-full transition-all duration-700"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </>
        )}

        <div className="flex items-center justify-between mt-3">
          <div className="flex items-center gap-1 text-xs text-[#8a8a96]">
            <Share2 className="w-3 h-3" />
            <span>Compartir link</span>
          </div>
          <ArrowUpRight className="w-4 h-4 text-[#4a4a54]" />
        </div>
      </div>
    </Link>
  )
}

// ── Participant session card ───────────────────────────────────────────────────

function ParticipantSessionCard({ card }: { card: SessionCard }) {
  const { local, myPayment } = card
  const date = new Date(local.createdAt).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })
  const hasPaid = !!myPayment
  const isConfirmed = myPayment?.confirmed ?? false

  return (
    <Link href={`/s/${local.id}`}>
      <div className="bg-[#111113] border border-[#222226] rounded-2xl p-4 hover:border-[#2e2e34] active:scale-[0.98] transition-all">
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
            isConfirmed
              ? 'bg-[#00DF76]/15 border border-[#00DF76]/20'
              : hasPaid
              ? 'bg-yellow-500/10 border border-yellow-500/20'
              : 'bg-[#18181b] border border-[#222226]'
          }`}>
            {isConfirmed
              ? <CheckCircle2 className="w-4 h-4 text-[#00DF76]" />
              : hasPaid
              ? <Clock className="w-4 h-4 text-yellow-500" />
              : <Clock className="w-4 h-4 text-[#4a4a54]" />
            }
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm truncate">
              {local.restaurantName ?? 'Sin nombre'}
            </p>
            <p className="text-xs text-[#4a4a54] mt-0.5">
              {date} · {local.hostName ?? 'Host'} te invitó
            </p>
          </div>
          <div className="text-right shrink-0">
            {myPayment && (
              <p className={`text-sm font-bold ${isConfirmed ? 'text-[#00DF76]' : 'text-[#c0c0c8]'}`}>
                {formatCLP(myPayment.amount)}
              </p>
            )}
            <p className={`text-xs mt-0.5 ${
              isConfirmed ? 'text-[#00DF76]' : hasPaid ? 'text-yellow-500' : 'text-[#4a4a54]'
            }`}>
              {isConfirmed ? 'Confirmado ✓' : hasPaid ? 'Pendiente' : 'Sin pagar'}
            </p>
          </div>
        </div>
      </div>
    </Link>
  )
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-5 text-center py-16">
      <div className="w-20 h-20 rounded-2xl bg-[#111113] border border-[#222226] flex items-center justify-center">
        <Utensils className="w-9 h-9 text-[#2e2e34]" />
      </div>
      <div>
        <p className="font-semibold text-[#c0c0c8]">No tienes boletas aún</p>
        <p className="text-sm text-[#4a4a54] mt-1 max-w-[200px] mx-auto leading-relaxed">
          Crea una la próxima vez que salgas a comer
        </p>
      </div>
      <Link href="/crear">
        <Button>
          <Plus className="w-4 h-4" /> Dividir primera boleta
        </Button>
      </Link>
    </div>
  )
}
