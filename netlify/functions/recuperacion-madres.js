// Recuperación Día de las Madres — WA a interesados sin compra (lada local 656/657/915)
// Manual: GET /.netlify/functions/recuperacion-madres?key=SECRET
// Dry run: GET /.netlify/functions/recuperacion-madres?key=SECRET&dry=1

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_WA = process.env.TWILIO_WA_NUMBER;
const BLAST_KEY = process.env.BLAST_KEY || 'caryera2026';

const MAX_PER_RUN = 50;
const DEDUP_DAYS = 60;

const TEMPLATE_SID = 'HX15df7b773fe9297d2d4271bad8200eae';

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
      console.error(`[RECUP-MADRES] WA error ${data.error_code}: ${data.message}`);
      return false;
    }
    return true;
  } catch (e) {
    console.error('[RECUP-MADRES] WA exception:', e.message);
    return false;
  }
}

async function saveToHistory(phone, role, content) {
  try {
    await supaREST('POST', 'clari_conversations', {
      phone: normalizePhone(phone),
      role,
      content,
      user_name: 'recuperacion-madres'
    });
  } catch (e) { console.error('[RECUP-MADRES] Save history error:', e.message); }
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

async function sendAdminWA(msg) {
  const phones = await getAdminPhones();
  const auth = Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString('base64');
  const fromNum = TWILIO_WA.startsWith('whatsapp:') ? TWILIO_WA : `whatsapp:${TWILIO_WA}`;
  for (const ap of phones) {
    try {
      const toNum = normalizePhone(ap);
      const params = new URLSearchParams();
      params.append('From', fromNum);
      params.append('To', `whatsapp:+${toNum}`);
      params.append('Body', msg);
      await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
        method: 'POST',
        headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString()
      });
    } catch (e) { console.warn('[RECUP-MADRES] Admin notify error:', e.message); }
  }
}

exports.handler = async function(event) {
  const qs = event.queryStringParameters || {};
  if (qs.key !== BLAST_KEY) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Key inválida. Usa ?key=TU_CLAVE' }) };
  }

  const dryRun = qs.dry === '1';
  console.log(`[RECUP-MADRES] Inicio${dryRun ? ' (DRY RUN)' : ''}`);

  const nowCH = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chihuahua' }));
  const horaLocal = nowCH.getHours();
  if (horaLocal < 10 || horaLocal >= 20) {
    console.log(`[RECUP-MADRES] Fuera de horario (${horaLocal}h Chihuahua)`);
    return { statusCode: 200, body: JSON.stringify({ ok: true, enviados: 0, mensaje: 'Fuera de horario (10am-8pm CST)' }) };
  }

  try {
    const now = new Date();

    let contactList = [];
    try {
      const cfgResp = await supaREST('GET', "app_config?id=eq.recuperacion_madres_contacts&select=value");
      if (cfgResp && cfgResp[0]) {
        contactList = JSON.parse(cfgResp[0].value);
      }
    } catch (e) {
      console.error('[RECUP-MADRES] Error cargando contactos:', e.message);
    }

    if (!contactList.length) {
      return { statusCode: 200, body: JSON.stringify({ ok: true, enviados: 0, mensaje: 'Lista vacía' }) };
    }

    console.log(`[RECUP-MADRES] ${contactList.length} contactos`);

    const candidates = contactList.map(c => ({
      nombre: c.nombre || 'amigo',
      phone: normalizePhone(c.phone)
    }));
    const phones = candidates.map(c => c.phone);

    const alreadySent = new Set();
    const dedupFrom = new Date(now);
    dedupFrom.setDate(dedupFrom.getDate() - DEDUP_DAYS);

    for (let i = 0; i < phones.length; i += 20) {
      const batch = phones.slice(i, i + 20);
      const phoneFilter = batch.map(p => `"${p}"`).join(',');
      try {
        const msgs = await supaREST('GET',
          `clari_conversations?phone=in.(${phoneFilter})&content=ilike.*Recup-Madres*&created_at=gte.${dedupFrom.toISOString()}&select=phone&limit=200`
        );
        if (msgs) msgs.forEach(m => alreadySent.add(m.phone));
      } catch (e) { /* continue */ }
    }

    console.log(`[RECUP-MADRES] ${alreadySent.size} ya contactados`);

    const toSend = candidates.filter(c => !alreadySent.has(c.phone));
    const limited = toSend.slice(0, MAX_PER_RUN);

    console.log(`[RECUP-MADRES] ${toSend.length} elegibles, enviando ${limited.length}`);

    if (dryRun) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          ok: true, dryRun: true,
          total: contactList.length,
          yaEnviados: alreadySent.size,
          elegibles: toSend.length,
          enviarEstaVez: limited.length,
          muestra: limited.slice(0, 10).map(c => ({ nombre: c.nombre, phone: '...' + c.phone.slice(-4) }))
        }, null, 2)
      };
    }

    let enviados = 0;
    for (const c of limited) {
      const nombre = (c.nombre || 'amigo').split(' ')[0];
      const ok = await sendTemplate(c.phone, TEMPLATE_SID, { '1': nombre });

      if (ok) {
        await saveToHistory(c.phone, 'assistant',
          `[Recup-Madres] Mensaje de recuperación enviado a ${nombre}`
        );
        enviados++;
        console.log(`[RECUP-MADRES] ✓ ${nombre} (..${c.phone.slice(-4)})`);
      }

      await new Promise(resolve => setTimeout(resolve, 1500));
    }

    console.log(`[RECUP-MADRES] Completado: ${enviados}/${limited.length}`);

    if (enviados > 0) {
      await sendAdminWA(
        `📊 *Recuperación Día de las Madres — Resumen*\n\n` +
        `✅ Enviados: ${enviados}/${limited.length}\n` +
        `⏭ Restantes: ${toSend.length - limited.length}\n` +
        `🚫 Ya contactados: ${alreadySent.size}\n\n` +
        `👀 Las respuestas llegarán a Clari automáticamente.`
      );
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, enviados, total: limited.length, restantes: toSend.length - limited.length })
    };

  } catch (err) {
    console.error('[RECUP-MADRES] Fatal:', err.message);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
