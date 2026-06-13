# Auditoría de Producto, Growth y Negocio — A-Pagar

> Auditoría realizada por equipo PM + Growth + Startup Analyst. Basada en lectura directa del código fuente (README, AUDITORIA, src/app, src/types, supabase/migrations). Fecha: junio 2026.

---

## Resumen ejecutivo

A-Pagar es una PWA chilena de nicho preciso: resolver la fricción de dividir la cuenta de restaurante entre amigos usando transferencias bancarias locales. El producto ya es funcional y tiene una propuesta diferenciada (OCR con IA, link compartible, tiempo real), pero opera sin modelo de negocio, sin analítica de comportamiento, sin retención estructural (no hay cuentas) y con un loop viral que se rompe en el momento crítico: el invitado paga y desaparece.

El riesgo principal no es técnico — es que el uso episódico (salidas a comer) combinado con la falta de memoria cross-device y sin incentivo para que el invitado se convierta en host, produzca un producto con altísima tasa de adquisición viral pero retención casi nula y KAN (K-factor efectivo) que no se captura.

Las prioridades de negocio inmediatas son: (1) cerrar el loop invitado→host, (2) implementar una analítica mínima viable para medir el funnel real, (3) elegir un modelo de monetización antes de escalar.

---

## 1. Propuesta de valor y posicionamiento

### La frase clave

"El anfitrión saca foto a la boleta, la IA lee todo, manda un link por WhatsApp y cada uno paga exactamente lo que pidió — sin registro, sin app, sin cobro manual."

### Por qué es diferente de las alternativas reales en Chile

| Dimensión | Dividir a ojo / calculadora | Splitwise | App del banco (Fintoc, MACH link) | A-Pagar |
|---|---|---|---|---|
| Requiere instalar algo | No | Sí (app) | No / varía | No (PWA) |
| Requiere registro | No | Sí | Sí (cuenta bancaria) | No |
| Lee la boleta con IA | No | No | No | Sí |
| Soporta ÷N por ítem compartido | No | No (manual) | No | Sí |
| Link compartible por WhatsApp | No | No (requiere que todos tengan app) | Parcial (solo monto fijo) | Sí |
| Comprobante con foto | No | No | Parcial | Sí |
| Realtime para el host | No | No | No | Sí (Supabase) |
| Costo al usuario | 0 | 0 / freemium | 0 | 0 |
| Funciona offline (básico) | Sí | No | No | Sí (service worker) |

### El "momento aha" real

Ocurre **en el dispositivo del invitado**, no del host. El invitado abre el link, ve su nombre ya en la lista junto a los demás, ve los ítems con los precios reales de la boleta (no montos estimados), toca los suyos, ve en tiempo real cuánto debe exactamente, y le aparecen los datos del banco del anfitrión listos para copiar (o un botón "Pagar ahora" si hay link de pago). Todo en bajo 60 segundos, sin crear cuenta.

**Ese momento es 10x mejor que la alternativa** porque elimina el único trabajo que nadie quiere hacer: "¿cuánto me toca a mí exactamente con propina incluida?".

### Posicionamiento correcto

No competir con Splitwise (deudas entre amigos con historia larga). Posicionarse como **"el link de la boleta del restaurant"** — efímero, instantáneo, sin fricción. El eje de diferenciación es **zero-friction para el invitado**: no descarga, no cuenta, solo abre el link y paga.

---

## 2. Loop de crecimiento

### Mapa del loop viral (como está hoy)

```
[HOST crea boleta]
       │
       ▼
[Genera link único /s/<id>]
       │
       ▼ WhatsApp al grupo
[N INVITADOS abren el link] ← EXPOSICIÓN a la marca A-Pagar
       │
       ▼
[Cada uno: nombre → ítems → transfiere → sube comprobante]
       │
       ▼
[HOST confirma en /host/<id>]
       │
       ▼
[Sesión cerrada / abandonada]
       │
       X ← AQUÍ SE ROMPE EL LOOP
```

### Donde se rompe: el punto de fuga principal

