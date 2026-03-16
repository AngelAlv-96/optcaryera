// /.netlify/functions/dbwrite.js
// Secure write proxy — validates user auth, then executes DB writes
// Uses service_role key via REST API (no npm dependencies)

const SUPA_URL = process.env.SUPABASE_URL || 'https://icsnlgeereepesbrdjhf.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Base users (mirrors frontend — custom users fetched from DB)
const BASE_USERS = {
  'americas':  { pass: 'americas01',  rol: 'sucursal' },
  'pinocelli': { pass: 'pinocelli01', rol: 'sucursal' },
  'magnolia':  { pass: 'magnolia01',  rol: 'sucursal' },
  'gerencia':  { pass: 'car2024ge',   rol: 'gerencia' },
  'admin':     { pass: 'car2024ad',   rol: 'admin' },
  'carera':    { pass: 'carera2024',  rol: 'admin' },
  'laboratorio': { pass: 'lab2024', rol: 'laboratorio' },
};

const ALLOWED_TABLES = [
  'pacientes','historias_clinicas','ordenes_laboratorio','citas',
  'app_config','productos','ventas','venta_items','venta_pagos',
  'monedero','vision_segura','vision_segura_eventos','protecciones_vs',
  'promociones','venta_promociones','cortes_caja','retiros_caja',
  'creditos_clientes','creditos_abonos','clari_conversations','landing_pages',
  'autorizaciones','lc_seguimiento','am_sesiones',
  'config_precios','lotes_compra','proveedores',
  'compras_lab','precios_materiales','proveedores_lab',
  'mapeo_materiales','catalogo_tienda','reglas_materiales'
];

async function supaREST(method, path, body, extraHeaders) {
  const headers = {
    'apikey': SERVICE_KEY,
    'Authorization': `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json'
  };
  if (extraHeaders) {
    Object.entries(extraHeaders).forEach(([k,v]) => { if (v) headers[k] = v; });
  }
  const opts = { method, headers };
  if (body && (method === 'POST' || method === 'PATCH' || method === 'PUT')) {
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(`${SUPA_URL}/rest/v1/${path}`, opts);
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) {
    const errMsg = typeof data === 'object' ? (data.message || data.error || JSON.stringify(data)) : text;
    return { data: null, error: errMsg };
  }
  return { data, error: null };
}

function buildFilterString(filters) {
  if (!filters || !filters.length) return '';
  return filters.map(f => {
    const v = (f.val === null || f.val === undefined) ? 'null' : f.val;
    if (f.op === 'eq') return `${f.col}=eq.${v}`;
    if (f.op === 'neq') return `${f.col}=neq.${v}`;
    return '';
  }).filter(Boolean).join('&');
}

async function getCustomUsers() {
  try {
    const { data } = await supaREST('GET', 'app_config?id=eq.custom_users&select=value', null, {});
    if (data && data[0] && data[0].value) {
      const v = data[0].value;
      return typeof v === 'string' ? JSON.parse(v) : v;
    }
  } catch (e) { /* no custom users */ }
  return {};
}

exports.handler = async (event) => {
  const H = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: H, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: H, body: JSON.stringify({ error: 'Method not allowed' }) };
  if (!SERVICE_KEY) return { statusCode: 500, headers: H, body: JSON.stringify({ error: 'Configura SUPABASE_SERVICE_ROLE_KEY en Netlify Environment Variables' }) };

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, headers: H, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const { table, action, data, filters, options, auth } = body;

  // ── Validate request ──
  if (!table || !action || !auth || !auth.id || !auth.pass)
    return { statusCode: 400, headers: H, body: JSON.stringify({ error: 'Missing required fields (table, action, auth)' }) };
  if (!['insert','update','delete','upsert'].includes(action))
    return { statusCode: 400, headers: H, body: JSON.stringify({ error: 'Invalid action: ' + action }) };
  if (!ALLOWED_TABLES.includes(table))
    return { statusCode: 403, headers: H, body: JSON.stringify({ error: 'Table not allowed: ' + table }) };

  // ── Authenticate user ──
  const custom = await getCustomUsers();
  const allUsers = { ...BASE_USERS };
  Object.entries(custom).forEach(([uid, u]) => {
    if (u && u.pass) allUsers[uid] = { pass: u.pass, rol: u.rol || 'sucursal' };
  });
  const user = allUsers[auth.id];
  if (!user || user.pass !== auth.pass)
    return { statusCode: 401, headers: H, body: JSON.stringify({ error: 'Autenticación fallida' }) };

  // ── Execute write operation ──
  try {
    let result;
    const filterStr = buildFilterString(filters);
    const prefer = [];

    switch (action) {
      case 'insert': {
        if (options && options.select) prefer.push('return=representation');
        result = await supaREST('POST', table, data, { 'Prefer': prefer.join(',') });
        if (options && options.single && Array.isArray(result.data)) result.data = result.data[0] || null;
        break;
      }
      case 'update': {
        if (options && options.select) prefer.push('return=representation');
        const path = filterStr ? `${table}?${filterStr}` : table;
        result = await supaREST('PATCH', path, data, { 'Prefer': prefer.join(',') });
        if (options && options.single && Array.isArray(result.data)) result.data = result.data[0] || null;
        break;
      }
      case 'delete': {
        const path = filterStr ? `${table}?${filterStr}` : table;
        result = await supaREST('DELETE', path, null, {});
        break;
      }
      case 'upsert': {
        prefer.push('resolution=merge-duplicates');
        if (options && options.select) prefer.push('return=representation');
        let path = table;
        if (options && options.onConflict) path += `?on_conflict=${options.onConflict}`;
        result = await supaREST('POST', path, data, { 'Prefer': prefer.join(',') });
        if (options && options.single && Array.isArray(result.data)) result.data = result.data[0] || null;
        break;
      }
      default:
        return { statusCode: 400, headers: H, body: JSON.stringify({ error: 'Unknown action' }) };
    }

    return { statusCode: 200, headers: H, body: JSON.stringify(result) };
  } catch (e) {
    return { statusCode: 500, headers: H, body: JSON.stringify({ error: e.message || 'Server error' }) };
  }
};
