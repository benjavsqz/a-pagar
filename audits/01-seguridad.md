# Auditoría de Seguridad — A-Pagar

> Fecha: 2026-06-13  
> Auditor: Claude Sonnet 4.6 (rol: auditor senior de seguridad)  
> Alcance: código fuente completo + migraciones SQL + configuración. Solo lectura — sin modificaciones.  
> Skills aplicadas: security-auditor, pci-compliance, privacy-by-design, gdpr-data-handling, secrets-management, backend-security-coder, api-security-best-practices

---

## Resumen ejecutivo

A-Pagar es una PWA fintech chilena de bajo volumen con un modelo de seguridad sin autenticación ("trust model"), donde la seguridad descansa en RLS de Supabase + un hostToken generado en el cliente. La postura de riesgo es **Media-Alta** para un MVP, con mejoras significativas implementadas entre las migraciones 001 y 005 (se corrigieron vectores críticos de redireccionamiento bancario y escalada de privilegios). Sin embargo, persisten **3 hallazgos Críticos** que bloquean lanzamiento en producción: (1) el modelo de token legacy permite confirmar pagos y cerrar boletas en sesiones antiguas sin ningún token, (2) cualquier persona con la anon key puede suscribir cualquier endpoint al canal push de cualquier sesión sin verificar que sea un participante legítimo de esa sesión, y (3) el bucket de comprobantes tiene policies de Storage incompletas que potencialmente permiten listar/acceder archivos de sesiones ajenas. Los datos PII (RUT, cuenta bancaria, correo, nombre) se almacenan en claro en la tabla `sessions` accesible por cualquier persona con el link. El `.env.local` no está en git (bien), pero el archivo existe en disco con la service-role key de Supabase en claro.

---

## Hallazgos (priorizados)

---

### **[SEV: CRÍTICO] Legacy mode bypasses token validation entirely**

- **Ubicación:** `supabase/migrations/005_host_token.sql:66` y `src/hooks/use-session.ts:123-129`
- **Descripción técnica:**
  Las RPCs `confirm_payment` y `close_session` tienen una cláusula explícita de compatibilidad: *"Legacy: sesiones sin secreto se permiten"*. La comprobación es `if v_secret is not null and (p_token is null or v_secret <> p_token) then raise exception`. Si `v_secret IS NULL` (ningún registro en `session_secrets` para esa sesión), cualquier llamada pasa sin validar el token, incluso con `p_token = NULL`.

  El cliente también tiene su propio fallback legacy en `use-session.ts:123-129`: si el RPC devuelve error `PGRST202` (función no encontrada = migración 005 no aplicada), cae a un UPDATE directo sin token.

- **Impacto / escenario de explotación:**
  - Cualquier participante (o atacante) que conozca el `session_id` (embebido en la URL `/host/UUID`) puede llamar directamente via PostgREST:
    ```
    POST https://<proyecto>.supabase.co/rest/v1/rpc/confirm_payment
    { "p_session_id": "<UUID>", "p_participant_id": "<UUID>", "p_token": null }
    ```
    Si la sesión fue creada antes de la migración 005, la confirmación procede sin el token. Un participante podría auto-confirmarse el pago sin que el host haya verificado la transferencia.
  - El mismo vector aplica a `close_session`: cualquiera puede cerrar una boleta abierta.
  - El código frontend también hereda este riesgo: si la migración 005 no está aplicada en producción, el fallback UPDATE directo no tiene ningún control.

- **Recomendación:**
  Eliminar el modo legacy: una vez aplicada la migración 005 a producción, las sesiones previas que no tengan registro en `session_secrets` deberían **bloquear** las acciones de host (no permitirlas). Si se requiere compatibilidad con boletas antiguas, ofrecer un flujo de "re-registro de token" (el host que tenga la URL `/host/UUID` puede registrar un nuevo secreto). Además, eliminar el fallback legacy del código cliente en `use-session.ts`.

---

### **[SEV: CRÍTICO] Push subscription: sin validación de pertenencia a sesión**

- **Ubicación:** `src/app/api/push/subscribe/route.ts` (completo) y `supabase/migrations/003_push_subscriptions.sql:19`
- **Descripción técnica:**
  El endpoint `POST /api/push/subscribe` acepta `{ subscription, sessionId, participantId, role }` sin verificar que `participantId` pertenezca a `sessionId`, ni que el `role` sea legítimo. La policy de INSERT en `push_subscriptions` es `WITH CHECK (true)` — completamente abierta.

  Esto significa que:
  1. Cualquier persona puede registrarse como `role: 'host'` en cualquier `session_id`, sin poseer el `hostToken`.
  2. Un atacante puede registrar su propio endpoint push como "host" de cualquier sesión e interceptar la notificación de `payment_received` (que contiene nombre del participante y monto).
  3. También puede registrar endpoints para espiar `payment_confirmed` de otros participantes en sesiones donde no participa.