El invitado completa su flujo (paga, sube comprobante, ve "¡Listo!") y **no hay ninguna pantalla, copy, ni CTA que le invite a ser host la próxima vez**. La última pantalla que ve el invitado (`step: 'done'`) es un mensaje de confirmación — y ahí termina su relación con el producto.

**Este es el punto de fuga crítico.** Cada boleta con N participantes es una oportunidad de convertir N-1 personas en futuros hosts. Si esa conversión es 0%, el loop no cierra y el crecimiento depende 100% del host original siendo consistente en usar la app cada vez que sale.

### Palancas para cerrar el loop invitado→host

**Palanca 1 — Post-pago CTA (impacto alto, esfuerzo bajo):**
En la pantalla `done` del invitado, agregar un bloque: "¿La próxima salida la organizas tú? Crea la boleta en 30 segundos →". Este es el cambio de mayor ROI: está en el momento de mayor satisfacción del usuario (acaba de pagar sin drama).

**Palanca 2 — Atribución del invitado (impacto medio, esfuerzo medio):**
Cuando el invitado en `done` toca "Crear mi boleta", pre-rellenar el flujo de creación con el nombre que ya ingresó. Reduce fricción de onboarding del host.

**Palanca 3 — WhatsApp de cierre como loop (impacto alto, esfuerzo medio):**
El host ya tiene la feature de recordatorio. Se puede añadir un mensaje de cierre automático al grupo cuando la boleta se cierra: "✅ La cuenta de [Restaurante] quedó saldada. Próxima vez usa A-Pagar: apagar.cl" — esto expone el producto a personas que ni siquiera abrieron el link.

**Palanca 4 — Historial como gancho de retorno (impacto medio, esfuerzo bajo):**
La pantalla `done` del invitado puede mostrar "Puedes ver esta boleta en tu historial → Mis boletas". Eso introduce al invitado al concepto de historial local y la URL de la app como lugar al que volver.

### Estimación del K-factor potencial

Asumiendo una boleta promedio de 4 personas:
- 1 host + 3 invitados por boleta
- Si el 15% de invitados crean una boleta en los siguientes 30 días → K = 0.45 (bueno)
- Si el 5% lo hacen (sin palancas) → K = 0.15 (bajo, crecimiento lento)
- Si el 25% lo hacen (con palancas activas) → K = 0.75 (muy bueno para B2C sin ads)

El producto tiene la estructura para un K-factor alto. No tiene los mecanismos de conversión implementados.

---

## 3. Activación y funnel

### Funnel del host (creador)

| Paso | Descripción | Fricción estimada | Hipótesis de caída |
|---|---|---|---|
| 0. Landing | Ve "/", CTA "Dividir boleta ahora →" | Muy baja | — |
| 1. Elegir modo | "Por ítems" vs "Partes iguales" | Baja | <5% abandono aquí |
| 2a. Foto + OCR | Sube foto, espera procesamiento Gemini | Media-alta | OCR falla o items incorrectos → 20-35% abandona o retrocede |
| 2b. Editar ítems | Corregir lo que la IA no leyó bien | Media | 10-15% abandona si hay muchas correcciones |
| 3. Datos del host | Nombre + banco + cuenta + RUT + email | Alta | Mayor punto de caída: formulario largo con 6 campos, 2 selects |
| 4. Genera link | "Generar link para compartir" | Baja | — |
| 5. Comparte | Botón WhatsApp o copiar | Baja | — |

**Punto de caída más crítico para el host: el paso 3 (datos bancarios).** El formulario tiene 6 campos (nombre, banco, tipo de cuenta, número, RUT, email) más el campo opcional de link de pago. Es el mayor esfuerzo que se le pide al host. Hipótesis: 25-40% de hosts que llegan al paso de ítems no completan el registro de datos bancarios.

**Mejora inmediata:** recordar los datos del host en `localStorage` entre sesiones (el nombre, banco, RUT ya debería pre-rellenarse si el mismo dispositivo creó una boleta antes). Hoy no hay evidencia de que esto esté implementado.

