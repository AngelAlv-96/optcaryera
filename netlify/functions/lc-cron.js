// LC CRM — Auto-reminder via WhatsApp (Clari)
// Runs daily, sends reminders 7 days before fecha_recompra
// Netlify Scheduled Function

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_WA = process.env.TWILIO_WA_NUMBER;

const DIAS_ANTES = 7;
const CLIP_API_KEY = process.env.CLIP_API_KEY;
const CLIP_API_SECRET = process.env.CLIP_API_SECRET;
const SITE_URL = process.env.URL || 'https://optcaryera.netlify.app';

// Recordatorio de recompra con LINK PERSONALIZADO (producto + graduación precargados)
// Plantilla lc_recompra_reorden: {{1}}=nombre, {{2}}=producto, {{3}}=link — atraviesa ventana 24h
const TEMPLATE_REORDEN = 'HXe70c84c575a1fa3ef7a911a343669aec';
const RECOMPRA_BASE_URL = 'https://caryera.mx/tienda.html?recompra=';
const MAX_PER_RUN = 10;

async function supaREST(method, path, body) {
  const opts = {
    method,
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': method === 'PATCH' ? 'return=representation' : 'return=representation'
    }
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, opts);
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Supabase ${method} ${path}: ${res.status} ${txt}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function enviarWA(to, message) {
  if (!TWILIO_SID || !TWILIO_TOKEN || !TWILIO_WA) {
    console.log('[LC-CRON] Twilio no configurado, skip WA');
    return false;
  }
  let cleanTo = to.replace(/\D/g, '');
  if (cleanTo.length === 10) cleanTo = '52' + cleanTo;
  if (!cleanTo.startsWith('521')) cleanTo = cleanTo.replace(/^52/, '521');

  const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`;
  const params = new URLSearchParams();
  const fromNum = TWILIO_WA.startsWith('whatsapp:') ? TWILIO_WA : `whatsapp:${TWILIO_WA}`;
  params.append('From', fromNum);
  params.append('To', `whatsapp:+${cleanTo}`);
  params.append('Body', message);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params.toString()
    });
    if (res.ok) {
      console.log(`[LC-CRON] WA enviado a +${cleanTo}`);
      return true;
    }
    const err = await res.text();
    console.error(`[LC-CRON] WA error ${res.status}:`, err);
    return false;
  } catch(e) {
    console.error('[LC-CRON] WA exception:', e.message);
    return false;
  }
}

async function generarLinkClip(monto, nombre, producto) {
  if (!CLIP_API_KEY || !CLIP_API_SECRET) return null;
  try {
    const resp = await fetch('https://api.payclip.com/v2/checkout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Basic ' + Buffer.from(CLIP_API_KEY + ':' + CLIP_API_SECRET).toString('base64')
      },
      body: JSON.stringify({
        amount: monto,
        currency: 'MXN',
        purchase_description: `Recompra LC ${producto} - Opticas Car y Era (10% desc suscripción)`,
        redirection_url: {
          success: `${SITE_URL}/tienda.html?pago=ok`,
          error: `${SITE_URL}/tienda.html?pago=error`,
          default: `${SITE_URL}/tienda.html`
        },
        metadata: {
          me_reference_id: 'LC-RECOMPRA-' + Date.now().toString(36).toUpperCase(),
          customer_info: { name: nombre }
        },
        webhook_url: `${SITE_URL}/.netlify/functions/clip-webhook`
      })
    });
    const data = await resp.json();
    if (resp.ok && data.payment_request_url) return data.payment_request_url;
    console.error('[LC-CRON] Clip error:', data);
    return null;
  } catch(e) {
    console.error('[LC-CRON] Clip exception:', e.message);
    return null;
  }
}

function last10(p) { return String(p || '').replace(/\D/g, '').slice(-10); }
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
  let b = String(nombre || '').toUpperCase().replace(/\s*[-+]\d+\.\d+(\s*[-+]\d+\.\d+)?\s*\*?\s*\d*\s*/g, ' ')
    .replace(/\s*(ESFERICOS?|TORICOS?|MULTIFOCALES?|NEGATIVOS?|POSITIVOS?|NEUTROS?)\s*/gi, ' ')
    .replace(/\s*\(.*?\)\s*/g, ' ').replace(/\s*(OD|OI)\s*/g, ' ').replace(/\s*X\d+\s*/gi, ' ').replace(/\s+/g, ' ').trim();
  if (!b || b.length < 3) b = String(nombre || '').split(/\s+/).slice(0, 3).join(' ');
  return b.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

async function sendTemplate(to, sid, vars) {
  if (!TWILIO_SID || !TWILIO_TOKEN || !TWILIO_WA) return false;
  let cleanTo = to.replace(/\D/g, '');
  if (cleanTo.length === 10) cleanTo = '521' + cleanTo;
  if (!cleanTo.startsWith('521')) cleanTo = cleanTo.replace(/^52/, '521');
  const fromNum = TWILIO_WA.startsWith('whatsapp:') ? TWILIO_WA : `whatsapp:${TWILIO_WA}`;
  const p = new URLSearchParams();
  p.append('From', fromNum); p.append('To', `whatsapp:+${cleanTo}`); p.append('ContentSid', sid);
  p.append('ContentVariables', JSON.stringify(vars));
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
      method: 'POST',
      headers: { 'Authorization': 'Basic ' + Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: p.toString()
    });
    const d = await res.json();
    if (d.error_code) { console.error('[LC-CRON] tpl err', d.error_code, d.message); return false; }
    return true;
  } catch(e) { console.error('[LC-CRON] tpl exc', e.message); return false; }
}

// Crea el token de recompra (producto + graduación real de la historia) y devuelve el link.
async function crearTokenRecompra(r) {
  const pac = r.pacientes || {};
  let grad_od = '', grad_oi = '', freq = r.duracion_dias || 90, uso = 'Mensual';
  try {
    const hist = await supaREST('GET', `historias_clinicas?paciente_id=eq.${r.paciente_id}&lc_od_esfera=not.is.null&select=lc_od_esfera,lc_od_cilindro,lc_od_eje,lc_oi_esfera,lc_oi_cilindro,lc_oi_eje&order=created_at.desc&limit=1`);
    if (hist && hist.length) {
      const h = hist[0];
      grad_od = fmtRx(h.lc_od_esfera, h.lc_od_cilindro, h.lc_od_eje); if (grad_od) grad_od = 'OD:' + grad_od;
      grad_oi = fmtRx(h.lc_oi_esfera, h.lc_oi_cilindro, h.lc_oi_eje); if (grad_oi) grad_oi = 'OI:' + grad_oi;
    }
  } catch(e) {}
  const prodName = cleanProd(r.producto);
  const prodKey = prodName.toLowerCase().replace(/\s+/g, '_');
  const nombre = (pac.nombre || '').split(' ')[0] || pac.nombre || '';
  let token = null;
  for (let a = 0; a < 6; a++) { const c = randTok(); const ex = await supaREST('GET', `lc_recompra?token=eq.${c}&select=token&limit=1`); if (!ex || !ex.length) { token = c; break; } }
  if (!token) return null;
  await supaREST('POST', 'lc_recompra', { token, nombre, telefono: last10(pac.telefono), producto: prodName, producto_key: prodKey, grad_od, grad_oi, sucursal: r.sucursal || null, frecuencia_dias: freq, uso, venta_folio: r.venta_id || null });
  return { token, link: RECOMPRA_BASE_URL + token, nombre, producto: prodName };
}

exports.handler = async function(event) {
  console.log('[LC-CRON] Iniciando revisión de recompras LC...');

  try {
    // ⏰ Guard de horario: solo enviar entre 10am-8pm hora Chihuahua
    const nowCH = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chihuahua' }));
    const hora = nowCH.getHours();
    if (hora < 10 || hora >= 20) {
      console.log(`[LC-CRON] ⏰ Fuera de horario (${hora}:${String(nowCH.getMinutes()).padStart(2,'0')} Chihuahua). No se envían recordatorios.`);
      return { statusCode: 200, body: JSON.stringify({ ok: true, enviados: 0, mensaje: 'Fuera de horario permitido (10am-8pm CST)' }) };
    }

    // Calcular fecha objetivo: hoy + 7 días
    const hoy = new Date();
    const target = new Date(hoy);
    target.setDate(target.getDate() + DIAS_ANTES);
    const targetStr = target.toISOString().slice(0, 10);
    const hoyStr = hoy.toISOString().slice(0, 10);

    // Buscar registros activos cuya fecha_recompra sea <= hoy+7 y no notificados
    const registros = await supaREST('GET',
      `lc_seguimiento?estado=eq.activo&notificado=eq.false&fecha_recompra=lte.${targetStr}&select=id,paciente_id,producto,fecha_recompra,sucursal,duracion_dias,venta_id,pacientes(nombre,apellidos,telefono)`
    );

    if (!registros || !registros.length) {
      console.log('[LC-CRON] No hay LC pendientes de notificar');
      return { statusCode: 200, body: JSON.stringify({ ok: true, enviados: 0 }) };
    }

    console.log(`[LC-CRON] ${registros.length} registros por notificar`);
    let enviados = 0;

    // Excluir empleados (usan el mismo WA del checador)
    let empleados = {};
    try { const cfg = await supaREST('GET', 'app_config?id=eq.empleados_telefono&select=value'); if (cfg && cfg.length) empleados = JSON.parse(cfg[0].value); } catch (e) {}
    const empSet = new Set(Object.keys(empleados).map(last10));

    for (const r of registros) {
      if (enviados >= MAX_PER_RUN) break;
      const tel = r.pacientes?.telefono;
      if (!tel) { console.log(`[LC-CRON] Sin teléfono para paciente ${r.paciente_id}, skip`); continue; }
      const tel10 = last10(tel);
      if (tel10.length !== 10) continue;
      if (empSet.has(tel10)) continue;   // empleados

      // Genera el LINK PERSONALIZADO (producto + graduación precargados)
      let tk = null;
      try { tk = await crearTokenRecompra(r); } catch(e) { console.error('[LC-CRON] token err:', e.message); continue; }
      if (!tk) continue;
      const nombre = tk.nombre || 'qué tal';

      // Plantilla de reorden con el link (atraviesa la ventana 24h; el freeform no llegaba)
      const ok = await sendTemplate(tel10, TEMPLATE_REORDEN, { '1': nombre, '2': tk.producto, '3': tk.link });
      if (ok) {
        const cleanPhone = tel10.length === 10 ? '521' + tel10 : tel10;
        try {
          await supaREST('POST', 'clari_conversations', {
            phone: cleanPhone,
            role: 'assistant',
            content: `[LC-Recompra] Recordatorio con link personalizado enviado (${tk.token})`,
            user_name: 'lc-recompra'
          });
        } catch(e) { console.error('[LC-CRON] Error saving to history:', e.message); }
        await supaREST('PATCH', `lc_seguimiento?id=eq.${r.id}`, { notificado: true, fecha_notificacion: new Date().toISOString() });
        enviados++;
      }

      await new Promise(resolve => setTimeout(resolve, 1500));
    }

    console.log(`[LC-CRON] Completado: ${enviados}/${registros.length} enviados`);
    return { statusCode: 200, body: JSON.stringify({ ok: true, enviados, total: registros.length }) };

  } catch(e) {
    console.error('[LC-CRON] Error:', e.message);
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