- **Impacto / escenario de explotación:**
  - Privacy: un atacante recibe notificaciones de pagos de sesiones ajenas.
  - Spam / fatiga: puede registrar miles de endpoints maliciosos, degradando el servicio de push.
  - El payload de la notificación incluye `participantName`, `amount`, `url` — datos personales enviados a un tercero.

- **Recomendación:**
  En `/api/push/subscribe`: validar que `sessionId` es un UUID existente; si `role === 'participant'`, verificar que `participantId` existe en `participants` con `session_id = sessionId`; si `role === 'host'`, requerir el `hostToken` en el body y validarlo contra `session_secrets` (usando el admin client, nunca el anon). Agregar rate limiting al endpoint.

---

### **[SEV: CRÍTICO] Storage: policies insuficientes — posible enumeración de comprobantes ajenos**

- **Ubicación:** `supabase/migrations/001_initial.sql:123-129` y `005_host_token.sql:139-143`
- **Descripción técnica:**
  La migración 001 crea el bucket `comprobantes` como `public = true` con policy `comprobantes_read_public`. La migración 005 lo convierte a `public = false` y sube el `file_size_limit` a 5 MB — correcto. Sin embargo, **no hay policy de SELECT para Storage** en ninguna migración. Las policies creadas son solo para INSERT (en la migración 001). La migración 005 solo actualiza el bucket, no crea policies de SELECT privadas.

  El código en `comprobante-link.tsx:22-27` genera una signed URL mediante el cliente anon del browser: `supabase.storage.from('comprobantes').createSignedUrl(value, 3600)`. Para que esto funcione, el rol `anon` debe tener permiso de `createSignedUrl` — lo cual requiere al menos acceso al objeto o que el bucket sea público de otro modo.

  Adicionalmente, el path de los comprobantes es `${sessionId}/${participantId}.${ext}` — predecible si se conocen los UUIDs (que son públicos vía la tabla `participants`).

- **Impacto / escenario de explotación:**
  - Si las policies de Storage son permisivas por defecto en Supabase (bucket privado sin policies = deny all), entonces `createSignedUrl` falla para el rol anon y los comprobantes no son visibles ni siquiera para el host legítimo. Esto es un bug funcional.
  - Si Supabase permite `createSignedUrl` sin policy explícita de SELECT para el bucket privado, cualquier persona con un `participantId` (obtenible de la tabla `participants` que es pública) puede generar una signed URL del comprobante de otro participante.
  - El host tampoco debería poder acceder a los comprobantes de sesiones donde no es anfitrión.

- **Recomendación:**
  Agregar policy explícita de SELECT en `storage.objects` para el bucket `comprobantes` que restrinja por `session_id` (extraíble del path). Lo ideal: que solo el host con token válido pueda generar signed URLs — esto requiere un endpoint server-side dedicado (API Route) que valide el `hostToken`, use el admin client para generar la URL, y la devuelva. No generar signed URLs directamente en el cliente con la anon key.

---

### **[SEV: ALTO] PII sensible (RUT, cuenta bancaria, correo) en tabla `sessions` con lectura pública total**

- **Ubicación:** `supabase/migrations/001_initial.sql:87` y `004_security_hardening.sql` (sin cambios a esta policy)
- **Descripción técnica:**
  La policy `sessions_read_public` es `FOR SELECT USING (true)` — cualquier persona con la anon key puede leer **cualquier sesión**, incluyendo `host_rut`, `host_account`, `host_bank`, `host_email`, `host_payment_link`, `host_name`. Estos datos persisten en la base indefinidamente (sin TTL).

  En Chile, el RUT es un dato de identificación única personal protegido por la Ley 19.628 y la nueva Ley 21.719 (vigente desde 2026). La combinación RUT + número de cuenta bancaria + correo electrónico es suficiente para intentar fraude bancario (ingeniería social, suplantación).

  El acceso no requiere conocer el `session_id`; con la anon key se puede hacer:
  ```
  GET /rest/v1/sessions?select=host_rut,host_account,host_email&limit=1000
  ```
  y obtener un dump de todos los datos personales del sistema.

- **Impacto / escenario de explotación:**
  - Harvesting masivo de RUTs, cuentas y correos de todos los hosts que hayan usado la app.
  - Brecha de privacidad bajo Ley 21.719: la app tiene obligación de notificar a los titulares ante una filtración de datos de identificación.
  - Phishing / suplantación bancaria usando datos reales del host.

- **Recomendación:**
  (a) Implementar RLS que restrinja `sessions` por `session_id`: `FOR SELECT USING (id = current_setting('request.headers', true)::json->>'x-session-id')::uuid` — o bien, mantener lectura por ID pero bloquear queries sin filtro de sesión. (b) A largo plazo, cifrar `host_rut` y `host_account` en reposo (columnas cifradas en Postgres con `pgcrypto`). (c) Establecer una política de retención: sesiones cerradas con más de N días deberían anonimizar los datos bancarios. (d) Documentar el periodo de retención en la política de privacidad (actualmente no lo especifica).

