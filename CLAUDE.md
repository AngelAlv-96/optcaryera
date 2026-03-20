# Ópticas Car & Era — Sistema de Gestión
# CONTEXTO COMPLETO PARA CLAUDE CODE

## ⛔ REGLAS QUE NUNCA SE ROMPEN
1. **NUNCA extraer CSS de index.html** — contiene 9 bloques `<style>` (2 en HTML global + 5 dentro de JS template literals + 2 en módulos JS). Si los extraes a archivos separados, ROMPES TODO el sistema.
2. **NUNCA hacer regex para eliminar comentarios** — `//` aparece en URLs (`https://...`) y en template strings. Regex los destroza.
3. **NUNCA modificar funciones ZPL** (impresión de etiquetas) — están BLINDADAS y funcionan perfectamente. No tocar.
4. **NUNCA borrar ni reemplazar archivos completos sin respaldo** — siempre hacer copia antes: `cp archivo.html archivo.html.bak`
5. **NUNCA hacer deploy sin que Angel lo pida explícitamente** — Netlify auto-deploys desde GitHub (cada push a main = deploy). Manual: `netlify deploy --prod --dir=.` solo si es necesario.
6. **NUNCA modificar el Supabase schema desde código** — cambios de DB (ALTER TABLE, INSERT en app_config, etc.) se hacen en el dashboard de Supabase manualmente.

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
├── zpl_bridge.py       — Bridge impresión ZPL ⛔ NO TOCAR
├── CLAUDE.md           — Este archivo
├── js/                 — Módulos JS extraídos de index.html
│   ├── mod-auth.js       — Autorizaciones WA (descuentos, borrar ventas)
│   ├── mod-catalogo.js   — Catálogo materiales ópticos
│   ├── mod-clari.js      — UI del chatbot Clari
│   ├── mod-creditos.js   — Créditos y adeudos
│   ├── mod-landings.js   — Landing pages builder
│   ├── mod-produccion.js — Producción y surtido lab
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
    ├── clip-webhook.js   — Webhook Clip: registra pagos + notifica WA
    ├── review-cron.js    — Cron encuesta de opinión Google Maps (diario 12pm CST)
    ├── meta-webhook.js   — Webhook Meta: Clari chatbot para Facebook Messenger + Instagram DM
    ├── stripe-subscribe.js — Crea Stripe Checkout Session para suscripciones (Google auth + recurring billing)
    ├── stripe-webhook.js  — Webhook Stripe: auto-crea ventas en cada cobro recurrente + notifica WA
    └── stripe-portal.js   — Portal cliente: consulta suscripciones + abre Stripe Customer Portal
