import { ImageResponse } from 'next/og'
import { logoDataUri } from '@/lib/logo'

// Ícono maskable servido en /icon-maskable (route handler, no es un nombre de
// archivo de metadata reconocido por Next). La marca va al ~62% centrada sobre
// fondo sólido de marca, con safe-zone alrededor, para que Android no recorte
// el logo dentro de la máscara circular/squircle. (El /icon "any" va a sangre.)
export const contentType = 'image/png'

export function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          width: '100%',
          height: '100%',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0a9c63',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img width={320} height={320} src={logoDataUri({ noBg: true, variant: 'dark' })} alt="A-Pagar" />
      </div>
    ),
    { width: 512, height: 512 }
  )
}
