import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { MisBoletasCta } from '@/components/mis-boletas-cta'
import { Camera, Share2, CircleCheck, ScanLine, Users } from 'lucide-react'

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col max-w-md mx-auto px-5 relative overflow-hidden">

      {/* Warm ambient blobs */}
      <div className="pointer-events-none fixed -top-20 -left-24 w-[340px] h-[340px] bg-[#ffd9c7]/50 blur-[90px] rounded-full -z-10" />
      <div className="pointer-events-none fixed top-40 -right-24 w-[320px] h-[320px] bg-[#bff0d8]/50 blur-[90px] rounded-full -z-10" />

      {/* Nav */}
      <nav className="flex items-center justify-between py-5 relative z-10">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-[10px] bg-[#0bb673] flex items-center justify-center shadow-[0_4px_12px_rgba(11,182,115,0.35)]">
            <span className="text-white text-sm font-black leading-none">$</span>
          </div>
          <span className="text-base font-extrabold tracking-tight">A-Pagar</span>
        </div>
        <Link
          href="/cuenta"
          className="text-sm font-medium text-[#7a6e64] hover:text-[#1a1614] transition-colors"
        >
          Mis boletas
        </Link>
      </nav>

      {/* Hero */}
      <div className="flex-1 flex flex-col justify-center gap-9 py-6">
        <div className="space-y-4" style={{ animation: 'fade-up 0.6s cubic-bezier(0.22,1,0.36,1) both' }}>
          <h1 className="text-[3.1rem] font-extrabold leading-[1.0] tracking-tight">
            Divide la<br />
            cuenta<br />
            <span className="text-[#077f4e]">sin drama</span> <span className="inline-block">🎉</span>
          </h1>
          <p className="text-[#6b5f55] text-base leading-relaxed max-w-xs">
            Foto de la boleta → link al grupo → cada uno marca lo suyo y paga.
          </p>
        </div>

        {/* Receipt mockup */}
        <div style={{ animation: 'fade-up 0.6s cubic-bezier(0.22,1,0.36,1) 0.12s both' }}>
          <ReceiptMockup />
        </div>

        {/* Two modes highlight */}
        <div className="grid grid-cols-2 gap-3 stagger">
          <div className="bg-white rounded-2xl p-4 shadow-[0_8px_24px_rgba(150,100,60,0.1)]" style={{ ['--i' as string]: 3 }}>
            <div className="w-9 h-9 rounded-xl bg-[#e7f9f0] flex items-center justify-center mb-2.5">
              <ScanLine className="w-5 h-5 text-[#0bb673]" />
            </div>
            <p className="text-sm font-bold">Por ítems</p>
            <p className="text-xs text-[#6b5f55] mt-0.5 leading-snug">Cada uno marca lo que pidió</p>
          </div>
          <div className="bg-white rounded-2xl p-4 shadow-[0_8px_24px_rgba(150,100,60,0.1)]" style={{ ['--i' as string]: 4 }}>
            <div className="w-9 h-9 rounded-xl bg-[#eeebfd] flex items-center justify-center mb-2.5">
              <Users className="w-5 h-5 text-[#7c6cf0]" />
            </div>
            <p className="text-sm font-bold">Partes iguales</p>
            <p className="text-xs text-[#6b5f55] mt-0.5 leading-snug">Divide el total entre todos</p>
          </div>
        </div>

        {/* Steps */}
        <div className="space-y-3.5 stagger">
          {[
            { icon: Camera,       label: 'Foto',      text: 'Saca foto a la boleta y la IA lee todo', bg: '#fef0e8', fg: '#ff7a59' },
            { icon: Share2,       label: 'Comparte',  text: 'Manda el link por WhatsApp al grupo',    bg: '#e7f9f0', fg: '#0bb673' },
            { icon: CircleCheck,  label: 'Listo',     text: 'Cada uno marca lo que pidió y transfiere', bg: '#eeebfd', fg: '#7c6cf0' },
          ].map(({ icon: Icon, label, text, bg, fg }, i) => (
            <div key={label} className="flex items-start gap-3.5" style={{ ['--i' as string]: i + 2 }}>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: bg }}>
                <Icon className="w-[18px] h-[18px]" style={{ color: fg }} />
              </div>
              <div className="pt-0.5">
                <p className="text-sm font-bold text-[#1a1614]">{label}</p>
                <p className="text-sm text-[#7a6e64] leading-snug">{text}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div className="pb-6 space-y-3 pt-4">
        <Link href="/crear" className="block">
          <Button size="lg" fullWidth>
            Dividir boleta ahora →
          </Button>
        </Link>
        <MisBoletasCta />
      </div>

      {/* Footer */}
      <footer className="pb-6 flex items-center justify-center gap-3 text-xs text-[#6b5f55]">
        <span>© {new Date().getFullYear()} A-Pagar</span>
        <span aria-hidden>·</span>
        <Link href="/privacidad" className="hover:text-[#1a1614] transition-colors">
          Privacidad
        </Link>
      </footer>
    </main>
  )
}