```

## 🔧 TECH STACK
- **Frontend**: Vanilla JS SPA (CERO frameworks/bundlers). Todo es HTML+CSS+JS puro.
- **Backend**: Supabase (PostgreSQL) + Netlify Functions (serverless)
- **WhatsApp**: Twilio (WA#2) + Meta directa (WA#1 Clari)
- **Messenger/Instagram**: Meta Graph API (meta-webhook.js) — Clari responde en FB Messenger + Instagram DM
- **IA**: Anthropic API (Clari chatbot + Lab Assistant OCR)
- **Pagos**: Stripe (suscripciones recurrentes tienda) + Clip API (checkout links portal pacientes)
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

## 📱 WHATSAPP
- **WA#1** (Clari inbound): 5216561967020 — sigue en Meta directa
- **WA#2** (notificaciones + Lab Assistant): 5216563110094 — Twilio activo
- wa-webhook.js maneja WA#2 (Twilio)
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
- **Auto-reply comentarios públicos**: `checkRecentComments()` piggybacks en cada webhook call, escanea últimos 7 días de posts vía `/feed` endpoint con inline comments, genera respuesta breve con Claude Haiku (`generatePublicReply`), publica vía `/{commentId}/comments` (form-encoded), tracking en Supabase `[FB-Comment:{id}]` para dedup. Max 5 replies por ejecución con timeout guard de 7s.
- Permisos del Page Token: `pages_read_user_content` (leer comentarios de usuarios), `pages_manage_engagement` (publicar respuestas), `pages_read_engagement`, `pages_messaging`, + 14 más
- App "car & era maker" no está verificada por Meta — campo `from` en comentarios no disponible (user data hidden), pero las respuestas funcionan sin él

## 🏪 NEGOCIO
- 3 sucursales: Américas, Pinocelli, Magnolia (Ciudad Juárez, Chihuahua)
- Óptica con laboratorio propio de lentes
- ~30,000 pacientes en la base de datos
- Dueño/operador: Angel Alvidrez

## 👤 ROLES DEL SISTEMA
- **admin**: acceso total (Angel, carera)
- **gerencia**: comisiones + caja readonly + dashboard $$ (Raúl y otros)
- **sucursal**: su sucursal, ventas/caja/lab (americas, pinocelli, magnolia)
- **laboratorio**: producción/surtido/bitácora, sin ventas/caja

## 📋 MÓDULOS ACTIVOS
Login, Dashboard (TC dólar auto-refresh), Pacientes, Ventas/POS (multi-pago, USD, ARO PX), Lab, Producción, Bitácora, Promociones (NxM por categoría), Caja (auto-open, ticket corte), Comisiones (quincenal), Clari (chatbot WA + CRM Kanban + Realtime), Config (5 pestañas: Equipo/Ventas/Respaldos/Importar/Herramientas), Historial Ventas (incluye SICAR con abonos), Créditos, Garantías, Ventas Online (ONL folios), CRM LC, Compras Lab (con lista precios SALES).

## 🏗️ CÓMO FUNCIONA INDEX.HTML
- Es una SPA: todas las vistas son `<div class="view" id="view-nombre">` que se muestran/ocultan
- Navegación: `go('nombre')` muestra la vista y ejecuta su init
- Nuevas vistas requieren: agregar a `const map={}`, agregar `div.view#view-nombre` antes de `</main>`, agregar trigger en `go()`
- Modales: `div.m-overlay` con `classList.add('open')`
- El Supabase client se inicializa como `db = createClient(SUPA_URL, SUPA_KEY)`
- Escrituras interceptadas por SecureQueryBuilder → envía a dbwrite.js
- CSS está DENTRO de index.html en múltiples bloques `<style>` (no extraer)

## 🔍 SCANNER REMAP
- PCs de sucursal: teclado español. Pistolas barcode: layout US
- Remap automático por velocidad de input (IIFE)
- Convierte: `' → -`, `Ñ → :`, `ñ → ;`
- SCAN_IDS: manos-input, lp-search, vta-pac-search, vta-prod-search, lab-search, surt-input, recibir-input
- Nuevos campos de escaneo SIEMPRE agregarlos a SCAN_IDS

## 💰 TIPO DE CAMBIO DÓLAR
- app_config id='tipo_cambio', value es JSON string: `{rate,updated,by}`
- Admin edita vía UI o WA ("Dolar X.XX")
- wa-webhook.js: PATCH con `value=JSON.stringify(...)` — columna es TEXT

## 🔐 SISTEMA DE AUTORIZACIÓN (mod-auth.js)
- Opción A: código WA (se envía código, usuario lo captura)
- Opción B: responder SI/NO en WA vía webhook
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

