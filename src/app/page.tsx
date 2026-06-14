import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { MisBoletasCta } from '@/components/mis-boletas-cta'
import { Camera, Share2, CircleCheck, ScanLine, Users, ArrowRight, Check, ReceiptText } from 'lucide-react'

export default function Home() {
  return (
    <main className="min-h-dvh flex flex-col relative overflow-hidden">

      {/* Warm ambient blobs */}
      <div className="pointer-events-none fixed -top-28 -left-28 w-[420px] h-[420px] bg-[#ffaa82]/40 blur-[90px] rounded-full -z-10" />
      <div className="pointer-events-none fixed top-[26%] -right-32 w-[420px] h-[420px] bg-[#7cdcaa]/34 blur-[90px] rounded-full -z-10" />
      <div className="pointer-events-none fixed -bottom-32 left-[16%] w-[360px] h-[360px] bg-[#b4a0fa]/20 blur-[90px] rounded-full -z-10" />

      <div className="w-full max-w-md lg:max-w-6xl mx-auto px-5 lg:px-8 flex-1 flex flex-col">

        {/* Nav */}
        <nav className="flex items-center justify-between py-5">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-[11px] bg-gradient-to-br from-[#16d488] to-[#0bb673] flex items-center justify-center shadow-[0_6px_16px_rgba(11,182,115,0.4)]">
              <span className="text-white text-sm font-black leading-none">$</span>
            </div>
            <span className="text-[17px] font-extrabold tracking-tight">A-Pagar</span>
          </div>
          <Link
            href="/cuenta"
            className="text-sm font-semibold text-[#6f6155] hover:text-[#241a12] transition-colors"
          >
            Mis boletas
          </Link>
        </nav>

        {/* Hero — 2 columnas en desktop */}
        <div className="grid lg:grid-cols-[1.05fr_0.95fr] lg:gap-16 lg:items-center lg:py-10">
          {/* Texto + CTA */}
          <div className="flex flex-col py-4 lg:py-0" style={{ animation: 'fade-up 0.6s cubic-bezier(0.22,1,0.36,1) both' }}>
            <h1 className="font-display font-semibold text-[clamp(2.9rem,11vw,4.6rem)] leading-[0.98] tracking-[-0.03em]">
              Divide la cuenta <em className="italic text-[#0a6f47]">sin drama</em>.
            </h1>
            <p className="text-[#6f6155] text-[clamp(1.05rem,2.4vw,1.2rem)] leading-relaxed max-w-[30ch] mt-5">
              Foto de la boleta → link al grupo → cada uno marca lo suyo y paga.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 mt-7 max-w-md">
              <Link href="/crear" className="block flex-1">
                <Button size="lg" fullWidth>
                  Dividir boleta ahora <ArrowRight className="w-[18px] h-[18px]" />
                </Button>
              </Link>
            </div>
            <div className="mt-3 max-w-md">
              <MisBoletasCta />
            </div>

            <div className="flex items-center gap-x-5 gap-y-2 mt-7 flex-wrap">
              {['Gratis', 'Funciona por WhatsApp', 'Hecho en Chile'].map(t => (
                <span key={t} className="flex items-center gap-1.5 text-[13px] font-semibold text-[#6f6155]">
                  <Check className="w-4 h-4 text-[#0a6f47]" strokeWidth={2.6} /> {t}
                </span>
              ))}
            </div>
          </div>

          {/* Recibo */}
          <div className="mt-8 lg:mt-0" style={{ animation: 'fade-up 0.6s cubic-bezier(0.22,1,0.36,1) 0.12s both' }}>
            <ReceiptMockup />
          </div>
        </div>

        {/* Modos + pasos */}
        <section className="py-8 lg:py-14 lg:max-w-3xl lg:mx-auto lg:w-full">
          <p className="meta mb-4">— Elige cómo dividir</p>

          {/* Dos modos */}
          <div className="grid grid-cols-2 gap-3 lg:gap-4 stagger">
            <div className="relative bg-white rounded-2xl p-5 shadow-[0_10px_30px_rgba(150,100,60,0.12)] overflow-hidden" style={{ ['--i' as string]: 1 }}>
              <span className="absolute top-0 inset-x-0 h-1 bg-[#0bb673]" />
              <div className="w-10 h-10 rounded-xl bg-[#e7f9f0] flex items-center justify-center mb-3">
                <ScanLine className="w-5 h-5 text-[#0a6f47]" />
              </div>
              <p className="font-display font-semibold text-lg leading-tight">Por ítems</p>
              <p className="text-xs text-[#6f6155] mt-1 leading-snug">Cada uno marca lo que pidió. Ideal con pedidos distintos.</p>
            </div>
            <div className="relative bg-white rounded-2xl p-5 shadow-[0_10px_30px_rgba(150,100,60,0.12)] overflow-hidden" style={{ ['--i' as string]: 2 }}>
              <span className="absolute top-0 inset-x-0 h-1 bg-[#7c6cf0]" />
              <div className="w-10 h-10 rounded-xl bg-[#ece9fd] flex items-center justify-center mb-3">
                <Users className="w-5 h-5 text-[#7c6cf0]" />
              </div>
              <p className="font-display font-semibold text-lg leading-tight">Partes iguales</p>
              <p className="text-xs text-[#6f6155] mt-1 leading-snug">Divide el total entre todos. Ideal si pidieron parecido.</p>
            </div>
          </div>

          {/* Pasos — panel tonal plano (jerarquía vs cards blancas) */}
          <div className="surface-tonal rounded-[22px] px-2 mt-6">
            {[
              { n: '01', icon: Camera,      label: 'Foto',      text: 'Saca foto a la boleta y la IA lee todo.',        bg: '#fef0e8', fg: 'var(--coral-ink)' },
              { n: '02', icon: Share2,      label: 'Comparte',  text: 'Manda el link por WhatsApp al grupo.',          bg: '#e7f9f0', fg: 'var(--brand-ink)' },
              { n: '03', icon: CircleCheck, label: 'Listo',     text: 'Cada uno marca lo que pidió y transfiere.',     bg: '#ece9fd', fg: '#7c6cf0' },
            ].map(({ n, icon: Icon, label, text, bg, fg }, i, arr) => (
              <div
                key={label}
                className={`flex items-center gap-4 px-3 py-4 ${i < arr.length - 1 ? 'border-b-2 border-dashed border-[var(--border)]' : ''}`}
              >
                <span className="money text-[13px] font-bold text-[#9a8b7c] w-6 shrink-0">{n}</span>
                <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: bg }}>
                  <Icon className="w-5 h-5" style={{ color: fg }} />
                </div>
                <div>
                  <p className="text-[15px] font-bold text-[#241a12]">{label}</p>
                  <p className="text-sm text-[#6f6155] leading-snug">{text}</p>
                </div>
              </div>
            ))}
          </div>

          {/* CTA de cierre */}
          <Link href="/crear" className="block mt-7 lg:max-w-sm lg:mx-auto">
            <Button size="lg" fullWidth>
              Dividir boleta ahora <ArrowRight className="w-[18px] h-[18px]" />
            </Button>
          </Link>
        </section>

        {/* Footer */}
        <footer className="mt-auto pb-7 flex items-center justify-center gap-3 text-xs text-[#6f6155]">
          <span>© {new Date().getFullYear()} A-Pagar</span>
          <span aria-hidden>·</span>
          <Link href="/privacidad" className="hover:text-[#241a12] transition-colors">
            Privacidad
          </Link>
        </footer>
      </div>
    </main>
  )
}

