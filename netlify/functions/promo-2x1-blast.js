// Promo 2x1 Abril Blast — Envía WA a lista curada (SEG2 5+msgs + SEG3 muy-interesados)
// A/B/C test con 3 templates aprobados (sin variables)
// Manual: GET /.netlify/functions/promo-2x1-blast?key=SECRET
// Dry run: GET /.netlify/functions/promo-2x1-blast?key=SECRET&dry=1

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_WA = process.env.TWILIO_WA_NUMBER;
const BLAST_KEY = process.env.BLAST_KEY || 'caryera2026';

// Envío conservador: lento para evitar errores, dedup estricto para no repetir
const MAX_PER_RUN = 25;
const RATE_LIMIT_MS = 3000; // 3s entre mensajes
const DEDUP_DAYS = 60;
const DEDUP_TAG = 'Promo-2x1-Abril';

// Templates aprobados (sin variables {{1}})
const TEMPLATES = {
  A: 'HXffc30d4dccea38264b11f870b7accb74', // directo
  B: 'HX299158062f2a57e439798cc7c2ebf2fa', // valor
  C: 'HX6b9a69281de9e1e5953fd8bc233ecbfc'  // urgencia
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

async function sendTemplate(to, templateSid) {
  if (!TWILIO_SID || !TWILIO_TOKEN || !TWILIO_WA || !templateSid) return { ok: false, err: 'missing_config' };
  const toNum = normalizePhone(to);
  const auth = Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString('base64');
  const params = new URLSearchParams();
  const fromNum = TWILIO_WA.startsWith('whatsapp:') ? TWILIO_WA : `whatsapp:${TWILIO_WA}`;
  params.append('From', fromNum);
  params.append('To', `whatsapp:+${toNum}`);
  params.append('ContentSid', templateSid);
  params.append('ContentVariables', JSON.stringify({}));
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
      method: 'POST',
      headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });
    const data = await res.json();
    if (data.error_code) {
      console.error(`[PROMO-2X1] WA error ${data.error_code}: ${data.message}`);
      return { ok: false, err: data.error_code + ':' + data.message };
    }
    return { ok: true };
  } catch (e) {
    console.error('[PROMO-2X1] WA exception:', e.message);
    return { ok: false, err: e.message };
  }
}

async function saveToHistory(phone, content) {
  try {
    await supaREST('POST', 'clari_conversations', {
      phone: normalizePhone(phone),
      role: 'assistant',
      content,
      user_name: 'promo-2x1'
    });
  } catch (e) { console.error('[PROMO-2X1] Save history error:', e.message); }
}

async function getAdminPhones() {
  try {
    const cfg = await supaREST('GET', "app_config?id=eq.whatsapp_config&select=value");
    if (cfg && cfg[0]) {
      const parsed = typeof cfg[0].value === 'string' ? JSON.parse(cfg[0].value) : cfg[0].value;
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
    } catch (e) { console.warn('[PROMO-2X1] Admin notify error:', e.message); }
  }
}

