// Américas Fase 3 Reactivation — Clientes dormidos 2023 + gasto medio/bajo 2024
// Reutiliza templates VIP (misma estrategia: revisar graduación, sin citas)
// Manual: GET /.netlify/functions/ame-fase3-reactivate?key=SECRET
// Dry run: GET /.netlify/functions/ame-fase3-reactivate?key=SECRET&dry=1

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_WA = process.env.TWILIO_WA_NUMBER;
const BLAST_KEY = process.env.BLAST_KEY || 'caryera2026';

const MAX_PER_RUN = 50;
const DEDUP_DAYS = 60;
const TAG = 'AME-Fase3';
const CONFIG_KEY = 'ame_fase3_contacts';

// Reuse VIP templates (same message angle: revisar graduación)
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
      console.error(`[${TAG}] WA error ${data.error_code}: ${data.message}`);
      return false;
    }
    return true;
  } catch (e) {
    console.error(`[${TAG}] WA exception:`, e.message);
    return false;
  }
}

async function saveToHistory(phone, role, content) {
  try {
    await supaREST('POST', 'clari_conversations', {
      phone: normalizePhone(phone),
      role,
      content,
      user_name: 'ame-fase3'
    });
  } catch (e) { console.error(`[${TAG}] Save history error:`, e.message); }
}

async function sendAdminWA(msg) {
  try {
    const cfg = await supaREST('GET', "app_config?id=eq.whatsapp_config&select=value");
    const phones = (cfg && cfg[0]) ? JSON.parse(cfg[0].value).admin_phones || ['5216564269961'] : ['5216564269961'];
    const auth = Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString('base64');
    const fromNum = TWILIO_WA.startsWith('whatsapp:') ? TWILIO_WA : `whatsapp:${TWILIO_WA}`;
    for (const ap of phones) {
      const params = new URLSearchParams();
      params.append('From', fromNum);
      params.append('To', `whatsapp:+${normalizePhone(ap)}`);
      params.append('Body', msg);
      await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
        method: 'POST',
        headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString()
      });
    }
  } catch (e) { console.warn(`[${TAG}] Admin notify error:`, e.message); }
}

exports.handler = async function(event) {
  const qs = event.queryStringParameters || {};
  const isScheduled = event.httpMethod === 'OPTIONS' || !event.httpMethod;
  if (!isScheduled && qs.key !== BLAST_KEY) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Key inválida' }) };
  }

  const dryRun = qs.dry === '1';
  console.log(`[${TAG}] Inicio${dryRun ? ' (DRY RUN)' : ''}`);

  // Guard horario
  const nowCH = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chihuahua' }));
  if (nowCH.getHours() < 10 || nowCH.getHours() >= 20) {
    return { statusCode: 200, body: JSON.stringify({ ok: true, enviados: 0, mensaje: 'Fuera de horario (10am-8pm CST)' }) };
  }

  try {
    const now = new Date();

    // Load contacts
    let contactList = [];
    try {
      const cfgResp = await supaREST('GET', `app_config?id=eq.${CONFIG_KEY}&select=value`);
      if (cfgResp && cfgResp[0]) contactList = JSON.parse(cfgResp[0].value);
    } catch (e) { console.error(`[${TAG}] Error cargando contactos:`, e.message); }

    if (!contactList.length) {
      return { statusCode: 200, body: JSON.stringify({ ok: true, enviados: 0, mensaje: 'Lista vacía' }) };
    }

    console.log(`[${TAG}] ${contactList.length} contactos`);

    const candidates = contactList.map(c => ({
      name: c.name, phone: normalizePhone(c.phone), group: c.group || 'A'
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
          `clari_conversations?phone=in.(${phoneFilter})&content=ilike.*${TAG}*&created_at=gte.${dedupFrom.toISOString()}&select=phone&limit=200`
        );
        if (msgs) msgs.forEach(m => alreadySent.add(m.phone));
      } catch (e) { /* continue */ }
    }

    // Also check VIP and LC tags — don't double-contact people already in earlier phases
    for (let i = 0; i < phones.length; i += 20) {
      const batch = phones.slice(i, i + 20);
      const phoneFilter = batch.map(p => `"${p}"`).join(',');
      try {
        const msgs = await supaREST('GET',
          `clari_conversations?phone=in.(${phoneFilter})&content=ilike.*Reactivacion*&created_at=gte.${dedupFrom.toISOString()}&select=phone&limit=200`
        );
        if (msgs) msgs.forEach(m => alreadySent.add(m.phone));
      } catch (e) { /* continue */ }
    }

    console.log(`[${TAG}] ${alreadySent.size} ya contactados (incluye fases anteriores)`);

    // Exclude recent buyers — DISABLED (verified manually before each campaign launch)
    const recentBuyers = new Set();

    console.log(`[${TAG}] ${recentBuyers.size} compraron reciente`);

    const toSend = candidates.filter(c => !alreadySent.has(c.phone) && !recentBuyers.has(c.phone));
    const limited = toSend.slice(0, MAX_PER_RUN);

    console.log(`[${TAG}] ${toSend.length} elegibles, enviando ${limited.length}`);

    if (dryRun) {
      const byGroup = { A: 0, B: 0, C: 0 };
      limited.forEach(c => { byGroup[c.group] = (byGroup[c.group] || 0) + 1; });
      return {
        statusCode: 200,
        body: JSON.stringify({
          ok: true, dryRun: true, total: contactList.length,
          yaEnviados: alreadySent.size, compraronReciente: recentBuyers.size,
          elegibles: toSend.length, enviarEstaVez: limited.length, porGrupo: byGroup,
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

      if (!templateSid) continue;

      const ok = await sendTemplate(c.phone, templateSid, { '1': nombre });
      if (ok) {
        await saveToHistory(c.phone, 'assistant',
          `[${TAG}] [Template-${group}] Reactivación Américas Fase 3 enviado a ${c.name}`
        );
        enviados++;
        resultados[group].enviados++;
        console.log(`[${TAG}] ✓ ${nombre} (..${c.phone.slice(-4)}) [${group}]`);
      }

      await new Promise(resolve => setTimeout(resolve, 1500));
    }

    console.log(`[${TAG}] Completado: ${enviados}/${limited.length}`);

    if (enviados > 0) {
      await sendAdminWA(
        `📊 *Américas Fase 3 — Resumen*\n\n` +
        `✅ Enviados: ${enviados}/${limited.length}\n` +
        `📋 A: ${resultados.A.enviados}/${resultados.A.total} | B: ${resultados.B.enviados}/${resultados.B.total} | C: ${resultados.C.enviados}/${resultados.C.total}\n` +
        `⏭ Restantes: ${toSend.length - limited.length}\n` +
        `🚫 Ya contactados: ${alreadySent.size} | 🛒 Compra reciente: ${recentBuyers.size}\n\n` +
        `👀 Alertas de respuesta activas.`
      );
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, enviados, total: limited.length, resultados, restantes: toSend.length - limited.length })
    };

  } catch (err) {
    console.error(`[${TAG}] Fatal:`, err.message);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
