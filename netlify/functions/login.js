// /.netlify/functions/login.js
// Login del lado del SERVIDOR: valida usuario+contraseña contra BASE_USERS + custom_users
// (leído con service_role, NO con la llave pública). Devuelve el usuario SIN la contraseña.
// Objetivo: que el frontend ya NO necesite leer app_config.custom_users ni tener las
// contraseñas en el HTML público → cierra la exposición de credenciales (Fase 1 de seguridad).
const crypto = require('crypto');
const SUPA_URL = process.env.SUPABASE_URL || 'https://icsnlgeereepesbrdjhf.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ALLOWED_ORIGIN = process.env.URL || 'https://optcaryera.netlify.app';
// Secreto JWT del proyecto Supabase (HS256). Si NO está seteado, login.js devuelve token:null
// y el frontend sigue usando la publishable key (sin romper nada). Solo al setearlo + cerrar RLS
// (Fase 3 de seguridad) el JWT pasa a ser obligatorio para leer pacientes/historias/ventas.
const JWT_SECRET = process.env.SUPABASE_JWT_SECRET;

// ── Firmador JWT HS256 sin dependencias (Node crypto) ──
function _b64url(input) {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function signJWT(payload, secret) {
  const header = _b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = _b64url(JSON.stringify(payload));
  const data = header + '.' + body;
  const sig = crypto.createHmac('sha256', secret).update(data).digest();
  return data + '.' + _b64url(sig);
}
// Mintea un token de "lectura autenticada" (role=authenticated) válido 30 días.
// PostgREST lo valida contra el JWT_SECRET y hace SET ROLE authenticated → RLS lo distingue de anon.
function mintReadToken(id, user) {
  if (!JWT_SECRET) return null;
  const nowSec = Math.floor(Date.now() / 1000);
  return signJWT({
    role: 'authenticated',
    aud: 'authenticated',
    sub: 'ce_' + id,
    ce_rol: user.rol || 'sucursal',
    iat: nowSec,
    exp: nowSec + 60 * 60 * 24 * 30
  }, JWT_SECRET);
}

// Usuarios base (fallback si no están en custom_users). Igual que el USUARIOS del frontend.
const BASE_USERS = process.env.AUTH_USERS_FULL ? JSON.parse(process.env.AUTH_USERS_FULL) : {
  'americas':    { pass:'americas01',  nombre:'Américas',     rol:'sucursal', sucursal:'Américas' },
  'pinocelli':   { pass:'pinocelli01', nombre:'Pinocelli',    rol:'sucursal', sucursal:'Pinocelli' },
  'magnolia':    { pass:'magnolia01',  nombre:'Magnolia',     rol:'sucursal', sucursal:'Magnolia' },
  'vittoria':    { pass:'vittoria01',  nombre:'Plaza Vía Vittoria', rol:'sucursal', sucursal:'Plaza Vía Vittoria' },
  'gerencia':    { pass:'car2024ge',   nombre:'Gerencia',       rol:'gerencia', sucursal:'Todas' },
  'admin':       { pass:'car2024ad',   nombre:'Administrador',  rol:'admin',    sucursal:'Todas' },
  'carera':      { pass:'carera2024',  nombre:'Administrador',  rol:'admin',    sucursal:'Todas' },
  'demo':        { pass:'demo2024',    nombre:'Demo (Pruebas)', rol:'admin',    sucursal:'Todas' },
  'entrenador':  { pass:'trainercarera', nombre:'Entrenador',   rol:'sucursal', sucursal:'Todas' },
  'laboratorio': { pass:'lab2024',     nombre:'Laboratorio',    rol:'laboratorio', sucursal:'Todas' },
};

async function getCustomUsers() {
  try {
    const res = await fetch(SUPA_URL + '/rest/v1/app_config?id=eq.custom_users&select=value', {
      headers: { 'apikey': SERVICE_KEY, 'Authorization': 'Bearer ' + SERVICE_KEY }
    });
    if (!res.ok) return {};
    const data = await res.json();
    if (Array.isArray(data) && data[0] && data[0].value) {
      const v = data[0].value;
      return typeof v === 'string' ? JSON.parse(v) : v;
    }
  } catch (e) { /* sin custom users */ }
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

  const id = (body.user || body.id || '').toString().trim().toLowerCase();
  const pass = (body.pass || body.password || '').toString();
  if (!id || !pass) return { statusCode: 400, headers: H, body: JSON.stringify({ ok: false, error: 'Faltan credenciales' }) };

  const custom = await getCustomUsers();
  const allUsers = {};
  Object.entries(BASE_USERS).forEach(([uid, u]) => { allUsers[uid.toLowerCase()] = u; });
  Object.entries(custom).forEach(([uid, u]) => { if (u) allUsers[uid.toLowerCase()] = u; }); // custom override

  const user = allUsers[id];
  if (!user || String(user.pass) !== String(pass)) {
    return { statusCode: 401, headers: H, body: JSON.stringify({ ok: false, error: 'Usuario o contraseña incorrectos' }) };
  }
  // Devolver el usuario SIN la contraseña (el frontend re-adjunta la tecleada para auth de dbwrite).
  const safeUser = {};
  Object.keys(user).forEach(function(k){ if (k !== 'pass') safeUser[k] = user[k]; });
  const token = mintReadToken(id, user); // JWT de lectura (null si falta SUPABASE_JWT_SECRET)
  return { statusCode: 200, headers: H, body: JSON.stringify({ ok: true, user: Object.assign({ id: id }, safeUser), token: token }) };
};
