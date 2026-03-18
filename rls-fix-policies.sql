-- ═══════════════════════════════════════════════════
-- TAREA 3: Corregir policies ALL demasiado permisivas
-- ═══════════════════════════════════════════════════

-- ── app_config: reemplazar "Allow all" (public) → service_role only ──
-- Ya tiene: "Allow all" (ALL, public, true) + "app_config_select" (SELECT, public, true)
-- Queremos: service_role=ALL + anon/authenticated=SELECT only
DROP POLICY "Allow all" ON public.app_config;
CREATE POLICY service_all_app_config ON public.app_config FOR ALL TO service_role USING (true) WITH CHECK (true);
-- app_config_select ya existe para SELECT, no tocar

-- ── lc_pedidos: reemplazar "Allow all" (public) → service_role only ──
DROP POLICY "Allow all" ON public.lc_pedidos;
CREATE POLICY service_all_lc_pedidos ON public.lc_pedidos FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY anon_read_lc_pedidos ON public.lc_pedidos FOR SELECT TO anon, authenticated USING (true);

-- ── catalogo_tienda: cambiar service_all de public → service_role ──
DROP POLICY service_all_catalogo_tienda ON public.catalogo_tienda;
CREATE POLICY service_all_catalogo_tienda ON public.catalogo_tienda FOR ALL TO service_role USING (true) WITH CHECK (true);
-- anon_read_catalogo_tienda ya existe, no tocar

-- ── compras_lab: cambiar service_all de public → service_role ──
DROP POLICY service_all_compras_lab ON public.compras_lab;
CREATE POLICY service_all_compras_lab ON public.compras_lab FOR ALL TO service_role USING (true) WITH CHECK (true);
-- Agregar lectura anon (no existía)
CREATE POLICY anon_read_compras_lab ON public.compras_lab FOR SELECT TO anon, authenticated USING (true);

-- ── mapeo_materiales: cambiar service_all de public → service_role ──
DROP POLICY service_all_mapeo_materiales ON public.mapeo_materiales;
CREATE POLICY service_all_mapeo_materiales ON public.mapeo_materiales FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY anon_read_mapeo_materiales ON public.mapeo_materiales FOR SELECT TO anon, authenticated USING (true);

-- ── precios_materiales: cambiar service_all de public → service_role ──
DROP POLICY service_all_precios_materiales ON public.precios_materiales;
CREATE POLICY service_all_precios_materiales ON public.precios_materiales FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY anon_read_precios_materiales ON public.precios_materiales FOR SELECT TO anon, authenticated USING (true);

-- ── proveedores_lab: cambiar service_all de public → service_role ──
DROP POLICY service_all_proveedores_lab ON public.proveedores_lab;
CREATE POLICY service_all_proveedores_lab ON public.proveedores_lab FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY anon_read_proveedores_lab ON public.proveedores_lab FOR SELECT TO anon, authenticated USING (true);

-- ── clari_conversations: NO TOCAR — Allow delete/insert son intencionales para chatbot ──
-- ── pacientes: NO TOCAR — pacientes_insert_anon es intencional para registros públicos ──