---

### **[SEV: ALTO] Cualquier participante puede modificar el `amount` de su propio pago**

- **Ubicación:** `supabase/migrations/001_initial.sql:111` (`payments_update_any`) + `005_host_token.sql:32-50` (trigger guard)
- **Descripción técnica:**
  La policy `payments_update_any` en `001_initial.sql` es `FOR UPDATE USING (true)`. El trigger `guard_payment_confirmation` en la migración 005 solo protege el campo `confirmed_by_host` cuando el usuario es `anon` o `authenticated`. Sin embargo, el campo `amount` en payments **no está protegido por ningún trigger**. Un participante puede hacer:
  ```sql
  UPDATE payments SET amount = 1 WHERE participant_id = '<mi_id>'
  ```
  y cambiar su monto a 1 peso antes de que el host confirme.

  El trigger `protect_confirmed_payments` sí congela el monto una vez confirmado (`if old.confirmed_by_host = true ...`), pero el vector es: cambiar el monto antes de que el host confirme.

- **Impacto / escenario de explotación:**
  Un participante deshonesto puede reducir su `amount` a 1 peso, subir cualquier comprobante (la app no verifica que el monto del comprobante coincida), y el host ve el monto manipulado en la UI. El host confía en que la UI refleja el monto real y confirma. El atacante pagó 1 peso.

- **Recomendación:**
  Crear un trigger `protect_payment_amount` que: (a) en INSERT, congele el `amount` calculado server-side (idealmente calculado por una RPC, no confiando en el valor enviado por el cliente); (b) en UPDATE, impida modificar `amount` si el campo ya fue establecido (o solo permita la modificación a través de una RPC server-side que recalcule el monto desde los claims actuales). La acción más simple: agregar al trigger existente una cláusula que prohíba cambiar `amount` una vez que existe un registro de pago.

---

### **[SEV: ALTO] is_host insertable por cualquier cliente: escalada de privilegios**

- **Ubicación:** `supabase/migrations/007_host_participant.sql` y `supabase/migrations/001_initial.sql:99` (`participants_insert_any` reemplazada en 005 por `participants_insert_open_session`)
- **Descripción técnica:**
  La migración 007 agrega la columna `is_host boolean NOT NULL DEFAULT false` a `participants`. La policy vigente para INSERT es `participants_insert_open_session`: `WITH CHECK (exists (select 1 from sessions s where s.id = session_id and s.status = 'open'))`. Esta policy **no** verifica que `is_host = false` en el INSERT.

  Cualquier participante puede insertar:
  ```json
  { "session_id": "<UUID>", "name": "Atacante", "is_host": true }
  ```
  Si la sesión ya tiene un host participante, el unique index `participants_one_host_per_session` lo bloqueará (`unique (session_id) where is_host`). Pero si el host original aún no creó su participante-host (sesiones creadas antes de que el usuario navegue al panel y se registre el participante-host), el atacante puede inscribirse como `is_host = true` primero.

  **Consecuencia en la UI:** el panel del host filtra con `participants.find(p => p.is_host)` para encontrar al host participante. Un atacante que logre insertarse como `is_host = true` aparecería en el panel del host como "su propio consumo", distorsionando los cálculos del consumo del host.

- **Impacto / escenario de explotación:**
  Race condition: entre el INSERT de sesión y el INSERT del participante-host (que ocurre justo después en `crear/page.tsx:249-259`), un atacante que sepa el `session_id` puede insertarse como `is_host`. Ventana de tiempo pequeña pero real. El resultado: el cálculo de `hostSummary` usa los claims del atacante, no del host real.

- **Recomendación:**
  Agregar `WITH CHECK (is_host = false)` a la policy de INSERT de participants. El participante-host debe ser creado por una RPC SECURITY DEFINER que valide el `hostToken`, no por INSERT directo del cliente. Alternativamente, calcular el `is_host` server-side basado en el `session_id` y el token.

---

### **[SEV: ALTO] /api/push/send sin autenticación: cualquiera puede disparar push a cualquier sesión**

- **Ubicación:** `src/app/api/push/send/route.ts` (completo)
- **Descripción técnica:**
  El endpoint `POST /api/push/send` no tiene ninguna forma de autenticación o autorización. Valida que `sessionId` sea un UUID válido y que `event` sea uno de los dos tipos conocidos, pero **no verifica que el llamante tenga relación con esa sesión**. Cualquier persona con acceso a internet puede:
  - Llamar el endpoint con el `session_id` de cualquier sesión y triggerear una notificación push a todos los suscriptores del rol correspondiente.
  - Enviar el `event: 'payment_received'` con un `participantName` y `amount` falsos al host de cualquier sesión.
  - Enviar el `event: 'payment_confirmed'` con datos falsos a cualquier participante.

  El payload de notificación incluye `participantName` y `amount` del body del request, no de la base de datos.

