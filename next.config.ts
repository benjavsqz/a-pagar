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
    return [
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
