'use client' // Los error boundaries deben ser Client Components
import { useEffect } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

// Antes no había error.tsx en ninguna ruta: un error en render dejaba pantalla
// en blanco (audits/03-frontend.md, SEV-Alto). Esto da una salida útil.
// NOTA: esta versión de Next renombró `reset` → `unstable_retry`.
export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center max-w-sm mx-auto px-5 gap-4 text-center">
      <h1 className="font-display text-xl font-bold">Algo salió mal</h1>
      <p className="text-[var(--text-2,#6b5d50)] text-sm">
        Ocurrió un error inesperado. Puedes reintentar o volver al inicio.
      </p>
      <div className="flex flex-col gap-2 w-full mt-2">
        <Button fullWidth onClick={() => unstable_retry()}>Reintentar</Button>
        <Link href="/" className="text-sm text-[var(--text-2,#6b5d50)] underline underline-offset-2">
          Volver al inicio
        </Link>
      </div>
    </div>
  )
}