### Funnel del invitado

| Paso | Descripción | Fricción | Hipótesis de caída |
|---|---|---|---|
| 0. Recibe link WhatsApp | Clic desde grupo | Baja (contexto social) | — |
| 1. Ingresa nombre | Input simple | Muy baja | 5-10% abandona aquí |
| 2. Marca ítems | Toggle / ÷N | Baja-Media | 10% no sabe qué tocó o ya lo marcaron otros |
| 3. Ve monto y datos | Pantalla de transferencia | Muy baja | — |
| 4. Transfiere y sube comprobante | Sale a app bancaria, vuelve | Media | 20-30% transfiere pero no vuelve a subir comprobante |
| 5. Done | Pantalla final | — | AQUÍ no hay CTA de conversión |

**Punto de caída más crítico del invitado: paso 4.** El usuario sale de la app para transferir (app bancaria / MACH / Mercado Pago) y puede no volver a subir el comprobante. El host confirma de todas formas, pero el flujo se percibe como incompleto. El botón "Ya transferí" (sin comprobante) existe como escape pero podría estar más prominente.

---

## 4. Monetización

### Tabla de opciones evaluadas

| Modelo | Encaje con el producto | Disposición a pagar | Riesgo | Esfuerzo | Veredicto |
|---|---|---|---|---|---|
| **Propina voluntaria al producto** ("Apoya A-Pagar con $X") en pantalla `done` del host o invitado | Alto: momento de satisfacción post-transacción exitosa, natural en CL | Baja-media (~5-15% converts, ticket $500-2.000 CLP) | Bajo | Muy bajo (1-2 días) | Viable como primer ingreso, no escalable |
| **Freemium — límite de boletas gratis** (ej: 3 boletas gratis, luego $X/mes) | Medio: rompe el ciclo viral, penaliza hosts frecuentes | Media (quien la usa frecuente puede pagar) | Alto: destruye adoption en fase early | Medio | No recomendado ahora |
| **Plan Pro para hosts frecuentes** (sin límite, historial cloud, recordatorios automáticos, PDF de boleta) | Alto: segmenta usuarios de alto valor sin penalizar el uso casual | Media-alta ($2.990-4.990 CLP/mes) | Bajo | Medio-alto (requiere auth) | Recomendado a mediano plazo |
| **Comisión sobre el pago** (% de cada transferencia) | Bajo: las transferencias son bancarias directas, A-Pagar no es intermediario de pago | N/A | Muy alto: requiere pasarela, regulación fintech | Muy alto | No viable en Chile sin ser entidad de pago |
| **B2B — restaurantes** (embed en menú digital, boleta generada automática por el mozo) | Alto: el restaurante tiene incentivo (menos problemas de propina, mejor experiencia) | Media-alta (~$15.000-29.000 CLP/mes por local) | Medio (ciclo de venta B2B largo) | Alto (integración con sistema de caja o tablet del restaurant) | Viable a largo plazo, pivot de modelo |
| **Publicidad contextual** (banner de banco, Mercado Pago, MACH dentro de la pantalla de transferencia) | Medio-bajo: degrada UX en el momento clave | Baja (CPM bajo en Chile) | Medio (daña marca) | Bajo | No recomendado |
| **Datos / insights anonimizados** (patrones de gasto en restaurantes) | Bajo: volumen necesario no existe hoy | N/A | Alto (privacidad, regulación) | Alto | No viable en stage actual |

### Recomendación: dos modelos en secuencia

**Fase 1 — ahora (0-6 meses): Propina voluntaria al producto**

Implementar un bloque en la pantalla `done` del host, después de que el último pago es confirmado:

```
"✅ ¡Boleta saldada sin drama!
¿Quieres apoyar A-Pagar?
[Invitar a un café $500] [Con gusto $1.000] [No, gracias]"
```

