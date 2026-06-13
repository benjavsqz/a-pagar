# A-Pagar 💸

App web chilena para dividir la cuenta del restaurante sin caos: el anfitrión saca una foto de la boleta, la IA extrae los ítems, comparte un link por WhatsApp y cada persona marca lo que pidió y transfiere su parte.

**Sin registro, sin app store, sin fricción.** Funciona como PWA instalable.

## Cómo funciona

1. **Foto** — El anfitrión escanea la boleta. Gemini (OCR con IA) extrae ítems, precios y cantidades, con soporte para los formatos de boleta chilenos (columnas Cant/Producto/Precio/Valor, boletas térmicas, comprobantes Transbank/Getnet).
2. **Comparte** — Se genera un link único (`/s/<id>`) que se manda al grupo por WhatsApp.
3. **Cada uno paga** — Los participantes marcan sus ítems (o pagan partes iguales), ven los datos de transferencia del anfitrión, transfieren y suben el comprobante. El anfitrión confirma los pagos en tiempo real y recibe notificaciones push.

Dos modos de división:
- **Por ítems** — cada uno paga exactamente lo que consumió (con propina 10% proporcional opcional).
- **Partes iguales** — el total se divide entre N personas.

## Stack

| Capa | Tecnología |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack) + React 19 |
| Estilos | Tailwind CSS 4 |
| Base de datos / realtime / storage | Supabase (Postgres + RLS, canales realtime, bucket de comprobantes) |
| OCR | Google Gemini (cascada flash-lite → flash → 2.0-flash) |
| Notificaciones | Web Push (VAPID) + Service Worker |

## Desarrollo local

```bash
npm install
npm run dev      # http://localhost:3000
npm run lint
npm run build
```

### Variables de entorno (`.env.local`)

```bash
NEXT_PUBLIC_SUPABASE_URL=         # URL del proyecto Supabase
NEXT_PUBLIC_SUPABASE_ANON_KEY=    # anon key (pública)
GOOGLE_AI_API_KEY=                # API key de Gemini (aistudio.google.com) — solo servidor
NEXT_PUBLIC_VAPID_PUBLIC_KEY=     # clave pública VAPID para push
VAPID_PRIVATE_KEY=                # clave privada VAPID — solo servidor
VAPID_SUBJECT=                    # mailto:tu@correo.com
```

### Base de datos

Ejecutar las migraciones de `supabase/migrations/` en orden (001 → 007) en el SQL Editor de Supabase. La 004 (RLS) y la 005 (host token + bucket privado) son de seguridad y **obligatorias** en producción. La 007 (`is_host`) habilita que el anfitrión marque su propio consumo; sin ella la app corre en modo legacy (el host no es participante).

## Estructura

```
src/
  app/
    page.tsx          # Landing
    crear/            # Flujo de creación (escaneo OCR / partes iguales)
    host/[id]/        # Panel del anfitrión (pagos en tiempo real)
    s/[id]/           # Vista del participante (marcar ítems, transferir)
    cuenta/           # Historial local de boletas
    api/ocr/          # Proxy a Gemini para lectura de boletas
    api/push/         # Suscripción y envío de notificaciones push
  components/         # UI base (button, input, card, toast…) y de sesión
  hooks/              # use-session (datos + realtime), use-push
  lib/                # Supabase clients, utils (RUT, CLP), compresión de imagen
supabase/migrations/  # Esquema SQL + RLS
```

## Modelo de confianza

El MVP funciona sin cuentas: los links de sesión son UUIDs no adivinables y actúan como capability tokens. Quien tiene el link puede ver la sesión y participar. Las migraciones de RLS impiden modificar sesiones/ítems después de creados y congelan pagos confirmados. Las acciones de anfitrión (confirmar pagos, cerrar la boleta) requieren un **host token** secreto que se genera al crear la sesión y se guarda solo en el dispositivo del anfitrión.
