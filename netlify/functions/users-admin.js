// /.netlify/functions/users-admin.js
// Devuelve custom_users SOLO a admin/gerencia (validado del lado del servidor con service_role).
// Reemplaza la lectura directa de app_config.custom_users desde el frontend, para poder
// ocultar esa fila de la lectura pública (anon) vía RLS sin romper el panel de Equipo.
const SUPA_URL = process.env.SUPABASE_URL || 'https://icsnlgeereepesbrdjhf.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ALLOWED_ORIGIN = process.env.URL || 'https://optcaryera.netlify.app';

const BASE_USERS = process.env.AUTH_USERS_FULL ? JSON.parse(process.env.AUTH_USERS_FULL) : {
  'americas':{pass:'americas01',rol:'sucursal'},'pinocelli':{pass:'pinocelli01',rol:'sucursal'},
  'magnolia':{pass:'magnolia01',rol:'sucursal'},'vittoria':{pass:'vittoria01',rol:'sucursal'},
  'gerencia':{pass:'car2024ge',rol:'gerencia'},'admin':{pass:'car2024ad',rol:'admin'},
  'carera':{pass:'carera2024',rol:'admin'},'demo':{pass:'demo2024',rol:'admin'},
  'entrenador':{pass:'trainercarera',rol:'sucursal'},'laboratorio':{pass:'lab2024',rol:'laboratorio'},
};

async function getCustom() {
  try {
    const r = await fetch(SUPA_URL + '/rest/v1/app_config?id=eq.custom_users&select=value', {
      headers: { 'apikey': SERVICE_KEY, 'Authorization': 'Bearer ' + SERVICE_KEY }
    });
    if (!r.ok) return {};
    const d = await r.json();
    if (Array.isArray(d) && d[0] && d[0].value) { const v = d[0].value; return typeof v === 'string' ? JSON.parse(v) : v; }
  } catch (e) {}
  return {};
}

exports.handler = async (event) => {
  const H = { 'Access-Control-Allow-Origin': ALLOWED_ORIGIN, 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Content-Type': 'application/json' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: H, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: H, body: JSON.stringify({ error: 'Method not allowed' }) };
  if (!SERVICE_KEY) return { statusCode: 500, headers: H, body: JSON.stringify({ error: 'Falta SUPABASE_SERVICE_ROLE_KEY' }) };

  let body; try { body = JSON.parse(event.body); } catch { return { statusCode: 400, headers: H, body: JSON.stringify({ error: 'Invalid JSON' }) }; }
  const auth = body.auth || {};
  if (!auth.id || !auth.pass) return { statusCode: 401, headers: H, body: JSON.stringify({ error: 'Sin auth' }) };

  const custom = await getCustom();
  const all = {};
  Object.entries(BASE_USERS).forEach(([k, u]) => { all[k.toLowerCase()] = u; });
  Object.entries(custom).forEach(([k, u]) => { if (u) all[k.toLowerCase()] = { pass: u.pass, rol: u.rol || 'sucursal' }; });

  const me = all[String(auth.id).toLowerCase()];
  if (!me || String(me.pass) !== String(auth.pass)) return { statusCode: 401, headers: H, body: JSON.stringify({ error: 'Auth fallida' }) };
  if (!['admin', 'gerencia'].includes(me.rol)) return { statusCode: 403, headers: H, body: JSON.stringify({ error: 'Solo admin/gerencia' }) };

  return { statusCode: 200, headers: H, body: JSON.stringify({ ok: true, users: custom }) };
};
