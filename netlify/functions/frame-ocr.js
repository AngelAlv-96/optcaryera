// Netlify Function — OCR de modelos de armazón con Anthropic Vision
// Recibe imagen base64, extrae modelo(s), detecta marca, guarda en compra_scans

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const SUPA_URL = process.env.SUPABASE_URL || 'https://icsnlgeereepesbrdjhf.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ALLOWED_ORIGIN = process.env.URL || 'https://optcaryera.netlify.app';

// Prefijos de marca conocidos (sincronizado con AM_PREFIX_MAP en index.html)
const PREFIX_MAP = { 'SM':'SEIMA', 'ZB':'ZABDI', 'HA':'HASHTAG', 'HP':'HP' };

function detectBrand(modelo) {
  if (!modelo || modelo.length < 3) return '';
  var prefix = modelo.substring(0, 2).toUpperCase();
  return PREFIX_MAP[prefix] || '';
}

async function supaREST(method, path, body) {
  const opts = {
    method,
    headers: {
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': method === 'POST' ? 'return=representation' : undefined
    }
  };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(`${SUPA_URL}/rest/v1/${path}`, opts);
  return r.json();
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: 'Method not allowed' };

  try {
    const body = JSON.parse(event.body || '{}');
    const { sesion_id, image_base64, scanned_by, media_type, manual_modelo } = body;

    if (!sesion_id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'sesion_id required' }) };

    // Validar sesión existe y está activa
    const sesiones = await supaREST('GET', `compra_sesiones?id=eq.${sesion_id}&select=id,estado`);
    if (!sesiones?.length) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Sesión no encontrada' }) };
    if (sesiones[0].estado !== 'activa') return { statusCode: 400, headers, body: JSON.stringify({ error: 'Sesión cerrada' }) };

    let modelos = [];

    if (manual_modelo) {
      // Entrada manual (sin foto)
      modelos = [{ modelo: manual_modelo.trim().toUpperCase(), confianza: 'manual' }];
    } else if (image_base64) {
      // OCR con Anthropic Vision
      if (!ANTHROPIC_KEY) return { statusCode: 500, headers, body: JSON.stringify({ error: 'API key not configured' }) };

      const visionRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': ANTHROPIC_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 256,
          messages: [{
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: media_type || 'image/jpeg', data: image_base64 }
              },
              {
                type: 'text',
                text: `Extract the eyeglass frame model number from this photo. The model code is usually printed/engraved on:
- The inside of the temple arm (varilla)
- A cardboard hang tag
- A sticker on the demo lens

Return ONLY a JSON object: {"modelos":["MODEL1"],"confianza":"alta|media|baja"}

Rules:
- Model codes are typically 2-4 letters followed by numbers (e.g. SM1515, ZB2274, HA5023, ET801, RI082)
- Include any size/color suffix if visible (e.g. SM1515-C2, ZB2274 52)
- If you see multiple distinct model numbers, list all of them
- If you can partially read it, include your best guess with confianza "baja"
- If nothing is readable, return {"modelos":[],"confianza":"baja"}
- Do NOT include brand names, prices, or other text — ONLY model codes`
              }
            ]
          }]
        })
      });

      if (!visionRes.ok) {
        const errText = await visionRes.text();
        console.error('[frame-ocr] Anthropic error:', errText);
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'Vision API error' }) };
      }

      const visionData = await visionRes.json();
      const text = visionData.content?.[0]?.text || '';

      // Parse JSON response
      try {
        const cleaned = text.replace(/```json\s*/g, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(cleaned);
        if (Array.isArray(parsed.modelos)) {
          modelos = parsed.modelos.map(m => ({
            modelo: String(m).trim().toUpperCase(),
            confianza: parsed.confianza || 'media'
          }));
        }
      } catch (parseErr) {
        // Fallback: try to extract model-like strings from text
        const matches = text.match(/[A-Z]{2,4}\s*[-]?\s*\d{2,5}[A-Z0-9-]*/gi);
        if (matches) {
          modelos = matches.map(m => ({ modelo: m.trim().toUpperCase(), confianza: 'baja' }));
        }
      }
    } else {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'image_base64 or manual_modelo required' }) };
    }

    // Filtrar modelos vacíos
    modelos = modelos.filter(m => m.modelo && m.modelo.length >= 2);

    // Guardar cada modelo detectado en compra_scans
    const saved = [];
    for (const m of modelos) {
      const marca = detectBrand(m.modelo);
      const row = {
        sesion_id,
        modelo: m.modelo,
        marca,
        confianza: m.confianza,
        scanned_by: scanned_by || ''
      };
      const inserted = await supaREST('POST', 'compra_scans', row);
      saved.push({ modelo: m.modelo, marca, confianza: m.confianza, id: inserted?.[0]?.id });
    }

    // Stats de la sesión completa
    const allScans = await supaREST('GET', `compra_scans?sesion_id=eq.${sesion_id}&select=modelo,marca,scanned_by&order=created_at.desc`);
    const total = allScans?.length || 0;
    const uniqueModelos = new Set((allScans || []).map(s => s.modelo)).size;
    const byBrand = {};
    const byUser = {};
    (allScans || []).forEach(s => {
      byBrand[s.marca || 'Sin marca'] = (byBrand[s.marca || 'Sin marca'] || 0) + 1;
      byUser[s.scanned_by || '?'] = (byUser[s.scanned_by || '?'] || 0) + 1;
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        modelos: saved,
        stats: { total, unique: uniqueModelos, marcas: Object.keys(byBrand).length, by_brand: byBrand, by_user: byUser }
      })
    };

  } catch (e) {
    console.error('[frame-ocr] Error:', e);
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
