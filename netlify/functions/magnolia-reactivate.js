// Magnolia Reactivation — Envía WA a clientes SICAR de Magnolia (lista estática en app_config)
// Lee lista de contactos de app_config id='magnolia_contacts' (exportada de SICAR pre-mudanza)
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

  // ⏰ Guard de horario: solo enviar entre 10am-8pm hora Chihuahua
  const nowCH = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chihuahua' }));
  const horaLocal = nowCH.getHours();
  if (horaLocal < 10 || horaLocal >= 20) {
    console.log(`[MAGNOLIA-REACTIVATE] ⏰ Fuera de horario (${horaLocal}:${String(nowCH.getMinutes()).padStart(2,'0')} Chihuahua). No se envían mensajes.`);
    return { statusCode: 200, body: JSON.stringify({ ok: true, enviados: 0, mensaje: 'Fuera de horario permitido (10am-8pm CST)' }) };
  }

  if (!TEMPLATE_SID && !dryRun) {
    console.warn('[MAGNOLIA-REACTIVATE] ⚠ MAGNOLIA_TEMPLATE_SID no configurado — usando freeform como fallback');
  }

  try {
    const now = new Date();

    // ── Lista estática de clientes SICAR Magnolia (pre-mudanza ene-mar 2024) ──
    // Cargada desde app_config id='magnolia_contacts'
    let contactList = [];
    try {
      const cfgResp = await supaREST('GET', "app_config?id=eq.magnolia_contacts&select=value");
      if (cfgResp && cfgResp[0]) {
        contactList = JSON.parse(cfgResp[0].value);
      }
    } catch (e) {
      console.error('[MAGNOLIA-REACTIVATE] Error cargando lista de contactos:', e.message);
    }

    if (!contactList.length) {
      console.log('[MAGNOLIA-REACTIVATE] Lista de contactos vacía (app_config magnolia_contacts)');
      return { statusCode: 200, body: JSON.stringify({ ok: true, enviados: 0, mensaje: 'Lista de contactos vacía' }) };
    }

    console.log(`[MAGNOLIA-REACTIVATE] ${contactList.length} contactos en lista estática SICAR`);

    // Build candidates from static list
    const candidates = contactList.map(c => ({
      name: c.name,
      phone: normalizePhone(c.phone)
    }));
    const phones = candidates.map(c => c.phone);
    console.log(`[MAGNOLIA-REACTIVATE] ${candidates.length} clientes con teléfono`);

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
    const toSend = candidates.filter(c => !alreadySent.has(c.phone)).slice(0, MAX_PER_RUN);

    console.log(`[MAGNOLIA-REACTIVATE] ${toSend.length} por enviar (máx ${MAX_PER_RUN})`);

    if (dryRun) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          ok: true, dryRun: true,
          contactosEnLista: contactList.length,
          yaContactados: alreadySent.size,
          porEnviar: toSend.length,
          clientes: toSend.map(c => ({ nombre: c.name, telefono: c.phone }))
        }, null, 2)
      };
    }

    let enviados = 0;
    for (const c of toSend) {
      const nombre = (c.name || 'Cliente').split(' ')[0];
      let ok = false;

      if (TEMPLATE_SID) {
        ok = await sendTemplate(c.phone, TEMPLATE_SID, { '1': nombre });
      } else {
        const msg = `¡Hola ${nombre}! 👋 Te escribimos de Ópticas Car & Era.\n\n` +
          `Tú fuiste de nuestros primeros clientes en la sucursal de montes urales y eso nunca se nos olvida 💛\n\n` +
          `Queremos contarte que nos mudamos — ya no estamos en Plaza La Nueva Esperanza (Montes Urales).\n\n` +
          `📍 Ahora nos encuentras en Plaza Magnolia, sobre Av. Manuel J. Clouthier (Jilotepec), casi a la altura de Plaza El Reloj, frente a Tostadas El Primo, donde está Helados Trevly.\n\n` +
          `📌 Aquí te dejo la ubicación: https://maps.app.goo.gl/HBomFDEfJJNPna697\n\n` +
          `Y tenemos algo para ti:\n` +
          `✅ 3x1 en Lentes Completos\n` +
          `✅ Examen de vista incluido\n` +
          `✅ Listos el mismo día\n\n` +
          `Pásate cuando gustes, no necesitas cita. Nos da mucho gusto saber de ti 😊`;
        ok = await sendWA(c.phone, msg);
      }

      if (ok) {
        await saveToHistory(c.phone, 'assistant',
          `[Magnolia-Reactivation] Mensaje de reactivación enviado a ${c.name} (lista SICAR)`
        );
        enviados++;
        console.log(`[MAGNOLIA-REACTIVATE] ✓ ${nombre} (${c.phone})`);
      }

      await new Promise(resolve => setTimeout(resolve, 1500));
    }

    console.log(`[MAGNOLIA-REACTIVATE] Completado: ${enviados}/${toSend.length}`);

    if (enviados > 0) {
      const adminPhones = await getAdminPhones();
      const summary = `📍 *Magnolia Reactivation*\n\n` +
        `✅ ${enviados} mensajes enviados de ${toSend.length} candidatos\n` +
        `📊 ${contactList.length} contactos en lista SICAR\n` +
        `🔄 ${alreadySent.size} ya contactados previamente`;
      for (const ap of adminPhones) {
        await sendWA(ap, summary);
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, enviados, total: toSend.length, contactosLista: contactList.length })
    };

  } catch (e) {
    console.error('[MAGNOLIA-REACTIVATE] Error:', e.message);
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