- Cero fricción: el host ya hizo el trabajo, la boleta está cerrada, es el mejor momento de gratitud.
- Analogía: la propina real al garçón. Psicológicamente consistente con el contexto.
- Estimación conservadora: si el 8% de sesiones cerradas convierten a $800 CLP promedio → con 500 boletas/mes cerradas = $32.000 CLP/mes (ruido). A 5.000 boletas/mes = $320.000 CLP/mes. Escala con el crecimiento.
- Sin necesidad de auth ni cambio de modelo.

**Fase 2 — mediano plazo (6-18 meses): Plan Pro para hosts frecuentes**

Una vez que haya auth ligera (magic link), ofrecer:

- Gratis: historial local, hasta X boletas/mes
- Pro ($2.990 CLP/mes o ~$29.990/año): historial cloud cross-device, pre-relleno de datos bancarios, recordatorios automáticos (sin tener que abrir WhatsApp manualmente), exportar PDF de boleta, estadísticas de cuánto has gastado / cuánto has cobrado

Segmento objetivo: el "host recurrente" — la persona que organiza salidas frecuentemente (amigos fijos, pólizas de trabajo, asados). Es un segmento pequeño pero con alta disposición a pagar.

---

## 5. Retención y el dilema auth

### El problema estructural

El historial es por dispositivo (`localStorage`). Si el usuario cambia de teléfono, navega en incógnito, o limpie el navegador, pierde todo. El host token (para confirmar pagos) vive solo en ese dispositivo: perderlo significa no poder gestionar boletas activas.

Para un producto de uso episódico (1-4 veces/mes promedio), la retención por hábito es difícil. Las razones para volver son:
1. Salir a comer de nuevo (externo, no controlable)
2. Ver el historial de boletas pasadas (controlable, pero limitado sin auth)
3. Tener los datos bancarios pre-rellenados para la próxima (high value, hoy no existe)

### El trade-off auth

| Dimensión | Sin auth (hoy) | Auth ligera (magic link / OTP) |
|---|---|---|
| Fricción de activación | Mínima: 0 pasos extra | Baja: +1 paso (email o teléfono) |
| Historial cross-device | No | Sí |
| Pre-relleno de datos bancarios | No (se pierden) | Sí (gran UX win para el host) |
| Retención medible | No (no hay identity) | Sí (puedes hacer email sequences) |
| Posibilidad de monetizar Pro | No | Sí |
| K-factor trackeable | No | Sí |
| Riesgo de abandono | Bajo | Medio (si el email/OTP falla o es lento) |
| Complejidad técnica | — | Media (Supabase Auth ya está en el stack) |

### Recomendación

**Implementar auth opcional progresiva, no obligatoria.**

Flujo sugerido:
1. El host crea la boleta (sin auth, igual que hoy).
2. Al final, cuando el link está generado, mostrar: "¿Quieres guardar esta boleta en la nube para no perderla? Ingresa tu email →" (opcional, un campo, un botón).
3. Si lo hace: se crea cuenta silenciosa (Supabase Auth magic link), la sesión queda vinculada.
4. La próxima vez que abra la app en otro dispositivo, el email lo reconoce y restaura su historial.

Ventajas: no rompe el flujo actual, no es barrera de entrada, pero construye base de usuarios identificados. Supabase Auth ya está como dependencia en el proyecto — el costo de implementación es bajo.

**No hacer auth obligatoria.** El "sin registro" es parte central de la propuesta de valor. Convertirlo en requerido destruye la tasa de activación.

---

## 6. Métricas: North Star + eventos a instrumentar

### North Star

**"Boletas cerradas al 100% en el mes"** (todas las transferencias confirmadas por el host)

Esta métrica captura todo lo que importa:
- Una boleta "cerrada al 100%" significa que el host la usó (activación), todos los invitados participaron (engagement del producto), y el host recibió su plata (valor entregado).
- Es la única métrica que prueba que el producto cumplió su promesa de principio a fin.

Métrica secundaria: **"Hosts con 2+ boletas cerradas en 60 días"** (retención real).

### Funnel de métricas a instrumentar (hoy solo hay @vercel/analytics)

