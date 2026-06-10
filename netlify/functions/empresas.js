// empresas.js — Convenios Empresariales (página pública empresas.html)
// Acciones:
//   registro : una empresa se pre-registra (status 'pendiente'), genera código único,
//              notifica a admin_phones por WA. Público (sin auth) — con honeypot + validaciones.
//   validar  : lookup de empresa por código (solo devuelve datos si status='activa').
// Patrón de seguridad: service_role solo en servidor (como portal-data.js).

const SUPA_URL = process.env.SUPABASE_URL || 'https://icsnlgeereepesbrdjhf.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_WA = process.env.TWILIO_WA_NUMBER;

async function supaREST(method, path, body) {
  const res = await fetch(`${SUPA_URL}/rest/v1/${path}`, {
    method,
    headers: {
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch (e) { /* texto no-JSON */ }
  if (!res.ok) {
    const msg = (json && (json.message || json.error)) || text || ('HTTP ' + res.status);
    throw new Error(msg);
  }
  return json;
}

// WA freeform (best-effort: si el destinatario está fuera de ventana 24h, Twilio lo rechaza y seguimos)
async function sendWAFreeform(to, bodyText) {
  if (!TWILIO_SID || !TWILIO_TOKEN || !TWILIO_WA) return false;
  try {
    const toNum = String(to).replace(/[\s\-\(\)\+]/g, '');
    const fromNum = TWILIO_WA.startsWith('whatsapp:') ? TWILIO_WA : 'whatsapp:' + TWILIO_WA;
    const auth = Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString('base64');
    const params = new URLSearchParams();
    params.append('From', fromNum);
    params.append('To', `whatsapp:+${toNum}`);
    params.append('Body', bodyText);
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
      method: 'POST',
      headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });
    const data = await res.json();
    return !data.error_code;
  } catch (e) {
    console.warn('[empresas] WA fail:', e.message);
    return false;
  }
}

// Código de empresa: CE- + 5 chars sin ambiguos (sin 0/O/1/I/L)
function generarCodigo() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let c = '';
  for (let i = 0; i < 5; i++) c += chars[Math.floor(Math.random() * chars.length)];
  return 'CE-' + c;
}

function normPhone(t) {
  let d = String(t || '').replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('52')) d = d.slice(2);
  if (d.length === 13 && d.startsWith('521')) d = d.slice(3);
  return d;
}

