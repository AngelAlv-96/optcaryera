// PIN VIP Reactivation — Envía WA a clientes VIP dormidos (gasto alto, sin compra en 1+ año)
// A/B/C test con 3 templates
// Manual: GET /.netlify/functions/vip-reactivate?key=SECRET
// Dry run: GET /.netlify/functions/vip-reactivate?key=SECRET&dry=1

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_WA = process.env.TWILIO_WA_NUMBER;
const BLAST_KEY = process.env.BLAST_KEY || 'caryera2026';

const MAX_PER_RUN = 50;
const DEDUP_DAYS = 60;

// Template SIDs — A/B/C test (v2 — sin citas)
const TEMPLATES = {
  A: 'HX5a5bfcece1321186bedb2030fb194f37',
  B: 'HX19b8342c79614ee0966c19b6e8a8963d',
  C: 'HX1eb140442d1dcfd78404d28e84f6a908'
};

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
      console.error(`[PIN-VIP] WA error ${data.error_code}: ${data.message}`);
      return false;
    }
    return true;
  } catch (e) {
    console.error('[PIN-VIP] WA exception:', e.message);
    return false;
  }
}

async function saveToHistory(phone, role, content) {
  try {
    await supaREST('POST', 'clari_conversations', {
      phone: normalizePhone(phone),
      role,
      content,
      user_name: 'pin-vip-reactivacion'
    });
  } catch (e) { console.error('[PIN-VIP] Save history error:', e.message); }
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
    } catch (e) { console.warn('[PIN-VIP] Admin notify error:', e.message); }
  }
}

exports.handler = async function(event) {
  const qs = event.queryStringParameters || {};
  const isScheduled = event.httpMethod === 'OPTIONS' || !event.httpMethod;
  if (!isScheduled && qs.key !== BLAST_KEY) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Key inválida. Usa ?key=TU_CLAVE' }) };
  }

  const dryRun = qs.dry === '1';
  console.log(`[PIN-VIP] Inicio${dryRun ? ' (DRY RUN)' : ''}`);

  // Guard horario 10am-8pm Chihuahua
  const nowCH = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chihuahua' }));
  const horaLocal = nowCH.getHours();
  if (horaLocal < 10 || horaLocal >= 20) {
    console.log(`[PIN-VIP] Fuera de horario (${horaLocal}h Chihuahua)`);
    return { statusCode: 200, body: JSON.stringify({ ok: true, enviados: 0, mensaje: 'Fuera de horario (10am-8pm CST)' }) };
  }

  try {
    const now = new Date();

    // Load contacts
    let contactList = [];
    try {
      const cfgResp = await supaREST('GET', "app_config?id=eq.pin_vip_contacts&select=value");
      if (cfgResp && cfgResp[0]) {
        contactList = JSON.parse(cfgResp[0].value);
      }
    } catch (e) {
      console.error('[PIN-VIP] Error cargando contactos:', e.message);
    }

    if (!contactList.length) {
      return { statusCode: 200, body: JSON.stringify({ ok: true, enviados: 0, mensaje: 'Lista vacía' }) };
    }

    console.log(`[PIN-VIP] ${contactList.length} contactos`);

    const candidates = contactList.map(c => ({
      name: c.name,
      phone: normalizePhone(c.phone),
      group: c.group || 'A'
    }));
    const phones = candidates.map(c => c.phone);

    // Dedup
    const alreadySent = new Set();
    const dedupFrom = new Date(now);
    dedupFrom.setDate(dedupFrom.getDate() - DEDUP_DAYS);

    for (let i = 0; i < phones.length; i += 20) {
      const batch = phones.slice(i, i + 20);
      const phoneFilter = batch.map(p => `"${p}"`).join(',');
      try {
        const msgs = await supaREST('GET',
          `clari_conversations?phone=in.(${phoneFilter})&content=ilike.*PIN-VIP-Reactivacion*&created_at=gte.${dedupFrom.toISOString()}&select=phone&limit=200`
        );
        if (msgs) msgs.forEach(m => alreadySent.add(m.phone));
      } catch (e) { /* continue */ }
    }

    console.log(`[PIN-VIP] ${alreadySent.size} ya contactados`);

    // Exclude recent buyers — DISABLED (verified manually: only 1 match GUADALUPE ALMODOVAR, already excluded from list)
    // Re-enable for future campaigns or when list is refreshed
    const recentBuyers = new Set();

    console.log(`[PIN-VIP] ${recentBuyers.size} compraron reciente (excluidos)`);

    const toSend = candidates.filter(c => !alreadySent.has(c.phone) && !recentBuyers.has(c.phone));
    const limited = toSend.slice(0, MAX_PER_RUN);

    console.log(`[PIN-VIP] ${toSend.length} elegibles, enviando ${limited.length}`);

    if (dryRun) {
      const byGroup = { A: 0, B: 0, C: 0 };
      limited.forEach(c => { byGroup[c.group] = (byGroup[c.group] || 0) + 1; });
      return {
        statusCode: 200,
        body: JSON.stringify({
          ok: true, dryRun: true,
          total: contactList.length,
          yaEnviados: alreadySent.size,
          compraronReciente: recentBuyers.size,
          elegibles: toSend.length,
          enviarEstaVez: limited.length,
          porGrupo: byGroup,
          muestra: limited.slice(0, 10).map(c => ({ name: c.name, phone: '...' + c.phone.slice(-4), group: c.group }))
        }, null, 2)
      };
    }

    let enviados = 0;
    const resultados = { A: { enviados: 0, total: 0 }, B: { enviados: 0, total: 0 }, C: { enviados: 0, total: 0 } };

    for (const c of limited) {
      const nombre = (c.name || 'Cliente').split(' ')[0];
      const group = c.group || 'A';
      const templateSid = TEMPLATES[group];
      resultados[group].total++;

      if (!templateSid) {
        console.warn(`[PIN-VIP] No template for group ${group}`);
        continue;
      }

      const ok = await sendTemplate(c.phone, templateSid, { '1': nombre });

      if (ok) {
        await saveToHistory(c.phone, 'assistant',
          `[PIN-VIP-Reactivacion] [Template-${group}] Mensaje de reactivación VIP Pinocelli enviado a ${c.name}`
        );
        enviados++;
        resultados[group].enviados++;
        console.log(`[PIN-VIP] ✓ ${nombre} (..${c.phone.slice(-4)}) [${group}]`);
      }

      await new Promise(resolve => setTimeout(resolve, 1500));
    }

    console.log(`[PIN-VIP] Completado: ${enviados}/${limited.length}`);

    if (enviados > 0) {
      await sendAdminWA(
        `📊 *VIP Reactivación — Resumen*\n\n` +
        `✅ Enviados: ${enviados}/${limited.length}\n` +
        `📋 Template A: ${resultados.A.enviados}/${resultados.A.total}\n` +
        `📋 Template B: ${resultados.B.enviados}/${resultados.B.total}\n` +
        `📋 Template C: ${resultados.C.enviados}/${resultados.C.total}\n\n` +
        `⏭ Restantes: ${toSend.length - limited.length}\n` +
        `🚫 Ya contactados: ${alreadySent.size}\n` +
        `🛒 Compraron reciente: ${recentBuyers.size}\n\n` +
        `👀 Las alertas de respuesta llegarán automáticamente.`
      );
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, enviados, total: limited.length, resultados, restantes: toSend.length - limited.length })
    };

  } catch (err) {
    console.error('[PIN-VIP] Fatal:', err.message);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
