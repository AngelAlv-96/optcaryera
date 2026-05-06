// Recuperación Día de las Madres — WA a interesados sin compra (lada local 656/657/915)
// Manual: GET /.netlify/functions/recuperacion-madres?key=SECRET
// Dry run: GET /.netlify/functions/recuperacion-madres?key=SECRET&dry=1

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_WA = process.env.TWILIO_WA_NUMBER;
const BLAST_KEY = process.env.BLAST_KEY || 'caryera2026';

// Bajo a 10/run para que UNA invocación termine dentro del timeout de Netlify (~26s Pro).
// Si la función no completa, curl timeoutea pero la instancia sigue corriendo en background;
// disparar otra crea instancias paralelas con dedup vacío y duplica envíos.
const MAX_PER_RUN = 10;
const DEDUP_DAYS = 60;

const TEMPLATE_SID = 'HX15df7b773fe9297d2d4271bad8200eae';
const TAG = 'Recup-Madres';
const LOCK_KEY = 'recup_madres_lock';
const LOCK_TTL_SEC = 90;

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

// Lock con TTL — evita que dos invocaciones corran al mismo tiempo
async function lockAcquire() {
  try {
    const cur = await supaREST('GET', `app_config?id=eq.${LOCK_KEY}&select=value`);
    if (cur && cur[0]) {
      const val = JSON.parse(cur[0].value || '{}');
      const startedAt = new Date(val.started_at || 0).getTime();
      if (Date.now() - startedAt < LOCK_TTL_SEC * 1000) return false;
    }
  } catch (e) { /* lock no existe aún, intentamos crear */ }
  try {
    const body = { id: LOCK_KEY, value: JSON.stringify({ started_at: new Date().toISOString() }) };
    // Upsert: si ya existe por race condition, falla y devolvemos false
    const opts = {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates,return=representation'
      },
      body: JSON.stringify(body)
    };
    const res = await fetch(`${SUPABASE_URL}/rest/v1/app_config`, opts);
    if (!res.ok) return false;
    return true;
  } catch (e) { return false; }
}

async function lockRelease() {
  try {
    await supaREST('PATCH', `app_config?id=eq.${LOCK_KEY}`, {
      value: JSON.stringify({ started_at: new Date(0).toISOString() })
    });
  } catch (e) { /* fail silent */ }
}

// Dedup PER-FONO inmediatamente antes de enviar.
// fail-closed: si la query falla, asumimos que ya fue contactado (mejor falso negativo que duplicado).
async function alreadyContacted(phone) {
  const since = new Date(Date.now() - DEDUP_DAYS * 86400000).toISOString();
  try {
    const r = await supaREST('GET',
      `clari_conversations?phone=eq.${phone}&content=ilike.*${TAG}*&created_at=gte.${since}&select=id&limit=1`
    );
    return Array.isArray(r) && r.length > 0;
  } catch (e) {
    console.error(`[RECUP-MADRES] Dedup query failed for ${phone}, fail-closed:`, e.message);
    return true; // fail-closed
  }
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

  // Lock para evitar invocaciones paralelas
  if (!dryRun) {
    const got = await lockAcquire();
    if (!got) {
      console.log('[RECUP-MADRES] Otra instancia en curso (lock activo). Saliendo.');
      return { statusCode: 200, body: JSON.stringify({ ok: true, enviados: 0, mensaje: 'Otra instancia ya está corriendo (lock)' }) };
    }
  }

  try {
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

    if (dryRun) {
      // En dry run, contar cuántos faltan haciendo dedup per-phone (más lento pero exacto)
      let yaContactados = 0;
      const muestraPendientes = [];
      for (const c of candidates) {
        const already = await alreadyContacted(c.phone);
        if (already) { yaContactados++; }
        else if (muestraPendientes.length < 10) {
          muestraPendientes.push({ nombre: (c.nombre || 'amigo').split(' ')[0], phone: '...' + c.phone.slice(-4) });
        }
      }
      const pendientes = candidates.length - yaContactados;
      return {
        statusCode: 200,
        body: JSON.stringify({
          ok: true, dryRun: true,
          total: candidates.length,
          yaContactados,
          pendientes,
          enviarEstaVez: Math.min(pendientes, MAX_PER_RUN),
          muestraPendientes
        }, null, 2)
      };
    }

    let enviados = 0;
    let saltados = 0;
    let errores = 0;

    for (const c of candidates) {
      if (enviados >= MAX_PER_RUN) break;

      // Dedup PER-FONO antes de enviar (no en batch al inicio)
      const already = await alreadyContacted(c.phone);
      if (already) { saltados++; continue; }

      const nombre = (c.nombre || 'amigo').split(' ')[0];
      const ok = await sendTemplate(c.phone, TEMPLATE_SID, { '1': nombre });

      if (ok) {
        // CRÍTICO: guardar historial INMEDIATAMENTE para que la siguiente
        // invocación vea este número como ya enviado.
        await saveToHistory(c.phone, 'assistant',
          `[${TAG}] Mensaje de recuperación enviado a ${nombre}`
        );
        enviados++;
        console.log(`[RECUP-MADRES] ✓ ${nombre} (..${c.phone.slice(-4)})`);
      } else {
        errores++;
      }

      await new Promise(resolve => setTimeout(resolve, 1500));
    }

    console.log(`[RECUP-MADRES] Completado: enviados=${enviados}, saltados=${saltados}, errores=${errores}`);

    if (enviados > 0) {
      const restantes = candidates.length - (await (async () => {
        // contar cuántos están ya contactados ahora (rápido por sample, costoso por exacto)
        // Para no agregar latencia al final, solo reportamos enviados-en-esta-tanda
        return 0;
      })());
      await sendAdminWA(
        `📊 *Recuperación Día de las Madres — Tanda*\n\n` +
        `✅ Enviados esta vez: ${enviados}\n` +
        `⏭ Saltados (ya contactados): ${saltados}\n` +
        `❌ Errores: ${errores}\n\n` +
        `👀 Las respuestas llegarán a Clari automáticamente.`
      );
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, enviados, saltados, errores })
    };

  } catch (err) {
    console.error('[RECUP-MADRES] Fatal:', err.message);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  } finally {
    if (!dryRun) await lockRelease();
  }
};
