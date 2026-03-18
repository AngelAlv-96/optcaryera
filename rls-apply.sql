-- ═══════════════════════════════════════════════════
-- TAREA 2: Habilitar RLS + policies en tablas sin RLS
-- ═══════════════════════════════════════════════════

-- proveedores
ALTER TABLE public.proveedores ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_all_proveedores ON public.proveedores FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY anon_read_proveedores ON public.proveedores FOR SELECT TO anon, authenticated USING (true);

-- lotes_compra
ALTER TABLE public.lotes_compra ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_all_lotes_compra ON public.lotes_compra FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY anon_read_lotes_compra ON public.lotes_compra FOR SELECT TO anon, authenticated USING (true);

-- config_precios
ALTER TABLE public.config_precios ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_all_config_precios ON public.config_precios FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY anon_read_config_precios ON public.config_precios FOR SELECT TO anon, authenticated USING (true);

-- retiros_caja
ALTER TABLE public.retiros_caja ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_all_retiros_caja ON public.retiros_caja FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY anon_read_retiros_caja ON public.retiros_caja FOR SELECT TO anon, authenticated USING (true);

-- creditos_clientes
ALTER TABLE public.creditos_clientes ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_all_creditos_clientes ON public.creditos_clientes FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY anon_read_creditos_clientes ON public.creditos_clientes FOR SELECT TO anon, authenticated USING (true);

-- creditos_abonos
ALTER TABLE public.creditos_abonos ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_all_creditos_abonos ON public.creditos_abonos FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY anon_read_creditos_abonos ON public.creditos_abonos FOR SELECT TO anon, authenticated USING (true);

-- autorizaciones
ALTER TABLE public.autorizaciones ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_all_autorizaciones ON public.autorizaciones FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY anon_read_autorizaciones ON public.autorizaciones FOR SELECT TO anon, authenticated USING (true);

-- productos (YA tiene policies, solo habilitar RLS)
ALTER TABLE public.productos ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_all_productos ON public.productos FOR ALL TO service_role USING (true) WITH CHECK (true);

-- vision_segura (YA tiene policy, solo habilitar RLS)
ALTER TABLE public.vision_segura ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_all_vision_segura ON public.vision_segura FOR ALL TO service_role USING (true) WITH CHECK (true);

-- vision_segura_eventos (YA tiene policy, solo habilitar RLS)
ALTER TABLE public.vision_segura_eventos ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_all_vision_segura_eventos ON public.vision_segura_eventos FOR ALL TO service_role USING (true) WITH CHECK (true);

-- lc_seguimiento
ALTER TABLE public.lc_seguimiento ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_all_lc_seguimiento ON public.lc_seguimiento FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY anon_read_lc_seguimiento ON public.lc_seguimiento FOR SELECT TO anon, authenticated USING (true);

-- brand_profile (agencia)
ALTER TABLE public.brand_profile ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_all_brand_profile ON public.brand_profile FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY anon_read_brand_profile ON public.brand_profile FOR SELECT TO anon, authenticated USING (true);

-- scheduled_posts (agencia)
ALTER TABLE public.scheduled_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_all_scheduled_posts ON public.scheduled_posts FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY anon_read_scheduled_posts ON public.scheduled_posts FOR SELECT TO anon, authenticated USING (true);

-- generated_images (agencia)
ALTER TABLE public.generated_images ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_all_generated_images ON public.generated_images FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY anon_read_generated_images ON public.generated_images FOR SELECT TO anon, authenticated USING (true);

-- composed_images (agencia)
ALTER TABLE public.composed_images ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_all_composed_images ON public.composed_images FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY anon_read_composed_images ON public.composed_images FOR SELECT TO anon, authenticated USING (true);

-- image_feedback (agencia)
ALTER TABLE public.image_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_all_image_feedback ON public.image_feedback FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY anon_read_image_feedback ON public.image_feedback FOR SELECT TO anon, authenticated USING (true);

-- learned_prompts (agencia)
ALTER TABLE public.learned_prompts ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_all_learned_prompts ON public.learned_prompts FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY anon_read_learned_prompts ON public.learned_prompts FOR SELECT TO anon, authenticated USING (true);

-- generated_videos (agencia)
ALTER TABLE public.generated_videos ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_all_generated_videos ON public.generated_videos FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY anon_read_generated_videos ON public.generated_videos FOR SELECT TO anon, authenticated USING (true);
