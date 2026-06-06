// Campaña de cumpleaños — felicita + cupón a los cumpleañeros del día.
// Cron diario (Netlify Scheduled). Manda el template cumpleanos_cupon (imagen + 30%/kit).
// Candados: solo fechas plausibles (RPC), excluye empleados y números US/El Paso,
// dedup 1 vez al año por tag [Cumple-AAAA], guard horario 10am-8pm Chihuahua.
// Manual/dry: GET /.netlify/functions/cumple-cron?key=SECRET (&dry=1)

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://icsnlgeereepesbrdjhf.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_WA = process.env.TWILIO_WA_NUMBER;
const BLAST_KEY = process.env.BLAST_KEY || 'caryera2026';

const TEMPLATE_SID = 'HXc5b9ce3afbce7e91786d68ecf31a1637'; // cumpleanos_cupon (var 1 = nombre)
const MAX_PER_RUN = 10;
const RATE_LIMIT_MS = 1500;

async function supaREST(method, path, body) {
  const opts = { method, headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=representation' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(SUPABASE_URL + '/rest/v1/' + path, opts);
  if (!res.ok) { const txt = await res.text(); throw new Error('Supabase ' + method + ' ' + path + ': ' + res.status + ' ' + txt); }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

function normalizePhone(phone) {
  let num = String(phone).replace(/[\s\-\(\)\+]/g, '');
  if (num.length === 10) num = '521' + num;
  if (num.length === 12 && num.startsWith('52') && num[2] !== '1') num = '521' + num.slice(2);
  return num;
}

async function sendTemplate(to, nombre) {
  if (!TWILIO_SID || !TWILIO_TOKEN || !TWILIO_WA) return { ok: false, err: 'missing_config' };
  const toNum = normalizePhone(to);
  const auth = Buffer.from(TWILIO_SID + ':' + TWILIO_TOKEN).toString('base64');
  const fromNum = TWILIO_WA.startsWith('whatsapp:') ? TWILIO_WA : 'whatsapp:' + TWILIO_WA;
  const params = new URLSearchParams();
  params.append('From', fromNum);
  params.append('To', 'whatsapp:+' + toNum);
  params.append('ContentSid', TEMPLATE_SID);
  params.append('ContentVariables', JSON.stringify({ '1': nombre || 'cliente' }));
  try {
    const res = await fetch('https://api.twilio.com/2010-04-01/Accounts/' + TWILIO_SID + '/Messages.json', { method: 'POST', headers: { 'Authorization': 'Basic ' + auth, 'Content-Type': 'application/x-www-form-urlencoded' }, body: params.toString() });
    const data = await res.json();
    if (data.error_code) { console.error('[CUMPLE] WA error ' + data.error_code + ': ' + data.message); return { ok: false, err: data.error_code + ':' + data.message }; }
    return { ok: true };
  } catch (e) { console.error('[CUMPLE] WA exception:', e.message); return { ok: false, err: e.message }; }
}

async function saveToHistory(phone, content) {
  try { await supaREST('POST', 'clari_conversations', { phone: normalizePhone(phone), role: 'assistant', content, user_name: 'cumple-cron' }); }
  catch (e) { console.error('[CUMPLE] Save history error:', e.message); }
}

exports.handler = async function(event) {
  const qs = (event && event.queryStringParameters) || {};
  // Permite ejecución manual con ?key=; el cron programado entra sin qs.
  const manual = !!qs.key;
  if (manual && qs.key !== BLAST_KEY) return { statusCode: 401, body: JSON.stringify({ error: 'Key invalida' }) };
  const dryRun = qs.dry === '1';

  // Guard horario 10am-8pm Chihuahua
  const nowCH = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chihuahua' }));
  const hora = nowCH.getHours();
  if (hora < 10 || hora >= 20) {
    return { statusCode: 200, body: JSON.stringify({ ok: true, enviados: 0, mensaje: 'Fuera de horario (10am-8pm CST)' }) };
  }

  try {
    const anio = nowCH.getFullYear();
    const mm = String(nowCH.getMonth() + 1).padStart(2, '0');
    const dd = String(nowCH.getDate()).padStart(2, '0');
    const mmdd = mm + '-' + dd;
    const TAG = 'Cumple-' + anio;

    // Cumpleañeros del día (RPC: solo fechas plausibles + con teléfono)
    let lista = await supaREST('POST', 'rpc/cumpleanos_del_dia', { p_mmdd: mmdd });
    if (!Array.isArray(lista)) lista = [];

    // Excluir empleados (usan el WA del checador)
    let empSet = new Set();
    try {
      const emp = await supaREST('GET', 'app_config?id=eq.empleados_telefono&select=value');
      if (emp && emp[0] && emp[0].value) {
        const map = typeof emp[0].value === 'string' ? JSON.parse(emp[0].value) : emp[0].value;
        Object.keys(map).forEach(p => empSet.add(String(p).replace(/[^0-9]/g, '').slice(-10)));
      }
    } catch (e) { console.warn('[CUMPLE] empleados load:', e.message); }

    // Elegibles: número MX (no El Paso 915), no empleado
    const candidatos = lista.map(p => {
      const d10 = String(p.telefono || '').replace(/[^0-9]/g, '').slice(-10);
      return { id: p.id, nombre: (p.nombre || '').trim().split(' ')[0] || 'cliente', phone: normalizePhone(p.telefono), d10 };
    }).filter(c => c.d10.length === 10 && !c.d10.startsWith('915') && !empSet.has(c.d10));

    // Dedup: no enviar 2 veces este año (tag [Cumple-AAAA])
    const yaEnviado = new Set();
    const phones = candidatos.map(c => c.phone);
    for (let i = 0; i < phones.length; i += 20) {
      const batch = phones.slice(i, i + 20);
      const filt = batch.map(p => '"' + p + '"').join(',');
      try {
        const ex = await supaREST('GET', 'clari_conversations?phone=in.(' + filt + ')&content=ilike.*' + TAG + '*&select=phone&limit=200');
        if (ex) ex.forEach(m => yaEnviado.add(m.phone));
      } catch (e) {}
    }

    const elegibles = candidatos.filter(c => !yaEnviado.has(c.phone));
    const limited = elegibles.slice(0, MAX_PER_RUN);

    if (dryRun) {
      return { statusCode: 200, body: JSON.stringify({ ok: true, dryRun: true, fecha: mmdd, cumpleaneros: lista.length, elegibles: elegibles.length, yaEnviados: yaEnviado.size, enviarEstaVez: limited.length, muestra: limited.map(c => c.nombre + ' ...' + c.phone.slice(-4)) }, null, 2) };
    }

    let enviados = 0, fallidos = 0;
    for (let i = 0; i < limited.length; i++) {
      const c = limited[i];
      // Re-check por número justo antes de enviar (fail-closed)
      try {
        const recheck = await supaREST('GET', 'clari_conversations?phone=eq.' + c.phone + '&content=ilike.*' + TAG + '*&select=id&limit=1');
        if (recheck && recheck.length > 0) continue;
      } catch (e) { console.warn('[CUMPLE] recheck fallo, salto:', e.message); continue; }
      const r = await sendTemplate(c.phone, c.nombre);
      if (r.ok) { await saveToHistory(c.phone, '[' + TAG + '] Felicitacion cumpleanos + cupon enviada a ' + c.nombre); enviados++; }
      else fallidos++;
      if (i < limited.length - 1) await new Promise(rs => setTimeout(rs, RATE_LIMIT_MS));
    }

    console.log('[CUMPLE] ' + mmdd + ': ' + enviados + ' enviados, ' + fallidos + ' fallidos, ' + (elegibles.length - limited.length) + ' restantes');
    return { statusCode: 200, body: JSON.stringify({ ok: true, fecha: mmdd, enviados, fallidos, restantes: elegibles.length - limited.length }) };
  } catch (err) {
    console.error('[CUMPLE] Fatal:', err.message);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
