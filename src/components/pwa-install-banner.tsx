'use client'
import { useEffect, useState } from 'react'
import { X, Download, Share } from 'lucide-react'

type Platform = 'android' | 'ios' | null

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISSED_KEY = 'apagar_pwa_dismissed'

export function PwaInstallBanner() {
  const [platform, setPlatform] = useState<Platform>(null)
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [visible, setVisible] = useState(false)
  const [installing, setInstalling] = useState(false)

  useEffect(() => {
    // Don't show if already installed (running as standalone PWA)
    if (window.matchMedia('(display-mode: standalone)').matches) return
    // Don't show if dismissed before
    if (localStorage.getItem(DISMISSED_KEY)) return

    const ua = navigator.userAgent.toLowerCase()
    const isIos = /iphone|ipad|ipod/.test(ua) && !('MSStream' in window)
    const isAndroidChrome = /android/.test(ua) && /chrome/.test(ua) && !/edg/.test(ua)

    // Small delay so it doesn't pop immediately on load
    let iosTimer: ReturnType<typeof setTimeout> | undefined
    if (isIos) {
      iosTimer = setTimeout(() => {
        setPlatform('ios')
        setVisible(true)
      }, 3000)
    }

    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      if (isAndroidChrome) {
        setPlatform('android')
        setTimeout(() => setVisible(true), 2000)
      }
    }

    window.addEventListener('beforeinstallprompt', handler)
    return () => {
      clearTimeout(iosTimer)
      window.removeEventListener('beforeinstallprompt', handler)
    }
  }, [])

  const handleDismiss = () => {
    setVisible(false)
    localStorage.setItem(DISMISSED_KEY, '1')
  }

  const handleInstall = async () => {
    if (!deferredPrompt) return
    setInstalling(true)
    await deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') {
      setVisible(false)
      localStorage.setItem(DISMISSED_KEY, '1')
    }
    setInstalling(false)
    setDeferredPrompt(null)
  }

  if (!visible || !platform) return null

  return (
    <div className={`fixed bottom-0 left-0 right-0 z-50 px-4 pb-safe-bottom transition-all duration-500 ${
      visible ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0'
    }`}>
      <div className="max-w-md mx-auto mb-4 bg-[#ffffff] border border-[#e0d4c4] rounded-2xl p-4 shadow-[0_-4px_32px_rgba(0,0,0,0.5)]">
        <div className="flex items-start gap-3">
          {/* App icon */}
          <div className="w-12 h-12 rounded-xl bg-[#0bb673] flex items-center justify-center shrink-0">
            <span className="text-[#1a1614] text-xl font-black leading-none">$</span>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-bold text-sm">Instalar A-Pagar</p>
                <p className="text-xs text-[#6b5f55] mt-0.5">
                  {platform === 'ios'
                    ? 'Agrégala a tu pantalla de inicio para acceso rápido'
                    : 'Instala la app para acceso rápido sin abrir el navegador'
                  }
                </p>
              </div>
              <button
                onClick={handleDismiss}
                aria-label="Cerrar aviso de instalación"
                className="p-1.5 rounded-lg hover:bg-[#f6f1ea] transition-colors text-[#8a7d71] hover:text-[#6b5f55] shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {platform === 'android' && (
              <button
                onClick={handleInstall}
                disabled={installing}
                className="mt-3 flex items-center gap-2 bg-[#0bb673] text-white text-sm font-bold px-4 py-2 rounded-full hover:bg-[#00c969] active:scale-95 transition-all disabled:opacity-60"
              >
                <Download className="w-3.5 h-3.5" />
                {installing ? 'Instalando...' : 'Instalar gratis'}
              </button>
            )}

            {platform === 'ios' && (
              <div className="mt-3 space-y-2">
                <div className="flex items-center gap-2 text-xs text-[#6b5f55]">
                  <span className="w-5 h-5 rounded-full bg-[#f6f1ea] border border-[#e0d4c4] flex items-center justify-center text-[10px] font-bold text-[#6b5f55] shrink-0">1</span>
                  <span>Toca</span>
                  <Share className="w-3.5 h-3.5 text-[#077f4e] inline shrink-0" />
                  <span className="text-[#1a1614] font-medium">Compartir</span>
                  <span>en Safari</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-[#6b5f55]">
                  <span className="w-5 h-5 rounded-full bg-[#f6f1ea] border border-[#e0d4c4] flex items-center justify-center text-[10px] font-bold text-[#6b5f55] shrink-0">2</span>
                  <span>Selecciona</span>
                  <span className="text-[#1a1614] font-medium">&quot;Agregar a inicio&quot;</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
