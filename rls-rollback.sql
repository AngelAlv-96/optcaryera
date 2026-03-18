-- ============================================================
-- RLS ROLLBACK SCRIPT — Revierte TODOS los cambios
-- Generado: 2026-03-17
-- ============================================================

-- ── Tarea 2: Deshabilitar RLS en las 19 tablas que no lo tenían ──
ALTER TABLE public.am_sesiones DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.proveedores DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.lotes_compra DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.config_precios DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.retiros_caja DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.creditos_clientes DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.creditos_abonos DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.autorizaciones DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.productos DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.vision_segura DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.vision_segura_eventos DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.lc_seguimiento DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_profile DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduled_posts DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.generated_images DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.composed_images DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.image_feedback DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.learned_prompts DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.generated_videos DISABLE ROW LEVEL SECURITY;

-- ── Tarea 2: Eliminar policies nuevas creadas ──
-- (solo las que NO existían antes)
DROP POLICY IF EXISTS "service_all_am_sesiones" ON public.am_sesiones;
DROP POLICY IF EXISTS "anon_read_am_sesiones" ON public.am_sesiones;
DROP POLICY IF EXISTS "service_all_proveedores" ON public.proveedores;
DROP POLICY IF EXISTS "anon_read_proveedores" ON public.proveedores;
DROP POLICY IF EXISTS "service_all_lotes_compra" ON public.lotes_compra;
DROP POLICY IF EXISTS "anon_read_lotes_compra" ON public.lotes_compra;
DROP POLICY IF EXISTS "service_all_config_precios" ON public.config_precios;
DROP POLICY IF EXISTS "anon_read_config_precios" ON public.config_precios;
DROP POLICY IF EXISTS "service_all_retiros_caja" ON public.retiros_caja;
DROP POLICY IF EXISTS "anon_read_retiros_caja" ON public.retiros_caja;
DROP POLICY IF EXISTS "service_all_creditos_clientes" ON public.creditos_clientes;
DROP POLICY IF EXISTS "anon_read_creditos_clientes" ON public.creditos_clientes;
DROP POLICY IF EXISTS "service_all_creditos_abonos" ON public.creditos_abonos;
DROP POLICY IF EXISTS "anon_read_creditos_abonos" ON public.creditos_abonos;
DROP POLICY IF EXISTS "service_all_autorizaciones" ON public.autorizaciones;
DROP POLICY IF EXISTS "anon_read_autorizaciones" ON public.autorizaciones;
DROP POLICY IF EXISTS "service_all_productos" ON public.productos;
DROP POLICY IF EXISTS "service_all_vision_segura" ON public.vision_segura;
DROP POLICY IF EXISTS "service_all_vision_segura_eventos" ON public.vision_segura_eventos;
DROP POLICY IF EXISTS "service_all_lc_seguimiento" ON public.lc_seguimiento;
DROP POLICY IF EXISTS "anon_read_lc_seguimiento" ON public.lc_seguimiento;
DROP POLICY IF EXISTS "service_all_brand_profile" ON public.brand_profile;
DROP POLICY IF EXISTS "anon_read_brand_profile" ON public.brand_profile;
DROP POLICY IF EXISTS "service_all_scheduled_posts" ON public.scheduled_posts;
DROP POLICY IF EXISTS "anon_read_scheduled_posts" ON public.scheduled_posts;
DROP POLICY IF EXISTS "service_all_generated_images" ON public.generated_images;
DROP POLICY IF EXISTS "anon_read_generated_images" ON public.generated_images;
DROP POLICY IF EXISTS "service_all_composed_images" ON public.composed_images;
DROP POLICY IF EXISTS "anon_read_composed_images" ON public.composed_images;
DROP POLICY IF EXISTS "service_all_image_feedback" ON public.image_feedback;
DROP POLICY IF EXISTS "anon_read_image_feedback" ON public.image_feedback;
DROP POLICY IF EXISTS "service_all_learned_prompts" ON public.learned_prompts;
DROP POLICY IF EXISTS "anon_read_learned_prompts" ON public.learned_prompts;
DROP POLICY IF EXISTS "service_all_generated_videos" ON public.generated_videos;
DROP POLICY IF EXISTS "anon_read_generated_videos" ON public.generated_videos;

-- ── Tarea 3: Restaurar policies permisivas que se reemplazaron ──
-- app_config: restaurar "Allow all" para public
DROP POLICY IF EXISTS "service_all_app_config" ON public.app_config;
DROP POLICY IF EXISTS "anon_read_app_config" ON public.app_config;
CREATE POLICY "Allow all" ON public.app_config FOR ALL TO public USING (true) WITH CHECK (true);

-- lc_pedidos: restaurar "Allow all" para public
DROP POLICY IF EXISTS "service_all_lc_pedidos" ON public.lc_pedidos;
DROP POLICY IF EXISTS "anon_read_lc_pedidos" ON public.lc_pedidos;
CREATE POLICY "Allow all" ON public.lc_pedidos FOR ALL TO public USING (true) WITH CHECK (true);

-- catalogo_tienda, compras_lab, mapeo_materiales, precios_materiales, proveedores_lab:
-- restaurar service_all_ policies to {public} roles
-- (these were changed from public to service_role)
DROP POLICY IF EXISTS "service_all_catalogo_tienda" ON public.catalogo_tienda;
CREATE POLICY "service_all_catalogo_tienda" ON public.catalogo_tienda FOR ALL TO public USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "service_all_compras_lab" ON public.compras_lab;
CREATE POLICY "service_all_compras_lab" ON public.compras_lab FOR ALL TO public USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "service_all_mapeo_materiales" ON public.mapeo_materiales;
CREATE POLICY "service_all_mapeo_materiales" ON public.mapeo_materiales FOR ALL TO public USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "service_all_precios_materiales" ON public.precios_materiales;
CREATE POLICY "service_all_precios_materiales" ON public.precios_materiales FOR ALL TO public USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "service_all_proveedores_lab" ON public.proveedores_lab;
CREATE POLICY "service_all_proveedores_lab" ON public.proveedores_lab FOR ALL TO public USING (true) WITH CHECK (true);

-- ── Tarea 4: Quitar search_path de funciones ──
ALTER FUNCTION public.generar_token_portal() RESET search_path;
ALTER FUNCTION public.update_landing_pages_updated_at() RESET search_path;
ALTER FUNCTION public.update_landing_timestamp() RESET search_path;
