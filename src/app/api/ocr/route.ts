import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { createClient } from '@/lib/supabase/server'

// La cascada de modelos + reintentos puede tardar; evita que la función se
// corte a los 10s por defecto en mitad de una llamada a Gemini.
export const maxDuration = 30

const PROMPT = `Analiza esta imagen de una boleta o ticket (chileno o latinoamericano).
Tu objetivo es extraer TODOS los ítems de comida y bebida con sus precios.

FORMATO DE RESPUESTA — devuelve ÚNICAMENTE este JSON (sin markdown, sin texto extra):
{"subtotal": 67750, "items": [{"name": "...", "price": 14400, "quantity": 2}]}

"subtotal" = el total de los ítems (SUBTOTAL o TOTAL sin propina). Busca en este orden:
1. "Consumo Cliente" o "Consumo"
2. "SUBTOTAL" o "Sub Total" o "Sub-Total"
3. "TOTAL" (cuando coincide con la suma de ítems, sin propina)
4. "Total Consumo" / "Total General Mesa"
Si no encuentras ninguna, usa null.

─── BOLETAS TIPO "CANT / PRODUCTO / PRECIO / VALOR" (muy comunes en Chile) ────

Muchos restaurantes chilenos usan 4 columnas:
  Cant   Producto        Precio   Valor
  2      CROQUETAS       $7200    $14400
  3      COCA ZERO       $2450    $7350
  1      LOMO VETADO.    $9300    $9300

  IMPORTANTE: usa siempre la columna "VALOR" (última columna = total de la línea)
  como "price" en tu JSON. NUNCA uses la columna "Precio" (precio unitario).
  "price" debe ser el TOTAL de la línea = Precio × Cantidad.

  Ejemplos CORRECTOS para este formato:
    "2  CROQUETAS  $7200  $14400" → {"name":"CROQUETAS", "price":14400, "quantity":2}
    "3  COCA ZERO  $2450  $7350"  → {"name":"COCA ZERO",  "price":7350,  "quantity":3}
    "1  LOMO VET.  $9300  $9300"  → {"name":"LOMO VETADO","price":9300,  "quantity":1}

─── BOLETAS TIPO "CANTIDAD × NOMBRE — PRECIO TOTAL" (un solo precio por línea) ─

  "2  Pisco Sour           19.800" → {"price":19800, "quantity":2}
  "3  Cerveza              12.000" → {"price":12000, "quantity":3}
  "   Limonada Jengibre     9.800" → {"price":9800,  "quantity":1}

─── REGLAS DE INCLUSIÓN / EXCLUSIÓN ─────────────────────────────────────────

INCLUYE: platos, bebidas, tragos, postres, entradas, aperitivos, jugos, aguas, extras
         con precio > 0 (ej: "+Agregado Pollo $1.100")
EXCLUYE sin excepción:
  - Subtotal, Total, TOTAL, Propina, Servicio, IVA, Descuento, Neto, Vuelto, Cubierto
  - Datos del local: RUT, folio, mesa, garzón/mesero, fecha, hora, dirección
  - Líneas con precio $0 o que sean modificadores sin costo

─── BOLETAS DE TERMINAL (GETNET, TRANSBANK, etc.) ───────────────────────────

Si la imagen es solo el comprobante del terminal de pago (muestra "Monto", "Propina",
"Total" pero NO lista ítems individuales), devuelve: {"subtotal": MONTO, "items": []}
donde MONTO es el campo "Monto" (sin propina).

─── FORMATO DE PRECIOS CHILENO ──────────────────────────────────────────────

El PUNTO es separador de MILES, NO decimal:
  "$8.500" = 8500  |  "$14.400" = 14400  |  "$84.400" = 84400
  "$8500"  = 8500  |  "$14400"  = 14400  (sin punto también válido)
Convierte siempre a entero sin puntos ni símbolo $.

─── REGLA CRÍTICA — cantidad ────────────────────────────────────────────────

"quantity" = el número en la columna CANT al inicio de la línea.
  - Si no hay número al inicio, quantity = 1.
  - NUNCA heredes la cantidad de la línea anterior.
  - Números DENTRO del nombre NO son cantidad: "(2 Proteínas)", "x2", "500cc", etc.

─── ÍTEMS CON NOMBRE LARGO (boletas térmicas) ───────────────────────────────

Las impresoras térmicas cortan líneas largas. Une el ítem aunque esté partido:
  "2  Bacon Ranch Quesadilla de Car-"
  "   ne                   29.200"
  → {"name":"Bacon Ranch Quesadilla de Carne", "price":29200, "quantity":2}

─── AUTOVALIDACIÓN OBLIGATORIA ──────────────────────────────────────────────

Suma internamente todos los "price" de tus ítems.
Compara con el SUBTOTAL visible en la boleta.
Si la diferencia es mayor a 500 pesos (o 2% del subtotal), REVISA y agrega los
ítems faltantes antes de responder.

─── FORMATO FINAL ────────────────────────────────────────────────────────────

Responde ÚNICAMENTE con JSON válido, sin texto extra, sin markdown, sin backticks.
Si la imagen no es una boleta o es ilegible: {"subtotal": null, "items": []}`

