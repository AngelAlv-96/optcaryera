// netlify/functions/am-sync.js
// Endpoint público para sincronización de sesiones Alta Masiva (cam.html)
// No requiere auth de usuario — valida session_id existente en BD

const SUPA_URL = process.env.SUPABASE_URL || 'https://icsnlgeereepesbrdjhf.supabase.co';
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const H = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Content-Type': 'application/json'
};

async function supaREST(method, path, body) {
  const opts = {
    method,
    headers: {
      'apikey': SUPA_KEY,
      'Authorization': 'Bearer ' + SUPA_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    }
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${SUPA_URL}/rest/v1/${path}`, opts);
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch(e) { data = text; }
  return { ok: res.ok, status: res.status, data };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: H, body: '' };

  try {
    const body = JSON.parse(event.body || '{}');
    const { action, sesion_id, rows_json, estado } = body;

    if (!sesion_id) return { statusCode: 400, headers: H, body: JSON.stringify({ error: 'sesion_id requerido' }) };

    // Validate session exists
    const check = await supaREST('GET', `am_sesiones?id=eq.${sesion_id}&select=id,estado`);
    if (!check.ok || !check.data || !check.data.length) {
      return { statusCode: 404, headers: H, body: JSON.stringify({ error: 'Sesión no encontrada o expirada' }) };
    }
    const sesion = check.data[0];
    if (sesion.estado === 'cerrada') {
      return { statusCode: 410, headers: H, body: JSON.stringify({ error: 'Sesión cerrada' }) };
    }

    if (action === 'push_row') {
      // Read current rows
      const current = await supaREST('GET', `am_sesiones?id=eq.${sesion_id}&select=rows_json`);
      let existing = [];
      if (current.ok && current.data && current.data[0]) {
        try { existing = JSON.parse(current.data[0].rows_json || '[]'); } catch(e) {}
      }

      // Append new row
      const newRow = body.row;
      if (!newRow || !newRow.marca) return { statusCode: 400, headers: H, body: JSON.stringify({ error: 'row.marca requerido' }) };

      // Dedup by modelo
      const dup = existing.some(r => (r.modelo||'').toLowerCase() === (newRow.modelo||'').toLowerCase());
      if (dup) return { statusCode: 200, headers: H, body: JSON.stringify({ ok: true, dup: true }) };

      existing.push(newRow);

      const upd = await supaREST('PATCH', `am_sesiones?id=eq.${sesion_id}`, {
        rows_json: JSON.stringify(existing),
        updated_at: new Date().toISOString()
      });
      if (!upd.ok) return { statusCode: 500, headers: H, body: JSON.stringify({ error: 'Error escribiendo sesión' }) };
      return { statusCode: 200, headers: H, body: JSON.stringify({ ok: true, total: existing.length }) };
    }

    if (action === 'close') {
      await supaREST('PATCH', `am_sesiones?id=eq.${sesion_id}`, {
        estado: 'cerrada',
        updated_at: new Date().toISOString()
      });
      return { statusCode: 200, headers: H, body: JSON.stringify({ ok: true }) };
    }

    if (action === 'set_marcas') {
      const marcas = body.marcas || [];
      await supaREST('PATCH', `am_sesiones?id=eq.${sesion_id}`, {
        marcas_json: JSON.stringify(marcas),
        updated_at: new Date().toISOString()
      });
      return { statusCode: 200, headers: H, body: JSON.stringify({ ok: true }) };
    }

    if (action === 'poll') {
      // Desktop polls: returns rows + updated_at
      const res = await supaREST('GET', `am_sesiones?id=eq.${sesion_id}&select=rows_json,updated_at,estado,marcas_json`);
      if (!res.ok || !res.data || !res.data.length) return { statusCode: 404, headers: H, body: JSON.stringify({ error: 'No encontrado' }) };
      return { statusCode: 200, headers: H, body: JSON.stringify(res.data[0]) };
    }

    return { statusCode: 400, headers: H, body: JSON.stringify({ error: 'action inválido' }) };

  } catch(e) {
    return { statusCode: 500, headers: H, body: JSON.stringify({ error: e.message }) };
  }
};
