import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Privacidad — A-Pagar',
  description: 'Qué datos maneja A-Pagar, para qué, y cuáles son tus derechos.',
}

export default function PrivacidadPage() {
  return (
    <main className="min-h-screen max-w-md mx-auto px-5 py-6">
      <div className="flex items-center gap-3 mb-8">
        <Link href="/" aria-label="Volver al inicio" className="p-2 -ml-2 hover:bg-[#18181b] rounded-xl transition-colors text-[#8a8a96] hover:text-white">
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-[#00DF76] flex items-center justify-center">
            <span className="text-black text-xs font-black leading-none">$</span>
          </div>
          <span className="text-base font-black tracking-tight">A-Pagar</span>
        </div>
      </div>

      <article className="space-y-6 text-sm leading-relaxed text-[#c0c0c8]">
        <header>
          <h1 className="text-2xl font-black text-white">Política de privacidad</h1>
          <p className="text-xs text-[#76767f] mt-1">Última actualización: junio 2026</p>
        </header>

        <section className="space-y-2">
          <h2 className="font-bold text-white">Qué datos guardamos</h2>
          <p>
            A-Pagar funciona sin cuentas ni registro. Para que la división de la boleta
            funcione, guardamos solo lo que ingresas al usar la app:
          </p>
          <ul className="list-disc pl-5 space-y-1 text-[#8a8a96]">
            <li>El nombre que escribes al crear o unirte a una boleta.</li>
            <li>Los ítems y montos de la boleta.</li>
            <li>Los datos de transferencia que el anfitrión decide compartir con su grupo (nombre, banco, número de cuenta, RUT).</li>
            <li>Los comprobantes de transferencia que los participantes suben voluntariamente.</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="font-bold text-white">Para qué se usan</h2>
          <p>
            Exclusivamente para mostrar la boleta al grupo, calcular lo que le toca a cada
            persona y permitir que el anfitrión confirme los pagos. No vendemos ni compartimos
            estos datos con terceros con fines comerciales.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="font-bold text-white">Quién puede verlos</h2>
          <p>
            Las boletas se comparten mediante un link privado. Cualquier persona que tenga el
            link puede ver la boleta, los nombres de los participantes y los datos de
            transferencia del anfitrión. Comparte el link solo con tu grupo. Los comprobantes
            se almacenan en un bucket privado y se acceden mediante enlaces temporales.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="font-bold text-white">Servicios de terceros</h2>
          <ul className="list-disc pl-5 space-y-1 text-[#8a8a96]">
            <li><strong className="text-[#c0c0c8]">Supabase</strong> — base de datos y almacenamiento de comprobantes.</li>
            <li><strong className="text-[#c0c0c8]">Google Gemini</strong> — la foto de la boleta se envía a Google para extraer los ítems (solo la imagen, sin datos personales adicionales).</li>
            <li><strong className="text-[#c0c0c8]">Vercel</strong> — hosting y métricas de uso anónimas (sin cookies de seguimiento).</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="font-bold text-white">Tus derechos</h2>
          <p>
            Conforme a la ley chilena de protección de datos personales (Ley 19.628 y sus
            modificaciones), puedes solicitar la eliminación de una boleta y de los datos
            asociados escribiendo a{' '}
            <a href="mailto:benjavsqueza@gmail.com" className="text-[#00DF76] hover:underline">
              benjavsqueza@gmail.com
            </a>{' '}
            con el link de la sesión.
          </p>
        </section>
      </article>
    </main>
  )
}
