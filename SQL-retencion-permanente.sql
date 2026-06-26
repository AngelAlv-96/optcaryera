-- ============================================================================
-- RETENCIÓN PERMANENTE de conversaciones y prospectos
-- Problema: clari_conversations se purga a ~30 días (lo hace un sistema externo
-- = la Agencia/Railway, que comparte esta misma BD). Esto pierde leads e historial.
-- Solución: 2 tablas permanentes que se llenan solas con un trigger AFTER INSERT
-- sobre clari_conversations. Aunque el sistema externo borre la tabla viva, estas
-- copias NUNCA se borran (el DELETE externo no dispara el trigger de INSERT).
-- ============================================================================

-- 1) Archivo permanente de TODAS las conversaciones (espejo, nunca se purga)
CREATE TABLE IF NOT EXISTS clari_conversations_archive (
  id           bigint,
  phone        text,
  role         text,
  content      text,
  user_name    text,
  created_at   timestamptz,
  via_phone_id text,
  archived_at  timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cca_phone   ON clari_conversations_archive(phone);
CREATE INDEX IF NOT EXISTS idx_cca_created ON clari_conversations_archive(created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cca_id ON clari_conversations_archive(id);

-- 2) Tabla permanente de PROSPECTOS (todo número que NOS ESCRIBE, 1 fila por teléfono)
CREATE TABLE IF NOT EXISTS prospectos (
  phone            text PRIMARY KEY,
  nombre           text,
  primer_contacto  timestamptz DEFAULT now(),
  ultimo_contacto  timestamptz DEFAULT now(),
  total_mensajes   int DEFAULT 0,
  ultimo_mensaje   text,
  es_paciente      boolean DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_prospectos_ultimo ON prospectos(ultimo_contacto);

-- 3) Función del trigger: archiva cada mensaje + actualiza el prospecto (solo si escribió)
CREATE OR REPLACE FUNCTION fn_clari_retener() RETURNS trigger AS $$
BEGIN
  -- a) Archivo completo (cualquier rol)
  INSERT INTO clari_conversations_archive (id, phone, role, content, user_name, created_at, via_phone_id)
  VALUES (NEW.id, NEW.phone, NEW.role, NEW.content, NEW.user_name, NEW.created_at, NEW.via_phone_id)
  ON CONFLICT (id) DO NOTHING;

  -- b) Prospecto SOLO cuando la persona escribe (role='user' = entrante)
  IF NEW.role = 'user' THEN
    INSERT INTO prospectos (phone, nombre, primer_contacto, ultimo_contacto, total_mensajes, ultimo_mensaje)
    VALUES (NEW.phone, NULLIF(NEW.user_name, ''), NEW.created_at, NEW.created_at, 1, left(NEW.content, 200))
    ON CONFLICT (phone) DO UPDATE SET
      ultimo_contacto = GREATEST(prospectos.ultimo_contacto, EXCLUDED.ultimo_contacto),
      total_mensajes  = prospectos.total_mensajes + 1,
      ultimo_mensaje  = EXCLUDED.ultimo_mensaje,
      nombre          = COALESCE(NULLIF(prospectos.nombre, ''), EXCLUDED.nombre);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4) Trigger
DROP TRIGGER IF EXISTS trg_clari_retener ON clari_conversations;
CREATE TRIGGER trg_clari_retener
  AFTER INSERT ON clari_conversations
  FOR EACH ROW EXECUTE FUNCTION fn_clari_retener();

-- 5) Backfill: copiar lo que TODAVÍA existe en la tabla viva
INSERT INTO clari_conversations_archive (id, phone, role, content, user_name, created_at, via_phone_id)
SELECT id, phone, role, content, user_name, created_at, via_phone_id
FROM clari_conversations c
ON CONFLICT (id) DO NOTHING;

-- 6) Seed prospectos desde lo que existe (mensajes entrantes)
INSERT INTO prospectos (phone, nombre, primer_contacto, ultimo_contacto, total_mensajes, ultimo_mensaje)
SELECT phone,
       (array_agg(user_name) FILTER (WHERE user_name IS NOT NULL AND user_name <> ''))[1],
       min(created_at), max(created_at), count(*),
       (array_agg(content ORDER BY created_at DESC))[1]
FROM clari_conversations
WHERE role = 'user'
GROUP BY phone
ON CONFLICT (phone) DO NOTHING;

-- 7) Marcar es_paciente cruzando con pacientes (por últimos 10 dígitos del teléfono)
UPDATE prospectos pr SET es_paciente = true
WHERE EXISTS (
  SELECT 1 FROM pacientes pa
  WHERE right(regexp_replace(pa.telefono, '\D', '', 'g'), 10) = right(pr.phone, 10)
    AND length(regexp_replace(pa.telefono, '\D', '', 'g')) >= 10
);

-- 8) RLS: contienen PII (teléfonos) -> solo lectura para 'authenticated' (panel logueado), nada de anon
ALTER TABLE clari_conversations_archive ENABLE ROW LEVEL SECURITY;
ALTER TABLE prospectos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cca_select_auth ON clari_conversations_archive;
CREATE POLICY cca_select_auth ON clari_conversations_archive FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS prospectos_select_auth ON prospectos;
CREATE POLICY prospectos_select_auth ON prospectos FOR SELECT TO authenticated USING (true);