- **Impacto / escenario de explotación:**
  - Phishing: un atacante envía notificaciones push falsas de "pago recibido" con montos inflados para confundir al host.
  - Spam masivo: enumeración de `session_ids` conocidos (o UUIDs aleatorios) y envío masivo de notificaciones.
  - Ingeniería social: notificación falsa de "pago confirmado" al participante para que crea que el host ya confirmó sin haberlo hecho.

- **Recomendación:**
  El endpoint debe verificar la legitimidad del llamante. Para `payment_received`: el body debería incluir el `participantId` del que envió, y el servidor verifica en la DB que ese participante pertenece a esa sesión. Para `payment_confirmed`: requerir el `hostToken` para poder enviar la confirmación. Extraer `participantName` y `amount` directamente de la DB (no confiar en el body del request) usando el admin client.

---

### **[SEV: ALTO] Rate limit del OCR en memoria: ineficaz en serverless**

- **Ubicación:** `src/app/api/ocr/route.ts:159-178`
- **Descripción técnica:**
  El rate limiter usa un `Map` en memoria (`requestLog`) con 10 requests por 10 minutos por IP. En un entorno serverless (Vercel), cada instancia de función tiene su propio proceso en memoria; no hay estado compartido entre instancias. Un atacante puede simplemente realizar peticiones concurrentes o esperar a que la instancia se recicle para resetear el contador.

  Adicionalmente, la IP se extrae de `x-forwarded-for` sin validación: `req.headers.get('x-forwarded-for') ?? 'unknown'`. Un atacante detrás de un proxy o con acceso al header puede falsificar la IP.

  El `MAX_BASE64_LENGTH` es 8 MB de base64 (~6 MB de imagen), pero no hay validación del `Content-Type` del request ni límite en el tamaño del body JSON completo (incluyendo otros campos). Un atacante puede enviar un body de 8 MB en `imageBase64` más campos adicionales arbitrariamente grandes.

- **Impacto / escenario de explotación:**
  - Abuso de cuota de Gemini API: costo directo para el propietario de la aplicación.
  - DoS económico: si la clave de Gemini tiene cuota de pago, un atacante puede agotar el presupuesto mensual.
  - IP spoofing trivial para bypasear el rate limit actual.

- **Recomendación:**
  (a) Implementar rate limiting distribuido con Upstash Redis o similar (un valor por IP/sesión compartido entre instancias). (b) Validar y limitar el tamaño total del body JSON antes de parsear (usar middleware de Next.js o `req.headers.get('content-length')`). (c) Requerir que el request incluya un `sessionId` válido y existente en la DB (como proxy de autenticidad — no perfecto pero reduce el abuso anónimo). (d) Registrar las llamadas por IP en Supabase para poder auditar y bloquear.

---

### **[SEV: ALTO] Secretos en claro en `.env.local` en disco**

