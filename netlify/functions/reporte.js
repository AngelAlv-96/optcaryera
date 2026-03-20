// Netlify Function — Reporte mensual (sin dependencias externas)

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://icsnlgeereepesbrdjhf.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;

const BASE_USERS = process.env.AUTH_USERS ? JSON.parse(process.env.AUTH_USERS) : {
  'americas':  { pass: 'americas01' },
  'pinocelli': { pass: 'pinocelli01' },
  'magnolia':  { pass: 'magnolia01' },
  'gerencia':  { pass: 'car2024ge' },
  'admin':     { pass: 'car2024ad' },
  'carera':    { pass: 'carera2024' },
  'laboratorio': { pass: 'lab2024' },
};

async function getCustomUsers() {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/app_config?id=eq.custom_users&select=value`, {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
    });
    const data = await res.json();
    if (data?.[0]?.value) {
      const v = data[0].value;
      return typeof v === 'string' ? JSON.parse(v) : v;
    }
  } catch(e) {}
  return {};
}

function authenticateRequest(event) {
  try {
    const authHeader = event.headers?.authorization || '';
    if (authHeader.startsWith('Basic ')) {
      const decoded = Buffer.from(authHeader.slice(6), 'base64').toString();
      const [id, pass] = decoded.split(':');
      return { id, pass };
    }
    const params = event.queryStringParameters || {};
    if (params.user && params.pass) return { id: params.user, pass: params.pass };
  } catch(e) {}
  return null;
}

async function query(table, params) {
  const url = `${SUPABASE_URL}/rest/v1/${table}?${params}`;
  const res = await fetch(url, {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Prefer': 'count=exact' }
  });
  const count = parseInt(res.headers.get('content-range')?.split('/')[1] || '0');
  const data = await res.json();
  return { data, count };
}

exports.handler = async (event) => {
  const ALLOWED_ORIGIN = process.env.URL || 'https://optcaryera.netlify.app';
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': ALLOWED_ORIGIN };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers };

  if (!SUPABASE_KEY) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'SUPABASE_SERVICE_KEY no configurada' }) };
  }

  // Authenticate request
  const auth = authenticateRequest(event);
  if (!auth) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Auth required. Use Basic auth or ?user=X&pass=Y' }) };
  }
  const custom = await getCustomUsers();
  const allUsers = { ...BASE_USERS };
  Object.entries(custom).forEach(([uid, u]) => { if (u?.pass) allUsers[uid] = { pass: u.pass }; });
  const user = allUsers[auth.id];
  if (!user || user.pass !== auth.pass) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Auth failed' }) };
  }

  try {
    const mesParam = event.queryStringParameters?.mes;
    const now = new Date();
    const mes = mesParam || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const [y, m] = mes.split('-').map(Number);
    const inicio = `${mes}-01T00:00:00`;
    const fin = new Date(y, m, 0, 23, 59, 59).toISOString();

    const [hcRes, pxRes, ordRes, hcData, ordData] = await Promise.all([
      query('historias_clinicas', `select=id&created_at=gte.${inicio}&created_at=lte.${fin}&limit=0`),
      query('pacientes', `select=id&created_at=gte.${inicio}&created_at=lte.${fin}&motivo_consulta=neq.Importado de Optox&limit=0`),
      query('ordenes_laboratorio', `select=id&created_at=gte.${inicio}&created_at=lte.${fin}&limit=0`),
      query('historias_clinicas', `select=examinador,created_at&created_at=gte.${inicio}&created_at=lte.${fin}&limit=5000`),
      query('ordenes_laboratorio', `select=estado_lab&created_at=gte.${inicio}&created_at=lte.${fin}&limit=5000`)
    ]);

    const porExaminador = {};
    (hcData.data || []).forEach(c => { const ex = c.examinador || 'Sin asignar'; porExaminador[ex] = (porExaminador[ex] || 0) + 1; });
    const porEstado = {};
    (ordData.data || []).forEach(o => { porEstado[o.estado_lab] = (porEstado[o.estado_lab] || 0) + 1; });
    const porDia = {};
    (hcData.data || []).forEach(c => { const dia = c.created_at.slice(0, 10); porDia[dia] = (porDia[dia] || 0) + 1; });

    const dias = new Date(y, m, 0).getDate();
    return {
      statusCode: 200, headers,
      body: JSON.stringify({
        periodo: mes,
        resumen: {
          consultas_realizadas: hcRes.count, pacientes_nuevos: pxRes.count,
          ordenes_laboratorio: ordRes.count, promedio_diario: (hcRes.count / dias).toFixed(1)
        },
        consultas_por_examinador: porExaminador, ordenes_por_estado: porEstado, consultas_por_dia: porDia
      })
    };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
