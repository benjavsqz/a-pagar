import { test, expect, type BrowserContext } from '@playwright/test'

// Flujos de inicio a fin de A-Pagar contra el dev server + Supabase real.
// Crea datos de prueba etiquetados "E2E" (boletas reales en la DB).
// Requiere migraciones 005–009 aplicadas (host_token, register_host_participant,
// confirm_payment) para que confirmar/cerrar funcionen.

function sessionIdFrom(hostUrl: string): string {
  return hostUrl.split('/host/')[1].split(/[?#]/)[0]
}

// ── Flujo 1: por ítems, de punta a punta ────────────────────────────────────────

test('flujo por ítems: crear → unirse → marcar → pagar → confirmar → cerrar', async ({ browser }) => {
  const hostCtx = await browser.newContext()
  const host = await hostCtx.newPage()

  // Crear boleta por ítems (entrada manual, sin OCR)
  await host.goto('/crear')
  await host.getByRole('button', { name: /Por ítems/ }).click()
  await host.getByRole('button', { name: /Ingresar ítems a mano/ }).click()
  await host.getByPlaceholder('Nombre del ítem').first().fill('Pizza')
  await host.getByPlaceholder('0').first().fill('12000')
  await host.getByRole('button', { name: /^Continuar/ }).click()
  await host.getByLabel(/Tu nombre/).fill('Host E2E')
  await host.getByRole('button', { name: /Generar link para compartir/ }).click()

  await host.waitForURL(/\/host\/[0-9a-f-]{36}/, { timeout: 20_000 })
  const sessionId = sessionIdFrom(host.url())
  expect(sessionId).toMatch(/[0-9a-f-]{36}/)

  // El panel host carga sin error (botón de cerrar boleta presente)
  await expect(host.getByRole('button', { name: /^Cerrar boleta/ })).toBeVisible({ timeout: 15_000 })

  // Un invitado entra en su propio contexto (localStorage separado)
  const guestCtx: BrowserContext = await browser.newContext()
  const guest = await guestCtx.newPage()
  await guest.goto(`/s/${sessionId}`)
  await guest.getByLabel(/¿Cómo te llamas\?/).fill('Invitado E2E')
  await guest.getByRole('button', { name: /^Entrar/ }).click()

  // Marca el ítem "Pizza"
  await guest.getByRole('button', { name: /Pizza/ }).first().click()

  // Avanza a transferir y marca como pagado sin comprobante
  await guest.getByRole('button', { name: /Ver cómo transferir/ }).click()
  await guest.getByRole('button', { name: /Ya transferí, sin comprobante/ }).click()
  await expect(guest.getByRole('heading', { name: /¡Listo!/ })).toBeVisible({ timeout: 15_000 })

  // El host ve al invitado; abre su tarjeta y confirma el pago
  await host.reload()
  await expect(host.getByText('Invitado E2E')).toBeVisible({ timeout: 20_000 })
  await host.getByRole('button', { name: /Invitado E2E/ }).click()
  const confirmar = host.getByRole('button', { name: /Confirmar pago recibido/ })
  await expect(confirmar.first()).toBeVisible({ timeout: 15_000 })
  await confirmar.first().click()
  await expect(host.getByText(/Pagado|confirmad/i).first()).toBeVisible({ timeout: 15_000 })

  // Cierra la boleta (modal accesible). El modal solo se cierra si close_session
  // tuvo éxito → su desaparición es la señal de cierre correcto.
  await host.getByRole('button', { name: /^Cerrar boleta/ }).click()
  const dialog = host.getByRole('alertdialog')
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: /Cerrar boleta/ }).click()
  await expect(dialog).toBeHidden({ timeout: 15_000 })

  await guestCtx.close()
  await hostCtx.close()
})

// ── Flujo 3: el host marca su propio consumo (is_host) ──────────────────────────

test('host marca lo que consumió: sección "Lo que consumí yo" funciona', async ({ browser }) => {
  const hostCtx = await browser.newContext()
  const host = await hostCtx.newPage()

  // Crear boleta por ítems
  await host.goto('/crear')
  await host.getByRole('button', { name: /Por ítems/ }).click()
  await host.getByRole('button', { name: /Ingresar ítems a mano/ }).click()
  await host.getByPlaceholder('Nombre del ítem').first().fill('Pizza')
  await host.getByPlaceholder('0').first().fill('12000')
  await host.getByRole('button', { name: /^Continuar/ }).click()
  await host.getByLabel(/Tu nombre/).fill('Host Consumo E2E')
  await host.getByRole('button', { name: /Generar link para compartir/ }).click()
  await host.waitForURL(/\/host\/[0-9a-f-]{36}/, { timeout: 20_000 })

  // La sección del host aparece (requiere que register_host_participant haya creado
  // el participante is_host → valida que la migración 008 está aplicada).
  const seccion = host.getByRole('button', { name: /Lo que consumí yo/ })
  await expect(seccion).toBeVisible({ timeout: 15_000 })
  await seccion.click()

  // El host marca la Pizza como suya
  await host.getByRole('button', { name: /Pizza/ }).first().click()

  // El subtítulo refleja su consumo y que NO se le cobra
  await expect(host.getByText(/no se te cobra/i)).toBeVisible({ timeout: 15_000 })

  await hostCtx.close()
})

// ── Flujo 2: partes iguales ─────────────────────────────────────────────────────

test('flujo partes iguales: crear → unirse → ver monto a pagar', async ({ browser }) => {
  const hostCtx = await browser.newContext()
  const host = await hostCtx.newPage()

  await host.goto('/crear')
  await host.getByRole('button', { name: /Partes iguales/ }).click()
  await host.getByPlaceholder('0').first().fill('30000')   // total
  await host.getByPlaceholder('2').first().fill('3')        // personas
  await host.getByRole('button', { name: /^Continuar/ }).click()
  await host.getByLabel(/Tu nombre/).fill('Host Equal E2E')
  await host.getByRole('button', { name: /Generar link/ }).click()

  await host.waitForURL(/\/host\/[0-9a-f-]{36}/, { timeout: 20_000 })
  const sessionId = sessionIdFrom(host.url())

  const guestCtx = await browser.newContext()
  const guest = await guestCtx.newPage()
  await guest.goto(`/s/${sessionId}`)
  await guest.getByLabel(/¿Cómo te llamas\?/).fill('Invitado Equal')
  await guest.getByRole('button', { name: /Entrar y pagar|^Entrar/ }).click()

  // En modo equal salta directo a transferir y muestra el monto (10.000 = 30.000 ÷ 3)
  await expect(guest.getByText(/\$\s?10\.000|Datos para transferir|transferir/i).first())
    .toBeVisible({ timeout: 15_000 })

  await guestCtx.close()
  await hostCtx.close()
})
