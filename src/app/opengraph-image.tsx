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
          background: '#080809',
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
              background: '#00DF76',
              width: 96,
              height: 96,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 24,
            }}
          >
            <span style={{ color: '#000', fontSize: 64, fontWeight: 900 }}>$</span>
          </div>
          <span style={{ color: '#f0f0f2', fontSize: 72, fontWeight: 900, letterSpacing: -2 }}>
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
          <span style={{ color: '#f0f0f2', fontSize: 52, fontWeight: 700 }}>
            Divide la cuenta. <span style={{ color: '#00DF76', marginLeft: 14 }}>Sin el drama.</span>
          </span>
          <span style={{ color: '#8a8a96', fontSize: 30 }}>
            Foto de la boleta → link al grupo → cada uno paga lo suyo
          </span>
        </div>
      </div>
    ),
    { ...size }
  )
}
