// Promo Follow-up — Avisa a clientes interesados que la promo sigue en abril
// Lee contactos de app_config id='promo_abril_followup'
// Manual: GET /.netlify/functions/promo-followup?key=SECRET
// Dry run: GET /.netlify/functions/promo-followup?key=SECRET&dry=1

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_WA = process.env.TWILIO_WA_NUMBER;
const BLAST_KEY = process.env.BLAST_KEY || 'caryera2026';

// Template SID — se llena después de crear en Twilio Console
const TEMPLATE_SID = process.env.PROMO_FOLLOWUP_TEMPLATE_SID || 'HXa4f1d07c41ebb02e5a4639afbf1cbede';

const MAX_PER_RUN = 50;
const DEDUP_TAG = '[Promo-Followup-Abril]';

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
  let num = String(phone).replace(/[\s\-\(\)\+]/g, '');
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
      console.error(`[PROMO-FOLLOWUP] WA error ${data.error_code}: ${data.message}`);
      return false;
    }
    return true;
  } catch (e) {
    console.error('[PROMO-FOLLOWUP] WA exception:', e.message);
    return false;
  }
}

async function sendFreeform(to, msg) {
  if (!TWILIO_SID || !TWILIO_TOKEN || !TWILIO_WA) return false;
  const toNum = normalizePhone(to);
  const auth = Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString('base64');
  const params = new URLSearchParams();
  const fromNum = TWILIO_WA.startsWith('whatsapp:') ? TWILIO_WA : `whatsapp:${TWILIO_WA}`;
  params.append('From', fromNum);
  params.append('To', `whatsapp:+${toNum}`);
  params.append('Body', msg);
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
      method: 'POST',
      headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });
    const data = await res.json();
    if (data.error_code) {
      console.error(`[PROMO-FOLLOWUP] Freeform error ${data.error_code}: ${data.message}`);
      return false;
    }
    return true;
  } catch (e) {
    console.error('[PROMO-FOLLOWUP] Freeform exception:', e.message);
    return false;
  }
}

async function saveToHistory(phone, role, content) {
  try {
    await supaREST('POST', 'clari_conversations', {
      phone: normalizePhone(phone),
      role,
      content,
      user_name: 'promo-followup'
    });
  } catch (e) { console.error('[PROMO-FOLLOWUP] Save error:', e.message); }
}

async function getAdminPhones() {
  try {
    const cfg = await supaREST('GET', "app_config?id=eq.whatsapp_config&select=value");
    if (cfg && cfg[0]) {
      const parsed = JSON.parse(cfg[0].value);
      return parsed.admin_phones || ['5216564269961'];
    }
  } catch (e) { /* fallback */ }
  return ['5216564269961'];
}

exports.handler = async function(event) {
  const qs = event.queryStringParameters || {};
  if (qs.key !== BLAST_KEY) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Key inválida. Usa ?key=TU_CLAVE' }) };
  }

  const dryRun = qs.dry === '1';
  console.log(`[PROMO-FOLLOWUP] Inicio${dryRun ? ' (DRY RUN)' : ''}`);

  // Guard horario 10am-8pm Chihuahua
  const nowCH = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chihuahua' }));
  const horaLocal = nowCH.getHours();
  if (horaLocal < 10 || horaLocal >= 20) {
    return { statusCode: 200, body: JSON.stringify({ ok: true, enviados: 0, mensaje: 'Fuera de horario (10am-8pm CST)' }) };
  }

  try {
    // Load contacts from app_config
    const cfgData = await supaREST('GET', "app_config?id=eq.promo_abril_followup&select=value");
    if (!cfgData || !cfgData[0]) {
      return { statusCode: 200, body: JSON.stringify({ error: 'No se encontró lista de contactos' }) };
    }
    const contacts = typeof cfgData[0].value === 'string' ? JSON.parse(cfgData[0].value) : cfgData[0].value;
    console.log(`[PROMO-FOLLOWUP] ${contacts.length} contactos en lista`);

    // Dedup — check already sent
    const dedupData = await supaREST('GET',
      `clari_conversations?content=ilike.*${encodeURIComponent(DEDUP_TAG)}*&select=phone&limit=500`
    );
    const alreadySent = new Set((dedupData || []).map(r => r.phone));
    console.log(`[PROMO-FOLLOWUP] ${alreadySent.size} ya enviados (dedup)`);

    // Filter
    const pending = contacts.filter(c => {
      const phone = normalizePhone(c.phone);
      return !alreadySent.has(phone);
    });
    console.log(`[PROMO-FOLLOWUP] ${pending.length} pendientes de enviar`);

    const batch = pending.slice(0, MAX_PER_RUN);
    let sent = 0, failed = 0;

    for (const c of batch) {
      const phone = normalizePhone(c.phone);
      const firstName = (c.name || '').replace(/\[.*?\]/g, '').replace(/[^\w\sáéíóúñÁÉÍÓÚÑ]/g, '').trim().split(' ')[0] || 'Hola';

      if (dryRun) {
        console.log(`[DRY] ${phone} | ${firstName} (${c.name})`);
        sent++;
        continue;
      }

      let ok = false;

      // Try template first, fallback to freeform
      if (TEMPLATE_SID) {
        ok = await sendTemplate(phone, TEMPLATE_SID, { '1': firstName });
      }

      if (!ok) {
        // Freeform fallback — only works within 24h window
        const msg = `Hola ${firstName}! 👓 Buenas noticias: nuestra promo 3x1 en lentes completos sigue vigente en abril. Examen de vista incluido y lentes listos en 35 min. Pásate cuando gustes, no necesitas cita 😊`;
        ok = await sendFreeform(phone, msg);
      }

      if (ok) {
        await saveToHistory(phone, 'assistant',
          `${DEDUP_TAG} Seguimiento promo abril enviado a ${c.name || phone}`
        );
        sent++;
      } else {
        failed++;
      }

      // Rate limit 1.5s
      await new Promise(r => setTimeout(r, 1500));
    }

    // Notify admin
    const adminPhones = await getAdminPhones();
    const summary = `📢 PROMO FOLLOW-UP ABRIL\n${dryRun ? '🧪 DRY RUN\n' : ''}✅ Enviados: ${sent}\n❌ Fallidos: ${failed}\n📋 Pendientes: ${pending.length - batch.length}\n📊 Total lista: ${contacts.length}`;

    if (!dryRun && sent > 0) {
      for (const ap of adminPhones) {
        await sendFreeform(ap, summary);
        await new Promise(r => setTimeout(r, 500));
      }
    }

    console.log(`[PROMO-FOLLOWUP] ${summary}`);
    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, enviados: sent, fallidos: failed, pendientes: pending.length - batch.length, total: contacts.length, dryRun })
    };
  } catch (e) {
    console.error('[PROMO-FOLLOWUP] Error:', e);
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
