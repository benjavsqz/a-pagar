import { ImageResponse } from 'next/og'

export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          background: '#080809',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            background: '#00DF76',
            width: '130px',
            height: '130px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '30px',
          }}
        >
          <span style={{ color: '#000', fontSize: '82px', fontWeight: 900, lineHeight: 1 }}>$</span>
        </div>
      </div>
    ),
    { ...size }
  )
}