## 💳 PAGOS EN LÍNEA (CLIP)
- Portal pacientes (`portal.html`) tiene botón "Pagar en línea" con selector de monto (Total/Mitad/Otro)
- `clip-payment.js`: genera link de Clip checkout vía API `https://api.payclip.com/v2/checkout` (Basic Auth)
- `clip-webhook.js`: recibe POST de Clip al completarse pago, registra en `venta_pagos`, actualiza `ventas.pagado/saldo`, notifica WA
- Método de pago: "Link de pago" (icono 🔗, color #38bdf8) — ya existía en el sistema
- Env vars Netlify: `CLIP_API_KEY`, `CLIP_API_SECRET` (producción, no test_)
- Pagos online aparecen en historial de abonos pero NO afectan cuadre de caja (solo Efectivo cuenta)
- Webhook URL configurado en Clip: `https://optcaryera.netlify.app/.netlify/functions/clip-webhook`
- Duplicate detection: referencia `clip_{paymentId}` evita doble registro

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

## ⭐ ENCUESTA DE OPINIÓN / GOOGLE MAPS REVIEWS
- `review-cron.js`: cron diario 12pm CST, envía template `opinion_servicio` a clientes que compraron hace 3-7 días
- Template WA: `HX30905d80304bed820dce55b439f1eca3` (Quick Reply, 3 botones: Todo excelente / Buenas promos / Podría mejorar)
- Variable `{{1}}`: nombre del cliente
- Respuestas manejadas en `wa-webhook.js`:
  - "Todo excelente" / "Buenas promos" → agradece + envía link Google Maps de la sucursal donde compró
  - "Podría mejorar" → Clari pide detalles + notifica admin_phones con alerta
- Links Google Maps por sucursal:
  - Américas: https://maps.app.goo.gl/HdEKPf2R8bL6tbvA9
  - Pinocelli: https://maps.app.goo.gl/HPZYupPVjy9aZ4j38
  - Magnolia: https://maps.app.goo.gl/HBomFDEfJJNPna697
- Tracking: `[Review]` tag en `clari_conversations` (evita re-envío en 30 días)
- Máx 20 encuestas por ejecución, rate limit 1.5s entre mensajes

## 💳 SUSCRIPCIONES STRIPE (Tienda Online)
- **Stripe account**: acct_1TD8PDF8cTOBxfic
- **Flujo**: cliente elige suscripción → Google Sign-In → Stripe Checkout (hosted) → pago automático recurrente
- **Google Sign-In**: Google Identity Services (GIS), ID token verificado server-side vía `oauth2.googleapis.com/tokeninfo`
- **Zero npm dependencies**: Stripe REST API directo con fetch, webhook signature con crypto HMAC-SHA256 nativo
- **stripe-subscribe.js**: verifica Google token, busca/crea Stripe customer por email, crea Checkout Session en modo subscription con `price_data` dinámico + `recurring`, soporta mix de items recurrentes + one-time
- **stripe-webhook.js**: `invoice.payment_succeeded` → crea venta (folio ONL-SUB-xxx) + registra pago + notifica admin y cliente por WA; `invoice.payment_failed` → alerta; `customer.subscription.deleted` → notifica cancelación. Duplicate detection por referencia `stripe_{invoiceId}`
- **stripe-portal.js**: devuelve status de suscripciones activas o crea sesión de Stripe Customer Portal (autogestión: cambiar tarjeta, cancelar, pausar)
- **Frontend**: nav con Google auth state (avatar + menú dropdown), checkout bifurcado (sub→Stripe, one-time→dbwrite), modal "Mi cuenta" con lista de suscripciones + botón portal, post-payment handler para ?pago=ok
- **Env vars Netlify**: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `GOOGLE_CLIENT_ID`
- **Webhook URL**: `https://optcaryera.netlify.app/.netlify/functions/stripe-webhook`
- **Eventos webhook**: `invoice.payment_succeeded`, `invoice.payment_failed`, `customer.subscription.deleted`
- **Google Client ID**: configurar en tienda.html variable `GOOGLE_CID` (línea en el JS)
- **Frecuencias**: 30d→mensual, 60d→bimestral, 90d→trimestral (mapeo a Stripe `interval: 'month'`)
- **Descuento suscripción**: 10% automático (aplicado en frontend antes de enviar a Stripe)

## 🧪 USUARIO DEMO
- Login: demo/demo2024, rol admin
- Intercepta escrituras (no guarda nada), no envía WA
- Banner dorado fijo

## 📊 VERSIÓN ACTIVA: v154
Cambios v154: Auditoría de seguridad completa — hardening de todas las funciones serverless + frontend. **CORS restrictivo**: las 11 funciones ahora limitan `Access-Control-Allow-Origin` a `optcaryera.netlify.app` (antes era `*`). **Security headers en netlify.toml**: X-Frame-Options SAMEORIGIN, X-Content-Type-Options nosniff, Referrer-Policy strict-origin-when-cross-origin, Permissions-Policy (cámara solo self), CSP con dominios explícitos. **clip-payment.js**: validación server-side de monto ≤ saldo. **clip-webhook.js**: verificación por token configurable (`CLIP_WEBHOOK_TOKEN` env var). **ia-chat.js**: errores sanitizados. **dbwrite.js**: validación regex de columnas en filtros (anti-injection). **reporte.js**: ahora requiere auth. **backup.js**: requiere BACKUP_TOKEN para todos los modos. **console.log** limpiados en webhooks. **Passwords**: 5 funciones ahora soportan env var `AUTH_USERS` (JSON) con fallback a hardcoded — en producción, passwords solo en env var. **SRI (Subresource Integrity)**: hashes SHA-384 en 4 CDN scripts de index.html + 2 de portal.html, Supabase JS pinado a v2.99.3. **Google credential**: ya no se guarda en sessionStorage (solo perfil UI), el JWT token vive en memoria y se renueva por auto_select. Env vars nuevas opcionales: `CLIP_WEBHOOK_TOKEN`, `AUTH_USERS`.
Cambios v153: Suscripciones automáticas Stripe + Google Sign-In + security hardening. 3 funciones nuevas (zero npm deps): `stripe-subscribe.js` crea Stripe Checkout Session en modo subscription con Google auth, `stripe-webhook.js` procesa cobros automáticos (crea venta + pago en DB + notifica admin/cliente por WA, con duplicate detection), `stripe-portal.js` consulta suscripciones y abre Stripe Customer Portal para autogestión. Frontend: Google Identity Services (One Tap + fallback botón), nav con auth state (avatar + menú dropdown con Mis suscripciones/Mis pedidos/Cerrar sesión), checkout bifurcado (items con suscripción → Google auth + Stripe Checkout hosted; sin suscripción → flujo existente dbwrite), modal "Mi cuenta" con lista de suscripciones activas (status badges, frecuencia, próximo cobro) + botón portal Stripe, post-payment handler (?pago=ok). Stripe REST API usado directamente con fetch (sin SDK), webhook signature verificada con crypto HMAC-SHA256 nativo. Env vars necesarias: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, GOOGLE_CLIENT_ID. Security hardening: `ia-chat.js` ahora requiere autenticación (BASE_USERS + custom_users de Supabase), las 4 llamadas frontend envían auth credentials. `clip-payment.js` valida token_portal contra tabla ventas en Supabase antes de generar link de pago. `stripe-subscribe.js` valida precios server-side contra DB (previene manipulación de precios desde frontend, descuento 10% calculado en servidor).
Cambios v152: Mejorar OCR Compras Lab + edición reactiva de items + edición de compras guardadas. Prompt OCR reescrito con instrucciones específicas para notas manuscritas (caligrafía, tachones, confusión de números) e impresas (encabezados de columnas). Abreviaturas ópticas comunes como contexto (BL, AR, CR, Poli, Foto, HI, Prog, BF, FT, Inv). Manejo robusto de IVA con 3 escenarios (separado, incluido, sin indicación). Materiales conocidos del catálogo de precios se pasan como referencia al modelo para mejor matching de nombres. Proveedor pre-seleccionado se incluye como contexto en web. Parsing más robusto: limpia markdown fences, trailing commas, comillas simples, con fallback. Editar nombre de material ahora re-valida precio contra lista automáticamente (onchange → clbRevalidarPrecio). Subtotal se actualiza visualmente en tiempo real al editar cantidad o precio (antes solo el total general). Focus del input se preserva al re-renderizar la tabla. Modal detalle de compras guardadas ahora es completamente editable: inputs inline para material/cantidad/precio, botón "+ Agregar línea", botón ✕ para eliminar items, subtotales y total se recalculan en tiempo real, botón "Guardar cambios" persiste a DB. Mejoras aplicadas en frontend (index.html clbProcesarFoto + clbRenderItems + clbVerDetalle) y backend (wa-webhook.js labAssistantOCR).
Cambios v151: Auto-reply a comentarios públicos en Facebook. `checkRecentComments()` en meta-webhook.js escanea posts de los últimos 7 días vía `/feed` endpoint con inline comments (`pages_read_user_content`), genera respuestas breves con Claude Haiku (`generatePublicReply`), y publica via `/{commentId}/comments` (form-encoded, requiere `pages_manage_engagement`). Dedup via `[FB-Comment:{id}]` en `clari_conversations`. Max 5 replies por ejecución con timeout guard de 7s. Page Access Token regenerado como long-lived (never-expires) con 18 permisos incluyendo `pages_manage_engagement`. Fix: Meta requiere form-encoded (URLSearchParams) no JSON para publicar comment replies. Fix: campo `from` no disponible en apps no verificadas — código maneja gracefully sin requerir datos de usuario.
Cambios v150: Clari multi-canal — Facebook Messenger + Instagram DM. Nuevo `meta-webhook.js` recibe mensajes de ambos canales vía Meta Graph API v25.0 y responde con la misma IA de Clari (Anthropic). Reutiliza historial en `clari_conversations` (senderId como phone, canal identificado en user_name). Búsqueda de pedidos por folio/nombre. Notificación WA a admin en primeros mensajes. Configurado en Meta Developers: webhook verificado, campo `messages` suscrito para Messenger e Instagram, Page Access Token de "Ópticas Car & Era" (140615486675232). Instagram @opticascar.yera (17841414023710928) conectado. Env vars: `META_PAGE_TOKEN`, `META_VERIFY_TOKEN`. App: "car & era maker" (2088315654915229) — compartida con agencia de marketing (solo campañas, no toca mensajes).
Cambios v149: Corte de caja — cuadre completo por método de pago. Dólar ahora tiene mismo flujo que Efectivo y Tarjeta: UI con input "Dólar contado (MXN)" (`caja-dolar-row`) + diferencia en tiempo real + sección DIFERENCIA DÓLAR en ticket. Ticket renombrado a "DIFERENCIA TARJETAS" (MSI es solo registro interno, misma terminal). Las 3 secciones (Efectivo/Tarjetas/Dólar) en UI y ticket aparecen SOLO si hubo ese método de pago ese día — Efectivo siempre aparece por el fondo inicial. `imprimirTicketCorte()` acepta `dolarContado` como 10mo parámetro. Fix visual: "DIFERENCIA TARJETAS" wrappea a 2 líneas igual que DIFERENCIA EFECTIVO/DÓLAR (texto de 18 chars no wrapeaba, 19+ sí).
Cambios v148: Anti-doble-click universal — protección `_actionBusy` aplicada a todas las operaciones críticas de escritura: `registrarRetiro()` (causa del bug de retiro duplicado del 2026-03-17), `confirmarRecibirPedidos()`, `registrarAbono()` (refactorizado a try/finally), `_ejecutarCancelarVenta()`, `enviarComprobanteAbono()`, `guardarPromo()`, `guardarProducto()`, `registrarAbonoCredito()` (mod-creditos.js). Patrón: flag `_actionBusy['nombre']` + botón deshabilitado + texto "⏳ Procesando..." + finally que siempre restaura el estado. Los botones dan feedback visual inmediato al primer click. `procesarVenta()` y `enviarLoteASucursal()` ya tenían protección desde antes. Validación en tiempo real de saldo disponible en caja antes de registrar retiro (re-query DB). Edición de teléfono de paciente para todos los roles (botón "📞 Tel." en fila), admin sigue teniendo edición completa. Terminal contado para tarjeta/MSI en UI de caja con diferencia automática. Ticket corte mejorado: secciones por método (Efectivo, Tarjeta/MSI, Dólar) solo aparecen si hubo ese método.
Cambios v147: Seguridad RLS Supabase — habilitado RLS en las 19 tablas que no lo tenían (12 óptica + 7 agencia). Corregidas 7 policies ALL con roles={public} (ahora solo service_role puede escribir). Fijado search_path=public en 3 funciones (generar_token_portal, update_landing_pages_updated_at, update_landing_timestamp). 40/40 tablas protegidas, 40/40 lecturas anon verificadas OK. Scripts: rls-audit-BEFORE.md, rls-audit-AFTER.md, rls-fix-log.md, rls-fix-summary.md, rls-rollback.sql. Excepciones intencionales: clari_conversations (chatbot anon) y pacientes (registro público).
Cambios v146: Imágenes inline en chat Clari — fotos de WA ahora se suben a Supabase Storage (bucket `chat-media`) vía `uploadChatMedia()` en wa-webhook.js. Se guardan como `[IMG:url]` en content de clari_conversations. Ambos renderers (pestaña Conversaciones + modal CRM) detectan el tag y muestran `<img>` inline con click para abrir tamaño completo. Cubre los 4 puntos de entrada de fotos: admin foto sola, admin foto+caption, cliente foto sola, cliente foto+caption. Tienda LC try-on virtual: reescrito pipeline de rendering con offscreen canvas aislado por ojo (fix bug un solo ojo), ellipse fitting estilo pupilómetro, blending con video pixels reales via 'color' composite mode.
Cambios v145: Clari vende LC con OCR de fotos — lcPhotoOCR() usa Anthropic Vision para extraer marca, modelo, graduación (PWR, CYL, AXIS, ADD), BC, DIA, color de fotos de cajas de LC o recetas. processLCPhoto() matchea con catálogo de productos y muestra opciones con precio. Funciona para TODOS los usuarios WA (no solo admin). Maneja foto sola y foto+caption. System prompt actualizado: prioriza transferencia bancaria BBVA sobre Clip (sin comisiones), invita a clientes a enviar fotos, recomienda cantidades según frecuencia, menciona recordatorios automáticos de recompra. Contexto [LC-OCR] guardado en historial para que Clari use datos extraídos en conversación. lc-cron.js reescrito: mensaje orientado a VENTA (ofrece pedir lentes, cliente responde SI), guarda [LC-Recompra] en clari_conversations, Clari maneja respuestas (SI→venta, precio→cotiza, graduación→sucursal). Admin recibe notificación diferenciada 🔄 RECOMPRA LC vs 🛒 NUEVA VENTA.
Cambios v144: CRM WhatsApp Kanban en Clari — 3ra pestaña "CRM" con board Kanban de 6 columnas (Necesita atención, Encuesta OK, LC Online, Cliente, Prospecto, Nuevo Lead). Clasificación automática cruzando clari_conversations con pacientes, ventas y lc_seguimiento. Modal overlay para ver conversación completa sin salir del CRM (con reply directo). Mobile responsive con scroll-snap para swipe entre columnas. Optimización de carga: `.in()` en vez de `ilike`, `Promise.all` para queries paralelas (512 contactos en ~3.5s). Insights panel con métricas: conversión, tasa respuesta encuestas, leads activos, prospectos por convertir, clientes con actividad reciente, recompras LC próximas. Supabase Realtime para chat Clari (sin polling). Fix auto-refresh que sacaba al usuario de conversación abierta. Fix whatsapp: duplicate prefix en review-cron.js y lc-cron.js. Fix estado filter en review-cron.js (Liquidada en vez de Completada).
Cambios v143: Sistema de encuestas de opinión Google Maps — review-cron.js envía template opinion_servicio (Quick Reply con 3 botones) a clientes 3-7 días después de compra. Respuestas positivas reciben link de Google Maps de su sucursal. Respuestas negativas activan modo atención de Clari + alerta a admin. Links por sucursal (Américas, Pinocelli, Magnolia). Tracking via [Review] tag en clari_conversations.
Cambios v142: Pagos en línea Clip — portal pacientes permite seleccionar monto (Total/Mitad/Otro) antes de pagar, clip-payment.js genera links dinámicos de Clip checkout, clip-webhook.js recibe webhook de Clip al completarse pago y auto-registra en venta_pagos (método "Link de pago"), actualiza saldo/pagado de la venta, y envía notificación WA a admin_phones + recipients_corte. Credenciales producción Clip configuradas en Netlify env vars. Pagos online NO afectan cuadre de caja (solo "Efectivo" cuenta para cuadre).
Cambios v141: Foto Colors requiere selector de color (Gris/Rosa/Cafe/Azul/Morado/Verde) en POS y Orden Lab — se guarda en tinte como "Foto Colors: Color", aparece en surtido/reporte distinguido por color. Fix folio slots: items con cantidad > 1 ahora se pueden asignar a múltiples folios (antes se bloqueaba después del primero).
Cambios v140: Cancelar ventas con autorización WA (motivo, devolución dinero, retiro caja), estimado compra con selector proveedor por fila (aprende preferencias), VS medios, TIPO badges, comparativo estimado vs compras reales, total nota editable en Compras Lab, terminología laboratorio→proveedor, Hi Index · Foto AR · VS (S1: $2,199, S2: $2,499), botón "+ Agregar material" en Catálogo (admin only) con modal para insertar en reglas_materiales.
Cambios v139: validación precios SALES en Lab Assistant (WA) y Compras Lab (web), OCR extrae serie, modal mapeo con selector de serie, agregar nuevas listas de precios por foto/manual, estimado de compra en Reporte Materiales usa listas oficiales con serie por CIL.
Cambios v138: fix lista usuarios config, checkbox Compras Lab en permisos, auth_phones separado de admin_phones, lista precios SALES en Compras Lab.

## ⚠️ PENDIENTES
1. Migrar WA#1 Clari a Twilio
2. SICAR migración completa
3. Landing pages bug
4. Plantillas Twilio: lc_recompra + venta_clari_pendiente
5. ~~Recompra automática wa-webhook~~ ✅ HECHO (2026-03-17) — lc_seguimiento ya registra fecha_recompra, lc-cron envía recordatorio 7d antes
6. Promo "Material a $1"
7. ~~SEGURIDAD: RLS Supabase~~ ✅ HECHO (2026-03-17) — 40/40 tablas con RLS, policies corregidas, search_path fijado. Proxy lectura por fases pendiente
8. ~~Mapeo materiales + matching inteligente compras lab~~ ✅ HECHO (2026-03-16)
9. Precios Marina pendientes de confirmar
10. ~~Configurar GitHub para sincronizar entre computadoras~~ ✅ HECHO (2026-03-16)
11. Mapear materiales existentes (CR-39 · Blue Light → 1.56 BLITA BLUE AR, etc.) en el sistema
12. Optimizar probador virtual LC en tienda.html (detección de ojos necesita más trabajo)
13. CRM Clari: modal overlay para conversación, optimizar vista móvil, agregar insights/stats
14. **Stripe**: Configurar env vars en Netlify (STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET), crear webhook en Stripe Dashboard, configurar Stripe Customer Portal settings
15. **Google Sign-In**: Crear OAuth 2.0 Client ID en Google Cloud Console, reemplazar GOOGLE_CID en tienda.html
16. **Stripe**: Probar flujo completo con claves test antes de activar producción
17. ~~**SEGURIDAD**: CLIP_WEBHOOK_TOKEN~~ ✅ HECHO (2026-03-20) — configurado en Netlify + Clip dashboard
18. **SEGURIDAD pendiente**: innerHTML con datos de DB sin sanitizar (XSS — riesgo bajo, solo users autenticados escriben)
19. ~~**SEGURIDAD**: token_portal expiración~~ DESCARTADO — token_portal da acceso permanente al monedero del paciente, no debe expirar
20. ~~**SEGURIDAD**: Google credential~~ ✅ HECHO (2026-03-20) — solo perfil en sessionStorage, JWT en memoria
21. ~~**SEGURIDAD**: Passwords env var~~ ✅ HECHO (2026-03-20) — 5 funciones soportan `AUTH_USERS` env var
22. ~~**SEGURIDAD**: SRI CDNs~~ ✅ HECHO (2026-03-20) — SHA-384 en 6 scripts, Supabase pinado v2.99.3
23. **SEGURIDAD pendiente**: Configurar `AUTH_USERS` JSON en Netlify env vars para eliminar passwords del source code
24. **SEGURIDAD pendiente**: Rate limiting en endpoints públicos
25. **SEGURIDAD pendiente**: RBAC en dbwrite.js (restricción por rol)

## 📝 AUTO-UPDATE (OBLIGATORIO)
Al finalizar CADA sesión donde se hagan cambios al proyecto, Claude Code DEBE:
1. Actualizar este CLAUDE.md con: qué cambió, versión nueva, decisiones técnicas tomadas
2. Incrementar la versión en la sección "VERSIÓN ACTIVA"
3. Mover items resueltos de PENDIENTES a la sección de cambios
4. Agregar nuevos pendientes si surgieron

Este archivo es la FUENTE DE VERDAD del proyecto. Las conversaciones de Claude Code no se sincronizan entre computadoras — este archivo sí (vía GitHub). Si el CLAUDE.md no está actualizado, el contexto se pierde.

## 💻 MULTI-DISPOSITIVO
Angel trabaja desde 2 computadoras (casa y trabajo). Las conversaciones de Claude Code son locales por máquina y NO se sincronizan. Por eso:
- CLAUDE.md debe estar siempre actualizado (es el contexto compartido)
- **Repo GitHub**: https://github.com/AngelAlv-96/optcaryera (PRIVADO)
- **Netlify**: auto-deploy desde branch `main` (cada push = deploy)
- Antes de empezar a trabajar en una máquina: `git pull`
- Al terminar de trabajar: `git add . && git commit -m "msg" && git push`
- En la otra PC (primera vez): `git clone https://github.com/AngelAlv-96/optcaryera.git`
