// LC Reactivation — Envía WA a usuarios de LC dormidos con A/B/C test
// Lee lista de contactos de app_config id='lc_reactivacion_contacts'
// Manual: GET /.netlify/functions/lc-reactivate?key=SECRET
// Dry run: GET /.netlify/functions/lc-reactivate?key=SECRET&dry=1

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_WA = process.env.TWILIO_WA_NUMBER;
const BLAST_KEY = process.env.BLAST_KEY || 'caryera2026';

const MAX_PER_RUN = 50;
const DEDUP_DAYS = 60;

// Template SIDs — A/B/C test
const TEMPLATES = {
  A: 'HX824d4c058d75e2af542763ef6afc6e3c',
  B: 'HXaac46affa7f74ab5bb425be640d17b45',
  C: 'HX048b7704b91753ffedc3cd5d9877754c'
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
      console.error(`[LC-REACTIVATE] WA error ${data.error_code}: ${data.message}`);
      return false;
    }
    return true;
  } catch (e) {
    console.error('[LC-REACTIVATE] WA exception:', e.message);
    return false;
  }
}

async function saveToHistory(phone, role, content) {
  try {
    await supaREST('POST', 'clari_conversations', {
      phone: normalizePhone(phone),
      role,
      content,
      user_name: 'lc-reactivacion'
    });
  } catch (e) { console.error('[LC-REACTIVATE] Save history error:', e.message); }
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
  // Auth
  const qs = event.queryStringParameters || {};
  const isScheduled = event.httpMethod === 'OPTIONS' || !event.httpMethod;
  if (!isScheduled && qs.key !== BLAST_KEY) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Key inválida. Usa ?key=TU_CLAVE' }) };
  }

  const dryRun = qs.dry === '1';
  console.log(`[LC-REACTIVATE] Inicio${dryRun ? ' (DRY RUN)' : ''}`);

  // ⏰ Guard de horario: solo enviar entre 10am-8pm hora Chihuahua
  const nowCH = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chihuahua' }));
  const horaLocal = nowCH.getHours();
  if (horaLocal < 10 || horaLocal >= 20) {
    console.log(`[LC-REACTIVATE] ⏰ Fuera de horario (${horaLocal}:${String(nowCH.getMinutes()).padStart(2, '0')} Chihuahua)`);
    return { statusCode: 200, body: JSON.stringify({ ok: true, enviados: 0, mensaje: 'Fuera de horario permitido (10am-8pm CST)' }) };
  }

  try {
    const now = new Date();

    // ── Load contact list from app_config ──
    let contactList = [];
    try {
      const cfgResp = await supaREST('GET', "app_config?id=eq.lc_reactivacion_contacts&select=value");
      if (cfgResp && cfgResp[0]) {
        contactList = JSON.parse(cfgResp[0].value);
      }
    } catch (e) {
      console.error('[LC-REACTIVATE] Error cargando contactos:', e.message);
    }

    if (!contactList.length) {
      return { statusCode: 200, body: JSON.stringify({ ok: true, enviados: 0, mensaje: 'Lista de contactos vacía' }) };
    }

    console.log(`[LC-REACTIVATE] ${contactList.length} contactos en lista`);

    const candidates = contactList.map(c => ({
      name: c.name,
      phone: normalizePhone(c.phone),
      group: c.group || 'A'  // A, B, or C
    }));
    const phones = candidates.map(c => c.phone);

    // ── Dedup: check who already got a message in last DEDUP_DAYS ──
    const alreadySent = new Set();
    const dedupFrom = new Date(now);
    dedupFrom.setDate(dedupFrom.getDate() - DEDUP_DAYS);

    for (let i = 0; i < phones.length; i += 20) {
      const batch = phones.slice(i, i + 20);
      const phoneFilter = batch.map(p => `"${p}"`).join(',');
      try {
        const msgs = await supaREST('GET',
          `clari_conversations?phone=in.(${phoneFilter})&content=ilike.*LC-Reactivacion*&created_at=gte.${dedupFrom.toISOString()}&select=phone&limit=100`
        );
        if (msgs) msgs.forEach(m => alreadySent.add(m.phone));
      } catch (e) { /* continue */ }
    }

    console.log(`[LC-REACTIVATE] ${alreadySent.size} ya contactados en últimos ${DEDUP_DAYS} días`);

    // Exclude recent buyers — DISABLED (verified manually before each campaign launch)
    const recentBuyers = new Set();

    console.log(`[LC-REACTIVATE] ${recentBuyers.size} compraron recientemente (excluidos)`);

    // Filter candidates
    const toSend = candidates.filter(c => !alreadySent.has(c.phone) && !recentBuyers.has(c.phone));
    const limited = toSend.slice(0, MAX_PER_RUN);

    console.log(`[LC-REACTIVATE] ${toSend.length} elegibles, enviando ${limited.length} (máx ${MAX_PER_RUN})`);

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
          muestra: limited.slice(0, 10).map(c => ({ name: c.name, phone: c.phone.slice(-4), group: c.group }))
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
        console.warn(`[LC-REACTIVATE] No template SID for group ${group}`);
        continue;
      }

      const ok = await sendTemplate(c.phone, templateSid, { '1': nombre });

      if (ok) {
        await saveToHistory(c.phone, 'assistant',
          `[LC-Reactivacion] [Template-${group}] Mensaje de reactivación LC enviado a ${c.name}`
        );
        enviados++;
        resultados[group].enviados++;
        console.log(`[LC-REACTIVATE] ✓ ${nombre} (${c.phone.slice(-4)}) [${group}]`);
      }

      // Rate limit: 1.5s between messages
      await new Promise(resolve => setTimeout(resolve, 1500));
    }

    console.log(`[LC-REACTIVATE] Completado: ${enviados}/${limited.length}`);

    // Notify admin with summary
    if (enviados > 0) {
      const adminPhones = await getAdminPhones();
      const summary = `📊 *LC Reactivación — Resumen*\n\n`
        + `✅ Enviados: ${enviados}/${limited.length}\n`
        + `📋 Template A: ${resultados.A.enviados}/${resultados.A.total}\n`
        + `📋 Template B: ${resultados.B.enviados}/${resultados.B.total}\n`
        + `📋 Template C: ${resultados.C.enviados}/${resultados.C.total}\n\n`
        + `⏭ Restantes: ${toSend.length - limited.length}\n`
        + `🚫 Ya contactados: ${alreadySent.size}\n`
        + `🛒 Compraron reciente: ${recentBuyers.size}\n\n`
        + `👀 Las alertas de respuesta llegarán automáticamente.`;
      for (const ap of adminPhones) {
        await sendTemplate(ap, null, {}); // skip, use freeform below
      }
      // Send as freeform to admin (within 24h window since admin always has active conversation)
      for (const ap of adminPhones) {
        try {
          const toNum = normalizePhone(ap);
          const auth = Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString('base64');
          const params = new URLSearchParams();
          const fromNum = TWILIO_WA.startsWith('whatsapp:') ? TWILIO_WA : `whatsapp:${TWILIO_WA}`;
          params.append('From', fromNum);
          params.append('To', `whatsapp:+${toNum}`);
          params.append('Body', summary);
          await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
            method: 'POST',
            headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params.toString()
          });
        } catch (e) { console.warn('[LC-REACTIVATE] Admin notify error:', e.message); }
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        enviados,
        total: limited.length,
        resultados,
        restantes: toSend.length - limited.length
      })
    };

  } catch (err) {
    console.error('[LC-REACTIVATE] Fatal:', err.message);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
