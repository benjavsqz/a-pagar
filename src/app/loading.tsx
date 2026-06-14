// Fallback de carga a nivel de ruta (Suspense). Se muestra durante la
// navegación inicial mientras el segmento se resuelve.
export default function Loading() {
  return (
    <div className="min-h-dvh flex items-center justify-center" aria-label="Cargando" role="status">
      <span className="inline-block h-7 w-7 rounded-full border-2 border-current/20 border-t-current animate-spin text-[#0bb673]" />
    </div>
  )
}
