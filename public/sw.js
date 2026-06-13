// Service Worker — notificaciones push + offline real
// Sube el número de versión para invalidar cachés viejas tras un deploy.
const VERSION = 'apagar-v2'
const CORE_CACHE = `${VERSION}-core`
const RUNTIME_CACHE = `${VERSION}-runtime`

// App shell: rutas públicas que queremos disponibles sin conexión.
const CORE_ASSETS = ['/', '/crear', '/cuenta', '/privacidad', '/manifest.webmanifest']

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CORE_CACHE)
      // best-effort: si alguna ruta falla, no abortamos la instalación
      .then(cache => Promise.allSettled(CORE_ASSETS.map(url => cache.add(url))))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => !k.startsWith(VERSION)).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  )
})

// ── Estrategias de caché ──────────────────────────────────────────────────────
self.addEventListener('fetch', e => {
  const { request } = e
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  // Las rutas de API siempre van a la red (datos frescos, nunca cacheadas)
  if (url.pathname.startsWith('/api/')) return

  // Navegaciones (HTML): network-first → cache → shell '/'
  if (request.mode === 'navigate') {
    e.respondWith(
      fetch(request)
        .then(res => {
          const copy = res.clone()
          caches.open(RUNTIME_CACHE).then(c => c.put(request, copy))
          return res
        })
        .catch(() => caches.match(request).then(hit => hit || caches.match('/')))
    )
    return
  }

  // Assets estáticos de Next (hash inmutable): cache-first
  if (url.pathname.startsWith('/_next/static/') || /\.(?:js|css|woff2?|png|jpg|jpeg|svg|webp|ico)$/.test(url.pathname)) {
    e.respondWith(
      caches.match(request).then(hit =>
        hit || fetch(request).then(res => {
          const copy = res.clone()
          caches.open(RUNTIME_CACHE).then(c => c.put(request, copy))
          return res
        })
      )
    )
    return
  }

  // Resto: network-first con fallback a caché
  e.respondWith(
    fetch(request)
      .then(res => {
        const copy = res.clone()
        caches.open(RUNTIME_CACHE).then(c => c.put(request, copy))
        return res
      })
      .catch(() => caches.match(request))
  )
})

// ── Push ──────────────────────────────────────────────────────────────────────
self.addEventListener('push', e => {
  if (!e.data) return
  const data = e.data.json()
  e.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icon',
      badge: '/icon',
      data: { url: data.url ?? '/' },
      vibrate: [100, 50, 100],
    })
  )
})

self.addEventListener('notificationclick', e => {
  e.notification.close()
  const url = e.notification.data?.url ?? '/'
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      const existing = clients.find(c => c.url.includes(self.location.origin))
      if (existing) return existing.focus().then(c => c.navigate(url))
      return self.clients.openWindow(url)
    })
  )
})
