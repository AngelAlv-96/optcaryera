-- ════════════════════════════════════════════════════════════════════════
-- HOTFIX Fase 3 — restaurar lectura de tablas internas para el cliente `authenticated`
-- ════════════════════════════════════════════════════════════════════════
-- La Fase 3 hizo que el frontend se autentique como rol `authenticated` (antes `anon`).
-- Estas tablas tenían SELECT SOLO para `anon` → dejaron de devolver datos en la app
-- (Recursos Humanos, Contabilidad, Comisiones, Auditoría, etc.).
-- Fix: agregarles `authenticated` SIN quitar `anon` (no empeora nada — eran anon-legibles
-- desde antes; restaura la funcionalidad de inmediato). ALTER POLICY ... TO conserva el USING.
-- ════════════════════════════════════════════════════════════════════════

ALTER POLICY anon_read_asistencia         ON public.asistencia            TO anon, authenticated;
ALTER POLICY anon_read_firmas             ON public.asistencia_firmas     TO anon, authenticated;
ALTER POLICY comisiones_pagadas_read      ON public.comisiones_pagadas    TO anon, authenticated;
ALTER POLICY anon_read_compra_scans       ON public.compra_scans          TO anon, authenticated;
ALTER POLICY anon_read_compra_sesiones    ON public.compra_sesiones       TO anon, authenticated;
ALTER POLICY cumple_canjes_anon_sel       ON public.cumple_canjes         TO anon, authenticated;
ALTER POLICY anon_read_facturas           ON public.facturas              TO anon, authenticated;
ALTER POLICY anon_read_gastos             ON public.gastos                TO anon, authenticated;
ALTER POLICY anon_select_inventario       ON public.inventario_auditorias TO anon, authenticated;
ALTER POLICY anon_read_precio_cambios     ON public.precio_cambios        TO anon, authenticated;
ALTER POLICY "anon can read review_queue" ON public.review_queue          TO anon, authenticated;

-- Verificación (deben quedar todas con {anon,authenticated}):
SELECT tablename, policyname, roles::text AS roles
FROM pg_policies
WHERE schemaname='public' AND tablename IN
 ('asistencia','asistencia_firmas','comisiones_pagadas','compra_scans','compra_sesiones',
  'cumple_canjes','facturas','gastos','inventario_auditorias','precio_cambios','review_queue')
ORDER BY tablename;