// Refuerzo para la SEGUNDA pasada, cuando la suma no calzó con el subtotal.
const THOROUGH_SUFFIX = `

─── SEGUNDA PASADA — REVISIÓN EXHAUSTIVA ─────────────────────────────────────
Esta es una RE-LECTURA porque en el primer intento la suma de los ítems NO calzó
con el subtotal de la boleta. Falta(n) o sobra(n) ítem(s). Sé extra meticuloso:
- Recorre la boleta LÍNEA POR LÍNEA, de arriba hacia abajo, sin saltarte ninguna.
- Incluye ítems tenues, con texto borroso, partidos en dos líneas o pegados al borde.
- Verifica que cada "price" use la columna VALOR (total de la línea), no el unitario.
- Cuenta bien la columna CANT: una línea "2 x ..." son 2 unidades del mismo ítem.
- Re-suma TODOS los "price". Si el total no coincide con el subtotal de la boleta,
  vuelve a mirar la imagen y encuentra el/los ítem(s) que faltan ANTES de responder.`

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

const MODEL_CASCADE = [
  'gemini-2.5-flash-lite',
  'gemini-2.5-flash',
  'gemini-2.0-flash',
]

// En modo exhaustivo saltamos el modelo más liviano y partimos por el más capaz.
const MODEL_CASCADE_THOROUGH = [
  'gemini-2.5-flash',
  'gemini-2.0-flash',
]

async function callGemini(apiKey: string, imageBase64: string, mimeType: string, thorough = false) {
  const genAI = new GoogleGenerativeAI(apiKey)
  const config = { temperature: 0.05, maxOutputTokens: 8192 }
  const prompt = thorough ? PROMPT + THOROUGH_SUFFIX : PROMPT
  const cascade = thorough ? MODEL_CASCADE_THOROUGH : MODEL_CASCADE

  for (const modelId of cascade) {
    const model = genAI.getGenerativeModel({ model: modelId, generationConfig: config })

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const result = await model.generateContent([
          prompt,
          { inlineData: { data: imageBase64, mimeType } },
        ])
        return result
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        const isOverloaded =
          msg.includes('503') || msg.includes('overloaded') ||
          msg.includes('unavailable') || msg.includes('high demand')
        const isNoQuota =
          msg.includes('429') && (msg.includes('limit:0') || msg.includes('quota'))

        if (isNoQuota) break
        if (isOverloaded && attempt === 0) {
          await sleep(3000)
          continue
        }
        if (isOverloaded) break
        throw e
      }
    }
  }

  throw new Error('GEMINI_OVERLOADED')
}

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
// ~6 MB de imagen ≈ 8 MB en base64; el cliente comprime a <500 KB, esto es solo tope de abuso
const MAX_BASE64_LENGTH = 8 * 1024 * 1024

// Rate limit en memoria por IP (ventana deslizante). En serverless es por
// instancia — no es perfecto, pero frena el abuso casual de la cuota de Gemini.
const RATE_LIMIT = 10
const RATE_WINDOW_MS = 10 * 60 * 1000
const requestLog = new Map<string, number[]>()

function isRateLimitedMemory(ip: string): boolean {
  const now = Date.now()
  const recent = (requestLog.get(ip) ?? []).filter(t => now - t < RATE_WINDOW_MS)
  if (recent.length >= RATE_LIMIT) {
    requestLog.set(ip, recent)
    return true
  }
  recent.push(now)
  requestLog.set(ip, recent)
  // Evitar crecimiento sin límite del mapa
  if (requestLog.size > 1000) {
    for (const [key, times] of requestLog) {
      if (times.every(t => now - t >= RATE_WINDOW_MS)) requestLog.delete(key)
    }
  }
  return false
}

