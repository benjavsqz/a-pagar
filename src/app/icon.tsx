import { ImageResponse } from 'next/og'

export const size = { width: 512, height: 512 }
export const contentType = 'image/png'

export default function Icon() {
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
          borderRadius: '112px',
        }}
      >
        <div
          style={{
            background: '#00DF76',
            width: '340px',
            height: '340px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '80px',
          }}
        >
          <span style={{ color: '#000', fontSize: '220px', fontWeight: 900, lineHeight: 1 }}>$</span>
        </div>
      </div>
    ),
    { ...size }
  )
}