- **Ubicación:** `.env.local` (archivo en disco, no en git)
- **Descripción técnica:**
  El archivo `.env.local` contiene en texto plano:
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`: JWT con rol `anon`, expira en 2096 (no rotable fácilmente).
  - `SUPABASE_SERVICE_ROLE_KEY`: JWT con rol `service_role` que salta completamente RLS — acceso total a la base de datos.
  - `GOOGLE_AI_API_KEY`: clave de Gemini API (formato inusual para una clave de Google — podría ser una clave de proyecto con permisos amplios).
  - `VAPID_PRIVATE_KEY`: clave privada VAPID para web-push.

  El archivo está correctamente ignorado por `.gitignore` (patrón `.env*`). Sin embargo:
  1. La `SUPABASE_SERVICE_ROLE_KEY` expone el proyecto completo si el archivo es accedido por malware, otro proceso con acceso al filesystem, o un CI/CD que lo lea inadvertidamente.
  2. La `anon key` es pública por diseño (`NEXT_PUBLIC_*`) pero su presencia en el archivo junto a la service key crea confusión y riesgo de copia.

- **Impacto / escenario de explotación:**
  Si el archivo `.env.local` llega a un repositorio público (por accidente en un commit futuro, GitHub Codespaces, CI leak, etc.):
  - La `service_role key` permite acceso completo sin RLS: leer todos los RUTs, cuentas bancarias, comprobantes de todos los usuarios.
  - La `GOOGLE_AI_API_KEY` puede ser usada para incurrir en costos de Gemini.
  - La `VAPID_PRIVATE_KEY` permite enviar push notifications falsas a cualquier suscriptor.

- **Recomendación:**
  (a) Migrar todos los secretos a Vercel Environment Variables (para producción) o a un secret manager. (b) Agregar un hook de pre-commit con `git-secrets` o `trufflehog` para prevenir commits accidentales de `.env`. (c) Considerar rotación periódica de las claves — especialmente la service_role key que no debería vivir en el filesystem de desarrollo a largo plazo. (d) Agregar `SUPABASE_SERVICE_ROLE_KEY` explícitamente al `.gitignore` como línea individual (además del patrón `.env*`), como defensa en profundidad.

---

### **[SEV: MEDIO] hostToken generado en el cliente y almacenado en localStorage**

- **Ubicación:** `src/app/crear/page.tsx:42-51` y `src/lib/local-sessions.ts:10-17`
- **Descripción técnica:**
  El `hostToken` es generado con `crypto.randomUUID()` en el browser del host (`crear/page.tsx:44`). Esto es criptográficamente correcto (Web Crypto API). Sin embargo:
  1. Se almacena en `localStorage['apagar_sessions_v2']` sin ningún cifrado o protección adicional.
  2. `localStorage` es accesible por cualquier JavaScript que corra en el mismo origen — incluyendo scripts de terceros (si se añadieran en el futuro), extensiones del navegador, o XSS.
  3. Si el host comparte su dispositivo, otra persona puede leer el token de `localStorage`.
  4. No hay expiración del token ni mecanismo de revocación. El token es válido para siempre hasta que se elimine manualmente del `localStorage`.

  También: el host que pierde el dispositivo (o borra el localStorage) pierde permanentemente la capacidad de confirmar pagos y cerrar la boleta — sin mecanismo de recuperación.

- **Impacto / escenario de explotación:**
  - XSS en la app (si ocurriera en el futuro) puede exfiltrar el `hostToken` de localStorage y usarlo para confirmar pagos o cerrar boletas en nombre del host.
  - Acceso físico al dispositivo del host permite operar como host.

- **Recomendación:**
  (a) Almacenar el `hostToken` en una cookie `HttpOnly; SameSite=Strict; Secure` en lugar de localStorage (resistente a XSS). Esto requiere un flujo server-side para leer la cookie al momento de invocar el RPC. (b) Implementar expiración del token (ej: 7 días) con renovación automática. (c) Documentar el riesgo de pérdida del token en la UI con un aviso claro al host ("guarda este link — si pierdes el historial de esta sesión, no podrás confirmar pagos").

---

### **[SEV: MEDIO] Realtime subscription a `claims` sin filtro por sesión**

- **Ubicación:** `src/hooks/use-session.ts:58`
- **Descripción técnica:**
  La suscripción realtime a la tabla `claims` no tiene filtro:
  ```ts
  .on('postgres_changes', { event: '*', schema: 'public', table: 'claims' }, () => load())
  ```
  Esto significa que **cualquier cambio en claims de CUALQUIER sesión** triggerea un `load()` en el cliente. El comentario en el código lo reconoce: "la columna claims.session_id recién existe desde la migración 005". Sin embargo, si la migración 005 ya está aplicada, el filtro debería activarse.

  Impacto en privacidad: aunque el handler solo recarga los datos de la sesión actual (`load()` filtra por `sessionId`), el canal realtime expone metadatos (timing de cambios) de otras sesiones — un observador podría inferir cuándo otros usuarios están marcando ítems en otras sesiones.

  Impacto en rendimiento/DoS: en un sistema con muchas sesiones activas, cada cliente recibe y procesa eventos de todos los cambios globales en `claims`, saturando conexiones WebSocket.

- **Recomendación:**
  Agregar el filtro `filter: \`session_id=eq.${sessionId}\`` a la suscripción de claims, ahora que la columna `session_id` existe desde la migración 005. Esto es un quick win sin cambio de schema.

---

### **[SEV: MEDIO] Política de privacidad incompleta respecto a los datos reales**

- **Ubicación:** `src/app/privacidad/page.tsx`
- **Descripción técnica:**
  La política de privacidad dice que guarda "nombre, ítems, datos de transferencia del anfitrión, comprobantes". Omite mencionar:
  1. El correo electrónico del anfitrión (`host_email`, migración 006).
  2. Los datos de suscripción push (`endpoint`, `p256dh`, `auth`) que son datos técnicos pero permiten identificar el dispositivo.
  3. La imagen de la boleta enviada a Google Gemini — se menciona, pero no se especifica que la imagen puede contener datos personales (nombre del restaurante, ítems que revelan hábitos de consumo, datos de la boleta fiscal con RUT del local).
  4. No hay mención de periodo de retención de datos (la ley 21.719 exige limitación temporal).
  5. No se menciona el derecho de acceso (acceder a los propios datos), solo el derecho de eliminación.
  6. No hay mecanismo de consentimiento explícito antes de ingresar datos bancarios.

- **Impacto:**
  Incumplimiento de la Ley 21.719 (vigente desde 2026) que exige: base legal para tratamiento, información sobre transferencias internacionales (Google, Vercel), período de retención, y todos los derechos del titular (acceso, rectificación, cancelación, oposición).

- **Recomendación:**
  Actualizar la política de privacidad para incluir: (a) listado completo de datos recopilados incluyendo correo, suscripciones push, imágenes de boletas; (b) base legal del tratamiento (consentimiento implícito al usar la app — en Chile se requiere que sea informado); (c) período de retención para cada tipo de dato; (d) transferencias internacionales a Google (USA) y Vercel (USA) con las garantías aplicables; (e) todos los derechos del titular bajo Ley 21.719. Considerar agregar un banner de aceptación explícita al primer uso.

