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
    └── lc-cron.js        — Cron recordatorios LC por WA
```

## 🔧 TECH STACK
- **Frontend**: Vanilla JS SPA (CERO frameworks/bundlers). Todo es HTML+CSS+JS puro.
- **Backend**: Supabase (PostgreSQL) + Netlify Functions (serverless)
- **WhatsApp**: Twilio (WA#2) + Meta directa (WA#1 Clari)
- **IA**: Anthropic API (Clari chatbot + Lab Assistant OCR)
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
Login, Dashboard (TC dólar auto-refresh), Pacientes, Ventas/POS (multi-pago, USD, ARO PX), Lab, Producción, Bitácora, Promociones (NxM por categoría), Caja (auto-open, ticket corte), Comisiones (quincenal), Clari (chatbot WA), Config (5 pestañas: Equipo/Ventas/Respaldos/Importar/Herramientas), Historial Ventas (incluye SICAR con abonos), Créditos, Garantías, Ventas Online (ONL folios), CRM LC, Compras Lab (con lista precios SALES).

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
- Cron: lc-cron.js envía recordatorios WA 7 días antes de recompra
- Vista CRM con filtros y stats, badge en dashboard

## 📸 COMPRAS LAB
- Registro de compras con foto (OCR vía Anthropic)
- Lab Assistant en wa-webhook.js procesa fotos de admin_phones
- Lista de precios SALES en app_config id='precios_lab_sales'
- Tabs: Compras | Lista de Precios
- PENDIENTE: mapeo materiales Anti Blue/Blue Light, matching inteligente OCR→precios, detección series por graduación

## 🧪 USUARIO DEMO
- Login: demo/demo2024, rol admin
- Intercepta escrituras (no guarda nada), no envía WA
- Banner dorado fijo

## 📊 VERSIÓN ACTIVA: v138
Cambios v138: fix lista usuarios config, checkbox Compras Lab en permisos, auth_phones separado de admin_phones, lista precios SALES en Compras Lab.

## ⚠️ PENDIENTES
1. Migrar WA#1 Clari a Twilio
2. SICAR migración completa
3. Landing pages bug
4. Plantillas Twilio: lc_recompra + venta_clari_pendiente
5. Recompra automática wa-webhook
6. Promo "Material a $1"
7. SEGURIDAD: RLS Supabase + proxy lectura por fases
8. Mapeo materiales + matching inteligente compras lab
9. Precios Marina pendientes de confirmar
10. ~~Configurar GitHub para sincronizar entre computadoras~~ ✅ HECHO (2026-03-16)

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
