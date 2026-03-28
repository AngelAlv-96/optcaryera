// Review CRM — Envía encuestas de opinión 2h después de entrega de lentes
// Lee de tabla review_queue (insertada al marcar Entregado en el sistema)
// Cron cada 15 min — envía individualmente, no en batch
// Netlify Scheduled Function

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_WA = process.env.TWILIO_WA_NUMBER;

// Template SID from Twilio Content Builder (opinion_servicio)
const TEMPLATE_SID = 'HX80c7577a56dea4c6a675a9a7ea5c5cea';

// Max per run (individual, not batch)
const MAX_PER_RUN = 10;

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

async function sendTemplate(to, contentSid, variables) {
  if (!TWILIO_SID || !TWILIO_TOKEN || !TWILIO_WA) return false;
  const toNum = normalizePhone(to);
  const auth = Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString('base64');
  const params = new URLSearchParams();
  const fromNum = TWILIO_WA.startsWith('whatsapp:') ? TWILIO_WA : `whatsapp:${TWILIO_WA}`;
  params.append('From', fromNum);
  params.append('To', `whatsapp:+${toNum}`);
  params.append('ContentSid', contentSid);
  if (variables && Object.keys(variables).length) {
    params.append('ContentVariables', JSON.stringify(variables));
  }
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
      method: 'POST',
      headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });
    const data = await res.json();
    if (data.error_code) {
      console.error(`[REVIEW-CRON] WA error ${data.error_code}: ${data.message}`);
      return false;
    }
    return true;
  } catch (e) {
    console.error('[REVIEW-CRON] WA exception:', e.message);
    return false;
  }
}

async function saveToHistory(phone, role, content) {
  try {
    await supaREST('POST', 'clari_conversations', {
      phone: normalizePhone(phone),
      role,
      content,
      user_name: 'review-cron'
    });
  } catch (e) { console.error('[REVIEW-CRON] Save history error:', e.message); }
}

exports.handler = async function(event) {
  console.log('[REVIEW-CRON] Verificando cola de encuestas...');

  try {
    // ⏰ Guard de horario: solo enviar entre 10am-8pm hora Chihuahua
    const nowCH = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chihuahua' }));
    const hora = nowCH.getHours();
    if (hora < 10 || hora >= 20) {
      console.log(`[REVIEW-CRON] ⏰ Fuera de horario (${hora}:${String(nowCH.getMinutes()).padStart(2,'0')} Chihuahua). Encuestas pendientes se enviarán mañana.`);
      return { statusCode: 200, body: JSON.stringify({ ok: true, enviados: 0, mensaje: 'Fuera de horario (10am-8pm)' }) };
    }

    const now = new Date().toISOString();

    // Leer encuestas pendientes donde send_at ya pasó
    const queue = await supaREST('GET',
      `review_queue?sent=eq.false&send_at=lte.${now}&order=send_at.asc&limit=${MAX_PER_RUN}`
    );

    if (!queue || !queue.length) {
      console.log('[REVIEW-CRON] Cola vacía — nada que enviar');
      return { statusCode: 200, body: JSON.stringify({ ok: true, enviados: 0 }) };
    }

    console.log(`[REVIEW-CRON] ${queue.length} encuesta(s) pendiente(s)`);

    // Dedup: verificar que no se haya enviado ya (por si se encoló duplicado)
    const cutoff30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const phones = queue.map(q => normalizePhone(q.phone));
    const alreadySent = new Set();

    for (let i = 0; i < phones.length; i += 20) {
      const batch = phones.slice(i, i + 20);
      const phoneFilter = batch.map(p => `"${p}"`).join(',');
      try {
        const existing = await supaREST('GET',
          `clari_conversations?phone=in.(${phoneFilter})&content=ilike.*[Review]*&created_at=gte.${cutoff30d}&select=phone`
        );
        if (existing) existing.forEach(e => alreadySent.add(e.phone));
      } catch (e) {
        console.warn('[REVIEW-CRON] Check existing error:', e.message);
      }
    }

    let enviados = 0;
    let saltados = 0;

    for (const item of queue) {
      const phone = normalizePhone(item.phone);

      // Ya le enviaron encuesta en los últimos 30 días → marcar como sent y saltar
      if (alreadySent.has(phone)) {
        await supaREST('PATCH', `review_queue?id=eq.${item.id}`, { sent: true });
        saltados++;
        continue;
      }

      const nombre = (item.paciente_nombre || 'Cliente').split(' ')[0];
      const ok = await sendTemplate(phone, TEMPLATE_SID, { '1': nombre });

      if (ok) {
        await saveToHistory(phone, 'assistant',
          `[Review] Encuesta de opinión enviada — Folio: ${item.folio || 'N/A'}, Sucursal: ${item.sucursal || 'N/A'}`
        );
        enviados++;
        console.log(`[REVIEW-CRON] ✅ Enviado a ${nombre} (${item.sucursal || '?'})`);
      }

      // Marcar como enviado (incluso si falló, para no reintentar infinitamente)
      await supaREST('PATCH', `review_queue?id=eq.${item.id}`, { sent: true });

      // Rate limit: 1.5s entre mensajes
      if (queue.indexOf(item) < queue.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
    }

    console.log(`[REVIEW-CRON] Completado: ${enviados} enviados, ${saltados} saltados (dedup)`);
    return { statusCode: 200, body: JSON.stringify({ ok: true, enviados, saltados }) };

  } catch (e) {
    console.error('[REVIEW-CRON] Error:', e.message);
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
