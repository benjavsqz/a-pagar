import { ImageResponse } from 'next/og'

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
          background: '#fbf3ea',
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
          <div
            style={{
              background: '#0bb673',
              width: 96,
              height: 96,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 24,
            }}
          >
            <span style={{ color: '#fff', fontSize: 64, fontWeight: 900 }}>$</span>
          </div>
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
