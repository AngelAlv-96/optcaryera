// /.netlify/functions/tienda-lookup.js
// Lookups acotados para la TIENDA pública (tienda.html, sin login server-side) usando service_role.
// Fase 3 de seguridad: la tienda leía pacientes/historias/ventas directo con la publishable key
// (SK). Al cerrar el SELECT público de esas tablas vía RLS, esas lecturas se romperían.
// Esta función las sustituye con consultas ACOTADAS (por teléfono / id / contacto, con límite):
//   - NO permite dump masivo (la amenaza principal del audit): hay que conocer el dato a buscar.
//   - Devuelve ARRAYS crudos (igual forma que PostgREST) para no cambiar el parsing de tienda.html.
// Mejora futura (no urgente): verificar el ID token de Google del cliente y filtrar por su email/tel
// para que ni siquiera se pueda consultar por teléfonos ajenos.
const SUPA_URL = process.env.SUPABASE_URL || 'https://icsnlgeereepesbrdjhf.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ALLOWED_ORIGIN = process.env.URL || 'https://optcaryera.netlify.app';

const RX_COLS = 'lc_od_esfera,lc_od_cilindro,lc_od_eje,lc_oi_esfera,lc_oi_cilindro,lc_oi_eje,lc_od_add,lc_oi_add,lc_od_bc,lc_oi_bc,od_esfera,od_cilindro,od_eje,oi_esfera,oi_cilindro,oi_eje,od_add,oi_add';

async function supaGET(path) {
  const res = await fetch(SUPA_URL + '/rest/v1/' + path, {
    headers: { 'apikey': SERVICE_KEY, 'Authorization': 'Bearer ' + SERVICE_KEY }
  });
  if (!res.ok) return [];
  const j = await res.json().catch(function(){ return []; });
  return Array.isArray(j) ? j : [];
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
  if (!SERVICE_KEY) return { statusCode: 500, headers: H, body: '[]' };

  let body;
  try { body = JSON.parse(event.body); } catch { return { statusCode: 400, headers: H, body: '[]' }; }
  const action = (body.action || '').toString();

  try {
    if (action === 'paciente_by_phone') {
      const phone = (body.phone || '').toString().replace(/\D/g, '').slice(-10);
      if (phone.length < 7) return { statusCode: 200, headers: H, body: '[]' };
      let limit = parseInt(body.limit, 10); if (!(limit > 0 && limit <= 10)) limit = 5;
      const rows = await supaGET('pacientes?telefono=ilike.*' + encodeURIComponent(phone) + '*&select=id,nombre,apellidos,telefono&limit=' + limit);
      return { statusCode: 200, headers: H, body: JSON.stringify(rows) };
    }

    if (action === 'historia_by_paciente') {
      const pid = (body.paciente_id || '').toString();
      if (!/^[0-9a-fA-F-]{1,40}$/.test(pid)) return { statusCode: 200, headers: H, body: '[]' };
      const rows = await supaGET('historias_clinicas?paciente_id=eq.' + encodeURIComponent(pid) + '&select=' + RX_COLS + '&order=created_at.desc&limit=1');
      return { statusCode: 200, headers: H, body: JSON.stringify(rows) };
    }

    if (action === 'ventas_web_by_contact') {
      const phone = (body.phone || '').toString().replace(/\D/g, '').slice(-10);
      const email = (body.email || '').toString().trim();
      let needle = '';
      if (phone && phone.length >= 7) needle = phone;
      else if (email && email.length >= 3) needle = email;
      else return { statusCode: 200, headers: H, body: '[]' };
      const rows = await supaGET('ventas?notas=ilike.*' + encodeURIComponent(needle) + '*&canal_venta=eq.' + encodeURIComponent('Tienda Web') + '&select=folio,total,monto_pagado,estado,sucursal,sucursal_entrega,created_at,notas&order=created_at.desc&limit=20');
      return { statusCode: 200, headers: H, body: JSON.stringify(rows) };
    }

    return { statusCode: 400, headers: H, body: '[]' };
  } catch (e) {
    return { statusCode: 500, headers: H, body: '[]' };
  }
};
