'use client'
import { useEffect } from 'react'

/**
 * Registra el Service Worker globalmente (en toda la app), no solo dentro de una
 * sesión. Antes el registro vivía dentro de usePush y abortaba sin VAPID key, así
 * que la landing y /crear —las que se instalan como PWA— corrían sin SW ni offline.
 */
export function RegisterSW() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    const register = () => { navigator.serviceWorker.register('/sw.js').catch(() => {}) }
    if (document.readyState === 'complete') register()
    else window.addEventListener('load', register, { once: true })
  }, [])
  return null
}
