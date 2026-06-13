import { ImageResponse } from 'next/og'

export const size = { width: 512, height: 512 }
export const contentType = 'image/png'

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          background: 'linear-gradient(160deg, #16d488, #0bb673)',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '112px',
        }}
      >
        <span style={{ color: '#fff', fontSize: '300px', fontWeight: 900, lineHeight: 1 }}>$</span>
      </div>
    ),
    { ...size }
  )
}
