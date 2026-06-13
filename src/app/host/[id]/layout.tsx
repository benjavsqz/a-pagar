import type { Metadata } from 'next'

// El panel del anfitrión es privado — nunca indexar
export const metadata: Metadata = {
  title: 'Tu boleta — A-Pagar',
  robots: { index: false, follow: false },
}

export default function HostLayout({ children }: { children: React.ReactNode }) {
  return children
}
