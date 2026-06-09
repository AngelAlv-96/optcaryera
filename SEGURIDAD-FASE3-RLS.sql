-- ════════════════════════════════════════════════════════════════════════
-- SEGURIDAD FASE 3 — Cerrar lectura pública de pacientes / historias / ventas
-- + ocultar empleados_pins de anon.  (Supabase SQL Editor, lo corre Angel)
-- ════════════════════════════════════════════════════════════════════════
--
-- PRE-REQUISITOS antes de correr esto:
--   1. SUPABASE_JWT_SECRET ya está en Netlify (Production) y se hizo redeploy.
--   2. El frontend ya manda el JWT (probado: login + POS leen bien CON el JWT,
--      con RLS todavía abierto → si el JWT fallara, el fallback cubría).
--   3. Sucursales CERRADAS (este es el momento de riesgo).
--
-- Qué hace:
--   - pacientes:           SELECT solo 'authenticated'  + conserva INSERT anónimo (preregistro.html)
--   - historias_clinicas:  SELECT solo 'authenticated'
--   - ventas:              SELECT solo 'authenticated'  (portal usa portal-data.js / service_role)
--   - app_config:          oculta 'empleados_pins' de anon (Mi Sobre usa pins-read.js)
--
-- Las ESCRITURAS del frontend van por dbwrite/funciones (service_role, BYPASSRLS),
-- así que NO se necesitan políticas de write para anon (salvo el INSERT de preregistro).
-- Revert completo al final del archivo (comentado).
-- ════════════════════════════════════════════════════════════════════════

-- ─────────────────────────── PACIENTES ───────────────────────────
ALTER TABLE public.pacientes ENABLE ROW LEVEL SECURITY;

-- 1) Borra TODA política que otorgue lectura (SELECT o ALL). Robusto ante cualquier nombre/estructura.
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT policyname FROM pg_policies
           WHERE schemaname='public' AND tablename='pacientes' AND cmd IN ('SELECT','ALL') LOOP
    EXECUTE format('DROP POLICY %I ON public.pacientes', r.policyname);
  END LOOP;
END $$;

-- 2) Lectura SOLO para usuarios autenticados (el frontend manda el JWT role=authenticated).
CREATE POLICY ce_pacientes_select_auth ON public.pacientes
  FOR SELECT TO authenticated USING (true);

-- 3) Conserva el INSERT anónimo (preregistro.html inserta con la publishable key, sin login).
--    Solo lo crea si ya no quedó ninguna política de INSERT tras el paso 1.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE schemaname='public' AND tablename='pacientes' AND cmd='INSERT') THEN
    CREATE POLICY ce_pacientes_insert_anon ON public.pacientes
      FOR INSERT TO anon, authenticated WITH CHECK (true);
  END IF;
END $$;

-- ──────────────────────── HISTORIAS_CLINICAS ────────────────────────
ALTER TABLE public.historias_clinicas ENABLE ROW LEVEL SECURITY;

DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT policyname FROM pg_policies
           WHERE schemaname='public' AND tablename='historias_clinicas' AND cmd IN ('SELECT','ALL') LOOP
    EXECUTE format('DROP POLICY %I ON public.historias_clinicas', r.policyname);
  END LOOP;
END $$;

CREATE POLICY ce_historias_select_auth ON public.historias_clinicas
  FOR SELECT TO authenticated USING (true);

-- ─────────────────────────── VENTAS ───────────────────────────
ALTER TABLE public.ventas ENABLE ROW LEVEL SECURITY;

DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT policyname FROM pg_policies
           WHERE schemaname='public' AND tablename='ventas' AND cmd IN ('SELECT','ALL') LOOP
    EXECUTE format('DROP POLICY %I ON public.ventas', r.policyname);
  END LOOP;
END $$;

CREATE POLICY ce_ventas_select_auth ON public.ventas
  FOR SELECT TO authenticated USING (true);

-- ──────────────────── APP_CONFIG: ocultar empleados_pins de anon ────────────────────
-- La política app_config_select ya excluye custom_users + whatsapp_config (Fase 1).
-- Se le agrega empleados_pins. (Si el nombre de la política difiere, ajustar aquí.)
ALTER POLICY app_config_select ON public.app_config
  USING (id <> ALL (ARRAY['custom_users','whatsapp_config','empleados_pins']));

-- ──────────────────────── VERIFICACIÓN (pega el resultado) ────────────────────────
SELECT tablename, policyname, cmd, roles::text AS roles
FROM pg_policies
WHERE schemaname='public'
  AND tablename IN ('pacientes','historias_clinicas','ventas','app_config')
ORDER BY tablename, cmd, policyname;


-- ════════════════════════════════════════════════════════════════════════
-- REVERT (si algo se rompe, correr ESTO para volver a lectura pública):
-- ════════════════════════════════════════════════════════════════════════
-- DROP POLICY IF EXISTS ce_pacientes_select_auth  ON public.pacientes;
-- DROP POLICY IF EXISTS ce_historias_select_auth  ON public.historias_clinicas;
-- DROP POLICY IF EXISTS ce_ventas_select_auth     ON public.ventas;
-- CREATE POLICY pacientes_public_select ON public.pacientes          FOR SELECT TO public USING (true);
-- CREATE POLICY historias_public_select ON public.historias_clinicas FOR SELECT TO public USING (true);
-- CREATE POLICY ventas_public_select    ON public.ventas             FOR SELECT TO public USING (true);
-- ALTER POLICY app_config_select ON public.app_config USING (id <> ALL (ARRAY['custom_users','whatsapp_config']));
-- (El INSERT anónimo de pacientes se conserva en ambos sentidos; no hace falta tocarlo.)
