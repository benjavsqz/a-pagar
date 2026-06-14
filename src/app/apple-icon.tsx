import { ImageResponse } from 'next/og'
import { logoDataUri } from '@/lib/logo'

export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default function AppleIcon() {
  return new ImageResponse(
    (
      // eslint-disable-next-line @next/next/no-img-element
      <img width={180} height={180} src={logoDataUri({ bleed: true, radius: 0 })} alt="A-Pagar" />
    ),
    { ...size }
  )
}
