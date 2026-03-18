# RLS Fix Log — Paso a Paso
**Fecha**: 2026-03-17
**Ejecutado por**: Claude Code (con token de acceso de Angel)

## Paso 1: Auditoría inicial
- Conectado via Supabase CLI (`supabase login --token`)
- Proyecto linkeado: `supabase link --project-ref icsnlgeereepesbrdjhf`
- Auditado: 40 tablas, 31 policies existentes, 3 funciones
- Resultado: 19 tablas sin RLS, 7 policies ALL con roles={public}, 3 funciones sin search_path
- Guardado en `rls-audit-BEFORE.md`
- Generado `rls-rollback.sql` antes de cualquier cambio

## Paso 2: Habilitar RLS en 19 tablas

### Tablas óptica (12):
1. `am_sesiones` — ENABLE RLS + service_all + anon_read ✅
2. `proveedores` — ENABLE RLS + service_all + anon_read ✅
3. `lotes_compra` — ENABLE RLS + service_all + anon_read ✅
4. `config_precios` — ENABLE RLS + service_all + anon_read ✅
5. `retiros_caja` — ENABLE RLS + service_all + anon_read ✅
6. `creditos_clientes` — ENABLE RLS + service_all + anon_read ✅
7. `creditos_abonos` — ENABLE RLS + service_all + anon_read ✅
8. `autorizaciones` — ENABLE RLS + service_all + anon_read ✅
9. `productos` — ENABLE RLS + service_all (ya tenía SELECT policies) ✅
10. `vision_segura` — ENABLE RLS + service_all (ya tenía SELECT policy) ✅
11. `vision_segura_eventos` — ENABLE RLS + service_all (ya tenía SELECT policy) ✅
12. `lc_seguimiento` — ENABLE RLS + service_all + anon_read ✅

### Tablas agencia (7):
13. `brand_profile` — ENABLE RLS + service_all + anon_read ✅
14. `scheduled_posts` — ENABLE RLS + service_all + anon_read ✅
15. `generated_images` — ENABLE RLS + service_all + anon_read ✅
16. `composed_images` — ENABLE RLS + service_all + anon_read ✅
17. `image_feedback` — ENABLE RLS + service_all + anon_read ✅
18. `learned_prompts` — ENABLE RLS + service_all + anon_read ✅
19. `generated_videos` — ENABLE RLS + service_all + anon_read ✅

**Verificación**: 0 tablas sin RLS después del cambio. 19/19 anon SELECT OK.

## Paso 3: Corregir policies permisivas

1. `app_config` — DROP "Allow all" (ALL, public) → CREATE service_all_app_config (ALL, service_role) ✅
2. `lc_pedidos` — DROP "Allow all" (ALL, public) → CREATE service_all_lc_pedidos (ALL, service_role) + anon_read ✅
3. `catalogo_tienda` — DROP+RECREATE service_all (public → service_role) ✅
4. `compras_lab` — DROP+RECREATE service_all (public → service_role) + anon_read ✅
5. `mapeo_materiales` — DROP+RECREATE service_all (public → service_role) + anon_read ✅
6. `precios_materiales` — DROP+RECREATE service_all (public → service_role) + anon_read ✅
7. `proveedores_lab` — DROP+RECREATE service_all (public → service_role) + anon_read ✅

**NO tocadas** (intencional):
- `clari_conversations`: Allow delete/insert para public → necesario para chatbot Clari
- `pacientes`: pacientes_insert_anon → necesario para registro público

**Verificación**: 7/7 tablas con anon SELECT OK. Escritura anon BLOQUEADA en app_config (confirmado).

## Paso 4: Fijar search_path en funciones

1. `generar_token_portal()` — SET search_path = public ✅
2. `update_landing_pages_updated_at()` — SET search_path = public ✅
3. `update_landing_timestamp()` — SET search_path = public ✅

**Verificación**: 3/3 funciones con proconfig=['search_path=public']

## Paso 5: Verificación final

- 40/40 tablas con RLS habilitado ✅
- 40/40 tablas con anon SELECT funcionando ✅
- 0 policies ALL con roles={public} en tablas no intencionales ✅
- 3/3 funciones con search_path fijo ✅
- Escritura anon bloqueada en tablas corregidas ✅
