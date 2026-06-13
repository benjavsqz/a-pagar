'use client'
import { useSyncExternalStore } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { getLocalSessions } from '@/lib/local-sessions'

const noopSubscribe = () => () => {}
const hasSessionsSnapshot = () => getLocalSessions().length > 0
const serverSnapshot = () => false

/**
 * CTA secundario de la landing: solo aparece si el usuario ya tiene
 * boletas en su historial local (a un usuario nuevo no le sirve de nada).
 */
export function MisBoletasCta() {
  const hasSessions = useSyncExternalStore(noopSubscribe, hasSessionsSnapshot, serverSnapshot)

  if (!hasSessions) return null

  return (
    <Link href="/cuenta" className="block">
      <Button variant="ghost" size="md" fullWidth>
        Ver mis boletas anteriores
      </Button>
    </Link>
  )
}
