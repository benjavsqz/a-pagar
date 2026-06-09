import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Camera, Share2, CircleCheck, ScanLine, Users } from 'lucide-react'

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col max-w-md mx-auto px-5 relative overflow-hidden">

      {/* Ambient glow */}
      <div className="pointer-events-none fixed top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-[#00DF76]/5 blur-[120px] rounded-full -z-10" />

      {/* Nav */}
      <nav className="flex items-center justify-between py-5 relative z-10">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-[#00DF76] flex items-center justify-center">
            <span className="text-black text-xs font-black leading-none">$</span>
          </div>
          <span className="text-base font-black tracking-tight">A-Pagar</span>
        </div>
        <Link
          href="/cuenta"
          className="text-sm text-[#8a8a96] hover:text-white transition-colors"
        >
          Mis boletas
        </Link>
      </nav>

      {/* Hero */}
      <div className="flex-1 flex flex-col justify-center gap-10 py-6">
        <div className="space-y-4">
          <div className="inline-flex items-center gap-2 bg-[#111113] border border-[#222226] rounded-full px-3 py-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#00DF76] animate-pulse" />
            <span className="text-xs text-[#8a8a96]">Sin apps · Sin registro</span>
          </div>
          <h1 className="text-[3.25rem] font-black leading-[1.0] tracking-tight">
            Divide la<br />
            cuenta.<br />
            <span className="text-[#00DF76]">Sin el drama.</span>
          </h1>
          <p className="text-[#8a8a96] text-base leading-relaxed max-w-xs">
            Foto de la boleta → link al grupo → cada uno marca lo suyo y paga.
          </p>
        </div>

        {/* Receipt mockup */}
        <ReceiptMockup />

        {/* Two modes highlight */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-[#111113] border border-[#00DF76]/15 rounded-2xl p-3.5">
            <ScanLine className="w-5 h-5 text-[#00DF76] mb-2" />
            <p className="text-sm font-semibold">Por ítems</p>
            <p className="text-xs text-[#4a4a54] mt-0.5 leading-snug">Cada uno marca exactamente lo que pidió</p>
          </div>
          <div className="bg-[#111113] border border-[#8b5cf6]/15 rounded-2xl p-3.5">
            <Users className="w-5 h-5 text-[#8b5cf6] mb-2" />
            <p className="text-sm font-semibold">Partes iguales</p>
            <p className="text-xs text-[#4a4a54] mt-0.5 leading-snug">Divide el total entre todos por igual</p>
          </div>
        </div>

        {/* Steps */}
        <div className="space-y-4">
          {[
            { icon: Camera,       label: 'Foto',      text: 'Saca foto a la boleta y la IA lee todo' },
            { icon: Share2,       label: 'Comparte',  text: 'Manda el link por WhatsApp al grupo' },
            { icon: CircleCheck,  label: 'Listo',     text: 'Cada uno marca lo que pidió y transfiere' },
          ].map(({ icon: Icon, label, text }) => (
            <div key={label} className="flex items-start gap-4">
              <div className="w-9 h-9 rounded-xl bg-[#111113] border border-[#222226] flex items-center justify-center shrink-0 mt-0.5">
                <Icon className="w-4 h-4 text-[#00DF76]" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">{label}</p>
                <p className="text-sm text-[#8a8a96] leading-snug">{text}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div className="pb-10 space-y-3 pt-4">
        <Link href="/crear" className="block">
          <Button size="lg" fullWidth>
            Dividir boleta ahora →
          </Button>
        </Link>
        <Link href="/cuenta" className="block">
          <Button variant="ghost" size="md" fullWidth>
            Ver mis boletas anteriores
          </Button>
        </Link>
      </div>
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
      <div className="absolute -inset-4 bg-[#00DF76]/8 rounded-3xl blur-2xl pointer-events-none" />

      <div className="relative bg-[#111113] border border-[#222226] rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#1e1e22]">
          <div>
            <p className="text-xs font-semibold text-white">La Piojera</p>
            <p className="text-[10px] text-[#4a4a54]">Mesa 4 · 4 personas</p>
          </div>
          <span className="text-[10px] font-semibold bg-[#00DF76]/10 text-[#00DF76] border border-[#00DF76]/20 px-2.5 py-1 rounded-full">
            Activa
          </span>
        </div>

        <div className="p-3 space-y-1">
          {items.map(item => (
            <div
              key={item.name}
              className={`flex items-center justify-between px-3 py-2.5 rounded-xl transition-colors ${
                item.mine
                  ? 'bg-[#00DF76]/10 border border-[#00DF76]/15'
                  : 'bg-[#18181b] border border-transparent'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <div className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${
                  item.mine ? 'bg-[#00DF76]' : 'border border-[#2e2e34]'
                }`}>
                  {item.mine && (
                    <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
                      <path d="M1 3L3 5L7 1" stroke="black" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </div>
                <span className={`text-xs ${item.mine ? 'text-white font-medium' : 'text-[#8a8a96]'}`}>
                  {item.name}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {!item.mine && (
                  <span className="text-[9px] text-[#4a4a54] bg-[#222226] px-1.5 py-0.5 rounded-full">
                    {item.person}
                  </span>
                )}
                <span className={`text-xs font-semibold tabular-nums ${item.mine ? 'text-[#00DF76]' : 'text-[#4a4a54]'}`}>
                  {item.price}
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className="mx-3 mb-3 bg-[#18181b] border border-[#222226] rounded-xl px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-[10px] text-[#4a4a54] font-medium uppercase tracking-wider">Tu parte</p>
            <p className="text-2xl font-black text-[#00DF76] tracking-tight">$15.400</p>
          </div>
          <div className="bg-[#00DF76] text-black text-xs font-bold px-4 py-2 rounded-full">
            Pagar →
          </div>
        </div>
      </div>
    </div>
  )
}
