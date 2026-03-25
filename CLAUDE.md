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
├── hero-lc.jpg         — Imagen trust section tienda LC (77KB, 1200x670)
├── firma-asistencia.html — Página pública: firma digital de reportes/actas (empleados)
├── zpl_bridge.py       — Bridge impresión ZPL ⛔ NO TOCAR
├── CLAUDE.md           — Este archivo
├── js/                 — Módulos JS extraídos de index.html
│   ├── mod-auth.js       — Autorizaciones WA (descuentos, borrar ventas)
│   ├── mod-catalogo.js   — Catálogo materiales ópticos
│   ├── mod-clari.js      — UI del chatbot Clari
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
    ├── clip-webhook.js   — Webhook Clip: registra pagos + notifica WA
    ├── review-cron.js    — Cron encuesta de opinión Google Maps (diario 12pm CST)
    ├── meta-webhook.js   — Webhook Meta: Clari chatbot para Facebook Messenger + Instagram DM
    ├── conekta-subscribe.js — Crea Conekta HostedPayment checkout para suscripciones (Google auth + planes dinámicos)
    ├── conekta-webhook.js  — Webhook Conekta: auto-crea ventas en cada cobro recurrente + notifica WA
    ├── stripe-subscribe.js — ⛔ DEPRECATED (Stripe bloqueado para LC) — mantener como referencia
    ├── asistencia-cron.js  — Cron asistencia: recordatorios ausencia + envío firmas (cada 30min 10am-12pm)
    ├── factura.js          — Proxy Facturapi: crear/cancelar CFDI, descargar PDF/XML (IVA 8% frontera)
    ├── stripe-subscribe.js — ⛔ DEPRECATED (Stripe bloqueado para LC) — mantener como referencia
    ├── stripe-webhook.js  — ⛔ DEPRECATED
    └── stripe-portal.js   — ⛔ DEPRECATED
