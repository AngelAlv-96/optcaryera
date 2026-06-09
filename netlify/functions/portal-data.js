// /.netlify/functions/portal-data.js
// Lectura de la venta del PORTAL del paciente por su token_portal, usando service_role.
// Objetivo (Fase 3 de seguridad): el portal es una página PÚBLICA (sin login) que mostraba la venta
// leyendo `ventas` (con join a `pacientes`) directo con la publishable key. Al cerrar el SELECT público
// de ventas/pacientes vía RLS, esa lectura se rompería — esta función la sustituye.
// La AUTORIZACIÓN es la posesión del token_portal (igual que el modelo actual: el link contiene el token);
// service_role bypassa RLS, así que el portal sigue funcionando con ventas/pacientes ya cerrados a anon.
const SUPA_URL = process.env.SUPABASE_URL || 'https://icsnlgeereepesbrdjhf.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ALLOWED_ORIGIN = process.env.URL || 'https://optcaryera.netlify.app';

exports.handler = async (event) => {
  const H = {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: H, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: H, body: JSON.stringify({ ok: false, error: 'Method not allowed' }) };
  if (!SERVICE_KEY) return { statusCode: 500, headers: H, body: JSON.stringify({ ok: false, error: 'Falta SUPABASE_SERVICE_ROLE_KEY' }) };

  let body;
  try { body = JSON.parse(event.body); } catch { return { statusCode: 400, headers: H, body: JSON.stringify({ ok: false, error: 'Invalid JSON' }) }; }
  const token = (body.token || '').toString().trim();
  // El token_portal es alfanumérico corto (Math.random base36, ~10 chars). Validación defensiva.
  if (!token || !/^[A-Za-z0-9_-]{6,64}$/.test(token)) {
    return { statusCode: 400, headers: H, body: JSON.stringify({ ok: false, error: 'Token inválido' }) };
  }

  try {
    const url = SUPA_URL + '/rest/v1/ventas?token_portal=eq.' + encodeURIComponent(token)
      + '&select=*,pacientes(nombre,apellidos,telefono)&limit=1';
    const res = await fetch(url, { headers: { 'apikey': SERVICE_KEY, 'Authorization': 'Bearer ' + SERVICE_KEY } });
    if (!res.ok) {
      const t = await res.text();
      return { statusCode: 200, headers: H, body: JSON.stringify({ ok: false, error: 'DB error: ' + t.slice(0, 120) }) };
    }
    const rows = await res.json();
    const venta = Array.isArray(rows) && rows[0] ? rows[0] : null;
    if (!venta) return { statusCode: 200, headers: H, body: JSON.stringify({ ok: false, error: 'not_found' }) };
    return { statusCode: 200, headers: H, body: JSON.stringify({ ok: true, venta: venta }) };
  } catch (e) {
    return { statusCode: 500, headers: H, body: JSON.stringify({ ok: false, error: e.message || 'Server error' }) };
  }
};
