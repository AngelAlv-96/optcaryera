// convenio-pase-blast.js — Envía el PASE de convenio por WhatsApp (plantilla) a los empleados
// que RH dio de alta en convenio_empleados, están VIGENTES y aún no lo reciben (pase_enviado_at IS NULL).
//
// DOS MODOS:
//  (A) CRON (automático): invocación programada (netlify.toml) o GET ?key=BLAST_KEY → procesa hasta
//      MAX_PER_RUN pendientes GLOBALES de TODAS las empresas activas. Corre cada ~15 min y drena la cola
//      (igual que cumple-cron / review-cron). RH registra a un empleado y a los minutos recibe su pase.
//  (B) MANUAL (botón "📤 Enviar pases"): POST con auth admin/gerencia + empresa_id → una empresa, el
//      frontend repite hasta restantes=0.
//
// Reglas de blast (CLAUDE.md): MAX_PER_RUN=10 + sleep 1.5s (timeout Netlify ~26s), re-check PER-FONO
// fail-closed contra clari_conversations (tag [Convenio-Pase]), guard horario 10am-7pm Chihuahua.

const SUPA_URL = process.env.SUPABASE_URL || 'https://icsnlgeereepesbrdjhf.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_WA = process.env.TWILIO_WA_NUMBER;
const TEMPLATE_SID = process.env.CONVENIO_PASE_TEMPLATE_SID || 'HXd1c975c009e9a49dcc0ea668b15c45b4'; // convenio_empleado_pase_v2 (v1 rechazada: variable al final)
const BLAST_KEY = process.env.BLAST_KEY;
const TAG = 'Convenio-Pase';
const MAX_PER_RUN = 10;
const RATE_LIMIT_MS = 1500;

const BASE_USERS = process.env.AUTH_USERS ? JSON.parse(process.env.AUTH_USERS) : {
  'gerencia': { pass: 'car2024ge', rol: 'gerencia' },
  'admin':    { pass: 'car2024ad', rol: 'admin' },
  'carera':   { pass: 'carera2024', rol: 'admin' },
};

async function supaREST(method, path, body) {
  const res = await fetch(`${SUPA_URL}/rest/v1/${path}`, {
    method,
    headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch (e) {}
  if (!res.ok) throw new Error((json && (json.message || json.error)) || ('HTTP ' + res.status));
  return json;
}

function normalizePhone(t) {
  let d = String(t || '').replace(/\D/g, '');
  if (d.length === 10) d = '521' + d;
  if (d.length === 12 && d.startsWith('52')) d = '521' + d.slice(2);
  return d;
}

async function sendTemplate(phone521, vars) {
  const auth = Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString('base64');
  const fromNum = TWILIO_WA.startsWith('whatsapp:') ? TWILIO_WA : 'whatsapp:' + TWILIO_WA;
  const params = new URLSearchParams();
  params.append('From', fromNum);
  params.append('To', 'whatsapp:+' + phone521);
  params.append('ContentSid', TEMPLATE_SID);
  params.append('ContentVariables', JSON.stringify(vars));
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
    method: 'POST',
    headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString()
  });
  const data = await res.json();
  return { ok: !data.error_code && !data.code, err: data.message || data.error_code };
}

// Envía un lote. Cada item: { id, nombre, telefono, emp: { nombre, codigo } }
async function enviarLote(lote) {
  let enviados = 0, fallidos = 0;
  for (let i = 0; i < lote.length; i++) {
    const e = lote[i];
    const phone = normalizePhone(e.telefono);
    if (phone.length < 12) { fallidos++; continue; }
    // Re-check PER-FONO inmediatamente antes de enviar (fail-closed: si falla el check, NO se envía)
    try {
      const recheck = await supaREST('GET', `clari_conversations?phone=eq.${phone}&content=ilike.*${TAG}*&select=id&limit=1`);
      if (recheck && recheck.length > 0) {
        await supaREST('PATCH', `convenio_empleados?id=eq.${e.id}`, { pase_enviado_at: new Date().toISOString() });
        continue;
      }
    } catch (err) { console.warn('[CONVENIO-PASE] recheck falló, salto:', err.message); continue; }

    const r = await sendTemplate(phone, { '1': e.nombre, '2': e.emp.nombre, '3': e.emp.codigo, '4': e.emp.codigo });
    if (r.ok) {
      enviados++;
      try { await supaREST('PATCH', `convenio_empleados?id=eq.${e.id}`, { pase_enviado_at: new Date().toISOString() }); } catch (err) {}
      try { await supaREST('POST', 'clari_conversations', { phone, role: 'assistant', content: `[${TAG}] [${e.emp.codigo}] Pase de convenio enviado a ${e.nombre} (${e.emp.nombre})`, user_name: 'convenio-pase' }); } catch (err) {}
    } else {
      fallidos++;
      console.warn('[CONVENIO-PASE] fallo a', phone.slice(-4), r.err);
    }
    if (i < lote.length - 1) await new Promise(rs => setTimeout(rs, RATE_LIMIT_MS));
  }
  return { enviados, fallidos };
}

function fueraDeHorario() {
  const nowCH = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chihuahua' }));
  const hora = nowCH.getHours();
  return hora < 10 || hora >= 19;
}

