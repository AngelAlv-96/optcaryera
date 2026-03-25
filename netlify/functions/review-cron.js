// Review CRM — Auto-request Google Maps reviews via WhatsApp
// Runs daily, sends encuesta_opinion template to customers who bought 3-7 days ago
// Netlify Scheduled Function

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_WA = process.env.TWILIO_WA_NUMBER;

// Template SID from Twilio Content Builder (encuesta_opinion)
const TEMPLATE_SID = 'HX80c7577a56dea4c6a675a9a7ea5c5cea';

// Days after purchase to send review request
const DIAS_MIN = 1;
const DIAS_MAX = 4;

// Max reviews per run (rate limiting)
const MAX_PER_RUN = 40;

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
  console.log('[REVIEW-CRON] Iniciando envío de encuestas de opinión...');

  try {
    // Calculate date range: ventas from DIAS_MIN to DIAS_MAX days ago
    const now = new Date();
    const dateMax = new Date(now);
    dateMax.setDate(dateMax.getDate() - DIAS_MIN);
    const dateMin = new Date(now);
    dateMin.setDate(dateMin.getDate() - DIAS_MAX);

    const fromDate = dateMin.toISOString();
    const toDate = dateMax.toISOString();

    // Find completed ventas in the date range with patient phone
    const ventas = await supaREST('GET',
      `ventas?estado=eq.Liquidada&created_at=gte.${fromDate}&created_at=lte.${toDate}&select=id,folio,sucursal,paciente_id,pacientes(nombre,apellidos,telefono)&order=created_at.desc&limit=100`
    );

    if (!ventas || !ventas.length) {
      console.log('[REVIEW-CRON] No hay ventas elegibles para encuesta');
      return { statusCode: 200, body: JSON.stringify({ ok: true, enviados: 0 }) };
    }

    console.log(`[REVIEW-CRON] ${ventas.length} ventas candidatas`);

    // Filter: only ventas where patient has phone
    const withPhone = ventas.filter(v => v.pacientes?.telefono);
    console.log(`[REVIEW-CRON] ${withPhone.length} con teléfono`);

    // Deduplicate by phone (one review per customer, not per venta)
    const byPhone = {};
    for (const v of withPhone) {
      const phone = normalizePhone(v.pacientes.telefono);
      if (!byPhone[phone]) byPhone[phone] = v;
    }
    // Prioritize Magnolia customers (local SEO recovery)
    const candidates = Object.values(byPhone).sort((a, b) =>
      (b.sucursal === 'Magnolia' ? 1 : 0) - (a.sucursal === 'Magnolia' ? 1 : 0)
    );
    console.log(`[REVIEW-CRON] ${candidates.length} clientes únicos (Magnolia priorizados)`);

    // Check which phones already got a review request (in last 30 days)
    const phones = Object.keys(byPhone);
    const cutoff30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const alreadySent = new Set();

    // Check in batches to avoid URL length issues
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

    console.log(`[REVIEW-CRON] ${alreadySent.size} ya encuestados en últimos 30 días`);

    // Filter out already sent
    const toSend = candidates.filter(v => {
      const phone = normalizePhone(v.pacientes.telefono);
      return !alreadySent.has(phone);
    }).slice(0, MAX_PER_RUN);

    console.log(`[REVIEW-CRON] ${toSend.length} por enviar (máx ${MAX_PER_RUN})`);

    let enviados = 0;
    for (const v of toSend) {
      const tel = v.pacientes.telefono;
      const nombre = (v.pacientes.nombre || 'Cliente').split(' ')[0];
      const sucursal = v.sucursal || 'N/A';

      const ok = await sendTemplate(tel, TEMPLATE_SID, { '1': nombre });

      if (ok) {
        // Log in clari_conversations with [Review] tag for tracking
        await saveToHistory(tel, 'assistant',
          `[Review] Encuesta de opinión enviada — Folio: ${v.folio}, Sucursal: ${sucursal}`
        );
        enviados++;
        console.log(`[REVIEW-CRON] Enviado a ${nombre} (${sucursal})`);
      }

      // Rate limit: 1.5s between messages
      await new Promise(resolve => setTimeout(resolve, 1500));
    }

    console.log(`[REVIEW-CRON] Completado: ${enviados}/${toSend.length} enviados`);
    return { statusCode: 200, body: JSON.stringify({ ok: true, enviados, total: toSend.length }) };

  } catch (e) {
    console.error('[REVIEW-CRON] Error:', e.message);
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
