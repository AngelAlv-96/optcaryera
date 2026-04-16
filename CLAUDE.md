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
- **WhatsApp**: Twilio (WA#2) + Meta directa (WA#1 Clari)
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
- **WA#1** (Clari inbound): 5216561967020 — sigue en Meta directa
- **WA#2** (notificaciones + Lab Assistant): 5216563110094 — Twilio activo
- wa-webhook.js maneja WA#2 (Twilio)
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

## 🏪 NEGOCIO
- 3 sucursales: Américas, Pinocelli, Magnolia (Ciudad Juárez, Chihuahua)
- Óptica con laboratorio propio de lentes
- ~30,000 pacientes en la base de datos
- Dueño/operador: Angel Alvidrez
- **Timezone**: `America/Chihuahua` (UTC-6 sin DST). NO usar `America/Ojinaga` (sigue DST de EE.UU.)
- **Horario**: Lunes a sábado 10am-7pm, Domingos 11am-5pm

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
- **Vinculación venta↔pago**: `payment_request_id` (UUID, devuelto por API) ≠ `payment_request_code` (código corto, en webhook). `clip-payment.js` guarda UUID como `clip_prid:` en notas. Webhook busca por múltiples IDs + fallback por monto
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

**Última versión**: v261 — Fix Alta Masiva: auto-detección de marca dejaba de respetar la edición manual cuando había modelo duplicado en DB.

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
1. Migrar WA#1 Clari a Twilio
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