exports.handler = async function(event) {
  const qs = event.queryStringParameters || {};
  if (qs.key !== BLAST_KEY) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Key inválida. Usa ?key=TU_CLAVE' }) };
  }

  const dryRun = qs.dry === '1';
  console.log(`[PROMO-2X1] Inicio${dryRun ? ' (DRY RUN)' : ''}`);

  // Guard horario 10am-8pm Chihuahua
  const nowCH = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chihuahua' }));
  const horaLocal = nowCH.getHours();
  if (horaLocal < 10 || horaLocal >= 20) {
    console.log(`[PROMO-2X1] Fuera de horario (${horaLocal}h Chihuahua)`);
    return { statusCode: 200, body: JSON.stringify({ ok: true, enviados: 0, mensaje: 'Fuera de horario (10am-8pm CST)' }) };
  }

  try {
    const now = new Date();

    // Load contacts
    let contactList = [];
    try {
      const cfgResp = await supaREST('GET', "app_config?id=eq.promo_2x1_contacts&select=value");
      if (cfgResp && cfgResp[0]) {
        const raw = cfgResp[0].value;
        contactList = typeof raw === 'string' ? JSON.parse(raw) : raw;
      }
    } catch (e) {
      console.error('[PROMO-2X1] Error cargando contactos:', e.message);
    }

    if (!contactList.length) {
      return { statusCode: 200, body: JSON.stringify({ ok: true, enviados: 0, mensaje: 'Lista vacía' }) };
    }

    console.log(`[PROMO-2X1] ${contactList.length} contactos`);

    const candidates = contactList.map(c => ({
      name: c.name || '',
      phone: normalizePhone(c.phone),
      group: c.group || 'A',
      src: c.src || ''
    }));

    // Dedup — consultar clari_conversations por tag Promo-2x1-Abril en últimos DEDUP_DAYS días
    const alreadySent = new Set();
    const dedupFrom = new Date(now);
    dedupFrom.setDate(dedupFrom.getDate() - DEDUP_DAYS);

    for (let i = 0; i < candidates.length; i += 20) {
      const batch = candidates.slice(i, i + 20);
      const phoneFilter = batch.map(c => `"${c.phone}"`).join(',');
      try {
        const msgs = await supaREST('GET',
          `clari_conversations?phone=in.(${phoneFilter})&content=ilike.*${DEDUP_TAG}*&created_at=gte.${dedupFrom.toISOString()}&select=phone&limit=500`
        );
        if (msgs) msgs.forEach(m => alreadySent.add(m.phone));
      } catch (e) { /* continue */ }
    }

    console.log(`[PROMO-2X1] ${alreadySent.size} ya contactados (tag ${DEDUP_TAG})`);

    // Excluir también compradores últimos 60 días (doble seguridad aunque la lista ya los filtró al construirse)
    const cut60 = new Date(now);
    cut60.setDate(cut60.getDate() - 60);
    const recentBuyers = new Set();
    try {
      const ventas = await supaREST('GET',
        `ventas?created_at=gte.${cut60.toISOString()}&select=pacientes(telefono)&limit=1000`
      );
      if (ventas) ventas.forEach(v => {
        if (v.pacientes && v.pacientes.telefono) {
          const norm = normalizePhone(v.pacientes.telefono);
          if (norm) recentBuyers.add(norm);
        }
      });
    } catch (e) { console.warn('[PROMO-2X1] Warn cargando compradores recientes:', e.message); }

    console.log(`[PROMO-2X1] ${recentBuyers.size} compradores recientes (excluidos)`);

    const eligible = candidates.filter(c =>
      c.phone && c.phone.length >= 12 && !alreadySent.has(c.phone) && !recentBuyers.has(c.phone)
    );

    const limited = eligible.slice(0, MAX_PER_RUN);

    console.log(`[PROMO-2X1] ${eligible.length} elegibles, enviando ${limited.length}`);

    if (dryRun) {
      const byGroup = { A: 0, B: 0, C: 0 };
      const bySrc = { seg2: 0, seg3: 0 };
      limited.forEach(c => {
        byGroup[c.group] = (byGroup[c.group] || 0) + 1;
        bySrc[c.src] = (bySrc[c.src] || 0) + 1;
      });
      return {
        statusCode: 200,
        body: JSON.stringify({
          ok: true, dryRun: true,
          total: contactList.length,
          yaContactados: alreadySent.size,
          compraronReciente: recentBuyers.size,
          elegibles: eligible.length,
          enviarEstaVez: limited.length,
          porGrupo: byGroup,
          porFuente: bySrc,
          restantes: eligible.length - limited.length,
          muestra: limited.slice(0, 10).map(c => ({ name: c.name, phone: '...' + c.phone.slice(-4), group: c.group, src: c.src }))
        }, null, 2)
      };
    }

    let enviados = 0, fallidos = 0;
    const resultados = { A: { enviados: 0, total: 0 }, B: { enviados: 0, total: 0 }, C: { enviados: 0, total: 0 } };
    const errores = [];

    for (const c of limited) {
      const group = c.group || 'A';
      const templateSid = TEMPLATES[group];
      resultados[group].total++;

      if (!templateSid) {
        console.warn(`[PROMO-2X1] No template for group ${group}`);
        fallidos++;
        continue;
      }

      // Re-check dedup just before sending (por si otra instancia paralelas envió)
      try {
        const recheck = await supaREST('GET',
          `clari_conversations?phone=eq.${c.phone}&content=ilike.*${DEDUP_TAG}*&created_at=gte.${dedupFrom.toISOString()}&select=id&limit=1`
        );
        if (recheck && recheck.length > 0) {
          console.log(`[PROMO-2X1] ⚠ Skip ${c.phone.slice(-4)} — ya enviado (race check)`);
          continue;
        }
      } catch (e) { /* continue */ }

      const result = await sendTemplate(c.phone, templateSid);

      if (result.ok) {
        await saveToHistory(c.phone,
          `[${DEDUP_TAG}] [Template-${group}] Promo 2x1 abril enviada a ${c.name || c.phone.slice(-4)}`
        );
        enviados++;
        resultados[group].enviados++;
        console.log(`[PROMO-2X1] ✓ ${c.name || '(s/n)'} (..${c.phone.slice(-4)}) [${group}]`);
      } else {
        fallidos++;
        errores.push({ phone: c.phone.slice(-4), group, err: result.err });
        console.log(`[PROMO-2X1] ✗ ${c.name || '(s/n)'} (..${c.phone.slice(-4)}) [${group}] — ${result.err}`);
      }

      // Pacing lento entre mensajes
      await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_MS));
    }

    console.log(`[PROMO-2X1] Completado: ${enviados} enviados, ${fallidos} fallidos`);

    if (enviados > 0 || fallidos > 0) {
      await sendAdminWA(
        `📊 *Promo 2x1 Abril — Resumen*\n\n` +
        `✅ Enviados: ${enviados}/${limited.length}\n` +
        `❌ Fallidos: ${fallidos}\n` +
        `📋 A directo: ${resultados.A.enviados}/${resultados.A.total}\n` +
        `📋 B valor: ${resultados.B.enviados}/${resultados.B.total}\n` +
        `📋 C urgencia: ${resultados.C.enviados}/${resultados.C.total}\n\n` +
        `⏭ Restantes: ${eligible.length - limited.length}\n` +
        `🚫 Ya contactados: ${alreadySent.size}\n` +
        `🛒 Compraron reciente: ${recentBuyers.size}`
      );
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        enviados, fallidos,
        total: limited.length,
        resultados,
        restantes: eligible.length - limited.length,
        errores: errores.slice(0, 10)
      })
    };

  } catch (err) {
    console.error('[PROMO-2X1] Fatal:', err.message);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
