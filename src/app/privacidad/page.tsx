import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Privacidad — A-Pagar',
  description: 'Qué datos maneja A-Pagar, para qué, dónde se guardan y cuáles son tus derechos.',
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
          <h2 className="font-bold text-[var(--text)]">Sin cuentas, sin registro</h2>
          <p>
            A-Pagar funciona <strong className="text-[var(--text-1)]">sin cuentas ni contraseñas</strong>. No
            te pedimos email para entrar, no creamos un perfil tuyo y no te seguimos entre boletas.
            Cada boleta vive detrás de un link privado y el historial de tus boletas se guarda solo en
            <strong className="text-[var(--text-1)]"> este dispositivo</strong> (ver más abajo).
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="font-bold text-[var(--text)]">Qué datos guardamos y para qué</h2>
          <p>
            Guardamos únicamente lo que ingresas para que la división de la boleta funcione:
          </p>
          <ul className="list-disc pl-5 space-y-1 text-[var(--text-2)]">
            <li><strong className="text-[var(--text-1)]">Anfitrión:</strong> el nombre y los datos de transferencia que decide compartir con su grupo — nombre, RUT, banco, número de cuenta, correo y link de pago (solo los que ingresa). Sirven para que el grupo sepa a quién y cómo pagar.</li>
            <li><strong className="text-[var(--text-1)]">Participantes:</strong> el nombre que escribes al unirte. Sirve para identificar quién consumió qué y quién ya pagó.</li>
            <li><strong className="text-[var(--text-1)]">Boleta:</strong> los ítems, montos y propina. Son la base del cálculo de lo que le toca a cada persona.</li>
            <li><strong className="text-[var(--text-1)]">Comprobantes:</strong> las imágenes de transferencia que los participantes suben voluntariamente, para que el anfitrión confirme los pagos.</li>
            <li><strong className="text-[var(--text-1)]">Foto de la boleta:</strong> si usas el escaneo, la foto puede contener datos del local (nombre, RUT del comercio) además de los ítems.</li>
            <li><strong className="text-[var(--text-1)]">Notificaciones push (opcional):</strong> si las activas, guardamos el identificador técnico de tu suscripción del navegador/dispositivo para poder avisarte de pagos.</li>
          </ul>
          <p className="text-[var(--text-2)]">
            Usamos estos datos <strong className="text-[var(--text-1)]">solo</strong> para mostrar la boleta al
            grupo, calcular lo que le toca a cada persona y permitir que el anfitrión confirme los pagos.
            No vendemos ni cedemos estos datos a terceros con fines comerciales ni de publicidad.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="font-bold text-[var(--text)]">Dónde se guardan</h2>
          <ul className="list-disc pl-5 space-y-1 text-[var(--text-2)]">
            <li>
              <strong className="text-[var(--text-1)]">En Supabase</strong> (base de datos y almacenamiento):
              las boletas, ítems, participantes, pagos y comprobantes. Los comprobantes viven en un
              <strong className="text-[var(--text-1)]"> bucket privado</strong> y se acceden mediante enlaces
              temporales, no públicos.
            </li>
            <li>
              <strong className="text-[var(--text-1)]">En este dispositivo</strong> (almacenamiento local del
              navegador, <code className="text-[var(--text-1)]">localStorage</code>): el historial de tus
              boletas y, si eres anfitrión, el código secreto que te deja confirmar pagos y cerrar la boleta.
              Esto <strong className="text-[var(--text-1)]">no se sincroniza</strong>: si cambias de teléfono,
              navegas en incógnito o borras los datos del navegador, ese historial desaparece de tu vista.
            </li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="font-bold text-[var(--text)]">Quién puede ver la boleta</h2>
          <p>
            Las boletas se comparten mediante un link privado. Cualquier persona que tenga el link puede ver
            la boleta, los nombres de los participantes y los datos de transferencia del anfitrión.
            <strong className="text-[var(--text-1)]"> Comparte el link solo con tu grupo.</strong>
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="font-bold text-[var(--text)]">Servicios de terceros</h2>
          <p className="text-[var(--text-2)]">
            Algunos proveedores procesan datos fuera de Chile (principalmente en EE. UU.):
          </p>
          <ul className="list-disc pl-5 space-y-1 text-[var(--text-2)]">
            <li><strong className="text-[var(--text-1)]">Supabase</strong> — base de datos y almacenamiento de comprobantes.</li>
            <li><strong className="text-[var(--text-1)]">Google Gemini</strong> — si escaneas una foto, esta se envía a Google (EE. UU.) para extraer los ítems.</li>
            <li><strong className="text-[var(--text-1)]">Vercel</strong> — hosting (EE. UU.) y métricas de uso anónimas (sin cookies de seguimiento).</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="font-bold text-[var(--text)]">Cuánto tiempo se conservan</h2>
          <ul className="list-disc pl-5 space-y-1 text-[var(--text-2)]">
            <li>
              Los <strong className="text-[var(--text-1)]">datos de transferencia del anfitrión</strong> (RUT,
              cuenta, banco, correo y link de pago) se eliminan automáticamente
              <strong className="text-[var(--text-1)]"> 30 días después</strong> de que la boleta se cierra.
            </li>
            <li>
              Los <strong className="text-[var(--text-1)]">comprobantes</strong> dejan de mostrarse en la app
              <strong className="text-[var(--text-1)]"> 30 días después</strong> de cerrar la boleta. La
              eliminación definitiva del archivo en el almacenamiento se está implementando como parte de este
              mismo plan de retención.
            </li>
            <li>
              El <strong className="text-[var(--text-1)]">historial en este dispositivo</strong> permanece
              hasta que lo borres tú: puedes hacerlo cuando quieras desde <em>Mis boletas</em> con
              «Borrar mis datos de este dispositivo».
            </li>
          </ul>
          <p className="text-[var(--text-2)]">
            También puedes pedir la eliminación antes de los 30 días escribiéndonos (ver más abajo).
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="font-bold text-[var(--text)]">Base legal y consentimiento</h2>
          <p>
            Tratamos estos datos sobre la base de tu <strong className="text-[var(--text-1)]">consentimiento</strong>:
            los entregas voluntariamente al crear o unirte a una boleta, con el fin concreto de dividir esa
            cuenta. No usamos los datos para otra cosa. Como no hay cuentas, no recopilamos más de lo necesario
            para ese propósito.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="font-bold text-[var(--text)]">Tus derechos</h2>
          <p>
            Conforme a la ley chilena de protección de datos personales (Ley 19.628, actualizada por la
            Ley 21.719), tienes derecho a <strong className="text-[var(--text-1)]">acceder</strong> a tus
            datos, <strong className="text-[var(--text-1)]">rectificarlos</strong>,{' '}
            <strong className="text-[var(--text-1)]">eliminarlos</strong> y{' '}
            <strong className="text-[var(--text-1)]">oponerte</strong> a su tratamiento. Para los datos de
            <em> este dispositivo</em> puedes ejercer el borrado tú mismo desde <em>Mis boletas</em>. Para el
            resto, escríbenos con el link de la boleta y haremos la gestión.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="font-bold text-[var(--text)]">Contacto</h2>
          <p className="text-[var(--text-2)]">
            Escribe a{' '}
            <a href="mailto:privacidad@a-pagar.app" className="text-[var(--brand-ink)] hover:underline">
              privacidad@a-pagar.app
            </a>
            . (Dirección de contacto configurable: reemplázala por el correo real del responsable antes de
            publicar.)
          </p>
        </section>
      </article>
    </main>
  )
}
