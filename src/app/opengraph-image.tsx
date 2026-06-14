import { ImageResponse } from 'next/og'
import { logoDataUri } from '@/lib/logo'

export const alt = 'A-Pagar — Divide la cuenta sin caos'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#faf2e7',
          gap: 36,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 24,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img width={104} height={104} src={logoDataUri({ radius: 24 })} alt="" />

          <span style={{ color: '#1a1614', fontSize: 72, fontWeight: 900, letterSpacing: -2 }}>
            A-Pagar
          </span>
        </div>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span style={{ color: '#1a1614', fontSize: 52, fontWeight: 700 }}>
            Divide la cuenta. <span style={{ color: '#0a8f5c', marginLeft: 14 }}>Sin drama.</span>
          </span>
          <span style={{ color: '#6b5f55', fontSize: 30 }}>
            Foto de la boleta → link al grupo → cada uno paga lo suyo
          </span>
        </div>
      </div>
    ),
    { ...size }
  )
}
