'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatCLP } from '@/lib/utils'
import { computeHostCollection } from '@/lib/billing'
import { getLocalSessions, type LocalSessionEntry } from '@/lib/local-sessions'
import { sendMagicLink, signOut, type AuthResult } from '@/lib/auth-actions'
import {
  getAccountSessionIds, linkSessionsToAccount,
} from '@/lib/user-sessions'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { LogoMark } from '@/components/brand/logo-mark'
import {
  ChevronLeft, Plus, Loader2, Utensils, CheckCircle2,
  Clock, Users, ArrowUpRight, TrendingUp, Share2, Trash2,
  Mail, LogOut, CloudUpload, Check,
} from 'lucide-react'
import type { Session, Item, Participant, Payment, Claim } from '@/types'

// Claves de localStorage que usa la app en este dispositivo. Borrarlas elimina el
// historial local y, si eres anfitrión, el token para gestionar boletas (vive solo
// aquí). No afecta los datos en Supabase. Ver src/lib/local-sessions.ts (apagar_sessions_v2)
// y src/components/pwa-install-banner.tsx (apagar_pwa_dismissed).
const LOCAL_KEYS = ['apagar_sessions_v2', 'apagar_pwa_dismissed'] as const

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
  // true si esta boleta NO está en el dispositivo y vino solo de la cuenta
  // (índice personal en user_sessions). Se muestra en modo "solo lectura".
  fromAccountOnly?: boolean
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function CuentaPage() {
  const router = useRouter()
  const [cards, setCards] = useState<SessionCard[]>([])
  const [loading, setLoading] = useState(true)
  const [confirmWipe, setConfirmWipe] = useState(false)
  // Auth opcional: email del usuario si inició sesión (null = anónimo, como siempre)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  const wipeLocalData = () => {
    for (const key of LOCAL_KEYS) localStorage.removeItem(key)
    setCards([])
    setConfirmWipe(false)
  }

  useEffect(() => {
    const load = async () => {
      const supabase = createClient()

      // Auth es opcional. getUser() devuelve null para usuarios anónimos; nunca
      // bloquea ni cambia el flujo sin cuenta.
      let accountIds: string[] = []
      try {
        const { data: userData } = await supabase.auth.getUser()
        const email = userData.user?.email ?? null
        setUserEmail(email)
        if (email) accountIds = await getAccountSessionIds(supabase)
      } catch {
        setUserEmail(null)
      }

      const locals = getLocalSessions()
      const localIds = new Set(locals.map(l => l.id))

      // Boletas guardadas en la cuenta que NO están en este dispositivo: se
      // muestran en modo solo lectura para que el historial sobreviva entre
      // dispositivos. No tienen host_token aquí, así que no se puede actuar sobre
      // ellas desde este equipo (lo gobierna el host_token, como siempre).
      const accountOnly: LocalSessionEntry[] = accountIds
        .filter(id => !localIds.has(id))
        .map(id => ({
          id,
          role: 'participant' as const,
          restaurantName: null,
          hostName: null,
          splitMode: 'items' as const,
          createdAt: new Date().toISOString(),
        }))

      const allEntries = [...locals, ...accountOnly]
      if (allEntries.length === 0) { setLoading(false); return }

      const ids = allEntries.map(l => l.id)

      const [sessionsRes, itemsRes, participantsRes, paymentsRes, claimsRes] = await Promise.all([
        supabase.from('sessions').select('*').in('id', ids),
        supabase.from('items').select('*').in('session_id', ids),
        supabase.from('participants').select('*').in('session_id', ids),
        supabase.from('payments').select('*').in('session_id', ids),
        supabase.from('claims').select('*').in('session_id', ids),
      ])

      const sessMap = Object.fromEntries(
        (sessionsRes.data ?? []).map(s => [s.id, s as Session])
      )

      // Agrupa cada colección por sesión para alimentar el cálculo común.
      const groupBy = <T extends { session_id: string }>(rows: T[]): Record<string, T[]> => {
        const map: Record<string, T[]> = {}
        for (const r of rows) (map[r.session_id] ??= []).push(r)
        return map
      }
      const itemsBy = groupBy((itemsRes.data ?? []) as Item[])
      const participantsBy = groupBy((participantsRes.data ?? []) as Participant[])
      const paymentsBy = groupBy((paymentsRes.data ?? []) as Payment[])
      const claimsBy = groupBy((claimsRes.data ?? []) as (Claim & { session_id: string })[])

      const accountOnlyIds = new Set(accountOnly.map(e => e.id))

      const built: SessionCard[] = allEntries.map(local => {
        const session = sessMap[local.id] ?? null
        const items = itemsBy[local.id] ?? []
        const participants = participantsBy[local.id] ?? []
        const payments = paymentsBy[local.id] ?? []
        const claims = claimsBy[local.id] ?? []
        const fromAccountOnly = accountOnlyIds.has(local.id)

        // Para boletas que solo vienen de la cuenta no tenemos el nombre local;
        // lo tomamos de la sesión en la DB para mostrar algo útil.
        if (fromAccountOnly && session) {
          local = { ...local, restaurantName: session.restaurant_name, hostName: session.host_name }
        }

        let myPayment: { amount: number; confirmed: boolean } | null = null
        if (local.role === 'participant' && local.participantId) {
          const pay = payments.find(p => p.participant_id === local.participantId)
          if (pay) myPayment = { amount: pay.amount, confirmed: pay.confirmed_by_host }
        }

        const itemsTotal = session?.split_mode === 'equal'
          ? (session.split_total ?? 0)
          : items.reduce((sum, i) => sum + i.price, 0)

        // Dinero por cobrar: misma fuente que /host y /s (src/lib/billing.ts),
        // así el total del historial nunca diverge del que ve el host.
        const { target, confirmed: confirmedAmount, guestCount } = session
          ? computeHostCollection({
              splitMode: session.split_mode,
              splitTotal: session.split_total,
              splitN: session.split_n,
              propinaPct: session.propina_pct,
              items, claims, participants, payments,
            })
          : { target: 0, confirmed: 0, guestCount: 0 }

        return {
          local,
          session,
          itemsTotal,
          target,
          participantCount: guestCount,
          confirmedAmount,
          confirmedCount: payments.filter(p => p.confirmed_by_host).length,
          myPayment,
          fromAccountOnly,
        }
      })

      setCards(built)
      setLoading(false)
    }
    load()
  }, [reloadKey])

  // Boletas de este dispositivo (con host_token / participantId locales) que aún
  // no están en la cuenta: candidatas a "guardar en mi cuenta".
  const localCount = cards.filter(c => !c.fromAccountOnly).length
  const accountOnlyCount = cards.filter(c => c.fromAccountOnly).length

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
    <div className="min-h-dvh flex flex-col w-full max-w-md lg:max-w-2xl mx-auto px-4 py-6 pb-24">
      {/* Ambient glow */}
      <div className="pointer-events-none fixed top-0 left-1/2 -translate-x-1/2 w-[500px] h-[300px] bg-[#bff0d8]/45 blur-[100px] rounded-full -z-10" />

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => router.push('/')}
          aria-label="Volver al inicio"
          className="p-2 -ml-2 hover:bg-[var(--fill)] rounded-xl transition-colors text-[var(--text-2)] hover:text-[var(--text)]"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2">
          <LogoMark className="w-7 h-7" />
          <span className="text-base font-black tracking-tight">A-Pagar</span>
        </div>
        <h1 className="font-display text-xl font-bold ml-1">Mis boletas</h1>
      </div>

      {/* Auth opcional: guardar boletas en una cuenta para que sobrevivan entre
          dispositivos. Todo lo de abajo (crear/unirse/marcar/pagar) funciona igual
          sin iniciar sesión. */}
      {!loading && (
        <AccountPanel
          userEmail={userEmail}
          localCount={localCount}
          accountOnlyCount={accountOnlyCount}
          localSessionIds={getLocalSessions().map(s => s.id)}
          onLinked={() => setReloadKey(k => k + 1)}
        />
      )}

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-7 h-7 text-[var(--brand-ink)] animate-spin" />
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
                  <p className="text-xs text-[var(--brand-ink)] font-medium uppercase tracking-wider">Por cobrar</p>
                  <p className="money text-3xl font-black text-[var(--brand-ink)] mt-0.5">{formatCLP(pendingToCollect)}</p>
                  <p className="text-xs text-[var(--text-2)] mt-1">
                    en {activeHost.length} boleta{activeHost.length !== 1 ? 's' : ''} activa{activeHost.length !== 1 ? 's' : ''}
                  </p>
                </div>
                <div className="w-10 h-10 rounded-full bg-[#0bb673]/15 flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-[var(--brand-ink)]" />
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

      {/* Borrar datos de este dispositivo — derecho real, solo afecta localStorage */}
      {!loading && (
        <div className="mt-10 pt-6 border-t border-[var(--line)] text-center">
          <button
            onClick={() => setConfirmWipe(true)}
            className="inline-flex items-center gap-1.5 text-xs text-[var(--text-2)] hover:text-[var(--text)] transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Borrar mis datos de este dispositivo
          </button>
          <p className="text-[11px] text-[var(--text-2)] mt-2 max-w-[260px] mx-auto leading-relaxed">
            Solo borra el historial guardado en este navegador. Las boletas en sí no se eliminan.{' '}
            <Link href="/privacidad" className="text-[var(--brand-ink)] hover:underline">Más sobre privacidad</Link>.
          </p>
        </div>
      )}

      <ConfirmDialog
        open={confirmWipe}
        title="¿Borrar datos de este dispositivo?"
        description="Se borrará el historial de boletas guardado en este navegador. Si eres anfitrión, perderás el acceso para confirmar pagos o cerrar tus boletas desde este dispositivo. Esto no se puede deshacer."
        confirmLabel="Borrar"
        cancelLabel="Cancelar"
        tone="danger"
        onConfirm={wipeLocalData}
        onCancel={() => setConfirmWipe(false)}
      />

      {/* Floating + button */}
      <Link href="/crear" className="fixed bottom-6 right-4 z-50">
        <button aria-label="Nueva boleta" className="w-14 h-14 bg-[#0bb673] rounded-full flex items-center justify-center shadow-[0_4px_24px_rgba(11,182,115,0.4)] hover:bg-[#0a9c63] active:scale-95 transition-[transform,background-color]">
          <Plus className="w-6 h-6 text-[var(--text)]" strokeWidth={2.5} />
        </button>
      </Link>
    </div>
  )
}

