# Ópticas Car & Era — Sistema de Gestión
# CONTEXTO COMPLETO PARA CLAUDE CODE

## ⛔ REGLAS QUE NUNCA SE ROMPEN
1. **NUNCA extraer CSS de index.html** — contiene 9 bloques `<style>` (2 en HTML global + 5 dentro de JS template literals + 2 en módulos JS). Si los extraes a archivos separados, ROMPES TODO el sistema.
2. **NUNCA hacer regex para eliminar comentarios** — `//` aparece en URLs (`https://...`) y en template strings. Regex los destroza.
3. **NUNCA modificar funciones ZPL** (impresión de etiquetas) — están BLINDADAS y funcionan perfectamente. No tocar.
4. **NUNCA borrar ni reemplazar archivos completos sin respaldo** — siempre hacer copia antes: `cp archivo.html archivo.html.bak`
5. **NUNCA hacer deploy sin que Angel lo pida explícitamente** — Netlify auto-deploys desde GitHub (cada push a main = deploy). Manual: `netlify deploy --prod --dir=.` solo si es necesario.
6. **NUNCA confiar en `res.ok` al llamar dbwrite.js** — dbwrite SIEMPRE devuelve HTTP 200, los errores van en `json.error` del body. Parsear `await res.json()` y checar `json.error`. Para inserts vía `db.from().insert()`, SIEMPRE agregar `.select('id').single()` para confirmar que se guardó. NUNCA enviar columnas que no existan en la tabla (verificar con `information_schema.columns`).
7. **Cambios de DB vía Supabase Management API** — Claude Code tiene acceso directo para ejecutar DDL (ALTER TABLE, CREATE TABLE, INSERT en app_config, etc.).
   - **Token**: Usar env var `SUPABASE_MGMT_TOKEN` (configurar en Claude Code settings o pasar manualmente)
   - **Endpoint**: `POST https://api.supabase.com/v1/projects/icsnlgeereepesbrdjhf/database/query`
   - **Uso**: `node -e "fetch('https://api.supabase.com/v1/projects/icsnlgeereepesbrdjhf/database/query',{method:'POST',headers:{'Authorization':'Bearer '+process.env.SUPABASE_MGMT_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({query:'TU SQL AQUÍ'})}).then(r=>r.json()).then(d=>console.log(JSON.stringify(d,null,2)))"`
   - **Renovar**: https://supabase.com/dashboard/account/tokens

8. **NUNCA usar fechas sin timezone en queries a Supabase** — Supabase guarda `created_at` en UTC. Si filtras con `gte('created_at', '2026-04-01T00:00:00')` sin offset, Supabase interpreta como UTC midnight = **6pm del día anterior en Chihuahua**. SIEMPRE usar: `new Date(fecha + 'T00:00:00-06:00').toISOString()` que convierte a UTC explícitamente. Funciones helper: `localDateToUTC(dateStr)` en index.html, `_estLocalToUTC(dateStr, endOfDay)` en mod-estrategia.js, `_contUtcRange(fi, ff)` en mod-contabilidad.js. **Patrón correcto**: `gte('created_at', new Date('2026-04-01T00:00:00-06:00').toISOString())`. **Patrón INCORRECTO**: `gte('created_at', '2026-04-01')` o `gte('created_at', '2026-04-01T00:00:00')`.
9. **NUNCA usar `new Date().getMonth()` en timestamps UTC sin convertir** — `getMonth()` devuelve el mes en timezone del browser. Para agrupar por mes, usar `new Date(ts).toLocaleDateString('en-CA', { timeZone: 'America/Chihuahua' })` y parsear año/mes del string resultante.
10. **NUNCA usar `toISOString().slice(0,10)` para obtener fecha local** — convierte a UTC primero. Usar `toLocaleDateString('en-CA', { timeZone: 'America/Chihuahua' })`.
11. **Funciones blast (WA masivo) NUNCA con MAX_PER_RUN > 10** — Netlify functions timeoutean a ~26s. Con 1.5s sleep por envío, 10 sends = ~18s = cabe. Si MAX es 50, la función timeoutea, curl regresa pero la instancia sigue en background; al disparar la siguiente, ambas tienen dedup vacío y mandan a la misma lista → DUPLICADOS. Pasó en Recuperación Día de las Madres v281: 207 contactos recibieron 2-3 veces el mismo mensaje. Regla: `MAX_PER_RUN = 10`, `BATCH_LIMIT = 10`, sleep 1.5s entre envíos. Aplica a: lc-reactivate, vip-reactivate, ame-fase3, pin-*, magnolia-reactivate, promo-*, review-blast/followup, recuperacion-madres.
12. **Dedup en blast NUNCA solo en batch al inicio** — siempre re-check PER-FONO inmediatamente antes de `sendTemplate()`. Aunque haya instancias paralelas, ambas verifican el mismo registro y solo una manda. Patrón: `const recheck = await supaREST('GET', 'clari_conversations?phone=eq.${phone}&content=ilike.*${TAG}*&...&limit=1'); if (recheck.length > 0) continue;`. **Catch fail-closed**: `catch(e) { console.warn(...); continue; }` (skip on error, NO `/* continue */` que envía sin verificar).

## 🛟 PROTOCOLO DE SEGURIDAD
Antes de cualquier cambio en un archivo:
1. `cp archivo.ext archivo.ext.bak` (respaldo)
2. Hacer el cambio
3. Si algo sale mal: `cp archivo.ext.bak archivo.ext` (restaurar)

Si algo se rompe gravemente:
- Angel tiene ZIPs versionados de respaldo (v136, v137, v138)
- Solo necesita descomprimir el ZIP anterior y hacer deploy

## 📁 ESTRUCTURA DEL PROYECTO
```
/ (raíz)
├── index.html          — App principal SPA (~1.25MB) ⚠️ ARCHIVO CRÍTICO
├── tienda.html         — Tienda LC online (independiente, no toca index)
├── portal.html         — Portal pacientes
├── preregistro.html    — Pre-registro citas
├── cam.html            — Cámara auxiliar
├── netlify.toml        — Config Netlify (redirects, functions)
├── sw.js               — Service Worker (cache version)
├── am-sync.js          — Sync auxiliar
├── banner.jpg          — Banner tienda
├── hero-lc.jpg         — Imagen trust section tienda LC (77KB, 1200x670)
├── firma-asistencia.html — Página pública: firma digital de reportes/actas (empleados)
├── optometria.html     — Herramienta clínica de cabina: 25 tests visuales (Snellen, Ishihara, Amsler, etc.) calibrados por pantalla. Acceso desde sidebar (admin/sucursal/gerencia)
├── zpl_bridge.py       — Bridge impresión ZPL ⛔ NO TOCAR
├── CLAUDE.md           — Este archivo
├── js/                 — Módulos JS extraídos de index.html
│   ├── mod-auth.js       — Autorizaciones WA (descuentos, borrar ventas)
│   ├── mod-catalogo.js   — Catálogo materiales ópticos
│   ├── mod-clari.js      — UI del chatbot Clari + Asistente Optometría IA (requiere auth en ia-chat)
│   ├── mod-creditos.js   — Créditos y adeudos
│   ├── mod-landings.js   — Landing pages builder
│   ├── mod-lc.js         — Módulo LC: catálogo cards + CRM recompra + estadísticas
│   ├── mod-produccion.js — Producción y surtido lab
│   ├── mod-asistencia.js  — Módulo RH: asistencia, expedientes, permisos, firmas, reportes LFT
│   ├── mod-contabilidad.js — Módulo Contabilidad: estado de resultados, gastos OCR, flujo efectivo, facturación CFDI
│   ├── mod-estrategia.js  — Módulo Estrategia: KPIs 90 días, histórico SICAR, monitor márgenes, plan 90 días
│   ├── mod-scanner.js    — Barcode scanner con remap teclado
│   └── mod-tickets.js    — Tickets térmicos (ventas, cortes, abonos)
└── netlify/functions/  — Serverless functions (backend)
    ├── dbwrite.js        — Proxy SEGURO de escritura a DB (ALLOWED_TABLES)
    ├── whatsapp.js       — Envío de mensajes WA vía Twilio
    ├── wa-webhook.js     — Webhook WA: Clari bot + Lab Assistant OCR (~70KB)
    ├── backup.js         — Respaldos automáticos
    ├── reporte.js        — Generación reportes
    ├── ia-chat.js        — Chat IA auxiliar
    ├── img-upload.js     — Upload imágenes a Supabase Storage
    ├── landing.js        — Servidor de landing pages dinámicas
    ├── lc-cron.js        — Cron recordatorios LC por WA
    ├── clip-payment.js   — Genera links de pago Clip checkout (portal pacientes)
    ├── clip-verify.js    — Verifica estado real de pago Clip vía API (portal post-redirect)
    ├── clip-webhook.js   — Webhook Clip: registra pagos + notifica WA
    ├── review-cron.js    — Cron encuesta de opinión Google Maps (cada 15 min, lee review_queue)
    ├── review-followup.js — Segundo toque reseñas: recordatorio a positivos 2-5 días después (filtro sentimiento)
    ├── meta-webhook.js   — Webhook Meta: Clari chatbot para Facebook Messenger + Instagram DM
    ├── conekta-subscribe.js — ⛔ DEPRECATED (v204, Conekta abandonado) — mantener como referencia
    ├── conekta-webhook.js  — ⛔ DEPRECATED (v204, Conekta abandonado) — mantener como referencia
    ├── stripe-subscribe.js — ⛔ DEPRECATED (Stripe bloqueado para LC) — mantener como referencia
    ├── lc-reactivate.js      — Reactivación LC: envío manual WA a usuarios LC dormidos (A/B/C test, 136 contactos Fase 1)
    ├── vip-reactivate.js     — Reactivación VIP: envío manual WA a clientes gasto ≥$5K dormidos 2024 (A/B/C test, 418 contactos Fase 2)
    ├── ame-fase3-reactivate.js — Américas Fase 3: dormidos 2023 + gasto medio 2024 (1,691 contactos, reutiliza templates VIP)
    ├── magnolia-reactivate.js — Cron reactivación Magnolia: WA a clientes dormidos 60-365 días (lunes 11am CST)
    ├── asistencia-cron.js  — Cron asistencia: recordatorios ausencia + envío firmas (cada 30min 10am-12pm)
    ├── audit-cron.js       — Cron auditoría pedidos: entregados sin cobrar, sin QC, conteo vencido (~5 días)
    ├── factura.js          — Proxy Facturapi: crear/cancelar CFDI, descargar PDF/XML (IVA 8% frontera)
    ├── stripe-subscribe.js — ⛔ DEPRECATED (Stripe bloqueado para LC) — mantener como referencia
    ├── stripe-webhook.js  — ⛔ DEPRECATED
    └── stripe-portal.js   — ⛔ DEPRECATED
```

