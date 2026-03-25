// Magnolia Reactivation — Envía WA a clientes dormidos de Magnolia
// Busca ventas Liquidadas en Magnolia de hace 60-365 días y envía mensaje de reactivación
// Manual: GET /.netlify/functions/magnolia-reactivate?key=SECRET
// Dry run: GET /.netlify/functions/magnolia-reactivate?key=SECRET&dry=1
// Netlify Scheduled Function: lunes 11am CST (17:00 UTC)

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_WA = process.env.TWILIO_WA_NUMBER;
const BLAST_KEY = process.env.BLAST_KEY || 'caryera2026';

const MAX_PER_RUN = 30;
const DORMANT_MIN_DAYS = 60;
const DORMANT_MAX_DAYS = 365;
const DEDUP_DAYS = 30;

// Template SID — crear en Twilio Console: magnolia_reactivacion
// Variable {{1}}: nombre del cliente
const TEMPLATE_SID = process.env.MAGNOLIA_TEMPLATE_SID || '';

// Admin phones for summary notification
const ADMIN_PHONES_DEFAULT = ['5216564269961'];

async function supaREST(method, path, body) {
  const opts = {
    method,
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
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

function normalizePhone(phone) {
  let num = phone.replace(/[\s\-\(\)\+]/g, '');
  if (num.length === 10) num = '521' + num;
  if (num.length === 12 && num.startsWith('52') && num[2] !== '1') num = '521' + num.slice(2);
  return num;
}

async function sendTemplate(to, templateSid, variables) {
  if (!TWILIO_SID || !TWILIO_TOKEN || !TWILIO_WA || !templateSid) return false;
  const toNum = normalizePhone(to);
  const auth = Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString('base64');
  const params = new URLSearchParams();
  const fromNum = TWILIO_WA.startsWith('whatsapp:') ? TWILIO_WA : `whatsapp:${TWILIO_WA}`;
  params.append('From', fromNum);
  params.append('To', `whatsapp:+${toNum}`);
  params.append('ContentSid', templateSid);
  params.append('ContentVariables', JSON.stringify(variables));
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
      method: 'POST',
      headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });
    const data = await res.json();
    if (data.error_code) {
      console.error(`[MAGNOLIA-REACTIVATE] WA error ${data.error_code}: ${data.message}`);
      return false;
    }
    return true;
  } catch (e) {
    console.error('[MAGNOLIA-REACTIVATE] WA exception:', e.message);
    return false;
  }
}

async function sendWA(to, message) {
  if (!TWILIO_SID || !TWILIO_TOKEN || !TWILIO_WA) return false;
  const toNum = normalizePhone(to);
  const auth = Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString('base64');
  const params = new URLSearchParams();
  const fromNum = TWILIO_WA.startsWith('whatsapp:') ? TWILIO_WA : `whatsapp:${TWILIO_WA}`;
  params.append('From', fromNum);
  params.append('To', `whatsapp:+${toNum}`);
  params.append('Body', message);
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
      method: 'POST',
      headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });
    const data = await res.json();
    if (data.error_code) {
      console.error(`[MAGNOLIA-REACTIVATE] Freeform WA error ${data.error_code}: ${data.message}`);
      return false;
    }
    return true;
  } catch (e) {
    console.error('[MAGNOLIA-REACTIVATE] Freeform WA exception:', e.message);
    return false;
  }
}

async function saveToHistory(phone, role, content) {
  try {
    await supaREST('POST', 'clari_conversations', {
      phone: normalizePhone(phone),
      role,
      content,
      user_name: 'magnolia-reactivate'
    });
  } catch (e) { console.error('[MAGNOLIA-REACTIVATE] Save history error:', e.message); }
}

async function getAdminPhones() {
  try {
    const cfg = await supaREST('GET', "app_config?id=eq.whatsapp_config&select=value");
    if (cfg && cfg[0]) {
      const parsed = JSON.parse(cfg[0].value);
      return parsed.admin_phones || ADMIN_PHONES_DEFAULT;
    }
  } catch (e) { /* fallback */ }
  return ADMIN_PHONES_DEFAULT;
}

