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
  target: number // lo que el host espera cobrar (lo que deben los demás)
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

      const [sessionsRes, itemsRes, participantsRes, paymentsRes, claimsRes] = await Promise.all([
        supabase.from('sessions').select('*').in('id', ids),
        supabase.from('items').select('session_id, id, price').in('session_id', ids),
        supabase.from('participants').select('session_id, id').in('session_id', ids),
        supabase.from('payments').select('session_id, participant_id, amount, confirmed_by_host').in('session_id', ids),
        supabase.from('claims').select('session_id, item_id').in('session_id', ids),
      ])

      const sessMap = Object.fromEntries(
        (sessionsRes.data ?? []).map(s => [s.id, s as Session])
      )

      // Ítems que tienen al menos un claim → su precio sí se cobra
      const claimedItemIds = new Set((claimsRes.data ?? []).map(c => c.item_id))

      const itemTotals: Record<string, number> = {}
      const claimedTotals: Record<string, number> = {}
      for (const item of itemsRes.data ?? []) {
        itemTotals[item.session_id] = (itemTotals[item.session_id] ?? 0) + item.price
        if (claimedItemIds.has(item.id)) {
          claimedTotals[item.session_id] = (claimedTotals[item.session_id] ?? 0) + item.price
        }
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

        // Lo que el host espera cobrar = lo que deben los demás:
        // - equal: (n-1) cuotas; - ítems: lo reclamado + propina (no su consumo)
        let target = 0
        if (session?.split_mode === 'equal' && session.split_total && session.split_n) {
          target = Math.ceil(session.split_total / session.split_n) * Math.max(0, session.split_n - 1)
        } else if (session) {
          const claimed = claimedTotals[local.id] ?? 0
          target = Math.ceil(claimed * (1 + session.propina_pct / 100))
        }

        return {
          local,
          session,
          itemsTotal,
          target,
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

  // Total por cobrar = suma de lo que falta en cada boleta activa
  const pendingToCollect = activeHost.reduce(
    (sum, c) => sum + Math.max(0, c.target - c.confirmedAmount),
    0
  )

  const isEmpty = cards.length === 0

  return (
    <div className="min-h-screen flex flex-col max-w-md mx-auto px-4 py-6 pb-24">
      {/* Ambient glow */}
      <div className="pointer-events-none fixed top-0 left-1/2 -translate-x-1/2 w-[500px] h-[300px] bg-[#bff0d8]/45 blur-[100px] rounded-full -z-10" />

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => router.push('/')}
          aria-label="Volver al inicio"
          className="p-2 -ml-2 hover:bg-[#f6f1ea] rounded-xl transition-colors text-[#6b5f55] hover:text-[#1a1614]"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-[#0bb673] flex items-center justify-center">
            <span className="text-white text-xs font-black leading-none">$</span>
          </div>
          <span className="text-base font-black tracking-tight">A-Pagar</span>
        </div>
        <h1 className="font-display text-xl font-bold ml-1">Mis boletas</h1>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-7 h-7 text-[#077f4e] animate-spin" />
        </div>
      ) : isEmpty ? (
        <EmptyState />
      ) : (
        <div className="space-y-6">
          {/* Summary card — only when there are active host sessions */}
          {activeHost.length > 0 && pendingToCollect > 0 && (
            <div className="bg-gradient-to-br from-[#0bb673]/15 to-[#0bb673]/5 border border-[#0bb673]/25 rounded-2xl p-4" style={{ animation: 'scale-in 0.4s cubic-bezier(0.22,1,0.36,1) both' }}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-[#077f4e] font-medium uppercase tracking-wider">Por cobrar</p>
                  <p className="money text-3xl font-black text-[#077f4e] mt-0.5">{formatCLP(pendingToCollect)}</p>
                  <p className="text-xs text-[#6b5f55] mt-1">
                    en {activeHost.length} boleta{activeHost.length !== 1 ? 's' : ''} activa{activeHost.length !== 1 ? 's' : ''}
                  </p>
                </div>
                <div className="w-10 h-10 rounded-full bg-[#0bb673]/15 flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-[#077f4e]" />
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
        <button aria-label="Nueva boleta" className="w-14 h-14 bg-[#0bb673] rounded-full flex items-center justify-center shadow-[0_4px_24px_rgba(11,182,115,0.4)] hover:bg-[#0a9c63] active:scale-95 transition-all">
          <Plus className="w-6 h-6 text-[#1a1614]" strokeWidth={2.5} />
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
        <span className="text-xs font-semibold text-[#6b5f55] uppercase tracking-wider">{title}</span>
        <span className="text-xs bg-[#f6f1ea] border border-[#ece2d5] rounded-full px-2 py-0.5 text-[#6b5f55]">
          {count}
        </span>
      </div>
      <div className="space-y-2.5 stagger">{children}</div>
    </div>
  )
}

// ── Host session card ─────────────────────────────────────────────────────────

function HostSessionCard({ card }: { card: SessionCard }) {
  const { local, session, target, participantCount, confirmedAmount, confirmedCount } = card
  const progressPct = target > 0 ? Math.min(100, Math.round((confirmedAmount / target) * 100)) : 0
  const isActive = session?.status !== 'closed'
  const isEqual = session?.split_mode === 'equal'
  const date = new Date(local.createdAt).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })

  return (
    <Link href={`/host/${local.id}`}>
      <div className="bg-[#ffffff] border border-[#ece2d5] shadow-[0_6px_18px_rgba(150,100,60,0.07)] rounded-2xl p-4 hover:border-[#e0d4c4] lift">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${isEqual ? 'bg-[#eeebfd]' : 'bg-[#e7f9f0]'}`}>
              {isEqual
                ? <Users className="w-4 h-4 text-[#5b4dc7]" />
                : <Utensils className="w-4 h-4 text-[#077f4e]" />
              }
            </div>
            <div>
              <p className="font-semibold text-sm leading-tight">
                {local.restaurantName ?? 'Sin nombre'}
              </p>
              <p className="text-xs text-[#6b5f55] mt-0.5">
                {date} · {participantCount} persona{participantCount !== 1 ? 's' : ''}
                {isEqual && ' · partes iguales'}
              </p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full border ${
              isActive
                ? 'bg-[#0bb673]/10 text-[#077f4e] border-[#0bb673]/20'
                : 'bg-[#f6f1ea] text-[#6b5f55] border-[#ece2d5]'
            }`}>
              {isActive ? 'Activa' : 'Cerrada'}
            </span>
          </div>
        </div>

        {target > 0 && (
          <>
            <div className="flex items-center justify-between mb-1.5 text-xs">
              <span className="text-[#6b5f55]">
                {confirmedCount}/{participantCount} pagaron
              </span>
              <span className="money">
                <span className="font-bold text-[#077f4e]">{formatCLP(confirmedAmount)}</span>
                <span className="text-[#6b5f55]"> / {formatCLP(target)}</span>
              </span>
            </div>
            <div className="h-1.5 bg-[#f1e9dd] rounded-full overflow-hidden">
              <div
                className="h-full bg-[#0bb673] rounded-full transition-all duration-700"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </>
        )}

        <div className="flex items-center justify-between mt-3">
          <div className="flex items-center gap-1 text-xs text-[#6b5f55]">
            <Share2 className="w-3 h-3" />
            <span>Compartir link</span>
          </div>
          <ArrowUpRight className="w-4 h-4 text-[#6b5f55]" />
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
      <div className="bg-[#ffffff] border border-[#ece2d5] shadow-[0_6px_18px_rgba(150,100,60,0.07)] rounded-2xl p-4 hover:border-[#e0d4c4] lift">
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
            isConfirmed
              ? 'bg-[#0bb673]/15 border border-[#0bb673]/20'
              : hasPaid
              ? 'bg-[#fef3c7] border border-[#fcd34d]'
              : 'bg-[#f6f1ea] border border-[#ece2d5]'
          }`}>
            {isConfirmed
              ? <CheckCircle2 className="w-4 h-4 text-[#077f4e]" />
              : hasPaid
              ? <Clock className="w-4 h-4 text-[#b45309]" />
              : <Clock className="w-4 h-4 text-[#6b5f55]" />
            }
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm truncate">
              {local.restaurantName ?? 'Sin nombre'}
            </p>
            <p className="text-xs text-[#6b5f55] mt-0.5">
              {date} · {local.hostName ?? 'Host'} te invitó
            </p>
          </div>
          <div className="text-right shrink-0">
            {myPayment && (
              <p className={`money text-sm font-bold ${isConfirmed ? 'text-[#077f4e]' : 'text-[#4a423b]'}`}>
                {formatCLP(myPayment.amount)}
              </p>
            )}
            <p className={`text-xs mt-0.5 ${
              isConfirmed ? 'text-[#077f4e]' : hasPaid ? 'text-[#b45309]' : 'text-[#6b5f55]'
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
      <div className="w-20 h-20 rounded-2xl bg-[#e7f9f0] flex items-center justify-center text-4xl">
        🧾
      </div>
      <div>
        <p className="font-semibold text-[#4a423b]">No tienes boletas aún</p>
        <p className="text-sm text-[#6b5f55] mt-1 max-w-[200px] mx-auto leading-relaxed">
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
