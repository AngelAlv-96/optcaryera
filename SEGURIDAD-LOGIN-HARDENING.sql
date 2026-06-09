-- ════════════════════════════════════════════════════════════════════════
-- SEGURIDAD — Endurecimiento del LOGIN: rate-limiting + candado por IP
-- (Supabase SQL Editor, lo corre Angel). Todo arranca SIN bloquear a nadie.
-- ════════════════════════════════════════════════════════════════════════
--
-- Qué hace:
--   1) Crea la tabla `login_attempts` (registra intentos de login: IP, usuario, ok/fallo).
--      → habilita el RATE-LIMITING: tras N fallos por IP en una ventana, login.js responde 429.
--      → además sirve para DESCUBRIR las IPs reales de cada sucursal (ver query al final).
--   2) Inserta la config del CANDADO POR IP en app_config, **DESHABILITADO** (enabled:false)
--      → no bloquea a nadie hasta que tú lo prendas con IPs reales.
--   3) Oculta esa config de la llave pública (como custom_users/whatsapp_config/empleados_pins).
--
-- login.js es FAIL-OPEN: si no corres esto, el login sigue funcionando igual (sin rate-limit).
-- Al correrlo, el rate-limiting se activa solo; el candado por IP queda listo pero apagado.
-- ════════════════════════════════════════════════════════════════════════

-- 1) Tabla de intentos (solo service_role la toca; login.js la usa con su service key).
CREATE TABLE IF NOT EXISTS public.login_attempts (
  id         bigserial PRIMARY KEY,
  ip         text,
  username   text,
  ok         boolean,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_la_ip_time ON public.login_attempts(ip, created_at);
ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;
-- (sin políticas = anon NO puede leer ni escribir; service_role bypassa RLS)

-- 2) Config del candado por IP — ARRANCA DESHABILITADO.
--    enabled=false → no bloquea. max_fails/window_min controlan el rate-limit (10 fallos / 10 min).
--    exempt_roles → admin y gerencia entran desde cualquier lado (nunca te quedas afuera).
INSERT INTO public.app_config (id, value)
VALUES ('login_ip_allowlist',
        '{"enabled": false, "ips": [], "exempt_roles": ["admin","gerencia"], "max_fails": 10, "window_min": 10}')
ON CONFLICT (id) DO NOTHING;

-- 3) Ocultar la config de IPs de la llave pública.
ALTER POLICY app_config_select ON public.app_config
  USING (id <> ALL (ARRAY['custom_users','whatsapp_config','empleados_pins','login_ip_allowlist']));

-- ✅ Listo. El RATE-LIMITING ya quedó activo. El candado por IP está listo pero APAGADO.


-- ════════════════════════════════════════════════════════════════════════
-- PASO 2 (en unos días) — DESCUBRIR las IPs de cada sucursal
-- ════════════════════════════════════════════════════════════════════════
-- Deja correr el sistema 2-3 días para que los empleados inicien sesión desde cada sucursal.
-- Luego corre esto para ver desde qué IP entra cada usuario:
--
--   SELECT ip, username, count(*) AS exitos, max(created_at) AS ultimo
--   FROM public.login_attempts WHERE ok = true
--   GROUP BY ip, username ORDER BY username, exitos DESC;
--
-- La IP con más logins de cada sucursal (americas/pinocelli/magnolia/vittoria/laboratorio)
-- es la de esa sucursal. Anótalas.


-- ════════════════════════════════════════════════════════════════════════
-- PASO 3 (cuando tengas las IPs) — PRENDER el candado por IP
-- ════════════════════════════════════════════════════════════════════════
-- Reemplaza las IPs de ejemplo por las reales y corre:
--
--   UPDATE public.app_config
--   SET value = '{"enabled": true, "ips": ["200.x.x.x","187.x.x.x","189.x.x.x","201.x.x.x"], "exempt_roles": ["admin","gerencia"], "max_fails": 10, "window_min": 10}'
--   WHERE id = 'login_ip_allowlist';
--
-- A partir de ahí, las cuentas de sucursal SOLO entran desde esas IPs. admin/gerencia, desde cualquier lado.
--
-- APAGARLO de nuevo (si una IP cambió y bloqueó a alguien):
--   UPDATE public.app_config SET value = jsonb_set(value::jsonb, '{enabled}', 'false')::text WHERE id = 'login_ip_allowlist';
--
-- LIMPIAR intentos viejos (opcional, de vez en cuando):
--   DELETE FROM public.login_attempts WHERE created_at < now() - interval '7 days';
