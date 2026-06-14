import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Hay un package-lock.json suelto en el directorio padre; fijamos la raíz
  // del workspace para que Turbopack no lo infiera mal.
  turbopack: {
    root: path.join(__dirname),
  },

  // Garantiza que web-push (librería Node.js pura) nunca se bundlee
  // en el cliente. Solo se usa en src/app/api/push/ (route handlers).
  serverExternalPackages: ['web-push'],

  // Cache headers explícitos para assets de /public que Vercel no toca.
  // - sw.js: DEBE ser no-cache para que las actualizaciones propaguen de
  //   inmediato (sin esto, el navegador puede cachear el SW hasta 24h).
  // - manifest.webmanifest: corta vida para reflejar cambios de icono/nombre.
  async headers() {
    // CSP base: bloquea embedding (clickjacking) y plugins, acota orígenes de red
    // a self + Supabase + Vercel Analytics. Se permite 'unsafe-inline'/'unsafe-eval'
    // porque Next inyecta scripts/estilos de hidratación sin nonce; aun así
    // frame-ancestors/object-src/base-uri aportan protección real.
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://va.vercel-scripts.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self'",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://va.vercel-scripts.com",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join('; ')

    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=()' },
        ],
      },
      {
        source: '/sw.js',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-cache, no-store, must-revalidate',
          },
          { key: 'Pragma', value: 'no-cache' },
        ],
      },
      {
        source: '/manifest.webmanifest',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=86400, stale-while-revalidate=604800',
          },
        ],
      },
    ]
  },
};

export default nextConfig;
