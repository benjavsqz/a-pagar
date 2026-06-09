'use client'
import { useEffect } from 'react'

interface PushOptions {
  sessionId: string
  participantId?: string
  role: 'host' | 'participant'
}

export function usePush({ sessionId, participantId, role }: PushOptions) {
  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
    if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) return

    const register = async () => {
      try {
        const reg = await navigator.serviceWorker.register('/sw.js')
        await navigator.serviceWorker.ready

        // Check if already subscribed
        let sub = await reg.pushManager.getSubscription()

        if (!sub) {
          // Request permission + subscribe
          const permission = await Notification.requestPermission()
          if (permission !== 'granted') return

          sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!) as unknown as BufferSource,
          })
        }

        // Save subscription to server
        await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            subscription: sub.toJSON(),
            sessionId,
            participantId: participantId ?? null,
            role,
          }),
        })
      } catch (err) {
        // Silently fail — push is enhancement only
        console.warn('Push setup failed:', err)
      }
    }

    register()
  }, [sessionId, participantId, role])
}

// Converts a URL-safe base64 VAPID key to Uint8Array
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)))
}