exports.handler = async (event) => {
  const H = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };
  const out = (code, obj) => ({ statusCode: code, headers: H, body: JSON.stringify(obj) });

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: H, body: '' };
  if (event.httpMethod !== 'POST') return out(405, { ok: false, error: 'Method not allowed' });
  if (!SERVICE_KEY) return out(500, { ok: false, error: 'Config faltante' });

  let body;
  try { body = JSON.parse(event.body); } catch (e) { return out(400, { ok: false, error: 'JSON inválido' }); }

  const action = body.action || 'registro';

  // ============ VALIDAR CÓDIGO (POS / consultas) ============
  if (action === 'validar') {
    const codigo = String(body.codigo || '').trim().toUpperCase();
    if (!/^CE-[A-Z0-9]{4,8}$/.test(codigo)) return out(200, { ok: false, error: 'codigo_invalido' });
    try {
      const rows = await supaREST('GET', `empresas_convenio?codigo=eq.${encodeURIComponent(codigo)}&select=id,nombre,codigo,status,beneficios&limit=1`);
      const emp = rows && rows[0];
      if (!emp) return out(200, { ok: false, error: 'no_encontrada' });
      if (emp.status !== 'activa') return out(200, { ok: false, error: 'no_activa', status: emp.status });
      return out(200, { ok: true, empresa: { id: emp.id, nombre: emp.nombre, codigo: emp.codigo, beneficios: emp.beneficios || null } });
    } catch (e) {
      return out(500, { ok: false, error: 'Error de servidor' });
    }
  }

  // ============ EMPLEADOS (alta opcional por RH — el código de la empresa es la credencial) ============
  // RH registra a sus empleados desde el kit; así tenemos la base y podemos mandarles su pase por WA.
  if (action === 'empleado_alta' || action === 'empleados_lista' || action === 'empleado_baja' || action === 'empleado_reactivar') {
    const codigo = String(body.codigo || '').trim().toUpperCase();
    if (!/^CE-[A-Z0-9]{4,8}$/.test(codigo)) return out(200, { ok: false, error: 'codigo_invalido' });
    let emp;
    try {
      const rows = await supaREST('GET', `empresas_convenio?codigo=eq.${encodeURIComponent(codigo)}&select=id,nombre,status&limit=1`);
      emp = rows && rows[0];
    } catch (e) { return out(500, { ok: false, error: 'Error de servidor' }); }
    if (!emp || emp.status !== 'activa') return out(200, { ok: false, error: 'no_activa' });

    try {
      if (action === 'empleados_lista') {
        const lista = await supaREST('GET', `convenio_empleados?empresa_id=eq.${emp.id}&select=id,nombre,num_empleado,telefono,pase_enviado_at,vigente,baja_at&order=created_at.desc&limit=3000`);
        // Teléfono enmascarado: la lista la ve cualquiera con el código
        const masked = (lista || []).map(e => ({ id: e.id, nombre: e.nombre, num_empleado: e.num_empleado, tel4: String(e.telefono || '').slice(-4), enviado: !!e.pase_enviado_at, vigente: e.vigente !== false, baja: e.baja_at ? String(e.baja_at).slice(0, 10) : null }));
        return out(200, { ok: true, empleados: masked, total: masked.length, empresa: { nombre: emp.nombre } });
      }
      if (action === 'empleado_alta') {
        const nombre = String(body.nombre || '').trim().slice(0, 120);
        const numEmp = String(body.num_empleado || '').trim().slice(0, 40);
        const telefono = normPhone(body.telefono);
        if (nombre.length < 3) return out(200, { ok: false, error: 'Escribe el nombre del empleado' });
        if (telefono.length !== 10) return out(200, { ok: false, error: 'El teléfono debe tener 10 dígitos' });
        // Tope sano anti-abuso (el código lo conocen los empleados): máx 3000 registros por empresa
        const totalRes = await fetch(`${SUPA_URL}/rest/v1/convenio_empleados?empresa_id=eq.${emp.id}&select=id`, { headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}`, 'Prefer': 'count=exact', 'Range': '0-0' } });
        const totalCount = parseInt((totalRes.headers.get('content-range') || '0/0').split('/')[1]) || 0;
        if (totalCount >= 3000) return out(200, { ok: false, error: 'Se alcanzó el límite de empleados registrados' });
        try {
          const ins = await supaREST('POST', 'convenio_empleados', { empresa_id: emp.id, empresa_codigo: codigo, nombre, num_empleado: numEmp || null, telefono });
          return out(200, { ok: true, empleado: { id: ins[0].id, nombre } });
        } catch (e) {
          if (/duplicate|unique/i.test(e.message)) {
            // Si ese teléfono existe pero está dado de BAJA → reingreso: se reactiva con los datos nuevos
            const prev = await supaREST('GET', `convenio_empleados?empresa_id=eq.${emp.id}&telefono=eq.${telefono}&select=id,vigente&limit=1`);
            if (prev && prev[0] && prev[0].vigente === false) {
              await supaREST('PATCH', `convenio_empleados?id=eq.${prev[0].id}`, { vigente: true, baja_at: null, nombre, num_empleado: numEmp || null });
              return out(200, { ok: true, empleado: { id: prev[0].id, nombre }, reactivado: true });
            }
            return out(200, { ok: false, error: 'Ese teléfono ya está registrado y vigente en esta empresa' });
          }
          throw e;
        }
      }
      if (action === 'empleado_baja') {
        // BAJA = marcar no vigente (NO se borra: conservamos el registro y sabemos su historial)
        const empId = parseInt(body.empleado_id);
        if (!empId) return out(200, { ok: false, error: 'empleado_id requerido' });
        await supaREST('PATCH', `convenio_empleados?id=eq.${empId}&empresa_id=eq.${emp.id}`, { vigente: false, baja_at: new Date().toISOString() });
        return out(200, { ok: true });
      }
      if (action === 'empleado_reactivar') {
        const empId = parseInt(body.empleado_id);
        if (!empId) return out(200, { ok: false, error: 'empleado_id requerido' });
        await supaREST('PATCH', `convenio_empleados?id=eq.${empId}&empresa_id=eq.${emp.id}`, { vigente: true, baja_at: null });
        return out(200, { ok: true });
      }
    } catch (e) {
      console.error('[empresas] empleados error:', e.message);
      return out(500, { ok: false, error: 'Error de servidor' });
    }
  }

  // ============ REGISTRO PÚBLICO ============
  if (action === 'registro') {
    // Honeypot anti-bot: campo oculto que un humano deja vacío
    if (body.website) return out(200, { ok: true }); // fingir éxito al bot

    const nombre = String(body.nombre || '').trim().slice(0, 120);
    const contacto = String(body.contacto_nombre || '').trim().slice(0, 120);
    const puesto = String(body.contacto_puesto || '').trim().slice(0, 80);
    const telefono = normPhone(body.telefono);
    const email = String(body.email || '').trim().slice(0, 120);
    const giro = String(body.giro || '').trim().slice(0, 80);
    const rfc = String(body.rfc || '').trim().toUpperCase().slice(0, 13);
    const numEmpleados = parseInt(body.num_empleados) || null;

    if (nombre.length < 3) return out(200, { ok: false, error: 'Escribe el nombre de la empresa' });
    if (contacto.length < 3) return out(200, { ok: false, error: 'Escribe el nombre del contacto' });
    if (telefono.length !== 10) return out(200, { ok: false, error: 'El teléfono debe tener 10 dígitos' });
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return out(200, { ok: false, error: 'Correo inválido' });

    try {
      // Duplicado: misma empresa (nombre) o mismo teléfono con solicitud viva
      const dup = await supaREST('GET',
        `empresas_convenio?or=(telefono.eq.${telefono},nombre.ilike.${encodeURIComponent(nombre)})&status=in.(pendiente,activa)&select=id,nombre,status&limit=1`);
      if (dup && dup[0]) {
        return out(200, { ok: false, error: dup[0].status === 'activa'
          ? 'Esta empresa ya está registrada y activa. Si perdiste tu código, escríbenos por WhatsApp.'
          : 'Ya tenemos una solicitud de esta empresa en revisión. Te contactamos pronto por WhatsApp.' });
      }

      // Generar código único (reintento si choca el UNIQUE)
      let inserted = null;
      for (let i = 0; i < 5 && !inserted; i++) {
        const codigo = generarCodigo();
        try {
          const rows = await supaREST('POST', 'empresas_convenio', {
            nombre, rfc: rfc || null, giro: giro || null,
            contacto_nombre: contacto, contacto_puesto: puesto || null,
            telefono, email: email || null, num_empleados: numEmpleados,
            codigo, status: 'pendiente'
          });
          inserted = rows && rows[0];
        } catch (e) {
          if (!/duplicate|unique/i.test(e.message)) throw e;
        }
      }
      if (!inserted) return out(500, { ok: false, error: 'No se pudo registrar, intenta de nuevo' });

      // Notificar a admins (best-effort, no bloquea la respuesta)
      try {
        const cfgRows = await supaREST('GET', 'app_config?id=eq.whatsapp_config&select=value');
        const waCfg = cfgRows && cfgRows[0] ? JSON.parse(cfgRows[0].value) : {};
        const admins = waCfg.admin_phones || [];
        const msg = `🏢 NUEVA SOLICITUD DE CONVENIO EMPRESARIAL\n\nEmpresa: ${nombre}${giro ? '\nGiro: ' + giro : ''}\nContacto: ${contacto}${puesto ? ' (' + puesto + ')' : ''}\nTel: ${telefono}${email ? '\nEmail: ' + email : ''}${numEmpleados ? '\nEmpleados: ~' + numEmpleados : ''}\nCódigo asignado: ${inserted.codigo}\n\nApruébala en el sistema → Convenios.`;
        for (let a = 0; a < admins.length; a++) {
          await sendWAFreeform(admins[a], msg);
          if (a < admins.length - 1) await new Promise(r => setTimeout(r, 1200));
        }
      } catch (e) { console.warn('[empresas] notif admin fail:', e.message); }

      return out(200, { ok: true, empresa: { nombre: inserted.nombre } });
    } catch (e) {
      console.error('[empresas] registro error:', e.message);
      return out(500, { ok: false, error: 'Error de servidor, intenta de nuevo' });
    }
  }

  return out(400, { ok: false, error: 'Acción desconocida' });
};