exports.handler = async function(event) {
  // Auth
  const qs = event.queryStringParameters || {};
  const isScheduled = event.httpMethod === 'OPTIONS' || !event.httpMethod;
  if (!isScheduled && qs.key !== BLAST_KEY) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Key inválida. Usa ?key=TU_CLAVE' }) };
  }

  const dryRun = qs.dry === '1';
  console.log(`[MAGNOLIA-REACTIVATE] Inicio${dryRun ? ' (DRY RUN)' : ''}`);

  if (!TEMPLATE_SID && !dryRun) {
    console.warn('[MAGNOLIA-REACTIVATE] ⚠ MAGNOLIA_TEMPLATE_SID no configurado — usando freeform como fallback');
  }

  try {
    const now = new Date();
    const dateFrom = new Date(now);
    dateFrom.setDate(dateFrom.getDate() - DORMANT_MAX_DAYS);
    const dateTo = new Date(now);
    dateTo.setDate(dateTo.getDate() - DORMANT_MIN_DAYS);

    // Fetch Magnolia ventas in dormancy window
    const ventas = await supaREST('GET',
      `ventas?sucursal=eq.Magnolia&estado=eq.Liquidada&created_at=gte.${dateFrom.toISOString()}&created_at=lte.${dateTo.toISOString()}&select=id,folio,sucursal,total,paciente_id,pacientes(nombre,apellidos,telefono)&order=created_at.desc&limit=500`
    );

    if (!ventas || !ventas.length) {
      console.log('[MAGNOLIA-REACTIVATE] No hay ventas Magnolia en ventana de dormancia');
      return { statusCode: 200, body: JSON.stringify({ ok: true, enviados: 0, mensaje: 'Sin candidatos' }) };
    }

    console.log(`[MAGNOLIA-REACTIVATE] ${ventas.length} ventas Magnolia en ventana ${DORMANT_MIN_DAYS}-${DORMANT_MAX_DAYS} días`);

    // Filter: must have phone
    const withPhone = ventas.filter(v => v.pacientes?.telefono);
    console.log(`[MAGNOLIA-REACTIVATE] ${withPhone.length} con teléfono`);

    // Deduplicate by phone — keep most recent venta per customer
    const byPhone = {};
    for (const v of withPhone) {
      const phone = normalizePhone(v.pacientes.telefono);
      if (!byPhone[phone]) byPhone[phone] = v;
    }
    const candidates = Object.values(byPhone);
    const phones = Object.keys(byPhone);
    console.log(`[MAGNOLIA-REACTIVATE] ${candidates.length} clientes únicos`);

    // Dedup: check who already got a reactivation message in last DEDUP_DAYS days
    const alreadySent = new Set();
    const dedupFrom = new Date(now);
    dedupFrom.setDate(dedupFrom.getDate() - DEDUP_DAYS);

    for (let i = 0; i < phones.length; i += 20) {
      const batch = phones.slice(i, i + 20);
      const phoneFilter = batch.map(p => `"${p}"`).join(',');
      try {
        const existing = await supaREST('GET',
          `clari_conversations?phone=in.(${phoneFilter})&content=ilike.*[Magnolia-Reactivation]*&created_at=gte.${dedupFrom.toISOString()}&select=phone&limit=200`
        );
        if (existing) existing.forEach(e => alreadySent.add(e.phone));
      } catch (e) {
        console.warn('[MAGNOLIA-REACTIVATE] Dedup check error:', e.message);
      }
    }

    console.log(`[MAGNOLIA-REACTIVATE] ${alreadySent.size} ya contactados en últimos ${DEDUP_DAYS} días`);

    // Filter and limit
    const toSend = candidates.filter(v => {
      const phone = normalizePhone(v.pacientes.telefono);
      return !alreadySent.has(phone);
    }).slice(0, MAX_PER_RUN);

    console.log(`[MAGNOLIA-REACTIVATE] ${toSend.length} por enviar (máx ${MAX_PER_RUN})`);

    if (dryRun) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          ok: true, dryRun: true,
          ventasEnVentana: ventas.length,
          clientesUnicos: candidates.length,
          yaContactados: alreadySent.size,
          porEnviar: toSend.length,
          clientes: toSend.map(v => ({
            nombre: (v.pacientes.nombre || '') + ' ' + (v.pacientes.apellidos || ''),
            telefono: v.pacientes.telefono,
            folio: v.folio,
            total: v.total
          }))
        }, null, 2)
      };
    }

    let enviados = 0;
    for (const v of toSend) {
      const tel = v.pacientes.telefono;
      const nombre = (v.pacientes.nombre || 'Cliente').split(' ')[0];
      let ok = false;

      if (TEMPLATE_SID) {
        // Preferred: use pre-approved Twilio template
        ok = await sendTemplate(tel, TEMPLATE_SID, { '1': nombre });
      } else {
        // Fallback: freeform message (may fail outside 24h window)
        const msg = `¡Hola ${nombre}! 👋 Somos Ópticas Car & Era Magnolia.\n\n` +
          `¿Sabías que tenemos una súper promo? 🔥\n\n` +
          `✅ 3x1 en Lentes Completos\n` +
          `✅ Examen de vista GRATIS\n` +
          `✅ Listos en 35 minutos\n\n` +
          `📍 Estamos en Plaza Magnolia, Av. Clouthier (Jilotepec), frente a Tostadas El Primo.\n\n` +
          `¿Te gustaría agendar tu visita? Responde a este mensaje y te atendemos 😊`;
        ok = await sendWA(tel, msg);
      }

      if (ok) {
        await saveToHistory(tel, 'assistant',
          `[Magnolia-Reactivation] Mensaje de reactivación enviado — Folio anterior: ${v.folio}, Total: $${Number(v.total || 0).toFixed(0)}`
        );
        enviados++;
        console.log(`[MAGNOLIA-REACTIVATE] ✓ ${nombre} (${v.folio})`);
      }

      // Rate limit
      await new Promise(resolve => setTimeout(resolve, 1500));
    }

    console.log(`[MAGNOLIA-REACTIVATE] Completado: ${enviados}/${toSend.length}`);

    // Notify admin
    if (enviados > 0) {
      const adminPhones = await getAdminPhones();
      const summary = `📍 *Magnolia Reactivation*\n\n` +
        `✅ ${enviados} mensajes enviados de ${toSend.length} candidatos\n` +
        `📊 ${candidates.length} clientes dormidos identificados\n` +
        `🔄 ${alreadySent.size} ya contactados previamente`;
      for (const ap of adminPhones) {
        await sendWA(ap, summary);
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, enviados, total: toSend.length, candidatos: candidates.length })
    };

  } catch (e) {
    console.error('[MAGNOLIA-REACTIVATE] Error:', e.message);
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
