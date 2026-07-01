// /.netlify/functions/cupon-generar.js
// Genera cupones personalizados (código único por persona) para una campaña.
// Auth admin/gerencia. Body:
//   { campana, beneficio_tipo, beneficio_valor, descripcion, vigencia, prefijo,
//     recipients:[{telefono,nombre}], auth:{id,pass} }
// beneficio_tipo: solar_gratis | kit_gratis | desc_pct | desc_monto
// Devuelve { ok, creados:[{telefono,nombre,codigo}], omitidos:[{telefono,motivo}] }
// - Un cupón por teléfono POR CAMPAÑA (dedup): si ya existe, se omite (no duplica).
// - El código lleva PREFIJO + 4 hex aleatorios (ej. SOLAR-4F9A). Reintenta si choca.

const SUPA_URL = process.env.SUPABASE_URL || 'https://icsnlgeereepesbrdjhf.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const BASE_USERS = process.env.AUTH_USERS ? JSON.parse(process.env.AUTH_USERS) : {
  'gerencia': { pass: 'car2024ge', rol: 'gerencia' },
  'admin':    { pass: 'car2024ad', rol: 'admin' },
  'carera':   { pass: 'carera2024', rol: 'admin' },
};

const TIPOS = ['solar_gratis','kit_gratis','desc_pct','desc_monto'];

async function supa(method, path, body) {
  const headers = { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=representation' };
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${SUPA_URL}/rest/v1/${path}`, opts);
  const text = await res.text();
  let data = null; try { data = JSON.parse(text); } catch { data = text; }
  return { ok: res.ok, status: res.status, data };
}

async function getCustomUsers() {
  try {
    const { data } = await supa('GET', 'app_config?id=eq.custom_users&select=value');
    if (data && data[0] && data[0].value) { const v = data[0].value; return typeof v === 'string' ? JSON.parse(v) : v; }
  } catch (e) {}
  return {};
}

function norm10(t) { const d = String(t||'').replace(/\D/g,''); return d.slice(-10); }
function randCode(prefijo) {
  const hex = Math.floor(Math.random()*0x10000).toString(16).toUpperCase().padStart(4,'0');
  return (prefijo ? prefijo.toUpperCase().replace(/[^A-Z0-9]/g,'') + '-' : '') + hex;
}

exports.handler = async (event) => {
  const H = { 'Content-Type': 'application/json' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: H, body: JSON.stringify({ error: 'POST only' }) };
  if (!SERVICE_KEY) return { statusCode: 500, headers: H, body: JSON.stringify({ error: 'Falta SUPABASE_SERVICE_ROLE_KEY' }) };

  let b; try { b = JSON.parse(event.body); } catch { return { statusCode: 400, headers: H, body: JSON.stringify({ error: 'JSON inválido' }) }; }
  const { campana, beneficio_tipo, beneficio_valor, descripcion, vigencia, prefijo, recipients, auth } = b;

  // Auth admin/gerencia
  if (!auth || !auth.id || !auth.pass) return { statusCode: 401, headers: H, body: JSON.stringify({ error: 'Falta auth' }) };
  const custom = await getCustomUsers();
  const users = { ...BASE_USERS };
  Object.entries(custom).forEach(([uid,u]) => { if (u && u.pass) users[uid] = { pass: u.pass, rol: u.rol || 'sucursal' }; });
  const user = users[auth.id];
  if (!user || user.pass !== auth.pass) return { statusCode: 401, headers: H, body: JSON.stringify({ error: 'Autenticación fallida' }) };
  if (!['admin','gerencia'].includes(user.rol)) return { statusCode: 403, headers: H, body: JSON.stringify({ error: 'Solo admin/gerencia' }) };

  // Validación
  if (!campana || !beneficio_tipo || !Array.isArray(recipients) || !recipients.length)
    return { statusCode: 400, headers: H, body: JSON.stringify({ error: 'Faltan campana / beneficio_tipo / recipients[]' }) };
  if (!TIPOS.includes(beneficio_tipo))
    return { statusCode: 400, headers: H, body: JSON.stringify({ error: 'beneficio_tipo inválido: ' + TIPOS.join(', ') }) };

  // Cupones ya existentes de esta campaña (dedup por teléfono)
  const existRes = await supa('GET', `cupones?campana=eq.${encodeURIComponent(campana)}&select=telefono`);
  const yaTiene = new Set((existRes.data || []).map(r => norm10(r.telefono)));

  const creados = [], omitidos = [];
  for (const r of recipients) {
    const tel10 = norm10(r.telefono);
    if (tel10.length !== 10) { omitidos.push({ telefono: r.telefono, motivo: 'teléfono inválido' }); continue; }
    if (yaTiene.has(tel10)) { omitidos.push({ telefono: r.telefono, motivo: 'ya tiene cupón en esta campaña' }); continue; }

    // Genera código único (reintenta ante colisión)
    let codigo = null;
    for (let attempt = 0; attempt < 6; attempt++) {
      const cand = randCode(prefijo || campana);
      const chk = await supa('GET', `cupones?codigo=eq.${encodeURIComponent(cand)}&select=id&limit=1`);
      if (chk.ok && Array.isArray(chk.data) && chk.data.length === 0) { codigo = cand; break; }
    }
    if (!codigo) { omitidos.push({ telefono: r.telefono, motivo: 'no se pudo generar código único' }); continue; }

    const ins = await supa('POST', 'cupones', {
      codigo, campana,
      beneficio_tipo,
      beneficio_valor: (beneficio_valor === undefined || beneficio_valor === null) ? null : Number(beneficio_valor),
      descripcion: descripcion || null,
      telefono: tel10,
      nombre: r.nombre || null,
      vigencia: vigencia || null,
      usado: false
    });
    if (ins.ok && Array.isArray(ins.data) && ins.data[0]) {
      yaTiene.add(tel10);
      creados.push({ telefono: tel10, nombre: r.nombre || null, codigo });
    } else {
      omitidos.push({ telefono: r.telefono, motivo: 'error DB: ' + (ins.data && (ins.data.message || JSON.stringify(ins.data))) });
    }
  }

  return { statusCode: 200, headers: H, body: JSON.stringify({ ok: true, campana, creados_n: creados.length, omitidos_n: omitidos.length, creados, omitidos }) };
};
