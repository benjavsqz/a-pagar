import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Privacidad — A-Pagar',
  description: 'Qué datos maneja A-Pagar, para qué, y cuáles son tus derechos.',
}

export default function PrivacidadPage() {
  return (
    <main className="min-h-dvh max-w-md mx-auto px-5 py-6">
      <div className="flex items-center gap-3 mb-8">
        <Link href="/" aria-label="Volver al inicio" className="p-2 -ml-2 hover:bg-[var(--fill)] rounded-xl transition-colors text-[var(--text-2)] hover:text-[var(--text)]">
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-[#0bb673] flex items-center justify-center">
            <span className="text-white text-xs font-black leading-none">$</span>
          </div>
          <span className="text-base font-black tracking-tight">A-Pagar</span>
        </div>
      </div>

      <article className="space-y-6 text-sm leading-relaxed text-[var(--text-1)]">
        <header>
          <h1 className="text-2xl font-black text-[var(--text)]">Política de privacidad</h1>
          <p className="text-xs text-[var(--text-2)] mt-1">Última actualización: junio 2026</p>
        </header>

        <section className="space-y-2">
          <h2 className="font-bold text-[var(--text)]">Qué datos guardamos</h2>
          <p>
            A-Pagar funciona sin cuentas ni registro. Para que la división de la boleta
            funcione, guardamos solo lo que ingresas al usar la app:
          </p>
          <ul className="list-disc pl-5 space-y-1 text-[var(--text-2)]">
            <li>El nombre que escribes al crear o unirte a una boleta.</li>
            <li>Los ítems y montos de la boleta.</li>
            <li>Los datos de transferencia que el anfitrión decide compartir con su grupo (nombre, banco, número de cuenta, RUT, correo y link de pago, si los ingresa).</li>
            <li>Los comprobantes de transferencia que los participantes suben voluntariamente.</li>
            <li>Si activas las notificaciones, los datos técnicos de tu suscripción push (identificador del navegador/dispositivo) para poder avisarte de pagos.</li>
            <li>La foto de la boleta que subes para el escaneo; puede contener datos del local (nombre, RUT del comercio) además de los ítems.</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="font-bold text-[var(--text)]">Para qué se usan</h2>
          <p>
            Exclusivamente para mostrar la boleta al grupo, calcular lo que le toca a cada
            persona y permitir que el anfitrión confirme los pagos. No vendemos ni compartimos
            estos datos con terceros con fines comerciales.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="font-bold text-[var(--text)]">Quién puede verlos</h2>
          <p>
            Las boletas se comparten mediante un link privado. Cualquier persona que tenga el
            link puede ver la boleta, los nombres de los participantes y los datos de
            transferencia del anfitrión. Comparte el link solo con tu grupo. Los comprobantes
            se almacenan en un bucket privado y se acceden mediante enlaces temporales.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="font-bold text-[var(--text)]">Servicios de terceros y transferencias internacionales</h2>
          <p className="text-[var(--text-2)]">
            Algunos proveedores procesan datos fuera de Chile (principalmente en EE. UU.):
          </p>
          <ul className="list-disc pl-5 space-y-1 text-[var(--text-2)]">
            <li><strong className="text-[var(--text-1)]">Supabase</strong> — base de datos y almacenamiento de comprobantes.</li>
            <li><strong className="text-[var(--text-1)]">Google Gemini</strong> — la foto de la boleta se envía a Google (EE. UU.) para extraer los ítems.</li>
            <li><strong className="text-[var(--text-1)]">Vercel</strong> — hosting (EE. UU.) y métricas de uso anónimas (sin cookies de seguimiento).</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="font-bold text-[var(--text)]">Cuánto tiempo se conservan</h2>
          <p>
            Los datos de transferencia del anfitrión (RUT, cuenta, banco, correo y link de pago)
            se eliminan automáticamente <strong className="text-[var(--text-1)]">30 días después</strong> de que
            la boleta se cierra. Puedes pedir la eliminación antes en cualquier momento.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="font-bold text-[var(--text)]">Tus derechos</h2>
          <p>
            Conforme a la ley chilena de protección de datos personales (Ley 19.628 y la
            Ley 21.719), tienes derecho a <strong className="text-[var(--text-1)]">acceder</strong> a tus
            datos, <strong className="text-[var(--text-1)]">rectificarlos</strong>,{' '}
            <strong className="text-[var(--text-1)]">eliminarlos</strong> y{' '}
            <strong className="text-[var(--text-1)]">oponerte</strong> a su tratamiento. Para ejercerlos,
            escribe a{' '}
            <a href="mailto:benjavsqueza@gmail.com" className="text-[var(--brand-ink)] hover:underline">
              benjavsqueza@gmail.com
            </a>{' '}
            con el link de la sesión.
          </p>
        </section>
      </article>
    </main>
  )
}