```
ADQUISICIÓN
  E01: page_view {page: 'landing'}
  E02: cta_click {label: 'dividir_boleta_ahora'}

ACTIVACIÓN HOST
  E03: modo_seleccionado {mode: 'items' | 'equal'}
  E04: ocr_iniciado
  E05: ocr_completado {items_count, mismatch: bool}
  E06: items_confirmados {items_count, subtotal}
  E07: host_data_completado {has_payment_link: bool}
  E08: sesion_creada {split_mode, items_count}

ACTIVACIÓN INVITADO
  E09: participant_joined {session_id}
  E10: items_marked {items_count, total_amount}
  E11: transfer_step_reached
  E12: payment_submitted {has_comprobante: bool}

ENGAGEMENT / VALOR
  E13: payment_confirmed_by_host {all_paid: bool}
  E14: session_closed
  E15: reminder_sent_whatsapp {pending_count}

LOOP VIRAL
  E16: link_copied | whatsapp_shared (host)
  E17: invitado_cta_host_click (en pantalla done del invitado) ← no existe aún
  E18: new_session_from_former_participant ← atribución del loop

RETENCIÓN
  E19: returning_host {days_since_last: int}
  E20: historial_viewed
```

### KPIs derivados (calcular semanalmente cuando haya volumen)

| KPI | Fórmula | Target saludable |
|---|---|---|
| Activation Rate (host) | E08 / E02 | > 40% |
| Activation Rate (invitado) | E12 / E09 | > 65% |
| Completion Rate | E14 / E08 | > 50% |
| Viral Coefficient K | (E09 total / E08 total) × (E18 / E09) | > 0.3 |
| Host Retention D30 | hosts con E08 en día 0 y E08 en día 1-30 | > 20% |
| OCR Success Rate | E05 con mismatch:false / E04 | > 70% |

---

## 7. Riesgos de negocio

### Riesgo 1 — Producto de un solo uso episódico sin memoria

Un usuario que sale a comer 2 veces al mes tiene 24 oportunidades al año de usar A-Pagar. Si el historial se pierde (nuevo dispositivo), la app vuelve a ser nueva para él. Sin auth, la "retención" es ilusoria — es re-adquisición repetida de la misma persona.

**Mitigación:** auth opcional como se describe en §5.

### Riesgo 2 — Dependencia de Gemini OCR con costo variable

El OCR es la feature estrella y el punto de diferenciación más fuerte. Gemini tiene costo por token/imagen. A escala (10.000+ boletas/mes), el costo puede ser significativo. Hoy no hay modelo de monetización que financie ese costo.

Estimación rough: si Gemini Flash cuesta ~$0.00007/imagen y hay 3 intentos promedio por boleta (cascade lite→flash→re-analyze), son $0.0002/boleta. A 10.000 boletas/mes = $2 USD/mes. Manejable. A 100.000 = $20 USD/mes. Sigue siendo bajo, pero es un costo con crecimiento lineal sin revenue correspondiente.

**Mitigación:** propina voluntaria al producto cubre esto fácilmente a mediana escala.

### Riesgo 3 — Competencia de apps bancarias chilenas

Banco Estado, BCI, Santander y neobancos (MACH, Fintoc, Tenpo) tienen toda la infraestructura para construir una feature similar. Si un banco grande la lanza como feature nativa de su app (donde ya está el usuario para transferir), A-Pagar pierde la fricción de "abrir otra app/link".

**Mitigación parcial:** A-Pagar es agnóstico al banco — funciona para transferencias entre cualquier banco, lo que ningún banco haría para un competidor. El OCR con IA y la experiencia del invitado sin registro son difíciles de replicar dentro de las restricciones de UX de una app bancaria corporativa. La velocidad de iteración también es ventaja.

### Riesgo 4 — Sin historial de datos del host = re-fricción en cada uso

El mayor pain del host recurrente es rellenar sus datos bancarios cada vez. Hoy los datos no se pre-rellenan entre sesiones (a pesar de estar en localStorage, el flujo de creación no los restaura). Esto hace que cada boleta tenga el mismo costo de configuración, lo que desincentiva el uso frecuente.