function ReceiptMockup() {
  const items = [
    { name: 'Empanada de pino',    price: '$3.500',  mine: true,  person: 'Tú' },
    { name: '2× Cerveza Kustmann', price: '$6.200',  mine: false, person: 'Benja' },
    { name: 'Ceviche mixto',       price: '$11.900', mine: true,  person: 'Tú' },
    { name: 'Pisco sour',          price: '$5.800',  mine: false, person: 'Cami' },
  ]

  return (
    <div className="relative">
      <div className="bg-white rounded-3xl overflow-hidden shadow-[0_18px_44px_rgba(150,100,60,0.18)]">
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-[#f1e9dd]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#fef0e8] flex items-center justify-center text-lg">🧾</div>
            <div>
              <p className="text-sm font-bold text-[#1a1614]">La Piojera</p>
              <p className="text-[11px] text-[#6b5f55]">Mesa 4 · con 3 amigos</p>
            </div>
          </div>
          <span className="flex items-center gap-1.5 text-[10px] font-bold bg-[#e7f9f0] text-[#077f4e] px-2.5 py-1 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-[#0bb673] animate-pulse" />
            Activa
          </span>
        </div>

        <div className="p-2.5 space-y-1.5">
          {items.map(item => (
            <div
              key={item.name}
              className={`flex items-center justify-between px-3 py-2.5 rounded-2xl ${
                item.mine ? 'bg-[#e7f9f0]' : 'bg-[#f6f1ea]'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                  item.mine ? 'bg-[#0bb673]' : 'border-2 border-[#d8cabb]'
                }`}>
                  {item.mine && (
                    <svg width="9" height="7" viewBox="0 0 8 6" fill="none">
                      <path d="M1 3L3 5L7 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </div>
                <span className={`text-[13px] truncate ${item.mine ? 'text-[#1a1614] font-semibold' : 'text-[#4a423b]'}`}>
                  {item.name}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {!item.mine && (
                  <span className="text-[9px] text-[#6b5f55] bg-white px-1.5 py-0.5 rounded-full">
                    {item.person}
                  </span>
                )}
                <span className={`money text-[13px] font-bold ${item.mine ? 'text-[#077f4e]' : 'text-[#6b5f55]'}`}>
                  {item.price}
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className="mx-2.5 mb-2.5 rounded-2xl px-4 py-3.5 flex items-center justify-between bg-gradient-to-br from-[#0a9c63] to-[#0bb673] shadow-[0_10px_24px_rgba(11,182,115,0.35)]">
          <div>
            <p className="text-[10px] text-white/90 font-semibold uppercase tracking-wider">Tu parte</p>
            <p className="money text-2xl font-extrabold text-white">$15.400</p>
          </div>
          <div className="bg-white text-[#077f4e] text-xs font-bold px-4 py-2 rounded-full">
            Pagar →
          </div>
        </div>
      </div>
    </div>
  )
}
