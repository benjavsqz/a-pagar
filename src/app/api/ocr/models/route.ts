import { NextResponse } from 'next/server'

export async function GET() {
  const apiKey = process.env.GOOGLE_AI_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'No API key' }, { status: 500 })

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}&pageSize=50`
  )
  const data = await res.json()

  // Filtrar solo los que soportan generateContent
  const models = (data.models ?? [])
    .filter((m: { supportedGenerationMethods?: string[] }) =>
      m.supportedGenerationMethods?.includes('generateContent')
    )
    .map((m: { name: string; displayName?: string }) => ({
      name: m.name,
      displayName: m.displayName,
    }))

  return NextResponse.json({ models, raw: data })
}