function ReceiptMockup() {
  const items = [
    { name: 'Empanada de pino',    price: '$3.500',  mine: true,  person: 'Tú' },
    { name: '2× Cerveza Kunstmann', price: '$6.200',  mine: false, person: 'Benja' },
    { name: 'Ceviche mixto',       price: '$11.900', mine: true,  person: 'Tú' },
    { name: 'Pisco sour',          price: '$5.800',  mine: false, person: 'Cami' },
  ]

  return (
    <div className="receipt-edge bg-white rounded-3xl shadow-[0_26px_60px_rgba(140,90,50,0.20)]">
      <div className="flex items-center justify-between px-4 py-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[var(--coral-soft)] flex items-center justify-center">
            <ReceiptText className="w-5 h-5 text-[var(--coral-ink)]" />
          </div>
          <div>
            <p className="text-[15px] font-extrabold tracking-tight text-[#241a12]">La Piojera</p>
            <p className="meta mt-0.5">Mesa 4 · 4 amigos</p>
          </div>
        </div>
        <span className="flex items-center gap-1.5 text-[11px] font-bold bg-[#e7f9f0] text-[#0a6f47] px-2.5 py-1 rounded-full">
          <span className="w-1.5 h-1.5 rounded-full bg-[#0bb673] animate-pulse" />
          Activa
        </span>
      </div>

      <hr className="perf mx-4" />

      <div className="p-3 space-y-2">
        {items.map(item => (
          <div
            key={item.name}
            className={`flex items-center justify-between px-3.5 py-3 rounded-2xl ${
              item.mine ? 'bg-[#e9f9f0]' : 'bg-[var(--surface-2)]'
            }`}
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                item.mine ? 'bg-[#0bb673]' : 'border-2 border-[#d8cabb]'
              }`}>
                {item.mine && (
                  <svg width="10" height="8" viewBox="0 0 8 6" fill="none">
                    <path d="M1 3L3 5L7 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </div>
              <span className={`text-[13.5px] truncate ${item.mine ? 'text-[#241a12] font-bold' : 'text-[#4a423b]'}`}>
                {item.name}
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {!item.mine && (
                <span className="text-[10px] text-[#6f6155] bg-white px-2 py-0.5 rounded-full font-semibold">
                  {item.person}
                </span>
              )}
              <span className={`money text-[13px] font-bold ${item.mine ? 'text-[#0a6f47]' : 'text-[#6f6155]'}`}>
                {item.price}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="mx-3 mb-4 rounded-2xl px-4 py-4 flex items-center justify-between bg-gradient-to-br from-[#073d27] to-[#0a6f47] shadow-[0_12px_26px_rgba(11,182,115,0.30)]">
        <div>
          <p className="meta text-white/80">Tu parte</p>
          <p className="money text-[27px] font-bold text-white mt-0.5">$15.400</p>
        </div>
        <div className="bg-white text-[#0a6f47] text-xs font-bold px-4 py-2 rounded-full">
          Pagar →
        </div>
      </div>
    </div>
  )
}
