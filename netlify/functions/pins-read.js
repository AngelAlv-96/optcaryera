// /.netlify/functions/pins-read.js
// Devuelve `empleados_pins` (hashes SHA-256 de los PIN de cobro de sobre) SOLO a un usuario autenticado.
// Fase 3 de seguridad: antes el frontend (Mi Sobre) leía app_config.empleados_pins directo con la
// publishable key → cualquiera con esa llave podía bajar los hashes y brute-forcear PINs de 4 dígitos.
// Al ocultar empleados_pins de anon vía RLS, esta función (service_role) sirve los hashes solo tras
// validar usuario+contraseña (mismo modelo que dbwrite). Las ESCRITURAS de PIN ya van por dbwrite.
const SUPA_URL = process.env.SUPABASE_URL || 'https://icsnlgeereepesbrdjhf.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ALLOWED_ORIGIN = process.env.URL || 'https://optcaryera.netlify.app';

const BASE_USERS = process.env.AUTH_USERS ? JSON.parse(process.env.AUTH_USERS) : {
  'americas':  { pass: 'americas01',  rol: 'sucursal' },
  'pinocelli': { pass: 'pinocelli01', rol: 'sucursal' },
  'magnolia':  { pass: 'magnolia01',  rol: 'sucursal' },
  'vittoria':  { pass: 'vittoria01',  rol: 'sucursal' },
  'gerencia':  { pass: 'car2024ge',   rol: 'gerencia' },
  'admin':     { pass: 'car2024ad',   rol: 'admin' },
  'carera':    { pass: 'carera2024',  rol: 'admin' },
  'laboratorio': { pass: 'lab2024', rol: 'laboratorio' },
};

async function supaGET(path) {
  const res = await fetch(SUPA_URL + '/rest/v1/' + path, {
    headers: { 'apikey': SERVICE_KEY, 'Authorization': 'Bearer ' + SERVICE_KEY }
  });
  if (!res.ok) return null;
  return res.json().catch(function(){ return null; });
}

async function getCustomUsers() {
  try {
    const data = await supaGET('app_config?id=eq.custom_users&select=value');
    if (data && data[0] && data[0].value) {
      const v = data[0].value;
      return typeof v === 'string' ? JSON.parse(v) : v;
    }
  } catch (e) { /* no custom users */ }
  return {};
}

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
  const auth = body.auth || {};
  if (!auth.id || !auth.pass) return { statusCode: 400, headers: H, body: JSON.stringify({ ok: false, error: 'Faltan credenciales' }) };

  // ── Autenticar usuario (mismo modelo que dbwrite) ──
  const custom = await getCustomUsers();
  const allUsers = { ...BASE_USERS };
  Object.entries(custom).forEach(([uid, u]) => { if (u && u.pass) allUsers[uid] = { pass: u.pass, rol: u.rol || 'sucursal' }; });
  const user = allUsers[auth.id];
  if (!user || user.pass !== auth.pass) {
    return { statusCode: 401, headers: H, body: JSON.stringify({ ok: false, error: 'Autenticación fallida' }) };
  }

  try {
    const data = await supaGET('app_config?id=eq.empleados_pins&select=value');
    let pins = {};
    if (data && data[0] && data[0].value) {
      const v = data[0].value;
      pins = typeof v === 'string' ? JSON.parse(v) : v;
    }
    return { statusCode: 200, headers: H, body: JSON.stringify({ ok: true, pins: pins }) };
  } catch (e) {
    return { statusCode: 500, headers: H, body: JSON.stringify({ ok: false, error: e.message || 'Server error' }) };
  }
};