// Rate-limit durable (global entre instancias) vía Supabase; cae al limitador en
// memoria si la RPC no está disponible (DB caída o migración 013 sin aplicar).
async function isRateLimited(ip: string): Promise<boolean> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('hit_ocr_rate_limit', {
      p_ip: ip,
      p_limit: RATE_LIMIT,
      p_window_seconds: Math.round(RATE_WINDOW_MS / 1000),
    })
    if (!error && typeof data === 'boolean') return data
  } catch {
    // sin red / RPC ausente → fallback
  }
  return isRateLimitedMemory(ip)
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.GOOGLE_AI_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'GOOGLE_AI_API_KEY no configurada' }, { status: 500 })
  }

  const ip = (req.headers.get('x-forwarded-for') ?? 'unknown').split(',')[0].trim()
  if (await isRateLimited(ip)) {
    return NextResponse.json(
      { error: '429: demasiadas solicitudes — espera unos minutos' },
      { status: 429 }
    )
  }

  try {
    const { imageBase64, mimeType, thorough } = await req.json()
    if (typeof imageBase64 !== 'string' || typeof mimeType !== 'string' || !imageBase64) {
      return NextResponse.json({ error: 'Falta imagen' }, { status: 400 })
    }
    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      return NextResponse.json({ error: 'Formato de imagen no soportado' }, { status: 415 })
    }
    if (imageBase64.length > MAX_BASE64_LENGTH) {
      return NextResponse.json({ error: 'Imagen demasiado grande (máx 6 MB)' }, { status: 413 })
    }

    const result = await callGemini(apiKey, imageBase64, mimeType, thorough === true)
    const rawText = result.response.text()
    const clean = rawText
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/g, '')
      .trim()

    let parsed: { subtotal?: number | null; items?: Array<{ name: string; price: number; quantity?: number }> } | Array<{ name: string; price: number; quantity?: number }>
    try {
      parsed = JSON.parse(clean)
    } catch {
      // No logueamos el contenido crudo: una boleta puede traer nombre/RUT del
      // local. Solo la longitud sirve para diagnóstico.
      console.error('OCR JSON parse error — output length:', clean.length)
      return NextResponse.json(
        { error: `No se pudo interpretar la respuesta del modelo: ${clean.slice(0, 120)}` },
        { status: 502 }
      )
    }

    // Support both old array format and new {subtotal, items} format
    const rawItems = Array.isArray(parsed) ? parsed : (parsed.items ?? [])
    const detectedSubtotal = !Array.isArray(parsed) ? (parsed.subtotal ?? null) : null

    if (!Array.isArray(rawItems)) {
      return NextResponse.json({ error: 'Respuesta inesperada del modelo' }, { status: 502 })
    }

    const items: Array<{ name: string; price: string }> = []
    let droppedLowValue = 0
    // Cap defensivo: una imagen adversaria no debería inflar el payload con
    // cientos de ítems (maxOutputTokens ya lo acota; esto es cinturón y tirantes).
    const MAX_ITEMS = 100
    for (const item of rawItems.slice(0, MAX_ITEMS)) {
      if (!item.name?.trim() || typeof item.price !== 'number' || item.price <= 0) continue
      const qty = Math.min(Math.max(1, item.quantity ?? 1), 20)
      const unitPrice = Math.round(item.price / qty)
      // Ítems muy baratos suelen ser ruido de OCR (números sueltos mal leídos).
      // Se descartan, pero lo contamos para informarlo y no "perder" plata en silencio.
      if (unitPrice < 200) { droppedLowValue++; continue }
      for (let i = 0; i < qty; i++) {
        items.push({ name: item.name.trim(), price: unitPrice.toString() })
      }
    }

    const extractedTotal = items.reduce((sum, i) => sum + parseInt(i.price), 0)
    const mismatch =
      detectedSubtotal !== null &&
      detectedSubtotal > 0 &&
      Math.abs(extractedTotal - detectedSubtotal) > Math.max(500, detectedSubtotal * 0.02)

    return NextResponse.json({
      items,
      subtotal: detectedSubtotal,
      extractedTotal,
      mismatch,
      droppedLowValue,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('OCR route error:', msg)
    // No devolver el error interno crudo: puede contener detalles del proveedor.
    // El cliente solo necesita distinguir sobrecarga/cuota para mostrar el mensaje correcto.
    const publicMsg = msg.includes('GEMINI_OVERLOADED') || msg.includes('503')
      ? 'GEMINI_OVERLOADED'
      : msg.includes('429')
      ? '429: límite de uso alcanzado'
      : 'Error al procesar la boleta'
    return NextResponse.json({ error: publicMsg }, { status: 500 })
  }
}
