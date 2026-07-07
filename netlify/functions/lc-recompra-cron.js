// LC RECOMPRA — envío automático del link personalizado de suscripción.
// (1) OFERTA: 7 días después de una compra de LC → explica el plan de suscripción (10%) + link (template lc_suscripcion_oferta).
//     NO dice "reordena ya" (el cliente puede seguir esperando/usando su 1a caja).
// (2) [reorden lo maneja lc-cron cuando se acerca la fecha de que se acaben, con el link personalizado — pendiente]
// Genera un token en lc_recompra (producto + graduación real de historias_clinicas) → link caryera.mx/tienda.html?recompra=TOKEN
// Candados de blast: MAX 10/run, 1.5s, guard 10am-8pm CST, dedup por tag [LC-Oferta-Suscripcion].

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_WA = process.env.TWILIO_WA_NUMBER;

const TEMPLATE_OFERTA = 'HX48630188fa26e215fbab894402411f57'; // lc_suscripcion_oferta ({{1}}=nombre, {{2}}=link)
const BASE_URL = 'https://caryera.mx/tienda.html?recompra=';
const MAX_PER_RUN = 10;
const RATE_LIMIT_MS = 1500;
const TAG = '[LC-Oferta-Suscripcion]';

async function supa(method, path, body) {
  const opts = { method, headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=representation' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(SUPABASE_URL + '/rest/v1/' + path, opts);
  const t = await res.text();
  if (!res.ok) throw new Error('Supabase ' + method + ' ' + path + ': ' + res.status + ' ' + t);
  return t ? JSON.parse(t) : null;
}
function norm(phone) { let n = String(phone || '').replace(/\D/g, ''); if (n.length === 10) n = '521' + n; if (n.length === 12 && n.startsWith('52') && n[2] !== '1') n = '521' + n.slice(2); return n; }
function last10(phone) { return String(phone || '').replace(/\D/g, '').slice(-10); }
function randTok() { return 'RC-' + Math.floor(Math.random() * 0x10000000).toString(16).toUpperCase().padStart(7, '0'); }
function fmtRx(esf, cil, eje) {
  if (esf === null || esf === undefined || esf === '') return '';
  const e = parseFloat(esf); if (isNaN(e)) return '';
  let s = (e >= 0 ? '+' : '') + e.toFixed(2);
  const c = parseFloat(cil); if (!isNaN(c) && c !== 0) s += '/' + c.toFixed(2);
  if (eje && parseInt(eje)) s += 'x' + parseInt(eje) + '°';
  return s;
}
function cleanProd(nombre) {
  // "AIR OPTIX HYDRAGLYDE ESFERICO" -> "Air Optix Hydraglyde"
  let b = String(nombre || '').toUpperCase().replace(/\s*[-+]\d+\.\d+(\s*[-+]\d+\.\d+)?\s*\*?\s*\d*\s*/g, ' ')
    .replace(/\s*(ESFERICOS?|TORICOS?|MULTIFOCALES?|NEGATIVOS?|POSITIVOS?|NEUTROS?)\s*/gi, ' ')
    .replace(/\s*\(.*?\)\s*/g, ' ').replace(/\s*(OD|OI)\s*/g, ' ').replace(/\s*X\d+\s*/gi, ' ').replace(/\s+/g, ' ').trim();
  if (!b || b.length < 3) b = String(nombre || '').split(/\s+/).slice(0, 3).join(' ');
  return b.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

async function sendTemplate(to, sid, vars) {
  const auth = Buffer.from(TWILIO_SID + ':' + TWILIO_TOKEN).toString('base64');
  const fromNum = TWILIO_WA.startsWith('whatsapp:') ? TWILIO_WA : 'whatsapp:' + TWILIO_WA;
  const p = new URLSearchParams();
  p.append('From', fromNum); p.append('To', 'whatsapp:+' + norm(to)); p.append('ContentSid', sid);
  p.append('ContentVariables', JSON.stringify(vars));
  const r = await fetch('https://api.twilio.com/2010-04-01/Accounts/' + TWILIO_SID + '/Messages.json', { method: 'POST', headers: { 'Authorization': 'Basic ' + auth, 'Content-Type': 'application/x-www-form-urlencoded' }, body: p.toString() });
  const d = await r.json();
  if (d.error_code) return { ok: false, err: d.error_code + ':' + d.message };
  return { ok: true, sid: d.sid };
}

// Crea el token de recompra (producto + graduación real) y devuelve el link. Reusable.
async function crearTokenRecompra(seg, pac) {
  // graduación LC de la historia más reciente del paciente
  let grad_od = '', grad_oi = '', freq = seg.duracion_dias || 90, uso = 'Mensual';
  try {
    const hist = await supa('GET', 'historias_clinicas?paciente_id=eq.' + seg.paciente_id + '&lc_od_esfera=not.is.null&select=lc_od_esfera,lc_od_cilindro,lc_od_eje,lc_oi_esfera,lc_oi_cilindro,lc_oi_eje&order=created_at.desc&limit=1');
    if (hist && hist.length) {
      const h = hist[0];
      grad_od = fmtRx(h.lc_od_esfera, h.lc_od_cilindro, h.lc_od_eje); if (grad_od) grad_od = 'OD:' + grad_od;
      grad_oi = fmtRx(h.lc_oi_esfera, h.lc_oi_cilindro, h.lc_oi_eje); if (grad_oi) grad_oi = 'OI:' + grad_oi;
    }
  } catch (e) {}
  const prodName = cleanProd(seg.producto);
  const prodKey = prodName.toLowerCase().replace(/\s+/g, '_');
  if (freq && freq <= 30) uso = 'Mensual'; else if (freq && freq <= 2) uso = 'Diario'; else uso = 'Mensual';
  const nombre = (pac.nombre || '').split(' ')[0] || pac.nombre || '';
  // token único
  let token = null;
  for (let a = 0; a < 6; a++) { const c = randTok(); const ex = await supa('GET', 'lc_recompra?token=eq.' + c + '&select=token&limit=1'); if (!ex || !ex.length) { token = c; break; } }
  if (!token) return null;
  await supa('POST', 'lc_recompra', { token, nombre, telefono: last10(pac.telefono), producto: prodName, producto_key: prodKey, grad_od, grad_oi, sucursal: seg.sucursal || null, frecuencia_dias: freq, uso, venta_folio: seg.venta_id || null });
  return { token, link: BASE_URL + token, nombre };
}

exports.handler = async function () {
  try {
    if (!SUPABASE_URL || !TWILIO_SID) return { statusCode: 200, body: JSON.stringify({ ok: false, msg: 'config faltante' }) };
    const now = new Date();
    const nowCH = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chihuahua' }));
    const hora = nowCH.getHours();
    if (hora < 10 || hora >= 20) return { statusCode: 200, body: JSON.stringify({ ok: true, enviados: 0, msg: 'fuera de horario' }) };
    // fecha de hace 7 días (local Chihuahua)
    const d7 = new Date(nowCH); d7.setDate(d7.getDate() - 7);
    const f7 = d7.toISOString().slice(0, 10);
    // compras de LC de hace 7 días con paciente (telefono) y estado activo
    const segs = await supa('GET', "lc_seguimiento?fecha_compra=eq." + f7 + "&estado=eq.activo&paciente_id=not.is.null&select=id,paciente_id,producto,duracion_dias,sucursal,venta_id,pacientes(nombre,telefono)");
    if (!Array.isArray(segs) || !segs.length) return { statusCode: 200, body: JSON.stringify({ ok: true, enviados: 0, msg: 'sin compras de hace 7 días' }) };
    let enviados = 0, saltados = 0; const errores = [];
    let empleados = {};
    try { const cfg = await supa('GET', "app_config?id=eq.empleados_telefono&select=value"); if (cfg && cfg.length) empleados = JSON.parse(cfg[0].value); } catch (e) {}
    const empSet = new Set(Object.keys(empleados).map(last10));
    for (const seg of segs) {
      if (enviados >= MAX_PER_RUN) break;
      const pac = seg.pacientes || {};
      const tel10 = last10(pac.telefono);
      if (tel10.length !== 10) { saltados++; continue; }
      if (tel10.startsWith('915')) { saltados++; continue; }        // El Paso / US
      if (empSet.has(tel10)) { saltados++; continue; }               // empleados
      // dedup: ya se le mandó la oferta?
      try { const ex = await supa('GET', "clari_conversations?phone=ilike.*" + tel10 + "*&content=ilike.*" + encodeURIComponent('LC-Oferta-Suscripcion') + "*&select=id&limit=1"); if (ex && ex.length) { saltados++; continue; } }
      catch (e) { saltados++; continue; }
      // crear token + link
      let tk = null; try { tk = await crearTokenRecompra(seg, pac); } catch (e) { errores.push('tok ' + tel10.slice(-4) + ':' + e.message); continue; }
      if (!tk) { saltados++; continue; }
      const nombre = tk.nombre || 'qué tal';
      const r = await sendTemplate(tel10, TEMPLATE_OFERTA, { '1': nombre, '2': tk.link });
      if (r.ok) {
        try { await supa('POST', 'clari_conversations', { phone: norm(tel10), role: 'assistant', content: TAG + ' Oferta de suscripción enviada (link ' + tk.token + ')', user_name: 'lc-oferta' }); } catch (e) {}
        enviados++;
      } else { errores.push(tel10.slice(-4) + ':' + r.err); }
      await new Promise(res => setTimeout(res, RATE_LIMIT_MS));
    }
    return { statusCode: 200, body: JSON.stringify({ ok: true, candidatos: segs.length, enviados, saltados, errores: errores.slice(0, 5) }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