---

### **[SEV: MEDIO] Validación de RUT sin verificación en el servidor**

- **Ubicación:** `src/lib/utils.ts:36-54` y `src/app/crear/page.tsx:810-814`
- **Descripción técnica:**
  La función `isValidRut()` existe en el cliente pero no se invoca al momento de guardar el RUT en el formulario de creación (`crear/page.tsx:810-814`). El campo acepta cualquier cadena de texto como `host_rut` sin validación. No hay validación server-side del RUT antes de insertarlo en la base de datos. 

  Un atacante podría insertar RUTs malformados, cadenas muy largas, o caracteres especiales como `host_rut`.

- **Impacto:**
  Datos de mala calidad en la base; potencial para inyección si en el futuro el RUT se usa en queries sin sanitización (bajo riesgo dado que Supabase usa queries parametrizadas, pero es un vector de datos corruptos).

- **Recomendación:**
  Invocar `isValidRut()` antes del submit y mostrar error al usuario. Agregar validación de longitud máxima en la columna de la DB (`host_rut varchar(12)`). Considerar una función RPC server-side que valide el RUT antes de insertar.

---

### **[SEV: MEDIO] Signed URLs generadas con el cliente anon (acceso a comprobantes)**

- **Ubicación:** `src/components/session/comprobante-link.tsx:21-27`
- **Descripción técnica:**
  Las signed URLs para los comprobantes se generan desde el cliente con la `anon key`:
  ```ts
  const supabase = createClient()  // usa NEXT_PUBLIC_SUPABASE_ANON_KEY
  const { data } = await supabase.storage.from('comprobantes').createSignedUrl(value, 3600)
  ```
  El cliente browser con la anon key genera una URL con 1 hora de validez. Si la policy de Storage permite `createSignedUrl` a `anon`, entonces:
  1. Cualquier persona que sepa el path (`${sessionId}/${participantId}.ext`) puede generar su propia signed URL.
  2. Los paths son predecibles dado que `participantId` es un UUID visible en la tabla `participants`.

  Además, las signed URLs de 1 hora son largas para un comprobante de pago — suficiente tiempo para ser compartidas o capturadas en logs.

- **Recomendación:**
  Mover la generación de signed URLs a un API Route server-side que (a) verifique que el solicitante es el host legítimo de la sesión (validando su `hostToken` enviado en el header); (b) use el admin client para generar la URL; (c) use una duración más corta (ej: 5-15 minutos). El componente `ComprobanteLink` debería llamar a este API Route en lugar de llamar directamente a Supabase Storage.

---

### **[SEV: MEDIO] comprobante_url legacy: URLs públicas permanentes en valores antiguos**

- **Ubicación:** `src/components/session/comprobante-link.tsx:14-19`
- **Descripción técnica:**
  El componente tiene manejo de compatibilidad: si `value.startsWith('http')`, abre la URL directamente sin pasar por signed URL. Esto corresponde a comprobantes subidos antes de la migración 005 cuando el bucket era público. Esas URLs (`https://...supabase.co/storage/v1/object/public/comprobantes/...`) siguen siendo válidas si el bucket fue convertido a privado *con* objetos previos que conservan sus rutas. Dependiendo de cómo Supabase maneja los objetos al cambiar `public = false`, esas URLs podrían seguir funcionando.

- **Recomendación:**
  Verificar en Supabase Dashboard que los objetos creados antes de la migración 005 ya no son accesibles con la URL pública. Si lo son, listarlos y re-subir o eliminar. Considerar ejecutar una migración de datos que recalcule el `comprobante_url` de pagos legacy a su path equivalente.

---

### **[SEV: BAJO] Ausencia de Content Security Policy y headers de seguridad HTTP**

- **Ubicación:** `next.config.ts` (sin `headers()`)
- **Descripción técnica:**
  El `next.config.ts` no define ningún header de seguridad HTTP. No hay:
  - `Content-Security-Policy` (CSP): sin CSP, cualquier XSS puede exfiltrar datos incluyendo el `localStorage` con el `hostToken`.
  - `X-Frame-Options` / `frame-ancestors`: la app puede ser embebida en un iframe (clickjacking).
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy`
  - `Permissions-Policy`
  - `Strict-Transport-Security` (HSTS): aunque Vercel puede manejar HTTPS, HSTS no está configurado explícitamente.

- **Recomendación:**
  Agregar `headers()` en `next.config.ts` con al menos: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, y una CSP base: `default-src 'self'; connect-src 'self' *.supabase.co wss://*.supabase.co; img-src 'self' data: blob:; script-src 'self' 'nonce-...'`.

---

### **[SEV: BAJO] Claims: cualquier participante puede borrar claims de otro participante**