exports.handler = async (event) => {
  const H = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Content-Type': 'application/json' };
  const out = (code, obj) => ({ statusCode: code, headers: H, body: JSON.stringify(obj) });
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: H, body: '' };

  const qs = (event && event.queryStringParameters) || {};
  // MANUAL si llega un POST con cuerpo JSON; si no, es CRON (invocación programada o GET ?key=)
  const isManual = event.httpMethod === 'POST' && event.body && event.body.trim().startsWith('{');

  // ───────────────────────── MODO CRON (automático) ─────────────────────────
  if (!isManual) {
    if (qs.key && BLAST_KEY && qs.key !== BLAST_KEY) return out(401, { ok: false, error: 'Key inválida' });
    if (fueraDeHorario()) return out(200, { ok: true, skipped: 'fuera_de_horario' });
    try {
      // Pendientes vigentes sin pase (de cualquier empresa); traemos un poco más para filtrar por empresa activa
      const pend = await supaREST('GET', `convenio_empleados?pase_enviado_at=is.null&vigente=eq.true&select=id,nombre,telefono,empresa_id&order=created_at.asc&limit=40`);
      if (!pend || !pend.length) return out(200, { ok: true, enviados: 0, fallidos: 0, mensaje: 'Sin pendientes' });
      // Empresas activas de esos pendientes
      const ids = [...new Set(pend.map(p => p.empresa_id))];
      const emps = await supaREST('GET', `empresas_convenio?id=in.(${ids.join(',')})&status=eq.activa&select=id,nombre,codigo`);
      const empMap = {}; (emps || []).forEach(e => { empMap[e.id] = e; });
      const elegibles = pend.filter(p => empMap[p.empresa_id]).slice(0, MAX_PER_RUN)
        .map(p => ({ id: p.id, nombre: p.nombre, telefono: p.telefono, emp: empMap[p.empresa_id] }));
      if (!elegibles.length) return out(200, { ok: true, enviados: 0, fallidos: 0, mensaje: 'Sin pendientes de empresas activas' });
      const { enviados, fallidos } = await enviarLote(elegibles);
      console.log(`[CONVENIO-PASE cron] ${enviados} enviados, ${fallidos} fallidos`);
      return out(200, { ok: true, modo: 'cron', enviados, fallidos });
    } catch (e) {
      console.error('[CONVENIO-PASE cron]', e.message);
      return out(500, { ok: false, error: e.message });
    }
  }

  // ───────────────────────── MODO MANUAL (botón) ─────────────────────────
  let body;
  try { body = JSON.parse(event.body); } catch (e) { return out(400, { ok: false, error: 'JSON inválido' }); }

  // Auth: solo admin/gerencia (BASE_USERS + custom_users)
  const auth = body.auth;
  if (!auth?.id || !auth?.pass) return out(401, { ok: false, error: 'Auth required' });
  let custom = {};
  try {
    const r = await supaREST('GET', 'app_config?id=eq.custom_users&select=value');
    if (r?.[0]?.value) custom = typeof r[0].value === 'string' ? JSON.parse(r[0].value) : r[0].value;
  } catch (e) {}
  const allUsers = { ...BASE_USERS };
  Object.entries(custom).forEach(([uid, u]) => { if (u?.pass) allUsers[uid] = { pass: u.pass, rol: u.rol || 'sucursal' }; });
  const user = allUsers[auth.id];
  if (!user || user.pass !== auth.pass) return out(401, { ok: false, error: 'Auth failed' });
  if (user.rol !== 'admin' && user.rol !== 'gerencia') return out(403, { ok: false, error: 'Solo admin/gerencia' });

  if (fueraDeHorario()) return out(200, { ok: false, error: 'fuera_de_horario', detalle: 'Los pases se envían entre 10am y 7pm' });

  const empresaId = parseInt(body.empresa_id);
  if (!empresaId) return out(400, { ok: false, error: 'empresa_id requerido' });
  const dry = !!body.dry;

  try {
    const emps = await supaREST('GET', `empresas_convenio?id=eq.${empresaId}&select=id,nombre,codigo,status&limit=1`);
    const emp = emps && emps[0];
    if (!emp) return out(200, { ok: false, error: 'empresa_no_encontrada' });
    if (emp.status !== 'activa') return out(200, { ok: false, error: 'empresa_no_activa' });

    const pendientes = await supaREST('GET', `convenio_empleados?empresa_id=eq.${empresaId}&pase_enviado_at=is.null&vigente=eq.true&select=id,nombre,telefono&order=created_at.asc&limit=${MAX_PER_RUN + 1}`);
    const lote = (pendientes || []).slice(0, MAX_PER_RUN).map(p => ({ id: p.id, nombre: p.nombre, telefono: p.telefono, emp }));
    const hayMas = (pendientes || []).length > MAX_PER_RUN;

    if (dry) return out(200, { ok: true, dry: true, pendientesEsteLote: lote.length, hayMas });
    if (!lote.length) return out(200, { ok: true, enviados: 0, fallidos: 0, restantes: 0, mensaje: 'Sin pendientes' });

    const { enviados, fallidos } = await enviarLote(lote);

    let restantes = 0;
    try {
      const rr = await fetch(`${SUPA_URL}/rest/v1/convenio_empleados?empresa_id=eq.${empresaId}&pase_enviado_at=is.null&vigente=eq.true&select=id`, { headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}`, 'Prefer': 'count=exact', 'Range': '0-0' } });
      restantes = parseInt((rr.headers.get('content-range') || '0/0').split('/')[1]) || 0;
    } catch (e) {}

    return out(200, { ok: true, enviados, fallidos, restantes });
  } catch (e) {
    console.error('[CONVENIO-PASE]', e.message);
    return out(500, { ok: false, error: e.message });
  }
};