// ── Account panel (auth opcional, magic link) ─────────────────────────────────
// Aditivo y degradable: si Email auth no está habilitado en Supabase, enviar el
// link falla y mostramos un aviso claro; nada del flujo anónimo depende de esto.

function AccountPanel({
  userEmail, localCount, accountOnlyCount, localSessionIds, onLinked,
}: {
  userEmail: string | null
  localCount: number
  accountOnlyCount: number
  localSessionIds: string[]
  onLinked: () => void
}) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [feedback, setFeedback] = useState<AuthResult | null>(null)
  const [linking, setLinking] = useState(false)
  const [linkedOk, setLinkedOk] = useState(false)

  // Aviso si el callback redirigió con error (?auth_error=1). Se lee una sola vez
  // en el cliente (inicializador perezoso) y se limpia el query param.
  const [callbackError] = useState(() => {
    if (typeof window === 'undefined') return false
    const has = new URLSearchParams(window.location.search).get('auth_error')
    if (has) window.history.replaceState(null, '', window.location.pathname)
    return !!has
  })

  // ── No autenticado: ofrecer magic link ──
  if (!userEmail) {
    const onSubmit = async (e: React.FormEvent) => {
      e.preventDefault()
      setSending(true)
      setFeedback(null)
      const fd = new FormData()
      fd.set('email', email)
      const res = await sendMagicLink(fd)
      setFeedback(res)
      setSending(false)
    }

    return (
      <div className="mb-6 bg-[var(--surface)] border border-[var(--line)] rounded-2xl p-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-[var(--brand-bg)] flex items-center justify-center shrink-0">
            <Mail className="w-4 h-4 text-[var(--brand-ink)]" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-sm">Guarda tus boletas — entra con tu correo</p>
            <p className="text-xs text-[var(--text-2)] mt-0.5 leading-relaxed">
              Opcional. Te enviamos un enlace mágico para que tu historial te siga en
              cualquier dispositivo. No necesitas contraseña.
            </p>
          </div>
        </div>

        {feedback?.ok ? (
          <p className="mt-3 text-sm text-[var(--brand-ink)] flex items-center gap-1.5">
            <Check className="w-4 h-4" /> Te enviamos un correo. Revisa tu bandeja y toca el enlace.
          </p>
        ) : (
          <form onSubmit={onSubmit} className="mt-3 flex flex-col sm:flex-row gap-2">
            <input
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="tu@correo.cl"
              aria-label="Tu correo"
              className="flex-1 h-11 px-4 rounded-full bg-[var(--fill)] border border-[var(--line)] text-sm outline-none focus:border-[var(--brand-ink)]"
            />
            <Button type="submit" loading={sending} disabled={sending}>
              Enviar enlace
            </Button>
          </form>
        )}

        {feedback && !feedback.ok && (
          <p className="mt-2 text-xs text-[#b45309]">{feedback.error}</p>
        )}
        {callbackError && (
          <p className="mt-2 text-xs text-[#b45309]">
            El enlace no se pudo validar (puede haber expirado). Pide uno nuevo.
          </p>
        )}
      </div>
    )
  }

  // ── Autenticado ──
  const onLink = async () => {
    setLinking(true)
    const n = await linkSessionsToAccount(localSessionIds)
    setLinking(false)
    if (n !== null) {
      setLinkedOk(true)
      onLinked()
      setTimeout(() => setLinkedOk(false), 2500)
    }
  }

  const onSignOut = async () => {
    await signOut()
    router.refresh()
    onLinked() // recarga la lista (se cae a solo locales)
  }

  return (
    <div className="mb-6 bg-[var(--surface)] border border-[var(--line)] rounded-2xl p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-[var(--brand-bg)] flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-4 h-4 text-[var(--brand-ink)]" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-sm truncate">{userEmail}</p>
            <p className="text-xs text-[var(--text-2)]">
              {accountOnlyCount > 0
                ? `${accountOnlyCount} boleta${accountOnlyCount !== 1 ? 's' : ''} guardada${accountOnlyCount !== 1 ? 's' : ''} en tu cuenta`
                : 'Tu cuenta está conectada'}
            </p>
          </div>
        </div>
        <button
          onClick={onSignOut}
          className="inline-flex items-center gap-1 text-xs text-[var(--text-2)] hover:text-[var(--text)] shrink-0"
        >
          <LogOut className="w-3.5 h-3.5" /> Salir
        </button>
      </div>

      {localCount > 0 && (
        <Button
          variant="secondary"
          fullWidth
          className="mt-3"
          onClick={onLink}
          loading={linking}
          disabled={linking || linkedOk}
        >
          {linkedOk ? (
            <><Check className="w-4 h-4" /> Guardadas en tu cuenta</>
          ) : (
            <><CloudUpload className="w-4 h-4" /> Guardar estas boletas en mi cuenta</>
          )}
        </Button>
      )}
    </div>
  )
}

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-[var(--text-2)] uppercase tracking-wider">{title}</span>
        <span className="text-xs bg-[var(--fill)] border border-[var(--line)] rounded-full px-2 py-0.5 text-[var(--text-2)]">
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
      <div className="bg-[var(--surface)] border border-[var(--line)] shadow-[0_6px_18px_rgba(150,100,60,0.07)] rounded-2xl p-4 hover:border-[var(--line-2)] lift">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${isEqual ? 'bg-[var(--violet-bg)]' : 'bg-[var(--brand-bg)]'}`}>
              {isEqual
                ? <Users className="w-4 h-4 text-[var(--violet-ink)]" />
                : <Utensils className="w-4 h-4 text-[var(--brand-ink)]" />
              }
            </div>
            <div>
              <p className="font-semibold text-sm leading-tight">
                {local.restaurantName ?? 'Sin nombre'}
              </p>
              <p className="text-xs text-[var(--text-2)] mt-0.5">
                {date} · {participantCount} persona{participantCount !== 1 ? 's' : ''}
                {isEqual && ' · partes iguales'}
              </p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full border ${
              isActive
                ? 'bg-[#0bb673]/10 text-[var(--brand-ink)] border-[#0bb673]/20'
                : 'bg-[var(--fill)] text-[var(--text-2)] border-[var(--line)]'
            }`}>
              {isActive ? 'Activa' : 'Cerrada'}
            </span>
          </div>
        </div>

        {target > 0 && (
          <>
            <div className="flex items-center justify-between mb-1.5 text-xs">
              <span className="text-[var(--text-2)]">
                {confirmedCount}/{participantCount} pagaron
              </span>
              <span className="money">
                <span className="font-bold text-[var(--brand-ink)]">{formatCLP(confirmedAmount)}</span>
                <span className="text-[var(--text-2)]"> / {formatCLP(target)}</span>
              </span>
            </div>
            <div className="h-1.5 bg-[var(--fill-2)] rounded-full overflow-hidden">
              <div
                className="h-full bg-[#0bb673] rounded-full transition-[width] duration-700"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </>
        )}

        <div className="flex items-center justify-between mt-3">
          <div className="flex items-center gap-1 text-xs text-[var(--text-2)]">
            <Share2 className="w-3 h-3" />
            <span>Compartir link</span>
          </div>
          <ArrowUpRight className="w-4 h-4 text-[var(--text-2)]" />
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
      <div className="bg-[var(--surface)] border border-[var(--line)] shadow-[0_6px_18px_rgba(150,100,60,0.07)] rounded-2xl p-4 hover:border-[var(--line-2)] lift">
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
            isConfirmed
              ? 'bg-[#0bb673]/15 border border-[#0bb673]/20'
              : hasPaid
              ? 'bg-[#fef3c7] border border-[#fcd34d]'
              : 'bg-[var(--fill)] border border-[var(--line)]'
          }`}>
            {isConfirmed
              ? <CheckCircle2 className="w-4 h-4 text-[var(--brand-ink)]" />
              : hasPaid
              ? <Clock className="w-4 h-4 text-[#b45309]" />
              : <Clock className="w-4 h-4 text-[var(--text-2)]" />
            }
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm truncate">
              {local.restaurantName ?? 'Sin nombre'}
            </p>
            <p className="text-xs text-[var(--text-2)] mt-0.5">
              {date} · {local.hostName ?? 'Host'} te invitó
            </p>
          </div>
          <div className="text-right shrink-0">
            {myPayment && (
              <p className={`money text-sm font-bold ${isConfirmed ? 'text-[var(--brand-ink)]' : 'text-[var(--text-1)]'}`}>
                {formatCLP(myPayment.amount)}
              </p>
            )}
            <p className={`text-xs mt-0.5 ${
              isConfirmed ? 'text-[var(--brand-ink)]' : hasPaid ? 'text-[#b45309]' : 'text-[var(--text-2)]'
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
      <div className="w-20 h-20 rounded-2xl bg-[var(--brand-bg)] flex items-center justify-center text-4xl">
        🧾
      </div>
      <div>
        <p className="font-semibold text-[var(--text-1)]">No tienes boletas aún</p>
        <p className="text-sm text-[var(--text-2)] mt-1 max-w-[200px] mx-auto leading-relaxed">
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