```

## 🔧 TECH STACK
- **Frontend**: Vanilla JS SPA (CERO frameworks/bundlers). Todo es HTML+CSS+JS puro.
- **Backend**: Supabase (PostgreSQL) + Netlify Functions (serverless)
- **WhatsApp**: Twilio (WA#2) + Meta directa (WA#1 Clari)
- **Messenger/Instagram**: Meta Graph API (meta-webhook.js) — Clari responde en FB Messenger + Instagram DM
- **IA**: Anthropic API (Clari chatbot + Lab Assistant OCR)
- **Pagos**: Conekta (suscripciones recurrentes tienda) + Clip API (checkout links portal pacientes + pagos únicos tienda)
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
- **Timezone**: `America/Chihuahua` (UTC-6 sin DST). NO usar `America/Ojinaga` (sigue DST de EE.UU.)
- **Horario**: Lunes a sábado 10am-7pm, Domingos 11am-5pm

## 👤 ROLES DEL SISTEMA
- **admin**: acceso total (Angel, carera)
- **gerencia**: comisiones + caja readonly + dashboard $$ (Raúl y otros)
- **sucursal**: su sucursal, ventas/caja/lab (americas, pinocelli, magnolia)
- **laboratorio**: producción/surtido/bitácora, sin ventas/caja

## 📋 MÓDULOS ACTIVOS
Login, Dashboard (TC dólar auto-refresh), Pacientes, Ventas/POS (multi-pago, USD, ARO PX), Lab, Producción, Bitácora, Promociones (NxM por categoría), Caja (auto-open, ticket corte), Comisiones (quincenal), Clari (chatbot WA + CRM Kanban + Realtime), Config (5 pestañas: Equipo/Ventas/Respaldos/Importar/Herramientas), Historial Ventas (incluye SICAR con abonos), Créditos, Garantías, Ventas Online (ONL folios), **Lentes de Contacto** (catálogo cards + CRM recompra + estadísticas — `js/mod-lc.js`), Compras Lab (con lista precios SALES), **Recursos Humanos** (asistencia WA + expedientes LFT + firmas digitales + permisos/vacaciones + reportes + actas — `js/mod-asistencia.js`), **Contabilidad** (estado de resultados + gastos con OCR + flujo de efectivo + facturación CFDI — `js/mod-contabilidad.js`), **Estrategia** (KPIs 90 días + histórico SICAR + monitor márgenes/descuentos + plan 90 días por rol — `js/mod-estrategia.js`).

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

## 📈 TRACKING (Pixels & Analytics)
- **Meta Pixel**: ID `26143384325317414` — conjunto "Car y Era Tienda" en Events Manager, cuenta "Opticas Car & Era" (906574340703715), portafolio empresarial (2460236247411857)
- **Google Analytics GA4**: ID `G-N84GYVTQKX` — propiedad "Car y Era Tienda", cuenta "Opticas Car y Era", zona Chihuahua GMT-6, moneda MXN
- **Instalado en**: `tienda.html` (ambos) + `netlify/functions/landing.js` (ambos, se inyectan en todas las landing pages)
- **Eventos Meta Pixel**: PageView (todas), ViewContent (ver producto), AddToCart, InitiateCheckout, Purchase (tienda), Lead (landings)
- **Eventos GA4**: page_view (auto), view_item (ver producto), add_to_cart, begin_checkout, purchase (tienda)
- **Coincidencias avanzadas automáticas**: activadas en Meta (detecta email/teléfono de formularios)
- **Estrategia actual**: anuncios van a WhatsApp directo (funciona), landing pages como intermediario para alimentar pixel (1 anuncio por campaña, ~10-20% budget). Cuando arranque tienda LC online, el pixel mide funnel completo.
- **Sistema hermano**: Car & Era Agency (Railway) maneja campañas de Meta Ads — tabla `campaigns` en misma Supabase. El pixel cierra el loop campaigns→conversiones.

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

## 📊 VERSIÓN ACTIVA: v184
Cambios v184: Tooltips ayuda Estrategia + Meta Pixel + Google Analytics. **Tooltips contextuales (?)**: 18 tooltips en `js/mod-estrategia.js` con explicaciones en lenguaje sencillo para términos como KPI, ROAS, YoY, promedio ponderado, tasa de descuento, etc. Sistema: diccionario `_EST_HELP`, helper `_estHelp(key)`, popover global posicionado automáticamente, click fuera cierra. Distribuidos en las 4 tabs (Dashboard/KPIs, Histórico, Metas, Márgenes). **Meta Pixel**: ID `26143384325317414` (conjunto "Car y Era Tienda" en Events Manager, cuenta "Opticas Car & Era"). Instalado en `tienda.html` con 5 eventos (PageView, ViewContent, AddToCart, InitiateCheckout, Purchase) y en `landing.js` con PageView + Lead. Coincidencias avanzadas automáticas activadas. **Google Analytics GA4**: ID `G-N84GYVTQKX` (propiedad "Car y Era Tienda", cuenta "Opticas Car y Era", zona Chihuahua GMT-6, moneda MXN). Instalado en `tienda.html` y `landing.js` con eventos de e-commerce (view_item, add_to_cart, begin_checkout, purchase). **Estrategia de pixels**: la mayoría de anuncios siguen a WhatsApp directo (funciona), 1 anuncio por campaña (~10-20% budget) apunta a landing page para alimentar pixel → lookalike audiences + retargeting + atribución ROAS. Landing pages redirigen a WA en 3s automáticamente. Sin cambios a DB.
Cambios v183: Supabase Realtime — actualización sin refresh en 7 tablas. **Suscripciones Realtime**: `initRealtimeSubscriptions()` se conecta a `postgres_changes` en 7 tablas (ventas, venta_pagos, ordenes_laboratorio, historias_clinicas, pacientes, compras_lab, gastos). Cada cambio en DB dispara auto-refresh de la vista activa si está afectada. **`_rtRefreshMap`**: mapa tabla→vistas→función de refresh (ej: cambio en `ventas` refresca dashboard/historial-ventas/caja/creditos). **Debounce 3s**: agrupa ráfagas de eventos para no refrescar 10 veces seguidas. **Toast "Datos actualizados"**: notificación verde 3s vía `_rtToast()`. **Guard null**: `_rtHandleChange` verifica que `_rtRefreshMap` exista antes de procesar (eventos pueden llegar antes de la inicialización completa). **Requisito Supabase**: las 7 tablas deben tener Replication habilitado en Database → Replication del dashboard. **Variables**: `_rtSubs` (channel), `_rtRefreshMap` (mapa), `_rtDebounce` (timers) — todas `var` para evitar hoisting issues con `let` en el scope de index.html. **Sin cambios a DB** (solo habilitar Replication en dashboard).
Cambios v182: Widget motivacional — animaciones Lottie con dotlottie-wc. **CDN dotlottie-wc**: `@lottiefiles/dotlottie-wc@0.9.2` (type=module) en `index.html` — web component que soporta formato `.lottie` (comprimido, WebAssembly + canvas). **`LOTTIE_ANIMS` map**: 7 stages progresivos con URLs reales de `assets-v2.lottiefiles.com`: sleep (0%), rocket (1-30%), running (30-60%), fire (60-80%), star (80-99%), celebrate (100%+), trophy (meta lograda). **`_estRenderLottie()` helper**: crea `<dotlottie-wc>` web component en el contenedor, destruye instancia anterior, timeout 5s si no renderiza → restaura emoji CSS fallback. **Mascot container** `#est-lottie-mascot` (48x48px): reemplaza emoji con animación Lottie. **Trophy container** `#est-lottie-trophy` (64x64px) en "META LOGRADA". **Carga asíncrona**: `customElements.whenDefined('dotlottie-wc')` espera a que el web component se registre (module async), luego renderiza. **Fallback**: si CDN no carga o URL falla → emoji con animación CSS se mantiene (est-anim-sleep/bounce/fire/celebrate). **Auto-refresh**: interval 3min destruye y recrea `<dotlottie-wc>` correctamente. Sin cambios a DB.
Cambios v181: Módulo Estrategia — metas, histórico SICAR, monitor de márgenes, plan 90 días. **Nuevo `js/mod-estrategia.js`** (~500 líneas): vista `view-estrategia` en sidebar (sección Reportes, después de Contabilidad), 4 tabs. **Tab Dashboard**: semáforo de KPIs con barras de progreso (reseñas Google, leads, citas, ROAS, followers IG, retención), valores actuales editables con click (guardados en `app_config` id=`kpis_estrategia`), métricas en tiempo real del sistema (ventas/mes, ingreso, ticket promedio, por sucursal), indicador de fase actual (sem 1-4/5-8/9-12), alerta de márgenes (rojo >45%, amarillo >40%, verde). **Tab Histórico**: ventas SICAR 2021-2026 hardcodeadas en JS (datos fijos), gráficas de barras CSS del mes actual vs mismos meses años anteriores por sucursal, tabla anual con YoY growth, contexto estacional por mes, "Magnolia Watch" con evolución trimestral post-mudanza (Mar 2024) y tendencia ↑↓→. **Tab Márgenes**: % ventas con descuento y tasa promedio en tiempo real, desglose por promoción, por sucursal, top 5 ventas con mayor descuento, tendencia diaria últimos 14 días. **Tab Plan 90 Días**: 3 columnas (Ángel/Ivon/Karen) con checkboxes por fase, notas editables, progreso visual, guardado en `app_config` id=`estrategia_plan90`. **Permisos**: controlable por checkbox "Estrategia" en Config → Equipo (admin y gerencia ven por default). **Datos cruzados**: se comparó el documento estratégico contra la DB real — Magnolia subestimada por ~$13K, ticket promedio real $3,482 (no $3,399), tasa descuento real 45% (no 48.2%). Sin cambios a DB.
Cambios v180: Tienda LC — redes sociales + nueva cuenta Conekta. **Redes sociales en footer**: agregados iconos SVG de Facebook, Instagram y WhatsApp al footer de `tienda.html` con links a las páginas oficiales (facebook.com/opticascar.y.era, instagram.com/opticascar.yera, wa.me/5216563110094). Estilo: círculos semitransparentes con hover accent. **Nueva cuenta Conekta**: cuenta anterior tenía datos personales incorrectos, se configuró nueva cuenta "Ópticas Car & Era" con datos fiscales del negocio. Llave privada `key_99bTGsDTN3233JHHzMHJHnK` configurada en Netlify env var `CONEKTA_PRIVATE_KEY`. Llave de firma de producción generada. Webhook "Tienda LC Pagos" creado y activo apuntando a `optcaryera.netlify.app/.netlify/functions/conekta-webhook` con todos los eventos suscritos. **Pendiente Conekta**: subir Constancia de Situación Fiscal actualizada (menos de 2 meses) para completar validación de cuenta.
Cambios v179: Fix reloj checador — fecha de corte + envío acta. **Fecha de corte `2026-03-23`**: el sistema de asistencia se activó el 23 de marzo, pero al registrar entrada revisaba los últimos 7 días buscando faltas — generaba actas falsas por días previos al inicio del sistema. Agregada constante `ASISTENCIA_START_DATE = '2026-03-23'` en `wa-webhook.js` (skip dates antes del 23 en loop de faltas) y `asistencia-cron.js` (clamp periodoInicio al 23 en envío de firmas). **Fix envío acta al empleado**: el mensaje de acta al empleado estaba dentro de `setTimeout(async function(){...}, 2000)` — en Netlify Functions, el handler retorna antes de que el timeout se ejecute, así que el mensaje **nunca se enviaba** (la notificación al admin sí llegaba porque estaba fuera del setTimeout). Cambiado a `await new Promise(setTimeout, 2000)` + `await sendWhatsAppReply()` síncrono, garantizando que el acta se envía antes del return. Sin cambios a DB.
Cambios v178: Fix ticket impreso Reporte de Materiales — LC ahora aparecen en ticket + columnas corregidas. **Bug**: en `imprimirReporteMateriales()`, el check `child.textContent?.includes('TOTAL LC')` interceptaba el wrapper div de LC (que contiene tanto "Lentes de Contacto" como "TOTAL LC") antes que el check de `'Lentes de Contacto'`, haciendo `continue` y saltando todo el detalle de LC. **Fix**: mover el check de `'Lentes de Contacto'` antes del de `'TOTAL LC'`, y generar el TOTAL LC row dentro del handler de LC. **Columnas LC cambiadas** (pantalla + ticket): de Ojo/Poder/BC/DIA/CIL/Cajas (6 cols, BC y DIA innecesarios para surtido) a **Ojo/Poder/CIL/Eje/Cajas** (5 cols, datos útiles para el laboratorio). Agregado parseo de AXIS desde `notas_laboratorio` con fallback a `od_eje`/`oi_eje` de la orden. CSS de tabla LC en ticket ajustado para 5 columnas. Sin cambios a DB.
Cambios v177: Fix burbujas chat Clari — invertir alineación estilo WhatsApp. **Antes**: Clari/Admin/Sistema a la izquierda, cliente a la derecha (confuso para leer). **Ahora**: cliente a la izquierda (incoming), Clari/Admin/Sistema/Corte a la derecha (outgoing del negocio). Cambio en ambos renderers: `renderClariConversations()` (lista conversaciones) y `abrirWaCrmDetalle()` (modal CRM). Solo se invirtió `flex-start`↔`flex-end` y los border-radius de las burbujas. Sin cambios a DB ni lógica.
Cambios v176: Rediseño Config tab módulo RH — vista unificada empleados + horarios individuales. **Antes**: 2 paneles separados (teléfonos de asesores a la izquierda, horarios globales a la derecha), layout grid 2 columnas. **Ahora**: una sola tarjeta "Empleados y Horarios" donde cada empleado es expandible para ver/editar su horario semanal individual (L-D con entrada/salida). Empleados agrupados por sucursal (Américas, Pinocelli, Magnolia, Laboratorio) con colores. Badge "Custom" para empleados con horario diferente al base. "Horario base" colapsable al fondo (aplica a todos por defecto). Tolerancia de retardo inline en header. Botones "Día de descanso" y "Restablecer horario base" por empleado. Nuevas funciones: `_asistToggleSection(id)` (toggle colapsable con flechas ▸/▾), `asistSetDayOff(uid)`, `asistResetSchedule(uid)`. Terminología: "Día libre" → "Día de descanso". Sin cambios a DB ni a la lógica de guardado (`asistGuardarHorario` sigue igual).
Cambios v175: Fix firma-asistencia RLS. **Causa raíz**: tabla `asistencia_firmas` tiene RLS habilitado (default Supabase en tablas nuevas post-v147) sin policy SELECT para anon — `firma-asistencia.html` leía directo con publishable key y Supabase regresaba array vacío → "Token no encontrado o expirado". **Fix dbwrite.js**: nueva action `read` permitida para auth `firma_token` — lee con service_role key y regresa el registro completo, bypassing RLS. **Fix firma-asistencia.html**: lectura del token ahora va por `fetch(DBWRITE_URL, {action:'read', table:'asistencia_firmas', auth:{id:'firma_token', pass:token}})` en vez de `supaRead()` directo. La validación de expiración y firma previa se mantiene client-side (líneas 126-135).
Cambios v174: Facturación — fix bugs portal + mejorar UI solicitudes. **Fix regímenes portal**: portal.html tenía solo 7 opciones de régimen fiscal, faltaban 603 (PM Fines no Lucrativos) y 621 (Incorporación Fiscal) — ahora tiene las 9 opciones sincronizadas con mod-contabilidad.js. **Fix RLS portal**: solicitudes de factura desde portal no llegaban a la cola porque `portal.html` hacía insert directo a Supabase con publishable key (RLS bloqueaba desde anon) — ahora escribe vía `dbwrite.js` con auth `portal_factura` que valida el token_portal contra la tabla ventas (mismo patrón que firma-asistencia.html). **Detalle expandible**: solicitudes pendientes ahora son cards que al hacer click despliegan todos los datos fiscales del paciente (régimen, CP, email, total venta, nombre paciente), con botones de acción más visibles ("Marcar emitida", "Editar y emitir", "Eliminar"). **Filtros y búsqueda emitidas**: tabla de facturas emitidas tiene buscador (folio/RFC/razón social) + selector de periodo (este mes/3 meses/año/todo) + contador de resultados, filtrado local en JS. **Badge sidebar**: "Contabilidad" en sidebar muestra badge con número de solicitudes pendientes, se actualiza en `loadDash()` y al entrar a pestaña Facturación.
Cambios v173: Catálogo materiales + formatos RH optimizados. **Catálogo materiales**: botón 🗑️ desactivar material por fila (admin only), pone `activo=false` sin borrar registros, ventas existentes no se afectan. **Acta/reporte formato optimizado**: reducido spacing/fonts para que todo quepa en 1 hoja carta (márgenes 12mm, font 10pt, line-height 1.3). **Texto invisible fix**: CSS dark theme sobreescribía `color:#000` en tabla de datos del empleado — agregado color explícito por celda. **Firma digital separada**: ahora en campo propio a la izquierda ("Firma(s) digital(es)"), campos de firma física del trabajador (centro) y patrón (derecha) quedan limpios para firma autógrafa. **Declaración corregida**: "En la ciudad de Cd. Juarez, Chih." en vez de dirección de sucursal.
Cambios v172: Módulo RH mejorado — registro manual de asistencia + firmas digitales funcionales + acta de falta formal. **Registro manual de asistencia**: modal de edición (✏️) en tabla diaria, admin y gerencia pueden registrar/corregir entrada, comida, regreso, salida. Calcula retardo y horas automáticamente. Modal se remueve del DOM al cerrar (antes congelaba la página). **Departamento Optometristas**: agregado al select de expedientes (Laboratorio, Optometristas, Ventas, Administración). **Modales RH corregidos**: 5 modales usaban `var(--bg)` (no definida) → transparentes; cambiado a `var(--surface)` (#1c1b19). Overlay con click-fuera-cierra y `remove()` al cerrar. **Envío WA corregido**: `currentUser.uid` no existe, es `.id` — causaba 401 en envío de reportes/actas. **Acta de falta mejorada**: al seleccionar "Acta de falta" en modal envío, oculta periodo (usa fechas de falta), oculta "Todos los empleados" (acta es individual), date pickers Desde/Hasta en vez de campo texto. **firma-asistencia.html**: API key corregida (JWT corrupto → Supabase JS client con sb_publishable), `filters` corregido (filter:{column,value} → filters:[{col,op,val}]), auth por token en dbwrite (excepción para firmas públicas). **Formato acta formal**: título prominente rojo "ACTA DE FALTA INJUSTIFICADA", solo fechas de falta (sin tabla asistencia completa), declaración formal con lugar/hora/fecha, 3 puntos legales (Art. 47 Frac. X LFT), texto de consentimiento. Aplica tanto en firma-asistencia.html como en vista previa del sistema. **Reportes mejorados**: fuentes más grandes (legibles), espacio 60px para firma física, sello de verificación digital (token parcial + fecha/hora + URL). **SW cache**: bumped v138→v139. Acta se detecta por periodo de 1 día (inicio===fin).
Cambios v171: Facturación simplificada — quitar Facturapi, flujo manual. **Decisión**: Angel canceló Facturapi ($299/mes) porque su contadora emite facturas directo en el portal del SAT y NominaX timbra nómina. El sistema ahora solo lleva **control de solicitudes**. **mod-contabilidad.js**: botón "Emitir factura" reemplazado por "✅ Marcar como emitida" (no llama API, solo actualiza DB), nuevo campo UUID fiscal (opcional), botón rápido "✅ Emitida" en solicitudes pendientes (Nancy marca sin abrir form), quitados botones PDF/XML/Cancelar-SAT de facturas emitidas, form simplificado (sin forma_pago). **factura.js**: vaciado (devuelve 410 Gone), backup en .bak — ya no se necesita backend porque todo opera directo con Supabase desde frontend. **Flujo vigente**: (1) empleado/cliente solicita factura con datos fiscales → status 'pending', (2) Nancy ve pendientes en Contabilidad → Facturación con datos RFC/razón/régimen/CP, (3) contadora emite en portal SAT y envía por correo, (4) Nancy marca como emitida en el sistema. Los 3 entry points de solicitud (venta detalle, portal pacientes, form Nancy) siguen sin cambio. **Env var `FACTURAPI_KEY`**: ya no se usa, puede eliminarse de Netlify.
Cambios v170: Módulo Contabilidad + Facturación CFDI con Facturapi. **Nuevo módulo `js/mod-contabilidad.js`**: 4 pestañas — Estado de Resultados (ingresos de venta_pagos/creditos_abonos vs egresos de compras_lab/gastos, utilidad bruta/neta con margen, desglose por método y categoría), Gastos (registro manual + foto con OCR Anthropic Vision, categorías Renta/Nómina/Proveedores/Otros, merge con compras_lab como read-only, editar/eliminar), Flujo de Efectivo (entradas vs salidas diarias con saldo acumulado, desglose gastos/compras/retiros), Facturación CFDI (lista facturas emitidas + solicitudes pendientes con status de venta). **Facturación CFDI**: nueva función `factura.js` (zero deps, fetch directo a Facturapi + Supabase REST). IVA 8% zona fronteriza. Catálogos SAT (régimen fiscal, uso CFDI, forma de pago, claves producto óptico). Flujo 3 puntos de entrada: empleados solicitan factura desde detalle de venta (solo guardan datos fiscales), clientes solicitan desde portal pacientes, Nancy (contabilidad) ve pendientes y emite cuando venta está liquidada. Solo ventas liquidadas se pueden facturar. Datos fiscales se guardan en `datos_fiscales` JSONB de pacientes para reusar. **Permisos actualizados**: 7 checkboxes nuevos (Lentes de Contacto, Comisiones, Recursos Humanos, Landing Pages, Contabilidad, Configuración, Clari WhatsApp) — ya no hay roleControlled, todos los módulos controlables por permiso. Gerencia tiene acceso completo a RH (4 pestañas + editar notas). **DB nuevas**: tabla `gastos` (fecha, concepto, monto, categoria, subcategoria, sucursal, comprobante_url), tabla `facturas` (venta_folio, facturapi_id, rfc_cliente, razon_social, total, status pending/valid/cancelled), columna `datos_fiscales` JSONB en pacientes. **Env var**: `FACTURAPI_KEY` (sk_test_ configurada en Netlify). **Pendiente**: completar cuenta Facturapi (CSD, datos fiscales, carta manifiesto) para activar modo producción, probar flujo completo con sk_test_.
Cambios v169: Módulo Recursos Humanos completo — reloj checador por WhatsApp + expedientes LFT + firmas digitales. **Nuevo módulo `js/mod-asistencia.js`** (~1200 líneas): vista `view-asistencia` renombrada a "Recursos Humanos" en sidebar (sección REPORTES), 4 tabs: Asistencia (diario), Reportes (resumen semanal/quincenal + reporte individual), Expedientes (datos LFT + documentos firmados), Config (teléfonos + horarios). **Reloj checador WA**: empleados envían `entrada`/`salida`/`comida`/`regreso` al WA#2 (Twilio). Detección fuzzy de typos y sinónimos (`ya llegué`/`me voy`/`voy a comer`/`buenos días`). Empleados registrados bloqueados de Clari (solo reloj checador, admin excluido). Calcula retardo vs horario programado + tolerancia configurable. Notifica admin por WA en retardos. **Horarios configurables**: por día de semana (L-D), tolerancia en minutos, overrides por empleado (día libre o horario custom). **Expedientes LFT** (Art. 804 Frac. III): nombre completo, CURP, NSS, RFC, puesto, departamento, fecha ingreso, salario, jornada, fecha nacimiento + datos patronales editables por empleado (razón social, RFC patronal, registro IMSS, domicilio fiscal) para 2 registros patronales diferentes. **Firmas digitales**: `firma-asistencia.html` página pública con canvas touch, empleado firma desde su celular via link WA. Token único + expiración 48-72h. Firma se guarda como base64 en `asistencia_firmas`. **Acta de falta injustificada** (Art. 47 Frac. X): se genera automáticamente cuando empleado registra entrada después de faltas — envía link por WA con acta + reporte para firma. **Cron `asistencia-cron.js`**: (1) recordatorio de ausencia 30min después de hora de entrada programada al empleado + admin, (2) envío automático de firmas cada 7-10 días (aleatorio por empleado). **Permisos/vacaciones**: modal para registrar vacaciones, permisos, incapacidades, días personales — el bot y cron los respetan (no genera faltas ni actas). **Dashboard calendario**: muestra próximos 30 días de cumpleaños, aniversarios laborales, permisos/vacaciones. **Preview formatos**: moldes vacíos de reporte LFT y acta de falta imprimibles en carta, con espacio para firma digital + firma física. **Envío manual**: botón en topbar para enviar reportes o actas por WA a un empleado o todos, con selector de tipo/período. **Baja de empleados**: botón que desactiva reloj checador y regresa el teléfono a Clari normal. Exportar Excel en resumen. **Comisiones movido a REPORTES** junto con RH. **DB nuevas**: tabla `asistencia` (uid, fecha, entrada, salida, comida_inicio, comida_fin, horas_trabajadas, retardo_min, es_falta, nota, sucursal), tabla `asistencia_firmas` (uid, periodo_inicio, periodo_fin, firma_empleado base64, token, firmado_at). **app_config**: `empleados_telefono` (phone→uid), `horarios_asistencia` (schedule+overrides+empleados_extra), `expedientes_empleados` (datos LFT por uid).
Cambios v168: Timezone fix + Dashboard persistente + Clari con fecha/hora. **Timezone**: corregido de `America/Ojinaga` a `America/Chihuahua` en las 3 referencias de index.html — México eliminó DST en 2022, Ojinaga sigue DST de EE.UU. causando 1h de diferencia en primavera/verano. **Dashboard persistente**: resumen del día ahora permanece visible hasta las 10:00 AM del día siguiente (antes desaparecía a medianoche). Lógica en `loadDash()`: si `nowLocal.getHours() < 10` muestra datos de ayer, después muestra hoy. Solo afecta dashboard, todas las demás funciones (caja, ventas, cortes) siguen usando `hoyLocal()` sin cambio. **Clari sabe fecha/hora**: `wa-webhook.js` y `meta-webhook.js` ahora inyectan `FECHA Y HORA ACTUAL: domingo, 22 de marzo de 2026, 10:14 p.m.` dinámicamente en el system prompt de Clari (timezone `America/Chihuahua`). Instrucción explícita de usar el día actual para responder horarios correctos (ej: domingo = 11am-5pm, no 10am-7pm). Aplica a los 3 canales: WhatsApp, Facebook Messenger, Instagram DM.
Cambios v167: POS + LC integración inteligente con Rx y orden de lab automática. **Nav sidebar**: "Lentes de Contacto" movido de sección Administración a Ventas, visible para todos los roles (admin, gerencia, sucursal). CRM y Estadísticas tabs restringidos a admin only. **Banner Rx en POS**: al hacer click en "Lentes de contacto" en POS, si el paciente tiene Rx Final pero no Rx LC, muestra prompt "¿Convertir a Rx para LC?" (sin mostrar valores de Rx Final). Al confirmar, convierte automáticamente usando fórmula vertex, guarda los campos `lc_*` en `historias_clinicas`, y abre el catálogo filtrado. Si ya tiene Rx LC, muestra graduación + botón "Filtrar por Rx". Banner solo aparece al abrir panel LC (no al seleccionar paciente). **Filtrado inteligente por Rx**: filtra productos por tipo según graduación del paciente — sin CYL muestra solo esféricos, con CYL muestra solo tóricos, con ADD muestra solo multifocales. Color se trata como esférico. Verifica rango de esfera contra `lc_parametros`. Tolerancia CYL ±0.50 (un step, clínicamente correcto). **Orden de lab automática**: al cobrar venta con LC agregados desde panel Rx, se genera automáticamente `ordenes_laboratorio` con tipo "Lente de Contacto", marca/modelo, graduación OD/OI, frecuencia de reemplazo, folio vinculado, fecha/hora entrega, sucursal. Orden se crea al cobrar (no al agregar al carrito) — si se cancela la venta, no se crea orden. Aparece en Cola de producción → Surtido de materiales (flujo normal). **Catálogo bloqueado**: no se abre hasta confirmar conversión de Rx (fuerza al empleado a actualizar historia clínica).
Cambios v166: Módulo LC separado de Productos. **Nuevo módulo `js/mod-lc.js`** (~600 líneas): vista unificada `view-lentes-contacto` con 3 tabs — Catálogo (cards con imagen, marca, tipo, frecuencia, specs técnicos, precio, badge stock), CRM Recompra (migrado de `view-lc-crm`), Estadísticas (ventas por marca, top productos, tendencia mensual, ingresos totales). **Catálogo LC**: cards visuales con filtros por tipo (esférico/tórico/multifocal/color), marca, frecuencia (diario/quincenal/mensual/trimestral) y búsqueda libre. Click en card abre modal detalle con todos los parámetros de `lc_parametros` (PWR, CYL, AXIS, ADD, BC, DIA, Dk/t, H₂O, UV, colores, presentaciones). **Edición de parámetros vía modal** (admin only): form completo para editar rangos de graduación y specs técnicos, guarda directo en `app_config`. **Productos excluye LC**: `filtrarProductos()` filtra `categoria!=='Lente de contacto'`, opciones LC removidas de selects de filtro, botón "Catálogo Tienda" movido al módulo LC. **Navegación**: `go('lc-crm')` redirige automáticamente a `lentes-contacto` (backward compat), sidebar muestra "Lentes de Contacto" visible para admin, gerencia y sucursal. **Estadísticas**: consulta ventas de últimos 6 meses, muestra ingresos LC totales, cajas vendidas, marcas activas, barras por marca y por producto, tendencia mensual con barras CSS. `_lcAutoRegistrar()` se mantiene en index.html (llamado desde ventas). ~350 líneas removidas de index.html (CRM + catálogo tienda migrados a mod-lc.js).
Cambios v165: Tienda LC — selección de graduación inteligente en cascada + picker visual + confirmación. **Cascada por tipo de LC**: campos de graduación aparecen solo según el tipo del producto — esférico muestra solo Esfera, tórico muestra Esfera+Cilindro+Eje, multifocal muestra Esfera+ADD, color muestra Esfera+Color. Valores disponibles se cargan dinámicamente de `lc_parametros` (app_config) con rangos reales de cada producto (PWR min/max/steps, CYL values, AXIS range, ADD values, colores). **Picker visual personalizado**: reemplaza selects nativos del navegador (difíciles de ver y usar) con dropdown estilizado — Esfera dividida en dos columnas Miopía(−) e Hipermetropía(+) inspirado en Lentesplus.com pero con mejor diseño, CYL/AXIS/ADD en grid compacto, colores con chips visuales. Styling consistente con la identidad de la tienda. **Confirmación de graduación**: paso intermedio antes de agregar al carrito que muestra resumen visual de la graduación seleccionada (OD/OI por separado o misma graduación) para evitar errores — el cliente debe confirmar explícitamente antes de que se agregue al carrito.
Cambios v164: Fix auto-reply comentarios Facebook. **Causa raíz**: campo `feed` no estaba suscrito en webhooks de Meta Developers — sin esta suscripción, Meta nunca enviaba notificaciones de comentarios nuevos. **Fix principal**: activar suscripción `feed` en Meta → Webhooks → Page (ahora `messages` + `feed` suscritos). **Polling no funcionaba** porque los comentarios están en posts de ads (agencia de marketing), y `/feed` API solo retorna posts orgánicos; además Standard Access de `pages_read_user_content` no permite leer comentarios de usuarios regulares. Con `feed` webhook suscrito, Meta envía datos del comentario directamente sin necesitar polling ni Advanced Access. **Código mejorado**: `checkRecentComments()` con logging detallado (dedup/short/old counts), `from` removido de query feed (apps no verificadas no lo reciben), endpoint diagnóstico `GET /meta-webhook?diag=comments&token=...` (muestra permisos, posts, comments, direct query), mejor error logging en `replyToComment()`.
Cambios v163: Rangos de graduación visibles + descontinuados retirados. **tienda.html**: carga `lc_parametros` de app_config en el `load()` (single fetch con `lc_imagenes` usando `id=in.(...)`). `showDetail()` muestra sección "Rangos de graduación" — esfera (min/max), cilindro (tóricos), eje con pasos (tóricos), ADD (multifocales), colores (color). **index.html**: `mostrarFormProducto()` carga `lc_parametros` lazy (first access) y renderiza grid de specs en `#prod-lc-params` (esfera, cil, eje, ADD, Dk/t, H₂O, UV, BC, DIA, box sizes, colores, notas descontinuación). **Descontinuados desactivados**: Air Optix Aqua (Sep 2021), FreshLook Colorblends Neutro + Esférico (fin 2024), SofLens Tórico (Jul 2023) — 4 productos `activo=false`. **52 productos visibles** en tienda (antes 55).
Cambios v162: Catálogo LC completo — 15 productos nuevos + parámetros técnicos de 56 productos. **Productos nuevos**: Acuvue Oasys 1 Day, Acuvue Oasys Multifocal, Acuvue Moist 1 Day Multifocal, Total30 (esf/tor/multi), Precision1 (esf/tor), Dailies Total 1 (tor/multi), Biofinity Energys, Biotrue ONEday Multifocal, Infuse (esf/tor/multi). **Parámetros en DB**: `app_config` id=`lc_parametros` con JSON de 56 productos — incluye rangos PWR (min/max/steps), CYL values para tóricos, AXIS range/steps, ADD values para multifocales, BC, DIA, material, Dk/t, UV, box sizes. Datos investigados de fuentes oficiales (jnjvisionpro.com, myalcon.com, coopervision.com, ecp.bauschcontactlenses.com). **Nuevas marcas**: Total30 (Alcon), Precision1 (Alcon), Infuse (Bausch+Lomb) — agregadas a BM, LM, TECH, BG, BG_MAP, SPECS en tienda.html y BRAND_MAP en index.html. **Catálogo interno**: filtro `activo=true` agregado a `cargarProductos()` (antes cargaba todos incluyendo inactivos). **55 productos visibles en tienda** (antes 40), **65 activos en DB** (antes 50). Precios de productos nuevos son estimados — Angel debe ajustar según sus costos reales. **Descontinuados detectados**: Air Optix Aqua (Sep 2021), FreshLook Colorblends (fin 2024), Biomedics 55/Tórico (Mayo 2026), SofLens Tórico (Jul 2023).
Cambios v161: Limpieza catálogo LC + actualización tienda. **Consolidación DB**: 120→50 productos activos. Desactivados 70 duplicados (graduaciones individuales como AIR OPTIX AQUA -0.50, -0.75, etc. que eran registros separados del mismo producto). **Marcas corregidas**: campo `marca` ahora tiene el fabricante real (Alcon, Acuvue, CooperVision, Bausch+Lomb, Lenticon) en vez del primer token del nombre (AIR, BAUCHS, ONE, 1, liberti). **Nombres estandarizados**: mayúsculas consistentes, sufijo de tipo (ESFERICO/TORICO/MULTIFOCAL), sin graduaciones ni paréntesis redundantes (ej: "liberti (avaira vitally) esferico"→"AVAIRA VITALITY ESFERICO", "BAUCHS + LOMB ULTRA (ESFERICOS)"→"BAUSCH+LOMB ULTRA ESFERICO", "ONE DAY ACUVUE MOIST con LACREON (NEGATIVOS)"→"ACUVUE MOIST 1 DAY ESFERICO"). **MyDay desactivado** (sin precio confirmado). **tienda.html actualizado**: BM (brand map), LM (lab map), HK/HI (filtros), TOP_KEYS, FEAT carousel, SPECS (45→43 entries con keys nuevas), TECH, BG/BG_MAP — todo sincronizado con nuevos nombres. Lookup de marca prioriza nombre del producto sobre campo `marca` DB (`BM[cn.split(' ')[0]]` primero). Nuevas marcas en catálogo: Avaira (CooperVision), O2 Optix (Alcon). **index.html**: BRAND_MAP actualizado con misma lógica. **Productos visibles en tienda**: 40 (sin Lenticon, Start, Especial, O2 Optix, Ultra Terapéutico, anuales).
Cambios v160: Módulo Promociones — 3 nuevos tipos + filtros globales de material. **Nuevo tipo `material_1`** (Material a $1): reemplaza el viejo `material_a_peso`. Filtros específicos por tipo_vision (VS, Bif F/T, Bif Semi-invisible, Progresivo), material (Hi Index, CR-39, Policarbonato, Ultra-thin 1.67, Super Ultra-thin 1.74) y tratamiento (AR, Anti-Blue AR, Blue Light, Foto AR, Foto Anti-Blue AR, Foto Blue Light). Calcula descuento del material más barato elegible vía `material_meta` con fallback por texto en descripción. Solo aplica si hay armazón ≥ monto mínimo configurado (default $1200). **Nuevo tipo `paquete_fijo`** (Paquete precio fijo): N armazones en rango de precio + N folios con spec de material por folio (tipo_vision/material/tratamiento). Descuento = subtotal - precio fijo. UI con `pfRegenerarFolios()` para generar rows dinámicos. **Filtros de material globales**: sección en Reglas con checkboxes de tipo_vision/material/tratamiento, se guarda como `filtros_material` JSONB. Helper `_filtrarItemsPromo()` aplica filtros en todos los cases de `calcularDescuentoPromo` (porcentaje, nxm, material_a_peso). Se oculta automáticamente para material_1 y paquete_fijo (tienen filtros propios). **Limpieza**: eliminado tipo `material_a_peso` del selector (lógica de cálculo se mantiene para backward compat). Filtro de estado default = "Activas". `eliminarPromo` captura errores con toast. `autoAsignarFolios` se dispara para material_1 y paquete_fijo. Columnas nuevas en DB: `monto_min_armazon`, `materiales_elegibles` JSONB, `precio_material`, `pf_config` JSONB, `filtros_material` JSONB.
Cambios v159: Tienda LC — suscripciones con Conekta (reemplaza Stripe). **2 funciones nuevas** (zero npm deps): `conekta-subscribe.js` crea Order con HostedPayment checkout en Conekta (planes dinámicos por monto+frecuencia, Google auth, validación precios server-side con descuento 10%), `conekta-webhook.js` procesa eventos de pago (crea venta + registra pago en DB + notifica admin/cliente por WA, duplicate detection por `conekta_{orderId}`). **Frontend restaurado**: Google Identity Services, Google Sign-In UI (avatar + menú dropdown con Mis suscripciones/Mis pedidos/Cerrar sesión), toggle Suscripción/Compra única en modal de pedido, frecuencias (mensual/bimestral/trimestral) + descuento 10%, sub badges en carrito, post-payment handler (?pago=ok). **Mi cuenta simplificado**: sin portal de autogestión (Conekta no tiene equivalente a Stripe Customer Portal), gestión vía WhatsApp. **Flujo**: suscripción → Google auth → `conekta-subscribe` → redirect a Conekta hosted → pago → webhook → venta en DB. **Pagos únicos siguen con Clip** (sin cambio). **API Conekta**: REST directa con fetch, Bearer auth, `application/vnd.conekta-v2.2.0+json`, amounts en centavos. Env vars: `CONEKTA_PRIVATE_KEY`, `CONEKTA_WEBHOOK_KEY`. Webhook URL: `https://optcaryera.netlify.app/.netlify/functions/conekta-webhook`.
Cambios v158: Tienda LC — remover Stripe y Google Sign-In. **Stripe bloqueado**: Stripe no acepta lentes de contacto (dispositivos médicos restringidos), cuenta en proceso de cierre. Se eliminaron ~150 líneas: Google Identity Services (GIS) script, Google Sign-In UI (botón + avatar + menú dropdown), toggle Suscripción/Compra única del modal de pedido, frecuencias de suscripción (mensual/bimestral/trimestral), descuento 10% de suscripción, Stripe checkout path, Mi cuenta/Mis suscripciones modal, openStripePortal(), checkPaymentReturn(). **Nav simplificado**: solo "Mis pedidos" + WhatsApp + carrito (sin auth). **Pagos vigentes**: Clip (en línea) + transferencia BBVA + pago en sucursal. **Pendiente**: evaluar Conekta para suscripciones recurrentes cuando se tengan documentos de empresa.
Cambios v157: Tienda LC — rediseño flujo "Ayúdame a elegir" conversacional. **Chat inline en hero**: conversación de Clari ahora aparece dentro del banner (antes se iba a sección separada abajo, forzando scroll). **Flujo step-by-step limpio**: cada paso reemplaza el contenido anterior (no acumula chat largo), botones desaparecen al elegir mostrando solo un badge con las selecciones. **Botón "← Volver"** siempre visible para regresar al paso anterior. **Filtro de edad**: primer paso pide edad como campo libre (input numérico), si tiene 40+ muestra opción de multifocales ("Necesito para lejos y para cerca"), si es menor no la muestra. **Lenguaje no técnico**: "Esféricos"→"No veo bien de lejos", "Tórico"→"Tengo astigmatismo", "Multifocal"→"Necesito para lejos y para cerca", "Color"→"Quiero cambiar de color", "Ver todo"→"No estoy seguro". Mensajes de Clari simplificados: "alto paso de oxígeno"→"lentes que dejen respirar bien tus ojos", "lentes diarios sin mantenimiento"→"lentes de un solo uso, los estrenas cada día sin líquidos ni estuches", "12h+"→"Todo el día", "Diarios/Mensuales"→"Usar y tirar (diarios)/Uno al mes". **Flujo completo**: Edad → Para qué → Experiencia → Horas → Productos recomendados. **Stripe restringido**: Stripe no acepta venta de lentes de contacto (dispositivos médicos). Pendiente evaluación de Conekta como alternativa para suscripciones recurrentes.
Cambios v156: Tienda LC — probador virtual contextual + trust section + mobile UX. **Probador virtual**: botón removido del hero, ahora solo aparece en detalle de productos tipo Color ("Probar color virtual"). **Trust section**: 2 cards (stock photos) unificadas en 1 card con foto real (`hero-lc.jpg`, 77KB) + gradient bottom-to-top, stats: 4,200+ Clientes / 24h Lentes listos / 3 Sucursales / 8+ Marcas. **Mobile optimizado**: hero reducido de 528px→263px (`min-height:auto`), botones hero lado a lado (compactos, `flex:1`), animación lente como fondo decorativo (absolute, opacity .7), flecha scroll oculta, trust section compactada. Productos visibles sin scroll en mobile (632px vs 980px antes).
Cambios v155: Tienda LC — 8 mejoras UX. **"Los más pedidos"**: sección siempre visible con 6 productos destacados (4 en mobile), independiente del path elegido en hero. **Filtro por marca**: 13 marcas en pro-catalog, combinable con tipo y frecuencia. **Hover "Ver detalles"**: overlay semitransparente en cards al hover, click abre modal detalle completo. **Badge stock/sobre pedido**: badge verde "En stock" o amarillo "Sobre pedido" en todas las cards (usa campo `stock` de DB). **Checkout 2 pasos**: Paso 1 muestra productos con botones +/- cantidad y total, Paso 2 tiene datos personales y pago (con botón "Volver"). **Cookie banner compacto mobile**: layout vertical centrado en pantallas <640px. **Social proof sin redundancia**: eliminado sp-strip de stats duplicados (ya están en trust-hero), solo quedan reviews + CTA WhatsApp. **Flujo "Ayúdame" conversacional**: ahora 4 pasos (tipo → experiencia primera vez/ya uso → horas de uso → recomendación personalizada), con tips contextuales (diarios para primera vez, alto O₂ para 12h+), sorting por Dk/t para uso prolongado, y mención de asesoría gratuita en sucursal para primerizos.
Cambios v154: Auditoría de seguridad completa — hardening de todas las funciones serverless + frontend. **CORS restrictivo**: las 11 funciones ahora limitan `Access-Control-Allow-Origin` a `optcaryera.netlify.app` (antes era `*`). **Security headers en netlify.toml**: X-Frame-Options SAMEORIGIN, X-Content-Type-Options nosniff, Referrer-Policy strict-origin-when-cross-origin, Permissions-Policy (cámara solo self), CSP con dominios explícitos. **clip-payment.js**: validación server-side de monto ≤ saldo. **clip-webhook.js**: verificación por token configurable (`CLIP_WEBHOOK_TOKEN` env var). **ia-chat.js**: errores sanitizados. **dbwrite.js**: validación regex de columnas en filtros (anti-injection). **reporte.js**: ahora requiere auth. **backup.js**: requiere BACKUP_TOKEN para todos los modos. **console.log** limpiados en webhooks. **Passwords**: 5 funciones ahora soportan env var `AUTH_USERS` (JSON) con fallback a hardcoded — en producción, passwords solo en env var. **SRI (Subresource Integrity)**: hashes SHA-384 en 4 CDN scripts de index.html + 2 de portal.html, Supabase JS pinado a v2.99.3. **Google credential**: ya no se guarda en sessionStorage (solo perfil UI), el JWT token vive en memoria y se renueva por auto_select. Env vars nuevas opcionales: `CLIP_WEBHOOK_TOKEN`, `AUTH_USERS`.
Cambios v153: Suscripciones automáticas Stripe + Google Sign-In + security hardening. 3 funciones nuevas (zero npm deps): `stripe-subscribe.js` crea Stripe Checkout Session en modo subscription con Google auth, `stripe-webhook.js` procesa cobros automáticos (crea venta + pago en DB + notifica admin/cliente por WA, con duplicate detection), `stripe-portal.js` consulta suscripciones y abre Stripe Customer Portal para autogestión. Frontend: Google Identity Services (One Tap + fallback botón), nav con auth state (avatar + menú dropdown con Mis suscripciones/Mis pedidos/Cerrar sesión), checkout bifurcado (items con suscripción → Google auth + Stripe Checkout hosted; sin suscripción → flujo existente dbwrite), modal "Mi cuenta" con lista de suscripciones activas (status badges, frecuencia, próximo cobro) + botón portal Stripe, post-payment handler (?pago=ok). Stripe REST API usado directamente con fetch (sin SDK), webhook signature verificada con crypto HMAC-SHA256 nativo. Env vars necesarias: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, GOOGLE_CLIENT_ID. Security hardening: `ia-chat.js` ahora requiere autenticación (BASE_USERS + custom_users de Supabase), las 4 llamadas frontend envían auth credentials. `clip-payment.js` valida token_portal contra tabla ventas en Supabase antes de generar link de pago. `stripe-subscribe.js` valida precios server-side contra DB (previene manipulación de precios desde frontend, descuento 10% calculado en servidor).
Cambios v152: Mejorar OCR Compras Lab + edición reactiva de items + edición de compras guardadas. Prompt OCR reescrito con instrucciones específicas para notas manuscritas (caligrafía, tachones, confusión de números) e impresas (encabezados de columnas). Abreviaturas ópticas comunes como contexto (BL, AR, CR, Poli, Foto, HI, Prog, BF, FT, Inv). Manejo robusto de IVA con 3 escenarios (separado, incluido, sin indicación). Materiales conocidos del catálogo de precios se pasan como referencia al modelo para mejor matching de nombres. Proveedor pre-seleccionado se incluye como contexto en web. Parsing más robusto: limpia markdown fences, trailing commas, comillas simples, con fallback. Editar nombre de material ahora re-valida precio contra lista automáticamente (onchange → clbRevalidarPrecio). Subtotal se actualiza visualmente en tiempo real al editar cantidad o precio (antes solo el total general). Focus del input se preserva al re-renderizar la tabla. Modal detalle de compras guardadas ahora es completamente editable: inputs inline para material/cantidad/precio, botón "+ Agregar línea", botón ✕ para eliminar items, subtotales y total se recalculan en tiempo real, botón "Guardar cambios" persiste a DB. Mejoras aplicadas en frontend (index.html clbProcesarFoto + clbRenderItems + clbVerDetalle) y backend (wa-webhook.js labAssistantOCR).
Cambios v151: Auto-reply a comentarios públicos en Facebook. `checkRecentComments()` en meta-webhook.js escanea posts de los últimos 7 días vía `/feed` endpoint con inline comments (`pages_read_user_content`), genera respuestas breves con Claude Haiku (`generatePublicReply`), y publica via `/{commentId}/comments` (form-encoded, requiere `pages_manage_engagement`). Dedup via `[FB-Comment:{id}]` en `clari_conversations`. Max 5 replies por ejecución con timeout guard de 7s. Page Access Token regenerado como long-lived (never-expires) con 18 permisos incluyendo `pages_manage_engagement`. Fix: Meta requiere form-encoded (URLSearchParams) no JSON para publicar comment replies. Fix: campo `from` no disponible en apps no verificadas — código maneja gracefully sin requerir datos de usuario.
Cambios v150: Clari multi-canal — Facebook Messenger + Instagram DM. Nuevo `meta-webhook.js` recibe mensajes de ambos canales vía Meta Graph API v25.0 y responde con la misma IA de Clari (Anthropic). Reutiliza historial en `clari_conversations` (senderId como phone, canal identificado en user_name). Búsqueda de pedidos por folio/nombre. Notificación WA a admin en primeros mensajes. Configurado en Meta Developers: webhook verificado, campos `messages` + `feed` suscritos para Messenger, Instagram y comentarios, Page Access Token de "Ópticas Car & Era" (140615486675232). Instagram @opticascar.yera (17841414023710928) conectado. Env vars: `META_PAGE_TOKEN`, `META_VERIFY_TOKEN`. App: "car & era maker" (2088315654915229) — compartida con agencia de marketing (solo campañas, no toca mensajes).
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

## 🔄 SUPABASE REALTIME
- **7 tablas suscritas**: ventas, venta_pagos, ordenes_laboratorio, historias_clinicas, pacientes, compras_lab, gastos
- **Requisito**: habilitar Replication en Supabase Dashboard → Database → Replication para cada tabla
- **`initRealtimeSubscriptions()`**: se llama en `setupApp()`, crea un solo channel `app-realtime` con listeners por tabla
- **`_rtRefreshMap`**: define qué función llamar por vista activa (ej: `ventas` → `loadDash()` si estás en dashboard)
- **`_rtHandleChange(table)`**: verifica si la vista activa está afectada, aplica debounce 3s, ejecuta función de refresh
- **`_rtToast(msg)`**: notificación verde "Datos actualizados" por 3s
- **Debounce 3s**: agrupa ráfagas (ordenes_laboratorio puede disparar docenas de eventos seguidos)
- **Guard null**: eventos pueden llegar antes de que el mapa se inicialice — `if (!_rtRefreshMap) return;`
- **Variables globales**: `_rtSubs`, `_rtRefreshMap`, `_rtDebounce` — deben ser `var` (no `let`) por hoisting en index.html
- **Clari chat**: tiene su propio Realtime separado (desde v144), no se toca

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
- **Magnolia**: -$1.2M/año vs pre-mudanza. Prueba: Meta Ads zona + driver tráfico digital. Si en 3 meses no mejora → revisar viabilidad
- **Plan 90 días**: Ángel (ads/promos), Ivon (contenido), Karen (operación). Fases de 4 semanas c/u
- **KPIs meta**: 120 reseñas Google, 150 leads/mes, 100 citas digital, 4.5x ROAS, +1000 followers IG, +15% retención
- **Datos históricos SICAR**: hardcodeados en `js/mod-estrategia.js` (ventas mensuales 2021-2026 por sucursal)
- **Estacionalidad**: Nov=pico (Buen Fin), Ene=más flojo, Jun-Jul=caída verano, Sep-Oct=recuperación

## ⚠️ PENDIENTES
1. Migrar WA#1 Clari a Twilio
2. SICAR migración completa
3. Landing pages bug
4. Plantillas Twilio: lc_recompra + venta_clari_pendiente
5. Precios Marina pendientes de confirmar
6. Mapear materiales existentes (CR-39 · Blue Light → 1.56 BLITA BLUE AR, etc.) en el sistema
7. Optimizar probador virtual LC en tienda.html (detección de ojos necesita más trabajo)
8. **Conekta**: ✅ `CONEKTA_PRIVATE_KEY` en Netlify (nueva cuenta), ✅ webhook activo (Tienda LC Pagos), ✅ llave firma producción, ⬜ subir Constancia Situación Fiscal actualizada, ⬜ probar flujo completo
9. **Google Sign-In**: ✅ configurado
10. **Facturación**: ✅ Facturapi cancelado (v171), ✅ CSD eliminados, ✅ flujo simplificado, ✅ env vars limpiadas (FACTURAPI_KEY + STRIPE_* eliminadas de Netlify), ⬜ considerar envío por correo desde sistema (requiere Gmail App Password con 2FA)
11. **SEGURIDAD menor**: innerHTML sin sanitizar (XSS bajo), Rate limiting, RBAC en dbwrite.js
12. **Lottie animations**: ✅ COMPLETADO (v182). CDN `dotlottie-wc@0.9.2`, 7 stages con URLs reales `.lottie` de `assets-v2.lottiefiles.com`, web component `<dotlottie-wc>` con canvas WebAssembly, fallback emoji CSS, auto-refresh compatible. URLs restantes del catálogo (179 total, 7 usadas) guardadas en sesión Claude Code para futuras variaciones.
13. **Metas mensuales**: al hacer deploy, insertar en Supabase `app_config` id=`metas_mensuales` con `{"crecimiento_pct":5,"overrides":{"2026-03":{"americas":420000,"pinocelli":320000,"magnolia":160000}}}` si Angel quiere override manual para marzo

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
