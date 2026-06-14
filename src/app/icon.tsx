import { ImageResponse } from 'next/og'
import { logoDataUri } from '@/lib/logo'

export const size = { width: 512, height: 512 }
export const contentType = 'image/png'

export default function Icon() {
  return new ImageResponse(
    (
      // eslint-disable-next-line @next/next/no-img-element
      <img width={512} height={512} src={logoDataUri({ bleed: true, radius: 0 })} alt="A-Pagar" />
    ),
    { ...size }
  )
}