**Mitigación:** persistir datos del host en localStorage entre sesiones. Esfuerzo: 1 día. Impacto alto en retención del host frecuente.

### Riesgo 5 — Sin analítica de comportamiento

Hoy solo hay `@vercel/analytics` (page views). No se saben las tasas de conversión del funnel, cuántos usuarios abandonan en el formulario de datos bancarios, ni si el OCR es percibido como útil o frustrante. Decisiones de producto sin datos = apuestas.

**Mitigación:** instrumentar los eventos del §6 con Posthog (tiene plan gratuito generoso, fácil de integrar en Next.js) o con Vercel Analytics custom events.

---

## 8. Quick wins de producto (alto impacto, bajo esfuerzo)

En orden de prioridad:

**QW1 — Pre-rellenar datos del host desde localStorage** (1-2 días)
Si el dispositivo ya creó una boleta, en el paso "Datos del host" rellenar automáticamente nombre, banco, tipo de cuenta, número, RUT. El usuario solo verifica y continúa. Elimina el mayor punto de fricción del host recurrente.

**QW2 — CTA invitado→host en pantalla `done`** (1 día)
Después de "¡Listo! Tu pago fue registrado", agregar: "¿La próxima salida la organizas tú? [Crear boleta ahora]". Es el mayor lever del loop viral y está en el momento emocional más positivo.

**QW3 — Propina voluntaria al producto en pantalla `done` del host** (1-2 días)
Cuando el host cierra la boleta o todos los pagos están confirmados, mostrar CTA de apoyo voluntario ($500 / $1.000 / $2.000 CLP). Primer camino a monetización real.

**QW4 — Mensaje de cierre al grupo por WhatsApp** (1 día)
Al cerrar la boleta, ofrecer al host enviar al grupo: "✅ Cuenta de [Restaurante] saldada. Próxima vez usa A-Pagar: [URL]". Cierra el loop viral de forma orgánica.

**QW5 — Analítica mínima con Posthog** (2-3 días)
Instrumentar E01→E14 del §6. Sin esto, las decisiones de producto son a ciegas.

**QW6 — Botón "Pagar ahora" más prominente cuando hay `host_payment_link`** (horas)
Revisando el código, el link de pago existe como campo opcional pero su prominencia en la pantalla del invitado puede variar. Es el feature más directo para acelerar el tiempo al pago.

---

## 9. Preguntas abiertas / hipótesis a validar

**Sobre el usuario:**
1. ¿Quién es el host típico? ¿Siempre el mismo en un grupo de amigos ("el organizador"), o rota? Si rota, el K-factor sube dramáticamente.
2. ¿Cuántos ítems tiene una boleta promedio? (define si el OCR es el camino principal o "partes iguales" domina)
3. ¿Qué porcentaje de invitados sube comprobante vs usa "Ya transferí"? (define si el comprobante es feature real o fricción)
4. ¿Cuánto tarda el flujo completo del host (creación → link) en una sesión real? ¿Es menor a 3 minutos?

**Sobre el mercado:**
5. ¿Hay segmento B2B real? Los garzones de restaurantes con grupos grandes (cumpleaños, empresas) tienen el mismo problema y podría haber un canal directo con locales.
6. ¿Cuál es el ticket promedio de una boleta chilena de restaurante entre amigos? (define si la comisión hipotética en pesos tiene sentido)

**Sobre el producto:**
7. ¿El OCR de Gemini funciona bien con boletas térmicas de restaurantes locales fuera de Santiago? (riesgo de calidad en provincias)
8. ¿El "modo partes iguales" es suficientemente rápido vs simplemente dividir en la calculadora del teléfono? (¿cuál es el diferenciador real aquí?)
9. ¿Cuál es el límite práctico de participantes por sesión? (grupos grandes de 10+ personas pueden tener problemas de concurrencia en claims)
10. Si se implementa auth magic link, ¿qué porcentaje de hosts la usarían? (hipótesis: 30-40% de hosts recurrentes, 5% de hosts únicos)
