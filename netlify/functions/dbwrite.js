// /.netlify/functions/dbwrite.js
// Secure write proxy — validates user auth, then executes DB writes
// Uses service_role key via REST API (no npm dependencies)

const SUPA_URL = process.env.SUPABASE_URL || 'https://icsnlgeereepesbrdjhf.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ALLOWED_ORIGIN = process.env.URL || 'https://optcaryera.netlify.app';

// Base users — prefer AUTH_USERS env var (JSON), fallback to hardcoded for backward compat
const BASE_USERS = process.env.AUTH_USERS ? JSON.parse(process.env.AUTH_USERS) : {
  'americas':  { pass: 'americas01',  rol: 'sucursal' },
  'pinocelli': { pass: 'pinocelli01', rol: 'sucursal' },
  'magnolia':  { pass: 'magnolia01',  rol: 'sucursal' },
  'vittoria':  { pass: 'vittoria01',  rol: 'sucursal' },
  'gerencia':  { pass: 'car2024ge',   rol: 'gerencia' },
  'admin':     { pass: 'car2024ad',   rol: 'admin' },
  'carera':    { pass: 'carera2024',  rol: 'admin' },
  'laboratorio': { pass: 'lab2024', rol: 'laboratorio' },
  'tienda':      { pass: 'tienda2024', rol: 'sucursal' },
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
  'mapeo_materiales','catalogo_tienda','reglas_materiales',
  'asistencia','asistencia_firmas','gastos','facturas',
  'inventario_auditorias','review_queue',
  'compra_sesiones','compra_scans',
  'precio_cambios',
  'comisiones_pagadas','cumple_canjes',
  'empresas_convenio','convenio_usos','convenio_empleados',
  'descuentos_rescate','cupones'
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

function isValidColumn(col) {
  return typeof col === 'string' && /^[a-zA-Z_][a-zA-Z0-9_]{0,63}$/.test(col);
}

function buildFilterString(filters) {
  if (!filters || !filters.length) return '';
  return filters.map(f => {
    if (!isValidColumn(f.col)) return '';
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

// ── Actas de falta sin firmar de un asesor (espejo de _msActasSinFirmar del index) ──
// ⚠️ La MISMA persona puede vivir con DOS identificadores: el calculado del nombre
// (`asesor_<nombre>`) y el del checador (`extra_<nombre completo>`), a veces con el nombre
// escrito distinto (Monserrat / Monserrath, Edna Karina / Edna Karina ... Garcia). Si solo se
// busca por el uid calculado, el acta de quien se dio de alta primero como empleado NO se
// encuentra — que es justo a quien hay que atrapar (lección v574).
function normNombre(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\b(lic|tec|dr|dra|sr|sra)\.?\b/g, '').replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/).filter(t => t.length >= 3);
}

async function uidsDeAsesor(nombre) {
  const uids = ['asesor_' + String(nombre || '').toLowerCase().replace(/\s+/g, '_')];
  try {
    const { data } = await supaREST('GET', 'app_config?id=eq.horarios_asistencia&select=value', null, {});
    const raw = data && data[0] && data[0].value;
    const Hor = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : {};
    const extras = Hor.empleados_extra || {};
    const tk = normNombre(nombre);
    if (tk.length >= 2) {
      Object.keys(extras).forEach(uid => {
        const et = normNombre((extras[uid] && extras[uid].nombre) || '');
        const todos = tk.every(t => et.some(e => e === t || e.indexOf(t) === 0 || t.indexOf(e) === 0));
        if (todos && uids.indexOf(uid) < 0) uids.push(uid);
      });
    }
  } catch (e) { /* se queda con el uid calculado */ }
  return uids;
}

// Nombres de asesor válidos HOY (sucursales + globales, menos los pausados).
// Devuelve [] si no se puede leer la config, para no bloquear por un problema de la base.
async function asesoresVigentes() {
  try {
    const { data } = await supaREST('GET', 'app_config?id=eq.asesores&select=value', null, {});
    const raw = data && data[0] && data[0].value;
    const c = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : {};
    const inact = c.inactivos || [];
    const todos = [].concat(...Object.values(c.sucursales || {}), c.globales || []);
    return todos.filter(n => !inact.includes(n));
  } catch (e) { return []; }
}

async function actasSinFirmar(asesorNombre) {
  if (!asesorNombre) return [];
  const uids = await uidsDeAsesor(asesorNombre);
  const lista = uids.map(u => '"' + u + '"').join(',');
  const { data } = await supaREST('GET',
    'asistencia_firmas?uid=in.(' + lista + ')&firmado_at=is.null&select=id,uid,tipo,periodo_inicio,periodo_fin', null, {});
  const pend = data || [];
  const actas = [];
  for (const f of pend) {
    let faltas = [];
    // ⚠️ El flujo automático del checador guarda el acta SIN escribir `tipo`, así que un
    // registro sin tipo cuenta como acta si dentro de su periodo hay una falta real.
    if (f.tipo === 'acta' || !f.tipo) {
      const r = await supaREST('GET',
        'asistencia?uid=eq.' + encodeURIComponent(f.uid) + '&es_falta=is.true' +
        '&fecha=gte.' + f.periodo_inicio + '&fecha=lte.' + f.periodo_fin + '&select=fecha&order=fecha', null, {});
      faltas = (r.data || []).map(x => x.fecha);
    }
    if (f.tipo === 'acta' || (!f.tipo && faltas.length)) {
      actas.push({ id: f.id, inicio: f.periodo_inicio, fin: f.periodo_fin, faltas });
    }
  }
  return actas;
}

// ── Cuánto le toca REALMENTE a un asesor en ese periodo ──
// Espejo de _msCalcComisionAsesor (index.html). Se recalcula en el servidor porque el
// navegador manda el monto ya calculado: el 17-ago dos asesoras cobraron $860 con una
// pestaña vieja cuando les tocaban $840 y $810.
// Devuelve null si no se puede calcular (entonces NO se bloquea nada).
const diaLocal = (ts) => new Date(ts).toLocaleDateString('en-CA', { timeZone: 'America/Chihuahua' });
const redondear5 = (x) => Math.round((Number(x) || 0) / 5) * 5;

async function comisionEsperada(suc, periodo, asesor) {
  const m0 = String(periodo || '').split('-');
  if (m0.length < 3) return null;
  const y = parseInt(m0[0], 10), mes = parseInt(m0[1], 10), q = m0[2];
  if (!y || !mes) return null;
  const ultimo = new Date(y, mes, 0).getDate();
  const mm = String(mes).padStart(2, '0');
  const desde = q === 'Q1' ? `${y}-${mm}-01` : `${y}-${mm}-16`;
  const hasta = q === 'Q1' ? `${y}-${mm}-15` : `${y}-${mm}-${ultimo}`;
  const ini = new Date(desde + 'T00:00:00-06:00').toISOString();
  const fin = new Date(hasta + 'T23:59:59.999-06:00').toISOString();

  const { data: cfgRow } = await supaREST('GET', 'app_config?id=eq.asesores&select=value', null, {});
  const rawCfg = cfgRow && cfgRow[0] && cfgRow[0].value;
  if (!rawCfg) return null;
  const cfg = typeof rawCfg === 'string' ? JSON.parse(rawCfg) : rawCfg;
  const activos = ((cfg.sucursales || {})[suc] || []).filter(n => !(cfg.inactivos || []).includes(n));
  const divisor = (cfg.divisores || {})[suc] || activos.length;
  if (!divisor) return null;
  const pct = (cfg.comisiones || {})[asesor] !== undefined ? (cfg.comisiones || {})[asesor] : (cfg.comision_default || 2);
  const fIni = (cfg.fecha_inicio || {})[asesor];
  const fIniMs = fIni ? new Date(fIni + 'T00:00:00-06:00').getTime() : 0;

  // Bolsa de la sucursal: pagos + abonos, sin canceladas y sin lo marcado "no comisiona"
  const { data: pagos } = await supaREST('GET',
    'venta_pagos?created_at=gte.' + ini + '&created_at=lte.' + fin +
    '&select=monto,created_at,ventas(sucursal,estado,excluir_comision)&limit=5000', null, {});
  const { data: abonos } = await supaREST('GET',
    'creditos_abonos?created_at=gte.' + ini + '&created_at=lte.' + fin +
    '&sucursal=eq.' + encodeURIComponent(suc) + '&select=monto,created_at&limit=5000', null, {});

  // Sus días de falta/incapacidad — resolviendo TODOS sus uids (asesor_ y extra_)
  const uids = await uidsDeAsesor(asesor);
  const { data: asis } = await supaREST('GET',
    'asistencia?uid=in.(' + uids.map(u => '"' + u + '"').join(',') + ')' +
    '&fecha=gte.' + desde + '&fecha=lte.' + hasta + '&select=fecha,es_falta,nota&limit=200', null, {});
  const malos = {};
  (asis || []).forEach(r => { if (r.es_falta === true || /incapacidad/i.test(r.nota || '')) malos[r.fecha] = true; });

  const suma = (arr, ok) => (arr || []).reduce((s, r) => {
    if (!ok(r)) return s;
    if (fIniMs && new Date(r.created_at).getTime() < fIniMs) return s;
    if (malos[diaLocal(r.created_at)]) return s;
    return s + Number(r.monto || 0);
  }, 0);

  const ingreso =
    suma(pagos, p => p.ventas && p.ventas.sucursal === suc && p.ventas.estado !== 'Cancelada' && !p.ventas.excluir_comision) +
    suma(abonos, () => true);

  return { comision: redondear5((ingreso / divisor) * (pct / 100)), ingreso, divisor, pct, diasMalos: Object.keys(malos) };
}

// Aviso al dueño cuando alguien intenta cobrar de más (fail-soft: nunca tumba la operación)
async function avisarIntentoCobro(texto) {
  try {
    const SID = process.env.TWILIO_ACCOUNT_SID, TOK = process.env.TWILIO_AUTH_TOKEN, WA = process.env.TWILIO_WA_NUMBER;
    if (!SID || !TOK || !WA) return;
    const { data } = await supaREST('GET', 'app_config?id=eq.whatsapp_config&select=value', null, {});
    const wc = data && data[0] ? JSON.parse(data[0].value) : {};
    const phones = wc.auth_phones || [];
    const from = WA.startsWith('whatsapp:') ? WA : 'whatsapp:' + WA;
    const auth = 'Basic ' + Buffer.from(SID + ':' + TOK).toString('base64');
    for (const ph of phones) {
      const p = new URLSearchParams();
      p.append('From', from);
      p.append('To', 'whatsapp:+' + ph);
      p.append('Body', texto);
      await fetch('https://api.twilio.com/2010-04-01/Accounts/' + SID + '/Messages.json', {
        method: 'POST', headers: { Authorization: auth, 'Content-Type': 'application/x-www-form-urlencoded' }, body: p.toString()
      });
    }
  } catch (e) { console.warn('[dbwrite] aviso cobro:', e.message); }
}

exports.handler = async (event) => {
  const H = {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
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
  if (!['insert','update','delete','upsert','read'].includes(action))
    return { statusCode: 400, headers: H, body: JSON.stringify({ error: 'Invalid action: ' + action }) };
  if (!ALLOWED_TABLES.includes(table))
    return { statusCode: 403, headers: H, body: JSON.stringify({ error: 'Table not allowed: ' + table }) };

  // ── Token-based auth for asistencia_firmas (public signature page) ──
  if (auth.id === 'firma_token' && table === 'asistencia_firmas' && (action === 'update' || action === 'read')) {
    // Validate token exists
    const check = await supaREST('GET', `asistencia_firmas?token=eq.${auth.pass}&select=*`, null, {});
    const rec = check.data && check.data[0];
    if (!rec) return { statusCode: 401, headers: H, body: JSON.stringify({ error: 'Token no encontrado' }) };

    // For read action, return the firma record directly (bypasses RLS)
    if (action === 'read') {
      return { statusCode: 200, headers: H, body: JSON.stringify({ data: rec, error: null }) };
    }

    // For update, validate not already signed and not expired
    if (rec.firmado_at) return { statusCode: 400, headers: H, body: JSON.stringify({ error: 'Ya firmado' }) };
    if (rec.token_expires && new Date(rec.token_expires) < new Date()) return { statusCode: 401, headers: H, body: JSON.stringify({ error: 'Token expirado' }) };
    // Auth OK — proceed with update (skip normal user auth below)

  // ── Token-based auth for portal factura requests ──
  } else if (auth.id === 'portal_factura' && (table === 'facturas' || table === 'pacientes')) {
    // Validate portal token exists in ventas
    const check = await supaREST('GET', `ventas?token_portal=eq.${auth.pass}&select=id,folio,paciente_id`, null, {});
    const venta = check.data && check.data[0];
    if (!venta) return { statusCode: 401, headers: H, body: JSON.stringify({ error: 'Token de portal no válido' }) };
    // Only allow: insert into facturas OR update datos_fiscales on the linked paciente
    if (table === 'facturas' && action !== 'insert')
      return { statusCode: 403, headers: H, body: JSON.stringify({ error: 'Solo se permite crear solicitudes' }) };
    if (table === 'pacientes' && action !== 'update')
      return { statusCode: 403, headers: H, body: JSON.stringify({ error: 'Solo se permite actualizar datos fiscales' }) };
    // Auth OK — proceed (skip normal user auth below)

  } else {
  // ── Authenticate user ──
  const custom = await getCustomUsers();
  const allUsers = { ...BASE_USERS };
  Object.entries(custom).forEach(([uid, u]) => {
    if (u && u.pass) allUsers[uid] = { pass: u.pass, rol: u.rol || 'sucursal' };
  });
  const user = allUsers[auth.id];
  if (!user || user.pass !== auth.pass)
    return { statusCode: 401, headers: H, body: JSON.stringify({ error: 'Autenticación fallida' }) };
  }

  // ── Candado del sobre: no se cobra con actas de falta SIN FIRMAR ──
  // El bloqueo del v574 vive en index.html, y el 17-ago se lo saltaron dos asesoras: sus
  // navegadores tenían la página cargada de la mañana (antes del deploy de las 10:18) y
  // nunca le dieron a "Actualizar". Se comprobó porque el sobre de Elva quedó grabado con
  // su nombre VIEJO, que ya no existía en la base a esa hora. Cualquier regla que solo viva
  // en el navegador se salta así. Aquí ya no.
  // ⚠️ Solo bloquea el autoservicio (metodo 'caja'). La transferencia la registra el admin
  // a mano y ahí sí decide él (decisión de Angel en v574): esa sigue pasando.
  if (table === 'comisiones_pagadas' && action === 'insert') {
    const filas = Array.isArray(data) ? data : [data];
    for (const fila of filas) {
      if (!fila || (fila.metodo && fila.metodo !== 'caja')) continue;
      try {
        // (a) El nombre tiene que existir HOY en la configuración de asesores. Si no existe,
        // la pestaña está vieja: el 17-ago el sobre de Elva se grabó como "Lic. Elva Rosa"
        // 50 minutos DESPUÉS de que ese nombre dejara de existir — señal inequívoca de que
        // esa página se cargó antes del cambio, y por eso tampoco traía el bloqueo.
        const vigentes = await asesoresVigentes();
        if (vigentes.length && !vigentes.includes(fila.asesor)) {
          return { statusCode: 403, headers: H, body: JSON.stringify({
            error: 'Esta pestaña está desactualizada: "' + fila.asesor + '" ya no aparece en la lista de asesores. ' +
                   'Recarga la página (botón Actualizar) y vuelve a intentarlo.'
          }) };
        }

        // (b) El monto no puede pasar de lo que le toca. El navegador manda la cifra ya
        // calculada, y una pestaña vieja calcula con datos viejos: así se pagaron $70 de más
        // el 17-ago. Se recalcula aquí y se compara.
        const esp = await comisionEsperada(fila.sucursal, fila.periodo, fila.asesor);
        if (esp && Number(fila.monto) > esp.comision + 0.01) {
          const extra = (Number(fila.monto) - esp.comision).toFixed(2);
          await avisarIntentoCobro(
            '⚠️ *Cobro de sobre detenido*\n\n' + fila.asesor + ' · ' + fila.sucursal + ' · ' + fila.periodo +
            '\nIntentó cobrar $' + Number(fila.monto).toFixed(2) + ' y le tocan $' + esp.comision.toFixed(2) +
            ' ($' + extra + ' de más).\n\nCasi siempre es una pestaña sin actualizar. Que recargue la página.');
          return { statusCode: 403, headers: H, body: JSON.stringify({
            error: 'El monto no coincide: te tocan $' + esp.comision.toFixed(2) + ' y se intentó cobrar $' +
                   Number(fila.monto).toFixed(2) + '. Recarga la página (botón Actualizar) para ver la cifra correcta.'
          }) };
        }

        const actas = await actasSinFirmar(fila.asesor);
        if (actas.length) {
          const det = actas.map(a => a.faltas.length ? a.faltas.join(', ') : (a.inicio + ' a ' + a.fin)).join(' · ');
          return { statusCode: 403, headers: H, body: JSON.stringify({
            error: 'No se puede cobrar el sobre: ' + fila.asesor + ' tiene ' + actas.length +
                   (actas.length === 1 ? ' acta de falta sin firmar' : ' actas de falta sin firmar') +
                   ' (' + det + '). Pide a gerencia que te reenvíe el acta desde RH → Faltas.'
          }) };
        }
      } catch (e) {
        // Fail-open a propósito: si la consulta falla, no se le niega su dinero a nadie
        // por un problema de la base. El bloqueo del navegador sigue en pie.
        console.warn('[dbwrite] candado sobre no verificable:', e.message);
      }
    }
  }

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
