# Resumen Ejecutivo — Fix RLS Supabase
**Proyecto**: Portal optico (Ópticas Car & Era + Agencia Marketing)
**Fecha**: 2026-03-17

## Resultado

| Métrica | Antes | Después |
|---------|-------|---------|
| Tablas con RLS | 21/40 (52%) | **40/40 (100%)** |
| Policies ALL para {public} | 7 | **0** (excepto clari/pacientes intencional) |
| Funciones con search_path mutable | 3 | **0** |
| Lectura anon funcionando | 40/40 | **40/40** |

## Cambios realizados

### 1. RLS habilitado en 19 tablas
12 del sistema óptica + 7 de la agencia. Cada una recibió:
- `service_all_*` policy para que el backend (service_role) siga operando
- `anon_read_*` policy para que el frontend (publishable key) pueda leer

### 2. Policies permisivas corregidas en 7 tablas
`app_config`, `lc_pedidos`, `catalogo_tienda`, `compras_lab`, `mapeo_materiales`, `precios_materiales`, `proveedores_lab` — las policies ALL que aplicaban a **todos los roles** ahora solo aplican a `service_role`. Anon solo puede SELECT.

### 3. Funciones aseguradas
`generar_token_portal()`, `update_landing_pages_updated_at()`, `update_landing_timestamp()` — search_path fijado a `public`.

## Excepciones intencionales (NO se tocaron)
- `clari_conversations`: Allow delete/insert para {public} — necesario para chatbot Clari que opera como anon
- `pacientes`: pacientes_insert_anon — necesario para registro de pacientes desde formularios públicos

## Impacto en el sistema
- **Frontend** (index.html): Sin impacto — lee con publishable key (role anon), todas las lecturas siguen funcionando
- **Backend** (dbwrite.js, wa-webhook.js, etc.): Sin impacto — usa service_role key, tiene acceso total
- **Tienda** (tienda.html): Sin impacto — solo lee catálogo y productos
- **Portal** (portal.html): Sin impacto — solo lee ventas/pacientes

## Archivos generados
- `rls-audit-BEFORE.md` — Estado antes de cambios
- `rls-audit-AFTER.md` — Estado después de cambios
- `rls-fix-log.md` — Log paso a paso
- `rls-fix-summary.md` — Este archivo
- `rls-rollback.sql` — Script para revertir TODO
- `rls-apply.sql` — SQL de Tarea 2
- `rls-fix-policies.sql` — SQL de Tarea 3
