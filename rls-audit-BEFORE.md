# RLS Audit — BEFORE Changes
**Fecha**: 2026-03-17
**Proyecto**: Portal optico (icsnlgeereepesbrdjhf)

## Tablas en public schema (40 total)

| # | Tabla | RLS Habilitado |
|---|-------|---------------|
| 1 | am_sesiones | ❌ NO |
| 2 | app_config | ✅ SI |
| 3 | autorizaciones | ❌ NO |
| 4 | brand_profile | ❌ NO |
| 5 | catalogo_tienda | ✅ SI |
| 6 | citas | ✅ SI |
| 7 | clari_conversations | ✅ SI |
| 8 | composed_images | ❌ NO |
| 9 | compras_lab | ✅ SI |
| 10 | config_precios | ❌ NO |
| 11 | cortes_caja | ✅ SI |
| 12 | creditos_abonos | ❌ NO |
| 13 | creditos_clientes | ❌ NO |
| 14 | generated_images | ❌ NO |
| 15 | generated_videos | ❌ NO |
| 16 | historias_clinicas | ✅ SI |
| 17 | image_feedback | ❌ NO |
| 18 | landing_pages | ✅ SI |
| 19 | lc_pedidos | ✅ SI |
| 20 | lc_seguimiento | ❌ NO |
| 21 | learned_prompts | ❌ NO |
| 22 | lotes_compra | ❌ NO |
| 23 | mapeo_materiales | ✅ SI |
| 24 | monedero | ✅ SI |
| 25 | ordenes_laboratorio | ✅ SI |
| 26 | pacientes | ✅ SI |
| 27 | precios_materiales | ✅ SI |
| 28 | productos | ❌ NO (tiene policies pero RLS deshabilitado!) |
| 29 | promociones | ✅ SI |
| 30 | proveedores | ❌ NO |
| 31 | proveedores_lab | ✅ SI |
| 32 | reglas_materiales | ✅ SI |
| 33 | retiros_caja | ❌ NO |
| 34 | scheduled_posts | ❌ NO |
| 35 | venta_items | ✅ SI |
| 36 | venta_pagos | ✅ SI |
| 37 | venta_promociones | ✅ SI |
| 38 | ventas | ✅ SI |
| 39 | vision_segura | ❌ NO (tiene policy pero RLS deshabilitado!) |
| 40 | vision_segura_eventos | ❌ NO (tiene policy pero RLS deshabilitado!) |

**Resumen**: 21 con RLS ✅ / 19 sin RLS ❌

## Policies existentes

| Tabla | Policy | Cmd | Roles | USING | WITH CHECK |
|-------|--------|-----|-------|-------|------------|
| app_config | Allow all | ALL | {public} | true | true |
| app_config | app_config_select | SELECT | {public} | true | - |
| catalogo_tienda | anon_read_catalogo_tienda | SELECT | {public} | true | - |
| catalogo_tienda | service_all_catalogo_tienda | ALL | {public} | true | true |
| citas | citas_select | SELECT | {public} | true | - |
| clari_conversations | Allow delete | DELETE | {public} | true | - |
| clari_conversations | Allow insert | INSERT | {public} | - | true |
| clari_conversations | Allow read | SELECT | {public} | true | - |
| clari_conversations | No public access | ALL | {public} | false | - |
| compras_lab | service_all_compras_lab | ALL | {public} | true | true |
| cortes_caja | cortes_caja_select | SELECT | {public} | true | - |
| historias_clinicas | historias_clinicas_select | SELECT | {public} | true | - |
| landing_pages | Lectura pública landing_pages | SELECT | {public} | true | - |
| lc_pedidos | Allow all | ALL | {public} | true | true |
| mapeo_materiales | service_all_mapeo_materiales | ALL | {public} | true | true |
| monedero | monedero_select | SELECT | {public} | true | - |
| ordenes_laboratorio | ordenes_laboratorio_select | SELECT | {public} | true | - |
| pacientes | pacientes_insert_anon | INSERT | {public} | - | true |
| pacientes | pacientes_select | SELECT | {public} | true | - |
| precios_materiales | service_all_precios_materiales | ALL | {public} | true | true |
| productos | anon_read_productos_lc | SELECT | {anon} | true | - |
| productos | productos_select | SELECT | {public} | true | - |
| promociones | promociones_select | SELECT | {public} | true | - |
| proveedores_lab | service_all_proveedores_lab | ALL | {public} | true | true |
| reglas_materiales | reglas_materiales_read | SELECT | {public} | true | - |
| venta_items | venta_items_select | SELECT | {public} | true | - |
| venta_pagos | venta_pagos_select | SELECT | {public} | true | - |
| venta_promociones | venta_promociones_select | SELECT | {public} | true | - |
| ventas | ventas_select | SELECT | {public} | true | - |
| vision_segura | vision_segura_select | SELECT | {public} | true | - |
| vision_segura_eventos | vision_segura_eventos_select | SELECT | {public} | true | - |

## Funciones con search_path mutable

| Función | search_path config |
|---------|-------------------|
| generar_token_portal() | NULL (mutable!) |
| update_landing_pages_updated_at() | NULL (mutable!) |
| update_landing_timestamp() | NULL (mutable!) |

## Problemas identificados

### CRÍTICO — 19 tablas sin RLS
am_sesiones, autorizaciones, brand_profile, composed_images, config_precios, creditos_abonos, creditos_clientes, generated_images, generated_videos, image_feedback, lc_seguimiento, learned_prompts, lotes_compra, productos, proveedores, retiros_caja, scheduled_posts, vision_segura, vision_segura_eventos

### WARNING — Policies ALL con roles={public} (demasiado permisivas)
- app_config: "Allow all" → ALL para {public}
- catalogo_tienda: "service_all_catalogo_tienda" → ALL para {public}
- compras_lab: "service_all_compras_lab" → ALL para {public}
- lc_pedidos: "Allow all" → ALL para {public}
- mapeo_materiales: "service_all_mapeo_materiales" → ALL para {public}
- precios_materiales: "service_all_precios_materiales" → ALL para {public}
- proveedores_lab: "service_all_proveedores_lab" → ALL para {public}

### WARNING — Funciones sin search_path fijo
3 funciones con search_path mutable (vulnerabilidad de inyección de schema)
