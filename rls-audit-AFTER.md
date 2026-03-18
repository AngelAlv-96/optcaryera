# RLS Audit — AFTER Changes
**Fecha**: 2026-03-17
**Proyecto**: Portal optico (icsnlgeereepesbrdjhf)

## Tablas en public schema (40 total)

| # | Tabla | RLS |
|---|-------|-----|
| 1 | am_sesiones | ✅ |
| 2 | app_config | ✅ |
| 3 | autorizaciones | ✅ |
| 4 | brand_profile | ✅ |
| 5 | catalogo_tienda | ✅ |
| 6 | citas | ✅ |
| 7 | clari_conversations | ✅ |
| 8 | composed_images | ✅ |
| 9 | compras_lab | ✅ |
| 10 | config_precios | ✅ |
| 11 | cortes_caja | ✅ |
| 12 | creditos_abonos | ✅ |
| 13 | creditos_clientes | ✅ |
| 14 | generated_images | ✅ |
| 15 | generated_videos | ✅ |
| 16 | historias_clinicas | ✅ |
| 17 | image_feedback | ✅ |
| 18 | landing_pages | ✅ |
| 19 | lc_pedidos | ✅ |
| 20 | lc_seguimiento | ✅ |
| 21 | learned_prompts | ✅ |
| 22 | lotes_compra | ✅ |
| 23 | mapeo_materiales | ✅ |
| 24 | monedero | ✅ |
| 25 | ordenes_laboratorio | ✅ |
| 26 | pacientes | ✅ |
| 27 | precios_materiales | ✅ |
| 28 | productos | ✅ |
| 29 | promociones | ✅ |
| 30 | proveedores | ✅ |
| 31 | proveedores_lab | ✅ |
| 32 | reglas_materiales | ✅ |
| 33 | retiros_caja | ✅ |
| 34 | scheduled_posts | ✅ |
| 35 | venta_items | ✅ |
| 36 | venta_pagos | ✅ |
| 37 | venta_promociones | ✅ |
| 38 | ventas | ✅ |
| 39 | vision_segura | ✅ |
| 40 | vision_segura_eventos | ✅ |

**Resumen**: 40/40 con RLS ✅

## Policies (71 total)

| Tabla | Policy | Cmd | Roles |
|-------|--------|-----|-------|
| am_sesiones | anon_read_am_sesiones | SELECT | anon,authenticated |
| am_sesiones | service_all_am_sesiones | ALL | service_role |
| app_config | app_config_select | SELECT | public |
| app_config | service_all_app_config | ALL | service_role |
| autorizaciones | anon_read_autorizaciones | SELECT | anon,authenticated |
| autorizaciones | service_all_autorizaciones | ALL | service_role |
| brand_profile | anon_read_brand_profile | SELECT | anon,authenticated |
| brand_profile | service_all_brand_profile | ALL | service_role |
| catalogo_tienda | anon_read_catalogo_tienda | SELECT | public |
| catalogo_tienda | service_all_catalogo_tienda | ALL | service_role |
| citas | citas_select | SELECT | public |
| clari_conversations | Allow delete | DELETE | public |
| clari_conversations | Allow insert | INSERT | public |
| clari_conversations | Allow read | SELECT | public |
| clari_conversations | No public access | ALL | public (USING=false) |
| composed_images | anon_read_composed_images | SELECT | anon,authenticated |
| composed_images | service_all_composed_images | ALL | service_role |
| compras_lab | anon_read_compras_lab | SELECT | anon,authenticated |
| compras_lab | service_all_compras_lab | ALL | service_role |
| config_precios | anon_read_config_precios | SELECT | anon,authenticated |
| config_precios | service_all_config_precios | ALL | service_role |
| cortes_caja | cortes_caja_select | SELECT | public |
| creditos_abonos | anon_read_creditos_abonos | SELECT | anon,authenticated |
| creditos_abonos | service_all_creditos_abonos | ALL | service_role |
| creditos_clientes | anon_read_creditos_clientes | SELECT | anon,authenticated |
| creditos_clientes | service_all_creditos_clientes | ALL | service_role |
| generated_images | anon_read_generated_images | SELECT | anon,authenticated |
| generated_images | service_all_generated_images | ALL | service_role |
| generated_videos | anon_read_generated_videos | SELECT | anon,authenticated |
| generated_videos | service_all_generated_videos | ALL | service_role |
| historias_clinicas | historias_clinicas_select | SELECT | public |
| image_feedback | anon_read_image_feedback | SELECT | anon,authenticated |
| image_feedback | service_all_image_feedback | ALL | service_role |
| landing_pages | Lectura pública landing_pages | SELECT | public |
| lc_pedidos | anon_read_lc_pedidos | SELECT | anon,authenticated |
| lc_pedidos | service_all_lc_pedidos | ALL | service_role |
| lc_seguimiento | anon_read_lc_seguimiento | SELECT | anon,authenticated |
| lc_seguimiento | service_all_lc_seguimiento | ALL | service_role |
| learned_prompts | anon_read_learned_prompts | SELECT | anon,authenticated |
| learned_prompts | service_all_learned_prompts | ALL | service_role |
| lotes_compra | anon_read_lotes_compra | SELECT | anon,authenticated |
| lotes_compra | service_all_lotes_compra | ALL | service_role |
| mapeo_materiales | anon_read_mapeo_materiales | SELECT | anon,authenticated |
| mapeo_materiales | service_all_mapeo_materiales | ALL | service_role |
| monedero | monedero_select | SELECT | public |
| ordenes_laboratorio | ordenes_laboratorio_select | SELECT | public |
| pacientes | pacientes_insert_anon | INSERT | public |
| pacientes | pacientes_select | SELECT | public |
| precios_materiales | anon_read_precios_materiales | SELECT | anon,authenticated |
| precios_materiales | service_all_precios_materiales | ALL | service_role |
| productos | anon_read_productos_lc | SELECT | anon |
| productos | productos_select | SELECT | public |
| productos | service_all_productos | ALL | service_role |
| promociones | promociones_select | SELECT | public |
| proveedores | anon_read_proveedores | SELECT | anon,authenticated |
| proveedores | service_all_proveedores | ALL | service_role |
| proveedores_lab | anon_read_proveedores_lab | SELECT | anon,authenticated |
| proveedores_lab | service_all_proveedores_lab | ALL | service_role |
| reglas_materiales | reglas_materiales_read | SELECT | public |
| retiros_caja | anon_read_retiros_caja | SELECT | anon,authenticated |
| retiros_caja | service_all_retiros_caja | ALL | service_role |
| scheduled_posts | anon_read_scheduled_posts | SELECT | anon,authenticated |
| scheduled_posts | service_all_scheduled_posts | ALL | service_role |
| venta_items | venta_items_select | SELECT | public |
| venta_pagos | venta_pagos_select | SELECT | public |
| venta_promociones | venta_promociones_select | SELECT | public |
| ventas | ventas_select | SELECT | public |
| vision_segura | service_all_vision_segura | ALL | service_role |
| vision_segura | vision_segura_select | SELECT | public |
| vision_segura_eventos | service_all_vision_segura_eventos | ALL | service_role |
| vision_segura_eventos | vision_segura_eventos_select | SELECT | public |

## Funciones — search_path

| Función | search_path |
|---------|-------------|
| generar_token_portal() | public ✅ |
| update_landing_pages_updated_at() | public ✅ |
| update_landing_timestamp() | public ✅ |

## Tests anon SELECT: 40/40 OK ✅