- **Ubicación:** `supabase/migrations/001_initial.sql:106` (`claims_delete_any`)
- **Descripción técnica:**
  La policy `claims_delete_any` es `FOR DELETE USING (true)`. Un participante puede borrar el claim de cualquier otro participante si conoce el `item_id` y `participant_id` (ambos visibles vía la tabla `claims` que tiene lectura pública). Esto permitiría a un participante deshonesto sacar ítems del cálculo de otro participante, reduciendo el monto que ese otro participante debe pagar (o redistribuyendo el costo a quienes quedan).

- **Recomendación:**
  Agregar columna `session_id` a la policy de DELETE en `claims` y filtrar por el `participantId` guardado en el contexto del cliente. En la práctica, sin auth, no es posible verificar la identidad del cliente con RLS puro — pero al menos se puede requerir que el `participant_id` en el claim coincida con una variable de sesión. La solución más robusta es mover add/removeClaim a RPCs que tomen el `participantId` como parámetro explícito y validen que el participante pertenece a la sesión.

---

### **[SEV: BAJO] host_payment_link: URL abierta sin validación de dominio**

- **Ubicación:** `src/app/s/[id]/page.tsx:387-394`
- **Descripción técnica:**
  El link de pago del host se renderiza como:
  ```tsx
  href={/^https?:\/\//i.test(session.host_payment_link) ? session.host_payment_link : `https://${session.host_payment_link}`}
  ```
  No hay validación de que el dominio sea un servicio de pago legítimo (Mercado Pago, MACH, Fintoc, etc.). Un host malicioso podría crear una boleta con `host_payment_link = "https://sitio-phishing.cl"` y compartir el link de la boleta — los participantes ven un botón verde "Pagar ahora" que los redirige al sitio malicioso.

  Aunque en el caso de uso normal el host es quien creó la sesión (y se supone confiable), las boletas son accesibles por cualquiera con el link, y un atacante podría crear sesiones falsas para engañar participantes.

- **Recomendación:**
  Implementar una allowlist de dominios permitidos para `host_payment_link` (ej: `mercadopago.com`, `flow.cl`, `fintoc.com`, `webpay.cl`, `tenpo.cl`, etc.). Mostrar el dominio de destino junto al botón para que el participante pueda verificarlo. Agregar validación en el servidor (en la RPC de creación de sesión) para rechazar URLs de dominios no permitidos.

---

### **[SEV: BAJO] No hay CSRF protection en las API routes**

- **Ubicación:** `src/app/api/ocr/route.ts`, `src/app/api/push/send/route.ts`, `src/app/api/push/subscribe/route.ts`
- **Descripción técnica:**
  Las API routes no verifican el header `Origin` ni usan tokens CSRF. Como la app no usa cookies de sesión para autenticación (usa anon key en header), el riesgo de CSRF clásico es bajo. Sin embargo, `/api/push/send` y `/api/push/subscribe` son invocables por scripts de terceros desde otros orígenes (no hay CORS restrictivo documentado en next.config).

- **Recomendación:**
  Para las routes que producen efectos secundarios (push/send, push/subscribe), verificar que el header `Origin` coincida con el dominio de la app. Agregar `Access-Control-Allow-Origin: <dominio>` explícito en las respuestas.

---

### **[SEV: BAJO] Datos de suscripción push sin validación de formato**

- **Ubicación:** `src/app/api/push/subscribe/route.ts:6-8`
- **Descripción técnica:**
  El endpoint valida que `subscription?.endpoint`, `sessionId`, y `role` existan, pero no valida:
  - Que `endpoint` sea una URL válida de push service (Firefox/Chrome tienen URLs de sus servicios específicos).
  - Que `p256dh` y `auth` sean strings base64 de la longitud correcta (65 bytes y 16 bytes respectivamente en base64url).
  - Que `role` sea uno de los valores permitidos ('host' | 'participant') — aunque la columna tiene un CHECK constraint en la DB.
  - Que `sessionId` sea un UUID válido (solo verifica que no sea falsy).

- **Recomendación:**
  Agregar validación de UUID en `sessionId`, validar que `role` sea 'host' o 'participant', y agregar longitud mínima/máxima a `endpoint`, `p256dh` y `auth`. Esto reduce el ruido de datos inválidos y previene algunos vectores de inyección.

---

## Quick wins (bajo esfuerzo, alto impacto)

1. **Filtrar Realtime de claims por sesión** (`use-session.ts:58`): agregar `filter: \`session_id=eq.${sessionId}\`` — 1 línea, cero migración, mejora privacidad y performance.

2. **Validar is_host=false en policy de INSERT de participants**: agregar `WITH CHECK (is_host = false AND exists (...))` a la policy `participants_insert_open_session`. Elimina la escalada de privilegios del hallazgo SEV:ALTO con una línea de SQL.

3. **Verificar Origin en /api/push/send y /api/push/subscribe**: 3 líneas de código en cada route para verificar `req.headers.get('origin')` contra el dominio esperado.

