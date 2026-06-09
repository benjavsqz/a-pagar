import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'

const PROMPT = `Analiza esta imagen de una boleta o ticket de restaurante chileno.
Tu objetivo es extraer TODOS los ítems de comida y bebida con sus precios.

FORMATO DE RESPUESTA — devuelve UNICAMENTE este JSON (sin markdown, sin texto extra):
{"subtotal": 269600, "items": [{"name": "...", "price": 19800, "quantity": 2}]}

Donde "subtotal" es el total de los ítems visibles. Busca en este orden de prioridad:
1. "Consumo Cliente" o "Consumo" (lo que pagó este cliente)
2. "SubTotal" o "Sub Total"
3. "Total Consumo"
4. "Total General Mesa" (solo si no hay ninguna de las anteriores)
Si no encuentras ninguna referencia, usa null.

─── REGLAS DE INCLUSION / EXCLUSION ────────────────────────────────────────

INCLUYE: platos, bebidas, tragos, postres, entradas, aperitivos, jugos, aguas
EXCLUYE sin excepción:
  - Líneas de SubTotal, Total, TOTAL, Propina, Servicio, IVA, Descuento, Vuelto, Cubierto
  - Datos del local: RUT, folio, mesa, garzón, fecha, hora, dirección
  - Modificadores con precio 0: líneas que empiecen con "+" y tengan precio 0
Si un modificador tiene precio propio (ej: "+Agrandar $1.500"), inclúyelo como ítem separado.

─── FORMATO DE PRECIOS (SISTEMA CHILENO) ────────────────────────────────────

El PUNTO separa MILES, NO es decimal:
  "12.990" = 12990 pesos | "5.800" = 5800 pesos | "47.800" = 47800 pesos
Convierte siempre a entero sin puntos.

─── CANTIDADES ───────────────────────────────────────────────────────────────

"price" = el PRECIO TOTAL de esa línea exactamente como aparece en la boleta.
"quantity" = el número que aparece al INICIO de la línea (antes del nombre del ítem).

Ejemplos CORRECTOS:
  "2  Pisco Sour             19.800" → {"price": 19800, "quantity": 2}
  "3  Cerveza                12.000" → {"price": 12000, "quantity": 3}
  "   Limonada Jengibre       9.800" → {"price": 9800,  "quantity": 1}
  "2  Big Famous Ribs        47.800" → {"price": 47800, "quantity": 2}
  "1  Mix & Match Fajitas (2 Proteínas) 18.900" → {"price": 18900, "quantity": 1}

REGLA CRÍTICA — cantidad:
  - Solo el número al INICIO de la línea (en la columna CANT) es la cantidad.
  - Si no hay número al inicio de la línea del ítem, quantity = 1.
  - NUNCA heredes la cantidad de la línea anterior.
  - Números DENTRO del nombre NO son cantidad: "(2 Proteínas)", "(3 Proteínas)", "x2", etc.

─── ÍTEMS CON NOMBRE LARGO (BOLETAS TÉRMICAS) ───────────────────────────────

Las impresoras térmicas cortan líneas largas. Cuando el nombre de un ítem no cabe en
una línea, continúa en la siguiente. Reconoce el ítem completo aunque esté partido:

  Ejemplo 1 — nombre partido con guión:
    "1  Mix & Match Fajitas (2 Pro-"
    "   teínas)              18.900"
  → Un solo ítem: "Mix & Match Fajitas (2 Proteínas)" precio=18900, quantity=1

  Ejemplo 2 — precio en línea aparte:
    "2  Bacon Ranch Quesadilla de Car-"
    "   ne                   29.200"
  → Un solo ítem: "Bacon Ranch Quesadilla de Carne" precio=29200, quantity=2

  Ejemplo 3 — precio cortado:
    "   Big Mix & Match Ribs  23.90"
    "   0"
  → Un solo ítem: "Big Mix & Match Ribs" precio=23900 (los dígitos cortados se concatenan)

─── AUTOVALIDACIÓN OBLIGATORIA ──────────────────────────────────────────────

Después de listar los ítems, suma internamente todos sus precios.
Compara esa suma con el SubTotal que ves en la boleta.
Si la diferencia es mayor a 500 pesos, REVISA la imagen nuevamente y busca el o los
ítems que te faltó incluir. Ajusta tu respuesta antes de devolverla.

─── FORMATO FINAL ────────────────────────────────────────────────────────────

Responde ÚNICAMENTE con JSON válido, sin texto extra, sin markdown, sin backticks.
Si la imagen no es una boleta o es ilegible: {"subtotal": null, "items": []}`

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

const MODEL_CASCADE = [
  'gemini-2.5-flash-lite',
  'gemini-2.5-flash',
  'gemini-2.0-flash',
]

async function callGemini(apiKey: string, imageBase64: string, mimeType: string) {
  const genAI = new GoogleGenerativeAI(apiKey)
  const config = { temperature: 0.05, maxOutputTokens: 8192 }

  for (const modelId of MODEL_CASCADE) {
    const model = genAI.getGenerativeModel({ model: modelId, generationConfig: config })

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const result = await model.generateContent([
          PROMPT,
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

export async function POST(req: NextRequest) {
  const apiKey = process.env.GOOGLE_AI_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'GOOGLE_AI_API_KEY no configurada' }, { status: 500 })
  }

  try {
    const { imageBase64, mimeType } = await req.json()
    if (!imageBase64 || !mimeType) {
      return NextResponse.json({ error: 'Falta imagen' }, { status: 400 })
    }

    const result = await callGemini(apiKey, imageBase64, mimeType)
    const rawText = result.response.text()
    const clean = rawText
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/g, '')
      .trim()

    let parsed: { subtotal?: number | null; items?: Array<{ name: string; price: number; quantity?: number }> } | Array<{ name: string; price: number; quantity?: number }>
    try {
      parsed = JSON.parse(clean)
    } catch {
      console.error('JSON parse error — raw:', clean)
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
    for (const item of rawItems) {
      if (!item.name?.trim() || typeof item.price !== 'number') continue
      const qty = Math.min(Math.max(1, item.quantity ?? 1), 20)
      const unitPrice = Math.round(item.price / qty)
      if (unitPrice < 200) continue
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
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('OCR route error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