## 🔧 TECH STACK
- **Frontend**: Vanilla JS SPA (CERO frameworks/bundlers). Todo es HTML+CSS+JS puro.
- **Backend**: Supabase (PostgreSQL) + Netlify Functions (serverless)
- **WhatsApp**: Twilio (WA#2, único número vigente) — WA#1 deprecated
- **Messenger/Instagram**: Meta Graph API (meta-webhook.js) — Clari responde en FB Messenger + Instagram DM
- **IA**: Anthropic API (Clari chatbot + Lab Assistant OCR)
- **Pagos**: Clip API (checkout links portal pacientes + pagos únicos tienda + pagos recurrentes vía dashboard manual)
- **Facturación**: Facturapi (CFDI 4.0, IVA 8% zona fronteriza) — sk_test_ configurada, pendiente activar producción
- **Hosting**: Netlify — dominio: optcaryera.netlify.app
- **CDNs**: qrcode-generator, html5-qrcode, xlsx, Supabase JS v2.38.4

## 🗄️ SUPABASE
- URL: `https://icsnlgeereepesbrdjhf.supabase.co`
- Publishable key (solo lectura): `sb_publishable_iCOmrbSO_EaZuv7fVUVxEA_AtHSPTKm`
- Service role key: solo en env vars de Netlify (NUNCA en frontend)
- **TODAS las escrituras** van por `netlify/functions/dbwrite.js` que valida auth
- El frontend lee directo de Supabase con la publishable key
- Supabase v2.38.4: `.or()` combinado con `.gte()/.lte()` FALLA — filtrar en JS
- `whatsapp_config` en app_config es tipo TEXT (JSON string, requiere JSON.parse)
- **`ordenes_laboratorio` NO tiene columna `updated_at`** — solo `created_at`. NUNCA usar `updated_at` en queries a esta tabla (causa 400)

## 📱 WHATSAPP
- **WA#2 Twilio** (único número vigente): **5216563110094** — Clari inbound + notificaciones + Lab Assistant + outbound freeform para reactivaciones
- ⛔ **WA#1 (5216561967020) DEPRECATED** — NO usar, ya no está activo. Documentación previa con este número es obsoleta.
- wa-webhook.js maneja TODO el flujo WA (Clari, notifs, Lab Assistant) por Twilio
- **Twilio credenciales**: guardadas en memoria local de Claude Code (`memory/reference_twilio_credentials.md`) — NUNCA en repo
- **Twilio Content API** (crear templates): `POST https://content.twilio.com/v1/Content` — Auth: Basic Base64(SID:TOKEN)
- **Twilio Submit for approval**: `POST /v1/Content/{templateSID}/ApprovalRequests/whatsapp` body: `{name, category: 'MARKETING'}`
- **admin_phones**: 4 números con acceso a Lab Assistant OCR y comandos admin
- **auth_phones**: solo Angel (5216564269961) para autorizaciones de descuento
- **recipients_corte**: 4 números que reciben notificación de cortes
- Todo en app_config id='whatsapp_config'

## 💬 FACEBOOK MESSENGER + INSTAGRAM DM
- **meta-webhook.js**: recibe mensajes de FB Messenger e Instagram DM, responde con Clari (misma IA)
- Meta App: "car & era maker" (ID: 2088315654915229) — compartida con agencia de marketing (solo campañas)
- Página FB: "Ópticas Car & Era" (140615486675232)
- Instagram: @opticascar.yera (17841414023710928)
- Webhook URL: `https://optcaryera.netlify.app/.netlify/functions/meta-webhook`
- Env vars Netlify: `META_PAGE_TOKEN` (Page Access Token, long-lived never-expires), `META_VERIFY_TOKEN` (clari_caryera_2026)
- Canal se detecta por `body.object`: 'page' = Messenger, 'instagram' = Instagram
- Historial en `clari_conversations` con senderId como phone, canal en user_name (clari-messenger/clari-instagram)
- No tiene ventana de 24h como WhatsApp — puede responder siempre
- Notifica admin por WA en primeros mensajes nuevos
- **Auto-reply comentarios públicos**: `checkRecentComments()` piggybacks en cada webhook call, escanea FB feed (7 días) + IG media (30 días), genera respuesta breve con Claude Haiku (`generatePublicReply`), publica vía `/{commentId}/comments` (FB) o `/{commentId}/replies` (IG, form-encoded), tracking en Supabase `[FB-Comment:{id}]` para dedup. Max 5 replies por ejecución con timeout guard de 7s.
- Permisos del Page Token (18 scopes): `instagram_manage_messages`, `instagram_manage_comments`, `instagram_basic`, `pages_read_user_content`, `pages_manage_engagement`, `pages_read_engagement`, `pages_messaging`, `pages_messaging_subscriptions`, `pages_manage_metadata`, `pages_manage_posts`, `pages_show_list`, `business_management`, `ads_management`, `ads_read`, `whatsapp_business_management`, `whatsapp_business_messaging`, `instagram_content_publish`, `public_profile`
- **Webhooks suscritos Instagram**: `comments` + `messages` (configurados en Meta Developers → Webhooks → Instagram)
- **Webhooks suscritos Page**: `feed` + `messages` (para FB Messenger + comentarios orgánicos)
- App "car & era maker" no está verificada por Meta — `instagram_manage_messages` en **Standard Access** = solo admins/testers reciben DMs de IG. Necesita **Advanced Access** (App Review ~5 días) para DMs de todos los usuarios. Solicitud iniciada pero borrador expirado.
- **⚠️ LECCIÓN v237**: los DMs de Instagram solo llegan al webhook para admins/testers de la app con Standard Access. Para usuarios regulares necesita Advanced Access. Los comentarios (tanto FB como IG) sí funcionan sin Advanced Access.

## 🤖 REGLAS CRÍTICAS DE CLARI (chatbot)
- **Brevedad**: 1-3 líneas por mensaje máximo. UNA pregunta/idea por mensaje. Esperar respuesta antes de avanzar. max_tokens=350. Emojis: 1-2 máximo.
- **No adelantarse**: NUNCA juntar múltiples temas en un solo mensaje (ej: graduación + examen + sucursal + promo + suscripción = MAL). Paso a paso.
- **No citas**: NUNCA mencionar "cita", "agendar", "apartar". Es llegando directo, sin cita.
- **Quejas/inconformidades**: Clari NUNCA admite culpa, NUNCA promete reembolsos/créditos/descuentos, NUNCA aconseja cómo reclamar, NUNCA dice "tienes razón" ante queja. NUNCA ser dramática ("¡Ay no!", "muchísimo", "me da mucha pena"). Tono profesional, breve (2-3 líneas máx), 0-1 emojis. Si reportan que no los atendieron → preguntar a qué hora fueron (investigar horario comida/ausencia). Si el cliente ya no quiere hablar → cerrar breve sin alargar.
- **Precios**: Clari sabe que el precio depende de armazón + graduación + material/tratamiento. NUNCA dice que "cobraron de más". Si preguntan precio exacto → "depende de lo que elijas, en sucursal te dan cotización personalizada".
- **Promos**: 3x1 desde $1,200 = material básico CR-39 visión sencilla. Tratamientos (AR, blue light, transitions) = costo adicional. Son promos DIFERENTES.
- **⚠️ LECCIÓN v195**: Clari le dijo a una clienta que le cobraron de más y le dio script para reclamar → la clienta llamó a quejarse cuando estaba conforme.
- **⚠️ LECCIÓN v210**: Clari le soltó 5 párrafos a un cliente que solo dijo "Si". Prompts deben ser EXPLÍCITOS en "espera respuesta antes de avanzar".
- **Responder lo que preguntan**: Si el cliente hace una pregunta específica, Clari responde SOLO eso (1-2 líneas) sin saludo, sin cambiar de tema, sin seguir script de pasos. Los pasos solo aplican si el cliente NO pregunta algo concreto.
- **⚠️ LECCIÓN v212**: Esmeralda preguntó "¿qué es el plan de suscripción?" y Clari ignoró la pregunta para seguir el script de pasos (saludo + graduación). Regla: pregunta específica = respuesta específica.
- **Suscripción LC**: Clari explica el plan completo sin letras chicas — cobro automático con tarjeta, lentes listos en sucursal sin pedirlos, 10% descuento exclusivo, cancela cuando quiera por WA. Descuento es el gancho principal.
- **Clientes existentes (pedidos)**: cuando alguien pregunta por su pedido YA ES CLIENTE — NUNCA dar direcciones, referencias de ubicación, horarios ni teléfonos. Solo el nombre de la sucursal. Las direcciones son para prospectos nuevos.
- **Búsqueda de pedidos**: si no encuentra por teléfono del WA, pedir FOLIO → TELÉFONO registrado → ticket de compra. NUNCA redirigir a sucursal sin agotar opciones. Si el cliente dice que recibió WA de "lentes listos", confirmar que somos nosotros.
- **⚠️ LECCIÓN v245**: Mirta Escobar preguntó por Messenger si sus lentes estaban listos. Clari no la encontró (buscó stopwords "Están" y "nombre" en vez de "Mirta" y "Escobar"), no pidió folio ni teléfono, la redirigió a llamar a sucursal, y le dio direcciones como si fuera clienta nueva.
- **Post-compra / reclamos de cobro**: si el cliente ya compró (ves folio o [Sistema] en historial) y reclama "yo no pedí X", "me cobraron las micas", "quería CR-39", etc. → NO confirmar ni asumir qué material/tratamiento recibió. Respuesta fija: "Para revisar qué material y graduación aparecen en tu ticket pasa a sucursal [X], ellos tienen el desglose." Nunca prometer modificaciones de orden (solo sucursal decide según estado del pedido). Si insisten "pero tú me dijiste…" → "Lo que te comparto son precios base, el desglose exacto lo tienen en sucursal." NO admitir ni negar lo dicho antes.
- **Precios — 3 variables independientes**: el precio final lo arman 3 cosas que suben precio POR SEPARADO: (a) Graduación (sencilla vs bifocal/progresivo), (b) MATERIAL (CR-39 vs policarbonato vs alto índice) — cambiar de material sube el precio, NO es un "tratamiento", (c) Tratamientos (AR, blue light, transitions, polarizado). NUNCA asumir que el cliente recibió CR-39 básico solo porque "no pidió tratamientos" — pudieron venderle policarbonato (que es material, no tratamiento). Promos incluyen SOLO: CR-39 + visión sencilla + sin tratamientos.
- **Promociones — referencia del cliente**: si el cliente dice "tu promo dice X", "según el anuncio…" y no coincide con KNOWLEDGE → pedir foto/screenshot en vez de adivinar. NO confirmar ni negar lo que el cliente afirma.
- **⚠️ LECCIÓN v268**: Brianda Carmona (folio 10593 Magnolia) compró con policarbonato, reclamó por chat "tu promo dice graduación incluida sin costo extra, no pedí tratamientos". Clari respondió "perfecto, entonces tus lentes vienen con CR-39 sin costo extra" — sin acceso real a lo que se cotizó. La clienta mandó a alguien a cambiar los 3 pares a CR-39 con ese argumento. Raíz: el prompt solo hablaba de "tratamientos" como upgrade, nunca de cambio de material. Cuando falta una variable del prompt, el modelo la ignora y asume el default.
- **Aplazo (financiamiento sin tarjeta)**: flujo correcto = (1) cliente se registra en Aplazo, (2) llega a sucursal con aprobación, (3) paga el primer pago (enganche 20%) en sucursal, (4) **se entrega los lentes ese mismo día** (no hay que esperar a terminar de pagar), (5) los 4 pagos quincenales restantes los hace directo con Aplazo — la óptica ya no interviene. **Excepción**: si Aplazo RECHAZA la solicitud, NO se entregan los lentes porque el pago no quedó procesado. Clari NUNCA debe decir "los entregamos hasta terminar de pagar" — es falso.
- **Detector de quejas — muletillas corteses**: `isComplaintMessage()` en wa-webhook.js tiene keyword `'molest'` que matchea con "disculpe la molestia" (cortesía, NO queja). Fix en v271: `POLITENESS_PATTERNS` excluye frases tipo "disculpe/perdón la(s) molestia(s)", "molestarte/molestarla", "sin molestar", "una molestia". Si el único match es `'molest'` + matchea cortesía → NO marca como queja. Si hay otras keywords (grosero, pesimo, engaño) → sí es queja aunque haya cortesía.
- **⚠️ LECCIÓN v271**: detectores por substring en español mexicano dan falsos positivos con muletillas corteses. Brenda preguntó amablemente sobre Aplazo con "Disculpe la molestia..." → detector marcó queja → pausó bot → mandó alerta "cliente molesto" al admin. Doble impacto: cliente sin respuesta + admin alertado de falso positivo. Siempre agregar pase de cortesía al clasificar sentimiento por keywords.
- **2x1 SOLO oftálmicos, NUNCA LC**: la promo 2x1 aplica únicamente a lentes oftálmicos completos (armazón + micas graduadas). NO aplica a lentes de contacto (se venden por caja a precio individual de marca), NO a accesorios/soluciones, NO a armazones sueltos sin Rx. El knowledge de promo en wa-webhook.js y meta-webhook.js (`getActivePromos()`) tiene bloque ⛔ ALCANCE al inicio que filtra esto antes de la mecánica. Si el cliente confunde "lentes" con LC, Clari aclara: "El 2x1 es para lentes oftálmicos (armazón con graduación). Los LC se cotizan aparte por caja según marca."
- **⚠️ LECCIÓN v283**: Clari decía a clientes que el 2x1 aplicaba a lentes de contacto. Caso real Messenger 2026-05-12 phone 27798440596413321: "Aplica tanto para lentes de contacto como para lentes con armazón". También 2026-05-10 phone 35219584947689968 implicó que LC entraban en 2x1 ("Si eliges lentes de contacto, los 2 son de contacto"). Raíz: el prompt decía "2x1 en lentes completos" sin excluir explícitamente LC, y "lentes" en español es polisémica. Regla nueva: cuando se redacta knowledge de cualquier promo Nx1 (u oferta acotada), SIEMPRE anteponer bloque "⛔ ALCANCE: aplica a A / NO aplica a B" antes de mecánica — la inclusividad por defecto del LLM es peligrosa con palabras polisémicas.
- **Anti-coqueteo / trato personal** (v293): ante cumplido personal a Clari ("eres linda/dulce/tierna"), ofrecimiento de número personal ("ese es mi número, si quieres platicar"), selfie sin propósito óptico ("vela y borrala"), apodos cariñosos ("amorcito/mi amor/preciosa") o terreno romántico → MODO NEUTRAL: 0 emojis, no repetir apodo más de 1 vez, no devolver cumplidos, respuesta 1 línea seca + redirección o cierre. Frases prohibidas: "qué lindo eres", "qué dulce", "te agradezco la invitación", "eres muy amable", "ay qué tierno", "para nada (no eres feo)". Loop de despedidas tras coqueteo: cortar al 2do "igualmente" con "Hasta luego." sin emojis. **NO confundir con cortesía mexicana**: "gracias ❤️ / mil gracias 😘 / bendiciones 🥰" como agradecimiento genérico NO es trigger; emojis de corazón en agradecimientos sin cumplido personal NO escalan. Bloque "REGLAS ANTI-COQUETEO / TRATO PERSONAL" en `DEFAULT_PERSONALITY` de wa-webhook.js y meta-webhook.js.
- **⚠️ LECCIÓN v293**: la "amabilidad cálida" por defecto del prompt reciproca el coqueteo automáticamente. Caso real Messenger 2026-05-27 phone 5216751038234 ("Meño"): Clari dijo "soy asistente virtual" varias veces pero respondió "¡Qué lindo eres Meño!", "¡Ay qué dulce eres!", "te agradezco mucho la invitación 😊" al ofrecimiento de número personal, "Para nada Meño, no es eso" al "estoy feo", usó el apodo "Meño" en 15 mensajes, mantuvo 😊/👓 todo el tiempo. El cliente se va con expectativa romántica falsa. Aclarar el rol NO es suficiente — el tono también tiene que cambiar a neutral, no solo el contenido. Regla: ante señales de coqueteo, profesional pero CERO calidez romántica.
- **Hot Sale Aplazo (v293, temporal 25 may - 2 jun 2026)**: Aplazo (la plataforma) tiene Hot Sale para clientes nuevos: 25% off + 3 quincenas sin intereses desde $2,000, código HS2026. ⚠️ DESCUENTO ES DE APLAZO, NO DE LA ÓPTICA — el cliente lo aprovecha dentro de la plataforma de Aplazo, no es algo que la óptica regale. Bloque en `getActivePromos()` con guard de fechas, auto-expira tras el 2 de junio. Si pregunta por Aplazo / pagos a plazos / financiamiento, Clari menciona Hot Sale + código + aclaración. NUNCA decir "te damos 25%" como si fuera descuento de la óptica.
- **Hot Sale Car & Era (v294, temporal 25 may - 2 jun 2026)**: promo HEADLINE de la óptica durante los 9 días del Hot Sale. Combo: 2x1 en lentes completos + lente solar graduado adicional por $499. Incluido SIN costo extra dentro del precio Hot Sale: armazón seleccionado + micas CR-39 visión sencilla + AR + UV (diferencia vs 2x1 estándar donde AR es opcional con costo). "Armazones seleccionados" = línea curada, NO todos los modelos aplican — si preguntan por un armazón específico, redirigir a sucursal. Upgrades con costo: bifocal/progresivo, policarbonato/alto índice, blue light/transitions/polarizado. ⛔ NO combinable con maestros 20%, Día del Niño 30%, ni descuento Aplazo HS2026. Bloque `hotSaleCarEra` prependido al return de `getActivePromos()` para que sea la primera promo que Clari lee. Durante 25 may - 2 jun, ante preguntas genéricas de promo, Clari arranca con Hot Sale (no con 2x1 estándar).
- **⚠️ Hot Sale Car & Era vs Hot Sale Aplazo** (v294): dos promos paralelas con el mismo nombre "Hot Sale" durante el mismo periodo. Diferenciador en el prompt: Car & Era = combo armazón+micas+AR+solar $499 (de la óptica). Aplazo = descuento 25% + 3 quincenas s/i, código HS2026 (de la plataforma de pagos, NO de la óptica). Si el cliente menciona código HS2026 → Aplazo. Si menciona armazones / 2x1 / micas / solar → Car & Era.
- **Lookup de pedidos en Messenger/IG por teléfono tipeado** (v295): `lookupOrdersByText` en meta-webhook.js extrae teléfonos de 10-13 dígitos del texto del cliente (normaliza dropando 521/52/1 a último 10), busca por `pacientes.telefono` y devuelve pedidos NO entregados igual que WA. Antes solo buscaba por folio (4-6 dígitos) o por palabras de nombre — el senderId de FB/IG no es teléfono así que cuando el cliente tipeaba sus 10 dígitos no se encontraba nada. Patrón replicable: cualquier lookup en Messenger debe asumir que el cliente puede tipear el dato en plain text (teléfono, folio, nombre); no confiar solo en metadata del webhook.
- **Filtro safety [Sistema] antes de enviar respuesta** (v295): tanto `sendMetaReply` como el equivalente en wa-webhook.js ahora aplican `reply.replace(/\n?\[Sistema\][^\n]*\n?/g, '\n')` antes de mandar al usuario. El modelo pattern-matchea los tags `[Sistema]` que ve en el historial guardado (donde son markers de eventos reales como ventas confirmadas) y los emite como si fueran un protocolo de tool-use. No existe tal protocolo — los lookups ya corrieron antes del prompt. Tres capas de defensa: (a) prompt instruction "NUNCA escribas [Sistema] ni [Tool]", (b) filtro regex en outgoing, (c) instrucción "si no ves PEDIDOS ENCONTRADOS en tu contexto, NO finjas estar consultando — pide folio/teléfono y espera".
- **⚠️ LECCIÓN v295**: cuando el modelo ve patrones consistentes en el historial (`[Sistema] ...`, `[LC-OCR] ...`, `[PROMO-OCR] ...`), aprende a emitirlos como si fueran sintaxis válida de tool-use. Caso real Messenger 2026-05-28 Ángel Ravelo Navarro (phone 6562180134): pidió status de pedido, dio teléfono, Clari respondió "[Sistema] Por favor consulta el estado del pedido registrado con el teléfono 656-218-0134" en CADA respuesta sin nunca devolver datos reales. Cliente esperó pacientemente ("ok", "está bien") creyendo que estaba esperando respuesta. Doble impacto: lookup roto + alucinación de protocolo inexistente. Regla: cuando los tags `[X]` van a quedar en el historial de conversación pero NO son comandos sino markers, agregar instrucción explícita al prompt + filtro de salida como red de seguridad.

## 📸 CLARI — OCR DE PROMOCIONES
- **`lcPhotoOCR` clasifica en 4 categorías** (A=caja LC, B=receta, C=promo/flyer/anuncio/captura, D=otro). Si detecta promo devuelve JSON con `{es_promo:true, texto_completo, titulo, precio, condiciones, marca_negocio, fecha_vigencia, detalle}`.
- **`processLCPhoto` maneja promo**: guarda `[PROMO-OCR] {json}` en `clari_conversations` e invoca Anthropic (claude-sonnet-4) con un system prompt específico que incluye las promos vigentes de `getActivePromos()` + los datos extraídos del flyer. Genera respuesta 2-4 líneas comparando vigencia/óptica/condiciones.
- **3 casos de análisis**: (i) promo nuestra vigente → explica condiciones reales, (ii) promo de OTRA óptica (marca_negocio diferente) → "es de otra óptica" + menciona la vigente, (iii) promo vieja → "esa promo ya no está vigente" + menciona la actual.
- **Detección por caption**: fotos + texto con `promo|oferta|descuento|anuncio|flyer|2x1|3x1|%|mira|fijate|vi esta` se procesan con OCR. Si solo mandan foto sin texto, el clasificador decide por contenido.
- **Fallback**: si Anthropic falla, Clari responde "Gracias por mandarme la promo, déjame revisarla" — el contexto [PROMO-OCR] queda guardado para que Clari responda con él en el siguiente turno.

## 🏪 NEGOCIO
- **4 sucursales** (Ciudad Juárez, Chihuahua): Américas, Pinocelli, Magnolia, y **Plaza Vía Vittoria** (inaugurada 30-may-2026 — folios prefijados `V`, color verde, login `vittoria`). Ver runbook **🆕 ALTA DE NUEVA SUCURSAL** más abajo.
- Óptica con laboratorio propio de lentes
- ~30,000 pacientes en la base de datos
- Dueño/operador: Angel Alvidrez
- **Timezone**: `America/Chihuahua` (UTC-6 sin DST). NO usar `America/Ojinaga` (sigue DST de EE.UU.)
- **Horario**: Lunes a sábado 10am-7pm, Domingos 11am-5pm

## 🆕 ALTA DE NUEVA SUCURSAL (RUNBOOK — derivado de v298-v308, Plaza Vía Vittoria)
> El sistema usa **strings de sucursal hardcodeados** (no hay tabla de sucursales en DB). Agregar una sucursal toca ~9 archivos + varias `app_config`. Seguir TODOS los pasos en orden. La causa de la mayoría de errores en vivo de Vittoria fue **saltarse uno de estos pasos**.

### 0. Decisiones previas (fijar ANTES de tocar código — difíciles de cambiar después)
- **Nombre canónico EXACTO** (con acento/grafía final): es el string literal que va en TODOS lados y en `ventas.sucursal`. Confirmar con Angel la ortografía exacta (Vittoria tuvo 3 correcciones: Vitore→Vitoria→Vittoria).
- **Usuario y contraseña de login** (patrón: nombre corto lowercase + `01`).
- **Color** (hex + RGB) y **código corto** de 3 letras (AME/PIN/MAG/PVV…).
- **Esquema de folio** (CRÍTICO, ver paso 4): ¿continúa numeración SICAR existente, o es sucursal NUEVA sin SICAR? Si es nueva → usar **folio PREFIJADO con una letra** (ej. `V`), NUNCA números bajos (chocan con folios viejos porque `ventas.folio` es UNIQUE **global**, no por sucursal).

### 1. Login frontend (index.html)
- Agregar entrada a `const USUARIOS = {...}` (~línea 5422): `'usuario': { pass:'xxx01', nombre:'<Canónico>', rol:'sucursal', sucursal:'<Canónico>' }`.

### 2. ⚠️ DB `app_config.custom_users` (CRÍTICO — sin esto puede LOGEARSE pero NO guardar nada → "Autenticación fallida")
- Agregar el usuario con la MISMA estructura que las otras sucursales: `{rol:'sucursal', pass:'xxx01', nombre, acciones:['del_ordenes'], permisos:[...17 permisos...], sucursal:'<Canónico>'}`. Copiar el array `permisos` de `americas`.
- `dbwrite.js`, `whatsapp.js`, `img-upload.js`, `reporte.js`, `ia-chat.js` autentican TODOS contra `custom_users` (merge con BASE_USERS). Sin el usuario aquí: escrituras, envío WA, ticket digital, OCR → todos dan 401.
- Opcional: agregar también a `BASE_USERS` hardcodeado de `dbwrite.js`/`whatsapp.js` (fallback/parity).
- **Los flags cacheados en login** (`waConfigured`) requieren **RECARGAR** para re-evaluarse tras agregar el usuario.

### 3. Listas/dropdowns/colores hardcodeados (~35 ubicaciones — barrer TODO)
- **index.html**: ~11 dropdowns de sucursal (cfg-suc, caja-suc-selector, caja-hist-suc, com-sucursal, cred-suc-filter, wcrm-filtro-suc, lc-filtro-suc, conteo-suc, lab-suc-filtro, cfg-asesor-suc, "— Sucursal —"); arrays (`sucs`, `physicalSucs`, `.forEach(['Américas'…])`, `sucOrder`); ~7 color maps (`sucColors`, `sucC`, `sucC2`, `_sucColors` RGB); `_sucShort`/`sucShort` ternarias (→ código corto); ternaria de `purchInfo`.
- **js/**: mod-asistencia (sucOrder, dropdown, color maps), mod-contabilidad (2 selectores), mod-estrategia (2 `sucDefs` con key normalizado + 2 `forEach` "by sucursal"), mod-tickets (fallback datos_fiscales).
- **netlify/functions**: wa-webhook (cmdVentas/cmdCaja/cmdPendientes `sucs` + emoji), audit-cron (loop conteo), optometria.html (dropdown cabina).
- Buscar con: `grep -rn "Américas.*Pinocelli.*Magnolia"` y `grep -rn "sucColors\|sucDefs"`. Verificar que NINGUNA quede sin la nueva.

### 4. ⚠️ Folio (CRÍTICO — causó 4 incidentes distintos en Vittoria)
- `ventas.folio` es **TEXT y UNIQUE GLOBAL** (no por sucursal). Por eso:
  - **NUNCA** arrancar una sucursal nueva en números bajos (0001 ya existe → choque). Subir la base (40001) solo retrasa el choque ~2 años.
  - **Solución correcta = folio PREFIJADO** (namespace propio, jamás choca): agregar a `PREFIXED_SUCS = {'<Canónico>':'V'}` en `generarFolioVenta()` (index.html). Genera `V0001`, `V0002`… **SIN guion** (un guion rompe la lógica de folios hermanos de promos `-2/-3`; con `V0001` los hermanos quedan `V0001-2`).
  - El path prefijado **NO debe persistir un contador** — debe calcular `siguiente = max(folio prefijado existente) + 1` leyendo las ventas reales (`ilike 'V%'`). Si persiste, **quema un folio en cada venta abortada/recargada** (V0001 saltó a V0006).
- **Código que asume folio numérico** — auditar y arreglar para que acepte el prefijo: entrega de lentes `buscarParaEntrega()` (guard `/^\d+$/` saltaba V0001; usar `/^[A-Za-z]{0,4}\d{2,}(?:-\d+)?$/` y `.eq('folio', folioBaseString)` no `parseInt`); Clari lookup por folio (wa-webhook + meta-webhook `/\b(\d{4,6})\b/` → `/\b(V?\d{4,6})\b/i`); detector de consulta de pedido; scan de historial Clari. (Buscar `parseInt(folio)`, `/^\d+$/`, `/\d{4,6}/`.)

### 5. DB `app_config` — otras claves por-sucursal
- **`datos_fiscales`** (CRÍTICO para el ticket impreso): `sucursales['<Canónico>'] = {direccion, telefono}`. Sin esto el ticket imprime sin dirección.
- **`asesores`**: `sucursales['<Canónico>'] = [nombres...]` — sin esto el dropdown de asesor en POS solo muestra globales y **las comisiones no se atribuyen al asesor real**.
- **`empleados_telefono`** + **`horarios_asistencia`**: personal de la sucursal para el reloj checador / asistencia.
- `metas_mensuales` (opcional, auto-calc=0 sin historia), `inventario_ultimo_conteo` (audit-cron lo trata como "nunca", OK sin tocar).
- **⚠️ Reseñas Google**: si la sucursal NO tiene ficha de Google verificada aún, agregarla a `SIN_FICHA_GOOGLE` en `review-cron.js` (no envía encuesta) y NO ponerla en `mapsLinks`/`MAPS_LINKS` (wa-webhook.js / review-followup.js) — el fallback misatribuiría sus reseñas a otra sucursal. Cuando la ficha esté lista: agregar su link `g.page/r/.../review` a ambos maps y quitarla de `SIN_FICHA_GOOGLE`.

### 6. Dashboard "cierre de sucursales" (gating)
- `renderDashAdmin` y `_checkAllCortesCompleted`: el resumen del día aparece cuando **todas las sucursales que OPERARON hoy cerraron caja**. `operatingSucs` debe medir "operó" por **ventas O caja** (no solo caja) — si no, se adelanta a una sucursal que vendió pero no ha cerrado. Las tarjetas usan grid responsivo (`auto-fit`) y omiten sucursales sin corte ni ventas.

### 7. Clari (wa-webhook.js + meta-webhook.js) — opcional, cuando abra
- Agregar la sucursal al bloque `DEFAULT_KNOWLEDGE` SUCURSALES (dirección, tel, Maps, referencias). El `clari_config` en DB tiene `personality`/`knowledge` VACÍOS → Clari usa el DEFAULT del código.
- Promos atadas a una sucursal van en un bloque branch-scoped (ej. `_vittoriaStatus` date-gated), NUNCA en `getActivePromos()` (global) o Clari las ofrece a todas las sucursales.
- Actualizar líneas que digan "las N sucursales" → "todas las sucursales".

### 8. sw.js — bump de `CACHE_NAME` (para que los clientes tomen el index.html/JS nuevos al recargar).

### 9. Verificación (en navegador, login como el usuario nuevo)
- Login OK + `currentUser.sucursal` correcto · `generarFolioVenta()` devuelve el 1er folio correcto y NO avanza en llamadas repetidas · escritura vía dbwrite NO da 401 · `getDatosFiscales()` devuelve la sucursal · `buscarParaEntrega('<folio>')` encuentra venta+órdenes · dropdowns/colores muestran la sucursal · 0 errores de consola.

### ⚠️ Lecciones transversales (no repetir)
- Al **renombrar un folio** de una venta en curso: el navegador del cajero mantiene el folio viejo en memoria → debe **RECARGAR** o sigue creando registros con el folio viejo. Tablas a barrer: `ventas.folio`, `venta_items.folio_asignado`, `ordenes_laboratorio.notas_laboratorio`, `review_queue.folio`, `monedero.descripcion` (venta_items/pagos linkean por venta_id).
- NUNCA pasar regex con `\b`/`\d` por perl/sed con escapes anidados (`\\b` → carácter backspace 0x08); usar reemplazo literal con node.

## 👤 ROLES DEL SISTEMA
- **admin**: acceso total (Angel, carera)
- **gerencia**: igual que admin pero sin permisos destructivos (borrar). Puede autorizar descuentos/cancelaciones/abonos (bypass directo + credenciales en modal auth)
- **sucursal**: su sucursal, ventas/caja/lab (americas, pinocelli, magnolia). Productos: solo lectura (sin editar/crear/precios)
- **laboratorio**: producción/surtido/bitácora, sin ventas/caja. Productos: solo lectura

## 📋 MÓDULOS ACTIVOS
Login, Dashboard (TC dólar auto-refresh), Pacientes, Ventas/POS (multi-pago, USD, ARO PX), Lab, Producción, Bitácora, Promociones (NxM por categoría), Caja (auto-open, ticket corte, historial por sucursal con modal detalle), Comisiones (quincenal), Clari (chatbot WA + CRM Kanban + Realtime), Config (5 pestañas: Equipo/Ventas/Respaldos/Importar/Herramientas), Historial Ventas (incluye SICAR con abonos), Créditos, Garantías, Ventas Online (ONL folios), **Lentes de Contacto** (catálogo cards + CRM recompra + estadísticas — `js/mod-lc.js`), Compras Lab (con lista precios SALES), **Recursos Humanos** (asistencia WA + expedientes LFT + firmas digitales + permisos/vacaciones + reportes + actas — `js/mod-asistencia.js`), **Contabilidad** (estado de resultados + gastos con OCR + flujo de efectivo + facturación CFDI — `js/mod-contabilidad.js`), **Estrategia** (KPIs 90 días + histórico SICAR + monitor márgenes/descuentos + plan 90 días por rol — `js/mod-estrategia.js`), **Entrega de Lentes** (acceso rápido dashboard: escaneo QR/folio/nombre → ver órdenes + saldo → cobrar + marcar entregado — inline en `index.html`), **Auditoría Pedidos** (inventario físico por QR + auditoría automática cada ~5 días + detección anomalías: sin cobrar/sin QC/espera larga — inline en `index.html` + `audit-cron.js`).

## 🏗️ CÓMO FUNCIONA INDEX.HTML
- Es una SPA: todas las vistas son `<div class="view" id="view-nombre">` que se muestran/ocultan
- Navegación: `go('nombre')` muestra la vista y ejecuta su init
- Nuevas vistas requieren: agregar a `const map={}`, agregar `div.view#view-nombre` antes de `</main>`, agregar trigger en `go()`
- Modales: `div.m-overlay` con `classList.add('open')`
- El Supabase client se inicializa como `db = createClient(SUPA_URL, SUPA_KEY)`
- Escrituras interceptadas por SecureQueryBuilder → envía a dbwrite.js
- CSS está DENTRO de index.html en múltiples bloques `<style>` (no extraer)

## 🛒 VALIDACIÓN PACIENTE EN POS
- **VTA_LIBRE** = `['Accesorio','Solución','Solucion']` — únicas categorías que se venden sin paciente
- Todo lo demás (Armazón, LC, Lente de sol, Cobertura, Servicio) requiere paciente obligatorio
- LC y Servicio **excluidos del buscador** de productos — LC solo vía botón "👁 Lentes de contacto"
- Validación en: `agregarProductoVta()`, `agregarItemManual()`, `_procesarVentaInner()`, `toggleVtaRapida()`
- Banner rojo en carrito si hay items que requieren paciente y no hay paciente
- **Guía entrenamiento LC**: auto-trigger en `vtaLcToggle()` la primera vez (localStorage `lc_guia_completada`)

## 🔍 SCANNER REMAP
- PCs de sucursal: teclado español. Pistolas barcode: layout US
- Remap automático por velocidad de input (IIFE)
- Convierte: `' → -`, `Ñ → :`, `ñ → ;`
- SCAN_IDS: manos-input, lp-search, vta-pac-search, vta-prod-search, lab-search, surt-input, recibir-input, entrega-search, conteo-input, am-rq-modelo
- Nuevos campos de escaneo SIEMPRE agregarlos a SCAN_IDS

## 📦 ALTA MASIVA — ESCANEO PROVEEDOR
- **Vista**: `view-alta-masiva` (admin only), acceso desde botón "📷 Alta masiva" en Productos
- **Prefijo→Marca**: `AM_PREFIX_MAP = { SM:'SEIMA', ZB:'ZABDI', HA:'HASHTAG', HP:'HP' }` — extensible
- **`amDetectPrefix(code)`**: retorna marca si las primeras 2 letras matchean un prefijo conocido
- **Ticket proveedor OCR**: botón "📋 Ticket proveedor" → sube foto(s) una por una → OCR extrae codigo+costo → `_amTicketCostos` acumula mapa en memoria → al escanear, costo se auto-llena
- **Código barras**: si el modelo tiene prefijo conocido, la etiqueta usa el modelo directo (SM1515), no el generado (SEIMA-SM1515)
- **Auto-guardar**: cada producto nuevo se guarda a DB inmediatamente al confirmar (sin esperar "Guardar todo")
- **Dropdown precios ↑↓**: `am-precio-list` muestra todos los precios de la marca, navegable con flechas, Enter selecciona + confirma
- **Cache precios**: `_amPrecioCache` por marca, se invalida al guardar producto nuevo
- **Focus**: cursor siempre en campo Modelo para escaneo continuo sin click
- **Flujo**: Foto ticket → escanear barcode → marca+costo auto → ↑↓ precio → Enter → guarda + imprime → siguiente

## 💰 TIPO DE CAMBIO DÓLAR
- app_config id='tipo_cambio', value es JSON string: `{rate,updated,by}`
- Admin edita vía UI o WA ("Dolar X.XX")
- wa-webhook.js: PATCH con `value=JSON.stringify(...)` — columna es TEXT

## 📈 TRACKING (Pixels & Analytics)
- **Meta Pixel**: ID `26143384325317414` — conjunto "Car y Era Tienda" en Events Manager, cuenta "Opticas Car & Era" (906574340703715), portafolio empresarial (2460236247411857)
- **Google Analytics GA4**: ID `G-N84GYVTQKX` — propiedad "Car y Era Tienda", cuenta "Opticas Car y Era", zona Chihuahua GMT-6, moneda MXN
- **Instalado en**: `tienda.html` (ambos) + `netlify/functions/landing.js` (ambos, se inyectan en todas las landing pages)
- **Eventos Meta Pixel**: PageView (todas), ViewContent (ver producto), AddToCart, InitiateCheckout, Purchase (tienda), Lead (landings)
- **Eventos GA4**: page_view (auto), view_item (ver producto), add_to_cart, begin_checkout, purchase (tienda)
- **Coincidencias avanzadas automáticas**: activadas en Meta (detecta email/teléfono de formularios)
- **Estrategia actual**: anuncios van a WhatsApp directo (funciona), landing pages como intermediario para alimentar pixel (1 anuncio por campaña, ~10-20% budget). Tienda LC online activa — pixel mide funnel completo.
- **Campaña Tienda LC Carrusel (Abril 2026)**: objetivo Tráfico → Sitio web (`tienda.html`), formato Carrusel 5 tarjetas (Air Optix Colors $699, Acuvue Oasys, Air Optix Hydraglyde, Dailies AquaComfort Plus, Biofinity), CTA "Comprar", presupuesto $120 MXN/día, audiencia Ciudad Juárez +40km, texto menciona suscripción con 10% descuento. Creativos diseñados en Canva (design ID `DAHFc1bF_mY`). Publicada 2026-03-30.
- **Sistema hermano**: Car & Era Agency (Railway) maneja campañas de Meta Ads — tabla `campaigns` en misma Supabase. El pixel cierra el loop campaigns→conversiones.

## 🔐 SISTEMA DE AUTORIZACIÓN (mod-auth.js)
- **Bypass directo**: admin y gerencia NO necesitan autorización (pasan directo)
- Opción A: código WA (se envía código, usuario lo captura)
- Opción B: responder SI/NO en WA vía webhook
- Opción C: credenciales admin o gerencia en modal (usuario + contraseña)
- Acciones protegidas: descuentos, borrar ventas/órdenes/garantías/abonos, cancelar ventas
- Lee auth_phones de whatsapp_config para enviar solicitudes

## 🛒 VENTAS ONLINE
- Folios: ONL-XXXX (serie separada en folio_ventas)
- Campos: canal_venta (Facebook/Instagram/WhatsApp/Otro), sucursal_entrega
- Solo admin crea ventas online
- Clari puede crear ventas online por WhatsApp

## 👁️ CRM LENTES DE CONTACTO
- Tabla: lc_seguimiento (tracking recompra)
- Cron: lc-cron.js envía recordatorios WA 7 días antes de recompra (mensaje orientado a VENTA, no informativo)
- Mensaje de recompra ofrece pedir los lentes directamente, cliente responde "SI" y Clari procede con venta
- Se guarda `[LC-Recompra]` en clari_conversations para que Clari tenga contexto al responder
- Admin recibe notificación diferenciada: 🔄 RECOMPRA LC vs 🛒 NUEVA VENTA CLARI
- System prompt maneja respuestas: SI→venta, precio→cotiza, graduación cambió→invita sucursal
- Vista CRM con filtros y stats, badge en dashboard

## 📸 COMPRAS LAB
- Registro de compras con foto (OCR vía Anthropic Vision, prompt especializado para notas manuscritas e impresas)
- OCR pasa materiales conocidos del catálogo como contexto + proveedor pre-seleccionado para mejor matching
- Parsing robusto: limpia markdown fences, trailing commas, comillas simples
- Items editables en nueva compra: material re-valida precio al cambiar nombre, subtotal se recalcula en tiempo real
- Lab Assistant en wa-webhook.js procesa fotos de admin_phones (mismo prompt mejorado)
- Listas de precios en app_config id='precios_lab_*' (SALES, y cualquier otro lab)
- Mapeos material→producto de lista en app_config id='mapeo_productos_lab' (JSON)
- Tabs: Compras | Lista de Precios (con botón "+ Nueva lista" para agregar labs por foto o manual)
- OCR extrae serie (S1/S2/S3) de notas de compra
- Validación de precios: cruza cada item contra listas oficiales, reporta discrepancias (WA y web)
- Modal de mapeo: aparece solo si un material no coincide con ninguna lista; incluye selector de serie
- Serie se determina por CIL: ≤-2.00=S1, ≤-4.00=S2, ≤-6.00=S3
- Estimado de compra en Reporte de Materiales usa listas oficiales (con serie por CIL) con fallback a historial
- **Compras guardadas son editables**: modal detalle con inputs inline (material, cantidad, precio), agregar/eliminar items, recálculo de subtotales/total en tiempo real, botón "Guardar cambios" persiste a DB
- **Alias de tratamiento para impresión** (v288, Reporte de Materiales): admin/gerencia pueden renombrar el tratamiento (no el material) para mostrar/imprimir un nombre custom — el sistema "aprende" persistiendo en `app_config` id=`tratamiento_print_aliases` (JSON con keys lowercase). Botón ✏ junto a cada header. Cuando hay alias activo: badge naranja "EDITADO" (visible para todos, tooltip muestra el original) + botón ↩ "Revertir" rápido (solo admin/gerencia). NO afecta DB de órdenes ni ningún flujo interno — solo display + print. Auto-preserva prefijo "Foto " si el tratamiento original contenía "foto" (Foto AR/Blue Light/Cromático/Colors) y el alias no lo menciona. Función clave: `_aplicarTratAlias(normTrat)` en `loadReporteMateriales()`. Print extrae automáticamente vía `data-mat-group` ya aliased.

## 💳 PAGOS EN LÍNEA (CLIP)
- Portal pacientes (`portal.html`) tiene botón "Pagar en línea" con selector de monto (Total/Mitad/Otro)
- `clip-payment.js`: genera link de Clip checkout vía API `https://api.payclip.com/v2/checkout` (Basic Auth). Guarda `clip_prid:{UUID}` en notas de la venta para que el webhook pueda vincular el pago
- `clip-verify.js` (v252): verifica estado real del pago consultando `GET api.payclip.com/v2/checkout/{payment_request_id}`. Estados: `CHECKOUT_COMPLETED`/`CHECKOUT_CANCELLED`/`CHECKOUT_PENDING`/`CHECKOUT_EXPIRED`. Portal lo llama al regresar de Clip
- `clip-webhook.js`: recibe POST de Clip al completarse pago, registra en `venta_pagos`, actualiza `ventas.pagado/saldo`, notifica WA. Acepta status `PAID`/`COMPLETED`/`CHECKOUT_COMPLETED` (Clip envía diferentes strings según el tipo de webhook). Busca venta por: folio → `clip_prid` con código corto → `clip_prid` con UUID → fallback por monto
- Método de pago: "Link de pago" (icono 🔗, color #38bdf8) — ya existía en el sistema
- Env vars Netlify: `CLIP_API_KEY`, `CLIP_API_SECRET` (producción, no test_)
- Pagos online aparecen en historial de abonos pero NO afectan cuadre de caja (solo Efectivo cuenta)
- Webhook URL global en Clip dashboard: `https://optcaryera.netlify.app/.netlify/functions/clip-webhook?token=CLIP_WEBHOOK_TOKEN` (con token completo `clip-caryera-2026-s3cur3`)
- Webhook URL per-payment: `clip-payment.js` envía `webhook_url` a Clip API al crear cada checkout — DEBE incluir `?token=` (fix v242)
- Env var `CLIP_WEBHOOK_TOKEN`: `clip-caryera-2026-s3cur3` — verificación de seguridad del webhook
- Duplicate detection: referencia `clip_{receipt_no}` evita doble registro (receipt_no es estable entre tipos de webhook)
- **Comprobante WA al cliente**: template `comprobante_tienda` SID `HXa41211eb4bdec7a116dc43712be73ad8` — envía folio/monto/sucursal al teléfono del cliente (extraído de notas de venta) después de pago exitoso
- **Payloads de Clip** (3 tipos por cada pago): (1) eventos INSERT/UPDATE con `{event_type, id:UUID, origin:"checkout-api"}` — sin datos de pago, (2) payload anidado con `{context, payment_detail:{amount, status_description:"Completed", receipt_no}, payment_request_detail:{payment_request_code, amount}}`, (3) payload plano con `{amount, status:"PAID", receipt_no, transaction_id}` — sin folio/metadata
- **Vinculación venta↔pago**: `payment_request_id` (UUID, devuelto por API) ≠ `payment_request_code` (código corto, en webhook). `clip-payment.js` guarda UUID como `clip_prid:` en notas. Webhook busca por folio (metadata) + prid (UUID y código corto). **SIN fallback por monto** (v275) — el fallback misatribuía cobros de terminal física a ventas online con clip_prid. Si un webhook llega sin folio ni prid que machee, se skipea (es un cobro de terminal o malformado)
- **⚠️ LECCIÓN v275**: Clip dispara el webhook para TODOS los cobros de la cuenta merchant (online + terminal física). Los cobros en terminal física llegan al webhook sin folio/metadata — si el webhook tiene fallback por monto, los absorbe la primera venta con `clip_prid` y saldo suficiente. Caso real: folio 15767 (Américas) recibió 5 pagos fantasma ($110+$60+$60+$199+$120=$549) que en realidad eran cobros con terminal Magnolia (cajero.magno@gmail.com). Regla: NUNCA usar fallback por monto en webhooks de procesadores compartidos entre online + terminal. Siempre requerir match explícito por referencia/id
- **⚠️ LECCIÓN v252**: NUNCA confiar en URLs de redirección de procesadores de pago. NUNCA asumir estructura de payload de webhooks sin verificar con logs reales — la documentación de Clip no refleja la estructura real

## 📷 LC PHOTO OCR (Clari vende LC con fotos)
- Cualquier usuario WA puede enviar foto de caja LC o receta → Clari extrae datos automáticamente
- `lcPhotoOCR()`: Anthropic Vision extrae marca, modelo, tipo, graduación (PWR, CYL, AXIS, ADD), BC, DIA, color
- `processLCPhoto()`: Matchea OCR con catálogo `productos` (categoria=Lente de contacto), muestra opciones con precio
- Contexto guardado como `[LC-OCR] {json}` en `clari_conversations` para que Clari use los datos en la conversación
- Si no hay match exacto en catálogo, busca alternativas por marca o tipo
- System prompt prioriza transferencia BBVA (sin comisión) sobre Clip
- Datos bancarios: BBVA Cuenta `0485220280` / CLABE `012164004852202892` / Benef: Ivonne Yamilez Alvidrez Flores
- Flujo completo: foto → OCR → catálogo → cotización → CREAR_VENTA → aprobación admin → pago → lc_seguimiento
- **Imágenes en chat**: fotos se suben a Supabase Storage (`chat-media` bucket) vía `uploadChatMedia()`, URL pública se guarda como `[IMG:url]` en `clari_conversations.content`, renderers detectan el tag y muestran `<img>` inline

## 👁 REACTIVACIÓN LC (Campaña Fase 1)
- **lc-reactivate.js**: envío MANUAL de templates WA a usuarios LC dormidos (`?key=SECRET`, dry run `?dry=1`)
- **Lista**: `app_config` id=`lc_reactivacion_contacts` — 136 contactos LC dormidos 2023-2024 de Américas (extraídos de SICAR Excel)
- **A/B/C test**: 3 grupos balanceados (~45 c/u), cada uno recibe template diferente. Campo `group` en cada contacto (A/B/C)
- **Templates Twilio** (pendientes aprobación Meta):
  - A (directo): `HX824d4c058d75e2af542763ef6afc6e3c` — "Sabemos que usas LC..."
  - B (casual): `HXaac46affa7f74ab5bb425be640d17b45` — "¿Ya se te están acabando..."
  - C (corto): `HX048b7704b91753ffedc3cd5d9877754c` — "Tenemos tus LC disponibles..."
- **Tag**: `[LC-Reactivacion]` + `[Template-A/B/C]` en `clari_conversations` (user_name: `lc-reactivacion`)
- **Clari entrenada**: detecta `[LC-Reactivacion]` → busca graduación en `historias_clinicas` → flujo suscripción
  - Graduación reciente (<1 año) → venta con 10% descuento suscripción AHORA
  - Necesita examen → primera compra precio regular, 10% empieza en SIGUIENTE compra
- **Alerta admin**: cada respuesta de cliente LC-Reactivacion envía WA inmediato a admin_phones (🚨/💬)
- **lookupLCHistory(phone)**: nueva función en wa-webhook.js que busca Rx LC en historias_clinicas
- **Dedup**: 60 días por tag, excluye compradores recientes (90 días del sistema nuevo)
- **Fase 2 — VIP Reactivación** (listo, pendiente aprobación Meta):
  - `vip-reactivate.js`: envío manual, misma arquitectura que LC
  - `app_config` id=`vip_reactivacion_contacts`: 418 contactos (gasto ≥$5K, dormidos 2024, no LC)
  - Templates v2 (sin citas): A=HX5a5bfcece1321186bedb2030fb194f37, B=HX19b8342c79614ee0966c19b6e8a8963d, C=HX1eb140442d1dcfd78404d28e84f6a908
  - Tag: `[VIP-Reactivacion]`, user_name: `vip-reactivacion`
  - URL: `/.netlify/functions/vip-reactivate?key=SECRET`
- **Fase 3 — Américas Dormidos 2023 + medio 2024** (listo):
  - `ame-fase3-reactivate.js`: reutiliza templates VIP, tag `[AME-Fase3]`
  - `app_config` id=`ame_fase3_contacts`: 1,691 contactos
  - URL: `/.netlify/functions/ame-fase3-reactivate?key=SECRET`
  - Necesita ~34 ejecuciones (50/run) para completar
- **Siguiente**: Pinocelli (mismo proceso — necesita reporte SICAR de Pinocelli)
- **Archivos análisis en Desktop de Angel**: resultado_cruce.json, analisis_completo_americas.json, directorio_clientes.json

## 📍 RESCATE MAGNOLIA (Estrategia Digital)
- **magnolia-reactivate.js**: envío único manual de lista estática SICAR (cron desactivado en netlify.toml)
- **Lista estática**: `app_config` id=`magnolia_contacts` — 116 clientes SICAR pre-mudanza (ene-mar 2024), extraídos de Excel SICAR + directorio, con teléfono normalizado formato 521XXXXXXXXXX
- **Envío ejecutado**: 2026-03-25, 115 de 116 enviados (1 duplicado por mismo teléfono), 3 rondas manuales
- Template Twilio: `magnolia_reactivacion` SID `HX06ad99f2b5c7b1ff5ff3bcc758052c5c` — **APROBADO por WhatsApp** (2026-03-25) — env var `MAGNOLIA_TEMPLATE_SID`
- Fallback freeform: incluye referencias detalladas (Plaza El Reloj, Tostadas El Primo, Helados Trevly) + link Google Maps
- Dedup: tag `[Magnolia-Reactivation]` en `clari_conversations` (30 días)
- Rate limit: 1.5s entre mensajes, máx 30 por ejecución
- Auth: `BLAST_KEY` env var, dry run con `?dry=1`
- **Clari entrenada para reactivación**: detecta `[Magnolia-Reactivation]` en historial e inyecta contexto completo — ubicación con referencias locales, link Maps, promo 3x1, examen incluido. **Reglas de trato**: no insistir con desinteresados, disculparse con molestos, máx 2 msgs sin respuesta
- **Clari entrenada para Facebook Ads**: meta-webhook.js tiene contexto Magnolia para gente que llega por anuncios preguntando cómo llegar — siempre envía link Maps + referencias
- **Filtro chat Clari**: conversaciones de campañas masivas sin respuesta se ocultan de la lista (magnolia-reactivate, review-cron, lc-cron) — aparecen cuando el cliente responde
- Review prioridad: review-cron.js pone clientes Magnolia al frente de la cola
- **Milestones**: Fase 1 $160K (estabilizar), Fase 2 $200K (parcial), Fase 3 $260K (recuperación total). **Meta abril 2026: $226K** (override manual, recuperación total al promedio pre-mudanza 2021-2023)
- **Promo principal**: 3x1 en Lentes Completos + Examen incluido + Listos en 35 min
- **Env vars necesarias**: `MAGNOLIA_TEMPLATE_SID` (Twilio), `BLAST_KEY` (auth)
- **⚠️ LECCIÓN APRENDIDA (v188)**: la lista SICAR de 116 no se cruzó contra ventas del sistema nuevo — algunos clientes (ej: Anabel Corona, compra reciente folio 10538) recibieron mensaje de "te extrañamos" cuando ya habían vuelto a comprar. **Para futuras campañas masivas**: SIEMPRE cruzar lista estática contra tabla `ventas` de Supabase y excluir clientes con compras recientes (ej: últimos 60 días)

## ⭐ ENCUESTA DE OPINIÓN / GOOGLE MAPS REVIEWS
- **Flujo (v220)**: al marcar lentes como "Entregado" → `_marcarEntregados()` inserta en `review_queue` con `send_at = +2 horas` → `review-cron.js` (cron cada 15 min) procesa cola y envía template
- **DB**: tabla `review_queue` (phone, paciente_nombre, folio, sucursal, send_at, sent, created_at)
- `review-cron.js`: cron `*/15 * * * *`, lee `review_queue` donde `send_at <= now AND sent = false`, máx 10/ejecución
- Template WA: `HX30905d80304bed820dce55b439f1eca3` (Quick Reply, 3 botones: Todo excelente / Buenas promos / Podría mejorar)
- Variable `{{1}}`: nombre del cliente
- Respuestas manejadas en `wa-webhook.js`:
  - "Todo excelente" / "Buenas promos" → `¡Gracias! 😊 Nos encantaría que compartieras tu experiencia en Google:` + link (2 líneas)
  - "Podría mejorar" → Clari pide detalles + notifica admin_phones con alerta
- Links directos de reseña Google por sucursal:
  - Américas: https://g.page/r/CV9ZD9ZPVjvbEBM/review
  - Pinocelli: https://g.page/r/Cdzzax18yI15EBM/review
  - Magnolia: https://g.page/r/CTVxzblIsQ6IEBM/review
- **Dedup**: frontend verifica review_queue 30 días + cron verifica `[Review]` en `clari_conversations` 30 días
- Tracking: `[Review]` tag en `clari_conversations`
- Guard horario: 10am-8pm Chihuahua (fuera de horario se queda en cola)

## 💳 SUSCRIPCIONES RECURRENTES (Tienda Online)
- **Procesador activo**: Clip (único)
- **Stripe**: ⛔ ABANDONADO (v158) — bloqueado por "dispositivos médicos"
- **Conekta**: ⛔ ABANDONADO (v204) — requisitos excesivos de validación, cuenta nunca aprobada
- **OpenPay**: ⛔ DESCARTADO (v204) — cuenta activa pero solo Link de pago, sin API de suscripciones habilitada
- **Pagos únicos**: Clip API (checkout links, `clip-payment.js`) — funciona en portal pacientes + tienda
- **Pagos recurrentes**: Clip dashboard manual (`dashboard.clip.mx/payments/recurring/plans`)
  - Soporta semanal/quincenal/mensual, tarjeta + efectivo en tiendas
  - Solo se crean planes desde dashboard (NO hay API de recurrentes), clientes se suscriben vía link compartido
  - Sin restricción con lentes de contacto
  - Cuenta verificada y activa
- **Google Sign-In**: ✅ RESTAURADO (v230) — tienda LC usa GIS para cuenta cliente con 3 tabs (pedidos desde DB, suscripciones LC, perfil). Requiere `GOOGLE_CLIENT_ID` en env var
- **OpenPay cuenta**: OPTICAS CARRERA, Merchant ID `mhrn62t5deasibtz8r8i`, activa pero sin uso. Giro: OPTICAS, LENTES Y ANTEOJOS

## 📊 CONTABILIDAD (mod-contabilidad.js)
- 4 pestañas: Estado de Resultados, Gastos, Flujo de Efectivo, Facturación CFDI
- **Estado de Resultados**: ingresos (venta_pagos + creditos_abonos) vs egresos (compras_lab + gastos), utilidad bruta/neta, desglose por método/categoría, filtros periodo+sucursal
- **Gastos**: registro manual + foto OCR (Anthropic Vision), categorías (Renta y servicios, Nómina y personal, Proveedores/materiales, Otros operativos), merge con compras_lab (read-only)
- **Flujo de Efectivo**: entradas vs salidas diarias con saldo acumulado
- **Facturación**: solicitudes pendientes (cards expandibles con datos fiscales) + emitidas (con buscador y filtro periodo) + badge sidebar
- Acceso: admin + gerencia + controlable por permisos (checkbox "Contabilidad")
- DB: tabla `gastos`, tabla `facturas`

## 🧾 FACTURACIÓN (control de solicitudes, emisión manual en SAT)
- **Emisión**: contadora hace facturas directo en portal del SAT, las envía por correo al cliente
- **Sistema**: solo lleva control de solicitudes (pendientes/emitidas)
- **factura.js**: ⛔ DEPRECATED (v171) — devuelve 410 Gone, backup en .bak
- **Flujo solicitudes**: empleados/clientes guardan datos fiscales como `status: 'pending'` en tabla `facturas`. Nancy (contabilidad) ve pendientes y marca como emitida cuando la contadora ya la hizo.
- **3 puntos de entrada**: detalle de venta (empleados), portal pacientes (clientes vía dbwrite con auth token_portal), pestaña Facturación (Nancy)
- **Portal escribe vía dbwrite.js**: auth `portal_factura` con token_portal de la venta (RLS bloquea inserts directos desde anon)
- **Datos fiscales reutilizables**: se guardan en `pacientes.datos_fiscales` (JSONB) al solicitar
- **Catálogos SAT** (en mod-contabilidad.js y portal.html): régimen fiscal 9 opciones (601/603/605/606/612/616/621/625/626), uso CFDI (G01/G03/D01/S01)
- **Badge sidebar**: Contabilidad muestra badge con count de solicitudes pendientes (se actualiza en loadDash y al entrar a facturación)
- **Nómina**: se timbra con NominaX (servicio externo, $300-600/mes, cálculo automático ISR/IMSS)
- **DB**: tabla `facturas` (venta_folio, facturapi_id, rfc_cliente, razon_social, total, status pending/valid/cancelled)

## 🧪 USUARIO DEMO
- Login: demo/demo2024, rol admin
- Intercepta escrituras (no guarda nada), no envía WA
- Banner dorado fijo

## 📊 VERSIÓN ACTIVA: v259

**Última versión**: v316 — Pull-to-refresh en móvil (jalar hacia abajo refresca) + se oculta el botón 🔄 en móvil (≤720px). `initPullToRefresh()` (en setupApp) pone listeners touch en `document`, solo activa con `scrollY<=0`, un dedo y fuera de modales/inputs; muestra `#ptr-indicator` con spinner que crece con resistencia y rota, y al pasar 70px refresca. `_ptrDoRefresh()` hace `.click()` del botón `.ptr-refresh-btn` de la vista activa (reutiliza su lógica; fallback a mapa `_ptrViewFn`→loadDash). En desktop los botones 🔄 siguen visibles. sw.js v316. Lección: PTR genérico = reutilizar el botón de refresco de cada vista en vez de mantener un mapa. Anterior v315 — Fix órdenes de lab del 2º par del 2x1 compartido + búsqueda por folio prefijado (caso V0004 Vittoria: 2x1 entre Edgar y Luisa; la orden de Luisa V0004-2 no se podía encontrar). (1) `buscarPacienteOrden` detectaba folio solo numérico (`/^\d{3,}/`) → no hallaba "V0004"; ahora `/^[A-Za-z]{0,4}\d{2,}(-\d+)?$/`. (2) Nueva `mostrarFoliosPendientesVenta(ventaId)` lista TODOS los folios pendientes de la venta (cualquier paciente) con su nombre; `selVentaEnOrden` la usa; `selPromoFolio` cambia al paciente correcto si el folio es de otro (2x1 compartido), con flag `_suppressPromoCheck`. sw.js v315. Lección: detectores de folio deben aceptar prefijo de letra; listas de "pendientes de una venta" deben ser POR VENTA, no por paciente. Anterior v314 — Fix del botón "Ir a venta" (v313): el paciente no se seleccionaba ("Sin resultados"). `go('ventas')` reenfoca el buscador a los 150ms y el `onfocus` re-disparaba la búsqueda con el nombre completo (4 palabras → no matchea). Fix: seleccionar a los 250ms (después del focus de go), ocultar dropdown y mover foco a `vta-prod-search`. sw.js v314. Lección: selección programática tras navegar debe ocurrir DESPUÉS del focus de la vista y dejar el foco en otro elemento. Anterior v313 — (1) Botón "🛒 Ir a venta" en el modal de consultas del paciente → abre POS con el paciente preseleccionado (`irAVentaDesdeConsultas`). (2) Fix búsqueda de pacientes en POS: por teléfono estaba ROTA (`buscarVtaPac` no pasaba `q` a `applySmartFilter` → `ilike '%undefined%'`); por nombre, `.limit(50)` sin `.order()` escondía pacientes nuevos → ahora ordena por `created_at` desc. (3) `buildSmartFilter` normaliza teléfono (quita espacios/símbolos). La búsqueda POS es en vivo (sin caché) = tiempo real. sw.js v313. Lección: `.limit()` sin `.order()` esconde registros nuevos; auditar todos los llamadores al refactorizar funciones compartidas. Anterior v312 — Limpieza de promos en Clari (wa-webhook.js + meta-webhook.js): 2x1 (+ solar $499) extendido del 31 may al **2 de junio** (gate `month===6 && day<=2` + textos actualizados, alineado con el Hot Sale); promo Día del Niño **desactivada** ("ya no es abril") y promo Maestros **eliminada** (vencía el 18 may pero seguía con regla de detección obligatoria → Clari la anunciaba vigente); línea del Hot Sale "no combina" limpiada de esas dos promos. Sintaxis validada, sin bump de sw.js (son functions). Ajuste DB puntual: venta V0004 (Vittoria, $4,699) corregida de Efectivo→Tarjeta en `venta_pagos` (autorizado por Angel; afecta corte del día -$4,699 efvo/+$4,699 terminal). Lección: promos date-gated por mes que cruzan a mes nuevo necesitan extender gate Y textos a la vez; promos vencidas con "REGLA OBLIGATORIA DE DETECCIÓN" deben removerse al expirar o Clari las sigue ofreciendo. Anterior v310 — Encuestas/reseñas Google para sucursal sin ficha (Vittoria, ficha en proceso). El handler hacía fallback `mapsLinks[suc] || mapsLinks['Américas']` → clientes de Vittoria habrían reseñado a Américas. Fix: `review-cron.js` no envía encuestas a sucursales en `SIN_FICHA_GOOGLE`; el handler (wa-webhook) y review-followup quitan el fallback (agradecen sin link si no hay ficha). Encuesta pendiente de Araceli suprimida. Reactivar agregando el link a `mapsLinks`/`MAPS_LINKS` y quitando de `SIN_FICHA_GOOGLE` cuando la ficha esté lista. Anterior v309 — Auditoría final 4ª sucursal + documentación. Arregladas las últimas 2 listas hardcodeadas sin Vittoria (mod-estrategia.js "ventas/descuento por sucursal") + texto "3 sucursales" de Clari. CLAUDE.md actualizado a **4 sucursales** + nuevo RUNBOOK "🆕 ALTA DE NUEVA SUCURSAL" (9 pasos + lecciones de toda la saga). DB final verificada: V0001/V0002 consecutivos, config completa, 0 restos. sw.js v309. Gaps abiertos (datos de Angel): asesores Vittoria (comisiones), personal asistencia. Anterior v308 — (1) Renombre V0006→V0002 (2ª venta Vittoria) para consecutivo correcto; su ticket ya enviado requiere reenvío (saldrá V0002). (2) Fix dashboard "cierre de sucursales" se adelantaba: el resumen aparecía sin esperar a Vía Vittoria aunque ya había vendido. `operatingSucs` (gating en `renderDashAdmin` + `_checkAllCortesCompleted`) detectaba "operando" solo por `cortes_caja`; ahora incluye sucursales con VENTAS hoy → una sucursal que vendió debe cerrar antes de mostrar el resumen. sw.js v308. Lección: medir "operó" por la señal más temprana (ventas), no la más tardía (corte). Anterior v307 — Fix folios NO consecutivos en Plaza Vía Vittoria (saltó V0001→V0006). Causa: la rama de folio prefijado persistía un contador (`siguiente+1`) en cada `generarFolioVenta()`, quemando un folio por cada venta abortada/reintento (las numéricas no persisten, recalculan de `lastVenta`). Fix: prefijada ahora calcula `max(folio V existente)+1` sin persistir contador. Verificado: devuelve V0007 y no avanza en llamadas repetidas. sw.js v307. El ticket de orden lab con `40001` era impresión vieja (DB ya es V0001, reimprimir lo corrige). Hueco V0002-V0005 queda (V0006 no se renumera, su ticket ya se envió). Lección: NO persistir contador de folio al generar (pre-confirmación) — derivar del último folio real o se queman. Anterior v306 — Auditoría comparativa sucursal nueva (folios `V`) vs Américas/Pinocelli. Auth backend 100% cubierto (todas las functions leen custom_users). Fixes folio prefijado: entrega de lentes (`buscarParaEntrega` saltaba `V0001` por guard `/^\d+$/` → ahora acepta numérico+prefijado, usa folio base string), Clari lookup+detector+historial por folio (regex `\d`-only → `V?\d`). sw.js v306. **GAPS pendientes (datos de Angel)**: `asesores` sin Vittoria (comisiones no atribuyen al asesor real, venta cierra con global), `empleados_telefono`+`horarios_asistencia` sin personal Vittoria (asistencia no rastrea). Lección: sucursal con folio prefijado = auditar todo `parseInt(folio)`/`/^\d+$/` en pipeline venta→lab→entrega→Clari. Anterior v305 — Folio PREFIJADO `V` para Plaza Vía Vittoria (solución permanente a choque de folios). `ventas.folio` es UNIQUE global pero cada sucursal cuenta aparte → números bajos/altos siempre pueden converger y chocar. Fix: rama en `generarFolioVenta()` con `PREFIXED_SUCS={'Plaza Vía Vittoria':'V'}` → folios `V0001, V0002…` (sin guion, para no romper la lógica de hermanos `-N` de promos); namespace propio = jamás choca con números de otras sucursales. `lastP` filtra `ilike('folio','V%')` para ignorar legacy numéricos. La 1ª venta de inauguración quedó como `40001` (legacy válido, $2,999); de ahí en adelante `V0001`+. Migración auto del seed numérico. sw.js v305. Lección: con UNIQUE global + contadores por-entidad, namespacing por prefijo es la solución robusta (como Online `ONL-`); evitar guion si hay sufijos `-N`. Anterior v304 — Fix "Autenticación fallida" al escribir desde la sucursal nueva. `dbwrite.js` autentica contra `custom_users` (DB) + `BASE_USERS`; `vittoria` faltaba en ambos (solo se había agregado al login frontend en v298). Fix: agregado `vittoria` a `app_config.custom_users` (mismos permisos que las otras sucursales, efecto inmediato sin deploy) + a `BASE_USERS` en dbwrite.js. **Checklist alta de sucursal/usuario**: NO basta el login frontend (`USUARIOS` en index.html) — agregar SIEMPRE el usuario a `app_config.custom_users` (fuente real de usuarios+permisos que usan frontend Y dbwrite); sin eso, puede logearse pero toda escritura falla con 401. (v303 desde otra sesión: helper display-only `_sucDisplay()` muestra "Vía Vittoria" sin el prefijo "Plaza" en cards del Dashboard; canónico en DB/código sigue "Plaza Vía Vittoria".) Anterior v302 — Promo de inauguración Plaza Vía Vittoria (lente solar graduado adicional GRATIS a los primeros clientes, solo esa sucursal — en `_vittoriaStatus`, branch-scoped) + nota del mapa para Clari (el link de Maps es de la PLAZA; la foto muestra un salón de fiestas/"payaso Teto", es la misma plaza, óptica a un lado de Farmacias Similares — aclarar solo si lo notan) + corrección "Plaza Similares"→"Farmacias Similares". Promo sin fecha de corte aún (pendiente que Angel defina cutoff). Verificado con demo real. Anterior v301 — Refuerzo marketing de Clari para inauguración Plaza Vía Vittoria (30 may): texto date-gated `_vittoriaStatus` ahora destaca la sucursal con entusiasmo cuando preguntan por ubicaciones / no saben a cuál ir (lista Vittoria primero "¡HOY inauguramos!"; post-apertura la sugiere como la más nueva). Profesional, sin spam, sin inventar promos. Verificado con demo real. Anterior v300 — Fix regresión: el Resumen del día (cierre de sucursales) dejó de aparecer al agregar la 4ª sucursal a `physicalSucs` (la condición `every()` exigía que las 4 cerraran caja, pero la nueva no opera). Fix: query de cajas abiertas hoy → `operatingSucs` (las que abrieron caja) → el resumen aparece cuando todas las que OPERARON cerraron, no todas las físicas. Igual en notificación push; `_renderResumenDia` omite tarjetas de sucursales sin movimiento. sw.js v300. Lección: agregar un ítem a un set que alimenta un `every()`/AND puede romper gates — preferir "los que operaron" sobre "todos". Anterior v299 — Fix folio inicial sucursal nueva sin SICAR. `generarFolioVenta()` pedía "último folio SICAR" en la primera venta, pero Plaza Vía Vittoria no tiene SICAR. Bug: guard `if(!folioConfig[suc])` trataba folio 0 como "no configurado". Fix: guard `=== undefined/null`, prompt aclara "sucursal nueva → escribe 0", DB `folio_ventas` sembrado `Plaza Vía Vittoria:0` (primera venta = 0001), sw.js v299. Lección: con valores donde 0 es legítimo, validar con `=== undefined`, nunca `!valor`. Anterior v298 — Alta de 4ª sucursal **Plaza Vía Vittoria** (apertura próxima, color verde `#66bb6a`, código `PVV`). Sistema dejado listo para la primera venta: login `vittoria`/`vittoria01` (rol sucursal), valor canónico `Plaza Vía Vittoria` agregado a ~35 ubicaciones hardcodeadas en 9 archivos (dropdowns, arrays, color maps, reportes admin WA, audit-cron, optometría) + `datos_fiscales` en DB con dirección/teléfono **reales** (Av. Ejército Nacional 12946 esq. Neptuno, CP 32565, tel 656 687 7482). Clave normalizada en estrategia: `plaza via vittoria`. El "Resumen del día / cierre de sucursales" del admin ahora usa grid responsivo (antes 3 columnas fijas) y contador dinámico de sucursales cerradas. Clari (wa-webhook.js + meta-webhook.js) ya anuncia y ofrece la nueva sucursal: bloque SUCURSALES con dirección + tel + Maps + nota "🆕 inauguramos 30 mayo 2026" + instrucción de promoverla a prospectos de la zona (verificado con demo real contra el modelo de Clari). Verificado en navegador (login + caja + datos fiscales OK, render de 4 tarjetas, 0 errores). **PENDIENTE al abrir**: asesores/empleados, ficha+link de reseña Google propios (hoy el review usa fallback a Américas). Detalle completo en CHANGELOG. **Lección**: no hay tabla de sucursales en DB — el sistema usa strings hardcodeados; agregar sucursal = barrer todos los puntos (login es el crítico, el POS usa `currentUser.sucursal`). Anterior v297 — Revert de v296. Los 8 endpoints regresaron a `claude-sonnet-4-20250514`. **Motivo del revert**: malentendido — "actualiza a opus 4.8" se refería al modelo de Claude Code (agente que asiste a Angel), NO al modelo en producción de Clari/OCRs. Cambio en Claude Code se hace desde la terminal del usuario (`/model` o `claude --model X` o settings.json), no desde código del proyecto. Anterior v295 (vigente nuevamente): fix lookup teléfono Messenger + filtro safety [Sistema]. (1) `lookupOrdersByText` en meta-webhook.js ahora extrae teléfonos de 10-13 dígitos del texto del cliente (normaliza dropando 521/52/1) y busca por `pacientes.telefono`. Antes solo buscaba por folio (4-6 dígitos) o nombre — un teléfono de 10 dígitos no matcheaba ningún patrón y la función devolvía null sin buscar. (2) Safety net en ambos webhooks: `sendMetaReply`/WA equivalente filtran líneas tipo "[Sistema] ..." antes de mandar al usuario. El modelo a veces pattern-matchea los tags [Sistema] del historial (donde son markers internos) y los emite como falsos comandos de tool-use que salen literal. (3) Instrucción explícita en DEFAULT_PERSONALITY: NO escribir "[Sistema]" ni "[Tool]" en respuestas; si no ve bloque PEDIDOS ENCONTRADOS, NO fingir estar consultando. Disparado por caso Ángel Ravelo Navarro (Messenger 2026-05-28): dio teléfono 6562180134, Clari entró en loop emitiendo "[Sistema] consulta el pedido..." sin lookup real. Su folio 10662-2 ya está listo en Magnolia. Anterior v294: Hot Sale Car & Era promo headline.

### 📚 Historial de cambios → `CHANGELOG.md`

El changelog detallado de v138 a v259 vive en [`CHANGELOG.md`](CHANGELOG.md) (no se carga en contexto automáticamente).

**Cuándo abrirlo**:
- Buscar contexto histórico de un módulo/feature/bug pasado
- Revisar lecciones aprendidas de incidentes (`Grep "LECCIÓN" CHANGELOG.md -A 2`)
- Ver evolución de un sistema (Magnolia, Clari, Clip, RH, Caja, etc.)
- Investigar por qué se tomó una decisión técnica

**Reglas y patrones operacionales** derivados del changelog ya están integrados en este archivo (REGLAS QUE NUNCA SE ROMPEN, secciones por módulo). Si algo no está aquí pero se aplica al sistema actual, probablemente esté en CHANGELOG.md.

**Al cerrar una sesión con cambios nuevos**: agregar la entrada nueva al INICIO de `CHANGELOG.md` (debajo de "## Historial completo (más reciente primero)") con formato `Cambios vN: <resumen + detalles + lecciones>`. Actualizar la línea "Última versión" arriba con la versión + 1 línea de resumen. Si se descubrió una regla operacional vigente, agregarla también a la sección correspondiente de `CLAUDE.md`.

## 🔍 ALERTAS QC (Control de Calidad)
- **`_alertaQCSinRevision(ordenes, etapa)`**: detecta órdenes sin "Revisado por:" en notas_laboratorio al cambiar estado
- **Etapa `'lab'`**: al enviar a sucursal sin revisión del lab → "⚠️ ALERTA QC LAB"
- **Etapa `'sucursal'`**: al marcar Listo/Entregado sin revisión en sucursal → "🏪 ALERTA QC SUCURSAL"
- **7 puntos de interceptación**: `cambiarEstadoLab` (2: lab+sucursal), `moverEstadoLab` (2: lab+sucursal), `enviarLoteASucursal` (1: lab), `_marcarEntregados` (1: sucursal), `_promptEntregaLentes` (vía _marcarEntregados)
- **Toast rojo** en pantalla del empleado + **alerta WA** a admin_phones con folios, paciente, tipo, usuario, hora
- **El flujo correcto** (`abrirRevisionQC` → `confirmarRevisionQC`) NO dispara alerta — agrega "Revisado por:" antes de cambiar estado
- **Estadísticas base (28-mar-2026)**: 92.1% con QC, 7.9% sin (43/546). Peores días: martes (15.3%), miércoles (14.3%) — coincide con descanso de revisoras
- **Patrón "batch de cierre"**: varias órdenes cerradas en el mismo minuto al final del día = causa principal de QC skip

## 📦 ENTREGAS PENDIENTES (Dashboard sucursal)
- **`_checkEntregasPendientes()`**: consulta `ordenes_laboratorio` con `estado_lab IN ('Listo para entrega','Recibido en óptica')` y `fecha_entrega < hoy`
- **Filtro "No ha venido" por DB** (v246): `_epUltimoNoHaVenido()` parsea la última fecha de "No ha venido" en `notas_laboratorio`. Si tiene menos de 7 días, la orden NO se muestra. Después de 7 días reaparece
- **Dashboard sucursal**: aparece como item en "Tareas pendientes" — `📦 X entregas vencidas (más antiguo: Xd) → Revisar →`
- **Click abre modal** con 2 acciones por pedido: "🤝 Entregado" (marca en DB) o "📞 No ha venido" (escribe en `notas_laboratorio`, no reaparece por 7 días)
- **Sin banner flotante** (eliminado v246) — ya no estorba ni aparece diario
- **Sin localStorage** — todo persiste en DB (`notas_laboratorio`)
- **Sin WA**: "No ha venido" NO envía mensaje al paciente
- **Solo rol `sucursal`**: admin, gerencia y laboratorio NO ven el item
- **Carga deferred**: `_loadDashEntregasVencidas()` se ejecuta como parte de `loadDash()`, no en setupApp

## 📋 AUDITORÍA DE PEDIDOS
- **audit-cron.js**: cron ~cada 5 días (11am CST), detecta entregados sin cobrar + sin QC + esperando >3 días
- **Conteo físico**: modal con scanner QR para verificar pedidos en sucursal vs DB
- **Vista**: `view-auditoria-pedidos` en sidebar (Reportes), 3 tabs (Resumen/Anomalías/Conteos)
- **DB**: tabla `inventario_auditorias` (tipo: `conteo_fisico` | `auditoria_automatica`, datos en JSONB, resoluciones en datos.resoluciones)
- **app_config**: `inventario_ultimo_conteo` (último conteo por sucursal), `inventario_config` (umbrales)
- **Dashboard**: card deferred con stats pedidos en sucursal + anomalías recientes + estado conteo + botones
- **Detección QC skip**: parsea LOG entries en `notas_laboratorio` — si "Recibido en óptica → Entregado" sin "Listo para entrega", es anomalía
- **Detección sin cobrar**: cruza ordenes entregadas con ventas.saldo > 0
- **Permisos**: admin + gerencia ven el módulo completo; sucursal ve botón conteo + burbuja de tarea (NO admin/gerencia/laboratorio)
- **Burbuja tarea**: `_conteoCheckTarea()` en setupApp, aparece si >10 días sin conteo, máx 3 dismisses/día (localStorage). Solo rol `sucursal`.
- **Pistola láser**: `conteo-input` en SCAN_IDS, Enter de pistola agrega folio automático
- **Flujo conteo (v197)**: al finalizar escaneo → auto-guarda en DB + envía WA a admin_phones. Sucursal NO ve resultados, solo "✅ Conteo enviado". Si hay folios faltantes → Fase 2: lista de folios sin detalles financieros + campo nota por folio → "Enviar verificación" → WA al admin + guardado en app_config
- **Cuadra**: resumen Esperados vs Escaneados en UI admin y WA
- **Separación por estado_lab**: missing se separa en "Listo para entrega" (🚨 alerta real) vs "Recibido en óptica" (⚠️ puede estar en QC/revisión)
- **Orphans cruzan ventas**: folios escaneados no en ordenes_laboratorio se cruzan con tabla ventas (join pacientes) para detectar saldo pendiente (incluye SICAR)
- **Resolución de folios**: en historial de conteos, cada folio faltante tiene select 🔴Pendiente / ✅Encontrado / ❌No encontrado. Se guarda en `datos.resoluciones` del registro. Badge "X por aclarar" o "Aclarado ✅" en summary.
- **`_audResolverFolio(conteoId, folio, estado)`**: actualiza resoluciones vía dbwrite sin recargar
- **Lista escaneo invertida**: último folio escaneado aparece arriba
- **whatsapp.js action `send_admin`**: envía freeform a todos los admin_phones de whatsapp_config
- **⚠️ LECCIÓN v197**: tabla `ventas` NO tiene columna `paciente_nombre` — usar join con `pacientes(nombre,apellidos)` para obtener nombre del paciente en queries de ventas

## ⏰ RELOJ CHECADOR / ASISTENCIA
- **Archivos**: `wa-webhook.js` (bot WA entrada/salida/comida/regreso + lookback faltas), `asistencia-cron.js` (recordatorios), `js/mod-asistencia.js` (UI)
- **Plantillas WA UTILITY** (atraviesan ventana 24h, fallback automático a freeform si Twilio falla): `retardo_empleado` HX85d725cc02628385e8c7f75f32c26c99 (admin, vars nombre/suc/hora/min), `ausencias_sin_aviso_v2` HXb2505c839e32603cc70cc602b62be57b (admin, vars fecha/n/lista), `correccion_asistencia` HX58f623eec625eb47d8b7bd03aff2abd7 (admin, vars fecha/nombre/suc/hora), `acta_falta_enviada` HX4583d4e52a7f97e0ba920f3ab52e677a (admin, vars nombre/suc/fechas), `recordatorio_entrada` HXe0980c7826540b349f599e3c2f7a1884 (empleado, var nombre), `reporte_asistencia_firma` HX49c1d5cd7048ca9dc650d1e8670c7b24 (empleado, vars nombre/inicio/fin/link). Helpers: `sendWhatsAppTemplate(to,sid,vars,fallbackText)` en wa-webhook.js y `sendWATemplate(...)` en asistencia-cron.js.
- **DB**: `asistencia` (registros diarios), `asistencia_firmas` (actas/reportes con token firma), `app_config` ids: `horarios_asistencia`, `empleados_telefono`, `expedientes_empleados`
- **`horarios_asistencia` estructura**: `{ default: { lun: {entrada,salida}, ... }, override: { uid: { dia: null|{entrada,salida}|{alternating,ref,parity} } }, tolerancia_min, empleados_extra }`
- **Día de descanso**: `override[uid][dia] = null` → el sistema lo salta en lookback, cron y UI
- **Domingo alterno**: `override[uid]["dom"] = { alternating: true, ref: "2026-03-29", parity: 0 }` — calcula semana par/impar desde `ref` para determinar si es su turno de descanso. Carolina parity=0 (descansa semanas pares), Brenda parity=1 (impares)
- **Lookback 7 días**: al fichar "entrada", revisa 7 días atrás buscando faltas. Excluye: días antes de `ASISTENCIA_START_DATE` (2026-03-25), días de descanso (null/alternating), permisos (regex en nota), días ya registrados
- **Acta automática**: si encuentra faltas, genera token 72h, envía link por WA al empleado + notifica admin
- **`_asistResolveSchedule(uid, dayKey, dateObj)`**: helper en mod-asistencia.js, acepta dateObj opcional para calcular paridad de días alternos
- **Días de descanso actuales** (v221): Elva=mar, Dulce=mie, Carolina=vie+dom alterno, Brenda=jue+dom alterno, Paola=mie, Mariela=mie, Alejandra=mar, Jorge=dom, Azael=dom
- **⚠️ LECCIÓN v221**: `asistGuardarHorario()` solo lee el horario BASE de la UI — los overrides (días de descanso, horarios custom) viven en `_asistHorarios.override` en memoria y se guardan como parte del objeto completo. Si se resetea el objeto o se pierde la referencia, los overrides desaparecen y el lookback genera actas falsas

## 🛡️ VISIÓN SEGURA
- **Tablas DB**: `vision_segura` (protecciones) + `vision_segura_eventos` (eventos de uso)
- **3 planes**: BÁSICO ($499), PLUS ($999), PREMIUM ($1,999) — definidos en `VS_PLANES` constante en index.html
- **Duración**: 12 meses desde fecha de compra (auto-calculado)
- **Estados**: VIGENTE → VENCIDO (auto por fecha) o SIN COBERTURA (agotado)
- **Fecha de compra editable (admin)**: `editarFechaVS()` — prompt AAAA-MM-DD, recalcula fecha_fin (+12 meses), auto-actualiza estado
- **Nueva protección**: modal con date picker (default hoy), preview de vencimiento, validación de armazón duplicado
- **Eventos**: LENTES (cambio graduación/rotura) y REPOSICION (solo PLUS/PREMIUM), con cooldown 50 días en plan ilimitado
- **Permisos**: `del_coberturas` para eliminar, editar fecha solo admin
- **Vista**: `view-vision-segura` con búsqueda de paciente, lista rápida, panel de protecciones + historial de eventos

## 💰 CAJA Y CORTES
- **3 fuentes de pagos**: `venta_pagos` (pagos de ventas), `creditos_abonos` (abonos a créditos SICAR), pagos online (Clip). Los 3 deben sumarse en desglose, efectivo esperado, terminal esperado y dólar esperado
- **`cajaDayData.creditoAbonos`**: siempre incluir en cálculos de cuadre — si solo se usa `cajaDayData.pagos` se pierden los abonos de créditos SICAR
- **Diferencia neta**: `_corteDiffNeta(c)` = `diferencia + diferencia_terminal + diferencia_dolar`. El estado general del corte (cuadra/faltante/sobrante) SIEMPRE debe usar la neta, no solo la diferencia de efectivo
- **Modal detalle corte**: usa `dNeta`/`diffNetaTxt` para el header general, y `d`/`diffTxt` para el cuadre individual de efectivo. NUNCA mezclar — la variable `d` (diferencia efectivo) debe existir siempre para la alerta cruzada y cuadre de efectivo. Función `async verDetalleCorte()` carga 4 queries paralelas para mostrar log de movimientos
- **Log de movimientos (v232)**: sección colapsable "📋 Movimientos del día" en modal de detalle. 3 sub-tablas: Ventas (folio/paciente/total/saldo/estado), Pagos recibidos (venta_pagos + creditos_abonos mezclados por hora, badge SICAR, colores por método), Retiros (monto/obs/quién, badge dólar). Resumen rápido con totales + saldos pendientes. Queries on-demand al abrir modal (no guardadas en corte)
- **`num_abonos` (fix v232)**: `realizarCorte()` ahora guarda `pagosAbonos.length + cajaDayData.creditoAbonos.length` (antes solo contaba pagosAbonos, omitiendo créditos SICAR)
- **Órdenes lab por sucursal**: las queries de `ordenes_laboratorio` para cortes SIEMPRE deben filtrar `.eq('sucursal', suc)`, no contar todas las del día
- **`total_ventas` vs ingreso total**: `total_ventas` = suma de `ventas.total` (montos de venta). `desglose_metodos` = suma de pagos reales (puede incluir abonos). Son números distintos — mostrar ventas como principal, cobrado como secundario
- **Template WA corte**: SID activo `HX23d232e120ff04a785bb92734974fba0` (v2, dice "Total ventas"). Variable {{4}} pasa `totalVentas`. Template anterior `HX7baea51b259a055403edfc70646d94d9` obsoleto
- **⚠️ LECCIÓN v202**: al cambiar la diferencia general del corte, la variable `d` (diferencia de efectivo) se perdió y causó ReferenceError silenciado dentro de `.then()` — el modal dejó de abrir sin error visible. Siempre mantener variables separadas para diferencia neta vs individual, y agregar `.catch()` a promises de UI para detectar errores silenciosos
- **Retiro incluye dólares (v223)**: `abrirRetiro()`, `registrarRetiro()` y `_initAlertaEfectivoGlobal()` suman pagos `metodo_pago='Dólar'` + créditos SICAR en dólar al disponible. Los pagos en dólar ya están en MXN en `venta_pagos.monto` (convertidos al cobrar con `monto * _tipoCambio`), `monto_usd` tiene el valor original USD
- **Modal retiro USD (v223)**: si hay dólares en caja, el modal muestra desglose + sección "Retiro en dólares" con input USD y conversión automática. `_retiroDolarUSDDisp` y `_retiroDolarMXNDisp` guardan los disponibles. `registrarRetiroDolar()` inserta en `retiros_caja` en MXN con obs auto "Retiro USD $X a TC $Y"
- **Retiros dólar separados (v228)**: los retiros se clasifican por `observaciones.startsWith('Retiro USD')`. Retiros de efectivo se restan del efectivo esperado, retiros de dólar se restan del dólar esperado. Aplica en: `renderCajaResumen`, `calcDiferencia`, `hacerCorte`, `_initAlertaEfectivoGlobal`. `total_retiros` en DB sigue guardando el total combinado para el registro
- **⚠️ LECCIÓN v228**: los retiros de dólar (vía `registrarRetiroDolar`) se guardan en `retiros_caja` con observación "Retiro USD $X a TC $Y". Si se restan de `efectivoTotal` en vez de `dolarTotal`, el efectivo esperado se vuelve negativo y confunde al empleado al hacer el corte
- **Cancelaciones mismo-día se neutralizan en el resumen (v285)**: cuando una venta se cancela el mismo día y se devuelve efectivo, el pago original (`venta_pagos`) Y el retiro de devolución (`retiros_caja` con observaciones que empiezan con "🚫 Devolución cancelación <folio>") se compensan matemáticamente. `cargarDatosCaja()` filtra AMBOS del cuadre cuando el folio cancelado está en `canceladas` de hoy — así el resumen muestra "Efectivo $0" en vez de "Efectivo $500 + Retiro $500". Cancelaciones cross-day (venta creada ayer, cancelada hoy) mantienen el retiro visible porque el venta no está en `allVentas` (filtrado por created_at). **Patrón regex en código**: `r.observaciones.match(/Devoluci[oó]n cancelaci[oó]n\s+(\S+)/)` extrae el folio para matchear contra el Set de canceladas. **NUNCA** cambiar la observación generada por `_ejecutarCancelarVenta()` (debe seguir empezando con "🚫 Devolución cancelación ") porque rompería el filtro.
- **Arrastre de billetes no retirados (v259)**: `fondo_inicial = 0` en cada nuevo corte — el sistema asume que al cierre se retira TODO el efectivo y dólar físico. Si no se retira, los billetes quedan físicamente en el cajón pero el sistema del día siguiente no los espera. Peor: si hoy no hay pago en dólar, el sistema no muestra casilla de dólar → los billetes USD se cuentan junto con MXN como efectivo → sobrante masivo solo en efectivo con terminal cuadrada. **Diagnóstico**: query de cortes últimos 2-3 días filtrando por sucursal, buscar días con `efectivo_contado > 0 OR dolar_contado > 0` y `total_retiros < efectivo_contado + dolar_contado`. Si la suma de no-retirados coincide con el sobrante de hoy, es arrastre. **Fix retroactivo**: registrar retiro en `retiros_caja` con fecha del día del sobrante (NO modificar el corte cerrado — es snapshot histórico), agregar observación al corte explicando el arrastre. Operativamente: recordar a sucursales retirar SIEMPRE al cierre, separar billetes USD/MXN al contar, capturar cualquier retiro físico en el sistema con el botón "Registrar retiro"

## 🔄 SUPABASE REALTIME
- **7 tablas suscritas**: ventas, venta_pagos, ordenes_laboratorio, historias_clinicas, pacientes, compras_lab, gastos
- **Requisito**: habilitar Replication en Supabase Dashboard → Database → Replication para cada tabla
- **`initRealtimeSubscriptions()`**: se llama en `setupApp()`, crea un solo channel `app-realtime` con listeners por tabla
- **`_rtRefreshMap`**: define qué función llamar por vista activa (ej: `ventas` → `loadDash()` si estás en dashboard)
- **`_rtHandleChange(table)`**: verifica si la vista activa está afectada, aplica debounce 3s, ejecuta función de refresh
- **`_rtToast(msg)`**: notificación verde "Datos actualizados" por 3s
- **Debounce 3s**: agrupa ráfagas (ordenes_laboratorio puede disparar docenas de eventos seguidos)
- **Guard null**: eventos pueden llegar antes de que el mapa se inicialice — `if (!_rtRefreshMap) return;`
- **Variables globales**: `_rtSubs`, `_rtRefreshMap`, `_rtDebounce`, `_rtSuppressUntil` — deben ser `var` (no `let`) por hoisting en index.html
- **`_rtSuppressUntil`** (v226): timestamp que suprime refreshes de Realtime después de escrituras locales. Previene race condition donde Realtime trae datos stale y "revierte" estados en la UI. Se setea a `Date.now() + 5000` (5s) en cada escritura a ordenes_laboratorio (10s para batch). Se verifica al entrar a `_rtHandleChange` y después del debounce
- **⚠️ REGLA**: toda función que escriba a `ordenes_laboratorio` DEBE hacer `_rtSuppressUntil = Date.now() + 5000` antes del write
- **Clari chat**: tiene su propio Realtime separado (desde v144), no se toca

## 📩 MI SOBRE (cobro de comisiones por empleado, v288-v292)
- **Tarjeta dashboard sucursal**: banner verde "📩 Mi sobre disponible" al INICIO de `dash-body`. Visible SOLO en ventana: días 1-3 (cobra Q2 mes anterior) y 16-18 (cobra Q1 mes actual). Fuera de ventana: invisible, no ocupa espacio. Solo rol `sucursal`. Si todos los asesores ya cobraron ese período → no aparece.
- **Control admin de visibilidad** (v289): botón "👁 Visibilidad: Auto/Abierto/Suspendido" en topbar Comisiones (admin only) → modal `m-sobre-override` con 3 opciones: Auto / Mantener ABIERTO hasta DD/MM / Mantener CERRADO hasta DD/MM. Persistido en `app_config` id=`sobre_override` JSON `{tipo:'open'|'close', hasta, set_by, set_at}`. Auto-expira al pasar la fecha. Cargado en `_loadDashMiSobre()` antes de evaluar la ventana.
- **Flujo modal `abrirMiSobre()`** (puede tener hasta 4 pasos según situación):
  1. **Step tareas** (v290): si la sucursal tiene tareas bloqueantes pendientes (conteo físico vencido), modal abre directo aquí con lista naranja + botón "Hacer ahora". Asesor no puede llegar al cobro hasta completar. Extensible: agregar más checks en `_msTareasBloqueantes(suc)`.
  2. **Step 1**: dropdown de asesores de la sucursal (excluye los que ya cobraron ese período).
  3. **Step 2 PIN**: detecta automáticamente si el asesor tiene PIN. Si NO → modo `create` (input + confirmación + banner "🆕 Primera vez que cobras"). Si SÍ → modo `enter` (input simple). SHA-256 con sal `pin+':'+nombre`. Rechaza obvios (0000, 1234, 4 dígitos iguales).
  4. **Step 3 cobro**: muestra período + monto + valida efectivo MXN en caja en tiempo real → botón "💵 Cobrar de caja" o mensaje "pide a admin transferencia" si no hay efectivo.
- **DB**:
  - **Tabla `comisiones_pagadas`** (UNIQUE sucursal+asesor+periodo): id BIGSERIAL, sucursal, asesor, periodo ("2026-05-Q1"), monto, fecha_pago, pagado_por, retiro_caja_id UUID FK a retiros_caja, metodo TEXT NOT NULL DEFAULT 'caja' (v291), created_at. RLS: anon SELECT, service_role ALL. Agregada a ALLOWED_TABLES en dbwrite.js.
  - **`app_config` id=`empleados_pins`**: JSON `{ "Nombre Asesor": "<sha256 hex>" }`.
  - **`app_config` id=`sobre_override`**: JSON del override admin (puede ser NULL).
- **Cobro caja `_ejecutarCobroSobre()`** (order matters):
  1. Re-verifica que no esté pagado ya (UNIQUE constraint protege contra race)
  2. Re-verifica efectivo en DB con `_msFetchCajaState(suc)` (independiente de `cajaData` global — funciona desde dashboard sin entrar a caja). **Solo cuenta efectivo MXN** — NO dólares (mismo criterio que registrarRetiro normal).
  3. Inserta `comisiones_pagadas` con `metodo='caja'` primero (marker)
  4. Inserta `retiros_caja` con `observaciones='[SOBRE] {asesor} - {periodo}'` y `registrado_por={asesor}`
  5. Link `retiro_caja_id` (best-effort)
  6. Si paso 4 falla → compensa borrando el `comisiones_pagadas`
- **Pago por transferencia `_ptPagarAsesor()`** (v291, admin only): inserta en `comisiones_pagadas` con `metodo='transferencia'`, `retiro_caja_id=NULL`. **NO toca caja** — solo registra que admin pagó fuera del sistema (transferencia bancaria desde su banco al asesor). Modal `m-pago-transfer` se abre desde botón "💸 Transfer" en topbar Comisiones → selector de período → lista agrupada por sucursal de pendientes con su monto calculado + botón "Marcar pagado" por cada uno.
- **PIN self-setup** (v290): empleados crean su propio PIN la primera vez. Admin ya no es requerido para configurarlos. `_msSavePin(asesor, pin)` es merge-safe (re-lee el JSON antes de escribir para no perder PINs creados por otros simultáneamente). Admin sigue pudiendo resetear PINs desde "🔐 PINs" → 🗑.
- **Tareas bloqueantes** (v290): `_msTareasBloqueantes(suc)` chequea conteo físico vencido (`app_config` id=`inventario_ultimo_conteo`, umbral 10 días). Extensible: agregar más checks (cambios de precio, entregas vencidas críticas, etc.) en esta función. Si hay tareas, el empleado NO puede cobrar — solo cerrar el modal o ir a hacer la tarea.
- **Panel auditoría "Sobres cobrados"** (v292): sección colapsable dentro de view-comisiones (admin/gerencia), debajo de la tabla. Se refresca al cambiar sucursal/período (llamada desde `calcularComisiones`). Muestra TODOS los sobres del período (todas sucursales) agrupados por sucursal: nombre, badge método (💵 Caja verde / 💸 Transfer azul), monto, fecha+hora Chihuahua, quién registró. Header con totales caja/transfer/total. Botón 🗑 deshacer por fila (admin only): para transfer borra solo el registro; para caja borra registro + retiros_caja vinculado con warning de que el efectivo esperado sube.
- **Helper `_msFetchCajaState(suc)`**: query directo a DB para caja abierta de hoy + pagos+abonos+retiros del día, independiente de `cajaData` global. Devuelve `{caja, efectivo MXN}`.
- **Filtros en retiros**: retiros con observación `[SOBRE] *` cuentan como retiro MXN normal (afectan cuadre de caja). Aparecen en historial de retiros con asesor como `registrado_por` para auditoría.
- **Botones admin en topbar Comisiones** (solo `currentUser.rol==='admin'`): `💸 Transfer` | `👁 Visibilidad` | `🔐 PINs` | `🔄`. Todos ocultos para otros roles.
- **⚠️ LECCIÓN v288**: el flujo de cobro debe ser self-contained desde dashboard — NUNCA depender de `cajaData` o `cajaDayData` globales, porque solo se cargan al entrar a view-caja. Usar `_msFetchCajaState(suc)` que consulta DB directo. Aplica a cualquier feature que necesite estado de caja desde otra vista.
- **⚠️ LECCIÓN v290**: PIN self-setup necesita validar contra PINs obvios (0000, 1234, repeticiones) — usuarios eligen lo más cómodo si no se les fuerza. También requiere doble input (PIN + confirmación) para prevenir typos que dejarían al empleado sin acceso.
- **⚠️ LECCIÓN v291**: cuando el admin paga al empleado por canal externo (transferencia bancaria desde su app), el sistema necesita un mecanismo explícito para registrar ese pago — si no, la tarjeta verde sigue apareciendo y hay riesgo de doble pago. La columna `metodo` distingue caja (afecta cuadre) de transferencia (no toca caja). Auditoría: `SELECT * FROM comisiones_pagadas WHERE metodo='transferencia' ORDER BY fecha_pago DESC;`
- **⚠️ LECCIÓN v292**: features de "deshacer" registros financieros deben compensar todos los efectos colaterales. Deshacer un cobro de caja sin borrar el retiros_caja vinculado deja el cajón "corto" en sistema vs realidad. Always show strong warning + cascade delete.
- **⚠️ LECCIÓN SQL (v288/v292)**: cuando una tabla nueva tiene FK a otra existente, verificar PRIMERO el tipo de la columna referenciada antes de hacer el CREATE TABLE. `retiros_caja.id` es UUID (no bigint) — el primer CREATE TABLE falló. Y al hacer migraciones de columna (`ALTER TABLE ADD COLUMN`), usar `IF NOT EXISTS` + `DEFAULT 'valor'` + `NOT NULL` para que filas existentes queden con valor sensato.

## 🎯 MÓDULO ESTRATEGIA (mod-estrategia.js)
- **5 tabs**: Meta del Mes, KPIs, Histórico, Márgenes, Plan 90 Días
- **Meta automática**: `_estCalcMeta()` — promedio ponderado últimos 3 años del mismo mes (peso 1x/2x/3x) + % crecimiento configurable. Magnolia solo usa datos post-mudanza (2024+)
- **Datos SICAR**: constante `SICAR_DATA` hardcodeada en JS (ventas mensuales 2021-2026 por sucursal, datos fijos)
- **Datos sistema nuevo (2026+)**: `_estLoadHistDB()` consulta ventas de la DB agrupadas por mes/sucursal para que 2027+ funcione automático
- **Override manual**: admin puede editar metas por sucursal/mes → se guarda en `app_config` id=`metas_mensuales`
- **app_config keys**: `kpis_estrategia` (KPIs 90 días), `estrategia_plan90` (checkboxes plan), `metas_mensuales` (overrides + % crecimiento)
- **Widget gamificado** en dashboard empleados (sucursal): anillo CSS circular de progreso, meta diaria en ventas (no montos), mascota animada con Lottie (10 temas emoji rotan por día + animación Lottie por stage), frases contextuales (hora/día/racha/récord), auto-refresh 3min
- **Lottie animations**: CDN `@lottiefiles/dotlottie-wc@0.9.2` (WebAssembly+canvas), `LOTTIE_ANIMS` map con 7 stages (sleep/rocket/running/fire/star/celebrate/trophy), `_estRenderLottie()` crea `<dotlottie-wc>` con fallback automático a emoji CSS si CDN o URL falla
- **Columna ventas DB**: `created_at` (no `fecha`), `estado` (no `status`), promos en tabla `venta_promociones`
- **Sucursal en DB**: `Américas` con acento (normalizar con NFD para matching)
- **Permisos**: checkbox "Estrategia" en Config, admin ve módulo completo, empleados solo ven widget en su dashboard

## 📈 CONTEXTO ESTRATÉGICO (Mar 2026)
- **Propuesta de valor**: "Ve bien. Véte bien." — Experto local, experiencia superior, garantía 60 días, calidad frontera
- **Segmento target**: C/C+ (28% población, ticket $1,500-$3,500)
- **Ticket promedio real**: $3,482 MXN (confirma posicionamiento C/C+)
- **Fortalezas**: Velocidad (8/10), Calidad percibida (7/10)
- **Debilidades**: Digital (2/10), Marca (3/10)
- **Competencia**: Ben & Frank (47/60), Devlyn (41/60), +Visión (38/60), Salud Digna (36/60), Car & Era (33/60)
- **Oportunidad**: Ninguna óptica local tiene estrategia digital sostenida. Quien entre primero domina 12-18 meses
- **Alerta descuentos**: 67.5% de ventas con descuento, tasa 45% — 3x1 permanente comprime márgenes
- **Magnolia**: -$1.2M/año vs pre-mudanza. Reactivación WA activa: 3 conversiones ($17,917) en 3 días de 116 contactos. Meta abril $226K (recuperación total). Meta Ads zona activa. Medir resultados a 4 semanas
- **Plan 90 días**: Ángel (ads/promos), Ivon (contenido), Karen (operación). Fases de 4 semanas c/u
- **KPIs meta**: 120 reseñas Google, 150 leads/mes, 100 citas digital, 4.5x ROAS, +1000 followers IG, +15% retención
- **Datos históricos SICAR**: hardcodeados en `js/mod-estrategia.js` (ventas mensuales 2021-2026 por sucursal)
- **Estacionalidad**: Nov=pico (Buen Fin), Ene=más flojo, Jun-Jul=caída verano, Sep-Oct=recuperación

## ⚠️ PENDIENTES
1. ~~Migrar WA#1 Clari a Twilio~~ ✅ Completado — WA#1 deprecated, WA#2 único vigente
2. SICAR migración completa
3. Landing pages bug
4. Plantillas Twilio: lc_recompra + venta_clari_pendiente
14. **Rescate Magnolia**: ✅ Lista SICAR 116 clientes extraída y cargada en `app_config` (v188), ✅ magnolia-reactivate.js reescrito para lista estática, ✅ 115 mensajes enviados (2026-03-25), ✅ Clari entrenada (ubicación + no insistir + Maps link), ✅ `MAGNOLIA_TEMPLATE_SID=HX06ad99f2b5c7b1ff5ff3bcc758052c5c` template aprobado, ✅ Cron desactivado (envío único), ❌ landing pages descartadas, ✅ Meta Ads geo-targeting zona Magnolia — campaña configurada, ✅ **Conversión medida (28-mar, 3 días post-envío)**: 8 respondieron WA (6.9%), 3 conversiones a venta (Crystal Medina $7,999 + Edgar Ibarra $5,319 + Martha Dominguez/Aracely $4,599) = **$17,917** atribuible a campaña. Anabel Corona ($5,799) compró 1 día antes del envío (no atribuible). Total ventas Magnolia post-envío: $50,300, campaña = 35.6%. SaMaViLe y otros 3 expresaron interés sin compra aún. ⬜ limpiar ~322 campañas viejas desactivadas en Ads Manager, ⬜ re-medir conversión a 2-4 semanas (cola larga WA)
15. **Decisiones estratégicas Magnolia (v186 sesión 2)**: (a) "Nos mudamos" solo para clientes registrados vía WA reactivation, NO para ads a nuevos clientes. (b) Landing pages descartadas — Clari ya mide funnel completo (WA→venta→ticket), pixel no necesario para negocio local con 3 sucursales. (c) "Examen de vista incluido" en vez de "gratis" (más ético). (d) Creative Canva: diseño 3x1 con modelo, "solo por tiempo limitado", ubicación Plaza Magnolia. (e) Ads directo a WhatsApp, sin intermediario landing page.
5. Precios Marina pendientes de confirmar
6. Mapear materiales existentes (CR-39 · Blue Light → 1.56 BLITA BLUE AR, etc.) en el sistema
7. Optimizar probador virtual LC en tienda.html (detección de ojos necesita más trabajo)
8. **Conekta**: ⛔ ABANDONADO (v204) — requisitos excesivos, cuenta nunca aprobada. Código en conekta-subscribe.js y conekta-webhook.js marcado DEPRECATED. Env vars `CONEKTA_PRIVATE_KEY`, `CONEKTA_WEBHOOK_KEY`, `GOOGLE_CLIENT_ID` pueden eliminarse de Netlify
9. **Google Sign-In**: ✅ RESTAURADO (v230) — tienda LC usa GIS para cuenta cliente (pedidos, suscripciones, perfil). ✅ Credencial OAuth configurada (`961220697987-...`) en tienda.html
10. **Facturación**: ✅ Facturapi cancelado (v171), ✅ CSD eliminados, ✅ flujo simplificado, ✅ env vars limpiadas (FACTURAPI_KEY + STRIPE_* eliminadas de Netlify), ⬜ considerar envío por correo desde sistema (requiere Gmail App Password con 2FA)
11. **SEGURIDAD menor**: innerHTML sin sanitizar (XSS bajo), Rate limiting, RBAC en dbwrite.js
12. **Lottie animations**: ✅ COMPLETADO (v182). CDN `dotlottie-wc@0.9.2`, 7 stages con URLs reales `.lottie` de `assets-v2.lottiefiles.com`, web component `<dotlottie-wc>` con canvas WebAssembly, fallback emoji CSS, auto-refresh compatible. URLs restantes del catálogo (179 total, 7 usadas) guardadas en sesión Claude Code para futuras variaciones.
13. **Metas mensuales**: ✅ Insertado en Supabase `app_config` id=`metas_mensuales` con `{"crecimiento_pct":5,"overrides":{"2026-04":{"magnolia":226000}}}`. Magnolia abril override $226K (recuperación total pre-mudanza). Américas ($452K) y Pinocelli ($335K) en automático
16. **Auditoría Pedidos DB**: ✅ Tabla `inventario_auditorias` creada, ✅ RLS + policy anon SELECT, ✅ app_config `inventario_ultimo_conteo` + `inventario_config` insertadas
17. **Template WA corte v2**: ✅ `HX23d232e120ff04a785bb92734974fba0` aprobado y activado (v202)
18. **Alertas QC + fix estados**: ✅ Alertas implementadas (v225). ✅ Bug "estados que reaparecen" diagnosticado y arreglado (v226) — race condition Realtime, fix con `_rtSuppressUntil`. ✅ Anti-doble-click en `moverEstadoLab` y `cambiarEstadoLab`. ⬜ Monitorear si la tasa de QC skip baja con alertas activas. ⬜ Considerar bloqueo hard (no permitir envío sin QC) si las alertas no son suficientes
20. **Promo Follow-up Abril**: ✅ Template `HXa4f1d07c41ebb02e5a4639afbf1cbede` creado y enviado a Meta (2026-03-31), ✅ 82 contactos en `app_config` id=`promo_abril_followup`, ✅ `promo-followup.js` deployado, ⬜ ejecutar campaña abril 1 (2 runs de 50), ⬜ verificar que template esté aprobado antes de enviar
21. **Reply Messenger/Instagram desde panel Clari**: el panel Clari (`enviarClariReply`) solo envía por WhatsApp vía `whatsapp.js`. Si el cliente escribió por Facebook Messenger o Instagram DM, el admin no puede responder desde el sistema — tiene que ir a Facebook directo. Pendiente: agregar soporte de reply multicanal detectando `user_name` (clari-messenger/clari-instagram) y usando Meta Graph API con `META_PAGE_TOKEN` para enviar la respuesta por el mismo canal.
19. **Instagram DMs Advanced Access**: ⬜ App Review de Meta para `instagram_manage_messages` Advanced Access — necesario para que Clari responda DMs de IG de TODOS los usuarios (hoy solo admin). Solicitud borrador expirada, crear nueva. Requiere video screencast + descripción por cada permiso. Bajo impacto (~3-4 DMs orgánicos/día, ads ya van a WhatsApp). Comentarios IG ✅ arreglados (v237, no requieren Advanced Access)

## 📝 AUTO-UPDATE (OBLIGATORIO)
Al finalizar CADA sesión donde se hagan cambios al proyecto, Claude Code DEBE:
1. Agregar entrada nueva al INICIO de `CHANGELOG.md` (debajo de "## Historial completo (más reciente primero)") con formato `Cambios vN: <resumen + detalles + lecciones>`
2. En `CLAUDE.md`, actualizar la línea "Última versión" en la sección VERSIÓN ACTIVA (versión nueva + 1 línea de resumen)
3. Si se descubrió una **regla operacional** o patrón nuevo que aplica al sistema vigente, agregarla también a la sección correspondiente de `CLAUDE.md` (no solo al CHANGELOG) para que esté siempre cargada en contexto
4. Mover items resueltos de PENDIENTES a `CHANGELOG.md` (en la entrada de la versión que los resolvió)
5. Agregar nuevos pendientes si surgieron

**División de responsabilidad**:
- `CLAUDE.md` = contexto operacional vigente (siempre cargado, mantener conciso)
- `CHANGELOG.md` = historia detallada (consulta on-demand vía Grep, puede crecer libremente)

Estos archivos son la FUENTE DE VERDAD del proyecto. Las conversaciones de Claude Code no se sincronizan entre computadoras — estos archivos sí (vía GitHub). Si no están actualizados, el contexto se pierde.

## 💻 MULTI-DISPOSITIVO
Angel trabaja desde 2 computadoras (casa y trabajo). Las conversaciones de Claude Code son locales por máquina y NO se sincronizan. Por eso:
- CLAUDE.md debe estar siempre actualizado (es el contexto compartido)
- **Repo GitHub**: https://github.com/AngelAlv-96/optcaryera (PRIVADO)
- **Netlify**: auto-deploy desde branch `main` (cada push = deploy)
- Antes de empezar a trabajar en una máquina: `git pull`
- Al terminar de trabajar: `git add . && git commit -m "msg" && git push`
- En la otra PC (primera vez): `git clone https://github.com/AngelAlv-96/optcaryera.git`