4. **Headers de seguridad en next.config.ts**: agregar un bloque `headers()` con X-Frame-Options, X-Content-Type-Options, Referrer-Policy. ~15 líneas, protección inmediata contra clickjacking y MIME sniffing.

5. **Invocar isValidRut() en el formulario del host**: la función ya existe en `src/lib/utils.ts:36-54`, solo falta llamarla antes del submit en `crear/page.tsx`.

6. **Limitar claims DELETE a claims propios**: aunque sin auth pura no es perfectamente seguro, agregar `WITH CHECK (participant_id = current_setting('request.jwt.claims', true)::json->>'sub')` o convertir en RPC reduce el vector inmediato.

7. **Eliminar el fallback legacy en use-session.ts:123-129**: una vez confirmado que la migración 005 está aplicada en producción, eliminar el bloque `if (rpcError && rpcError.code === RPC_MISSING)` que cae a UPDATE directo.

---

## Riesgos mayores que requieren decisión de diseño

### 1. Modelo sin autenticación vs. datos bancarios sensibles

El diseño "sin auth + hostToken en localStorage" es coherente para un MVP de bajo volumen. Sin embargo, almacenar RUT + cuenta bancaria + correo de forma persistente en una tabla de lectura pública (filtrable por cualquier anon key) en una base de datos sin autenticación de usuarios es una decisión arquitectónica de alto riesgo bajo la Ley 21.719.

**Decisión requerida:** ¿se mantiene el modelo sin auth con las mejoras de RLS propuestas? ¿O se implementa auth ligera (magic link) para proteger los datos bancarios del host con identidad verificada? La auth ligera además resolvería el problema de la pérdida del `hostToken` al borrar el localStorage.

### 2. PII vs. minimización de datos

La app recopila RUT + cuenta bancaria + correo porque son necesarios para transferencias bancarias chilenas. Sin embargo, estos datos se exponen a todos los participantes del grupo (por diseño) y se almacenan indefinidamente. Una alternativa de minimización: almacenar los datos bancarios cifrados en `session_secrets` (no en `sessions`), y que solo el host pueda descifrarlos con su token. Los participantes recibirían los datos a través de un API Route autenticado con el `hostToken`, no directamente de la DB.

### 3. Estrategia de retención y derecho al olvido

Actualmente no hay ningún proceso automático de eliminación de datos. La Ley 21.719 requiere límites de retención definidos. Decisión: ¿cuánto tiempo se conservan las sesiones cerradas con sus datos bancarios? Propuesta: anonimizar `host_rut`, `host_account`, `host_email` 30 días después del cierre.

### 4. Confirmación de pago sin verificación del comprobante

El modelo de negocio asume que el host verifica manualmente el comprobante. No hay validación automática de que el comprobante corresponda al monto indicado (ni tampoco que sea una imagen real). Un sistema más robusto integraría con Fintoc o Transbank para verificar transferencias reales — pero esto es una decisión de producto/costo que está fuera del alcance de la auditoría técnica.

---

## Preguntas abiertas para el equipo

1. **¿La migración 005 está aplicada en el proyecto Supabase de producción?** Si no, el hallazgo Crítico #1 (legacy bypass) afecta todas las sesiones existentes.

2. **¿Las policies de Storage para el bucket `comprobantes` están configuradas en el Dashboard de Supabase?** Las migraciones no crean policies de SELECT para Storage — solo UPDATE de las propiedades del bucket. ¿Hay policies manuales configuradas fuera de las migraciones?

3. **¿El `SUPABASE_SERVICE_ROLE_KEY` en `.env.local` es la clave real de producción o de un proyecto de desarrollo local?** Si es producción, cualquier persona con acceso al filesystem de desarrollo tiene acceso completo sin RLS a la base de datos de producción.

4. **¿Hay algún proceso de revisión de sesiones anómalas?** No hay logging de accesos sospechosos (confirmaciones de pago sin comprobante, múltiples IPs para el mismo hostToken, etc.). ¿Se tiene acceso a los logs de PostgREST en Supabase?

5. **¿Cuál es el volumen esperado de sesiones?** El hallazgo de la anon key permitiendo leer toda la tabla `sessions` es más grave a medida que crece el volumen de datos PII almacenados.

6. **¿La GOOGLE_AI_API_KEY es una clave con restricciones de dominio/IP configuradas en Google Cloud Console?** Las claves de AI Studio sin restricciones son usables desde cualquier IP, amplificando el riesgo si se filtra.

7. **¿Se usa Vercel Analytics (`@vercel/analytics` en package.json)?** Si está habilitado, ¿se recopilan datos de usuarios chilenos sin consentimiento explícito? Esto podría requerir mención en la política de privacidad bajo Ley 21.719.

8. **¿Hay un plan de respuesta a incidentes?** Si la `service_role key` se filtra o si hay acceso no autorizado a datos bancarios, ¿hay un proceso definido de notificación a los titulares?
