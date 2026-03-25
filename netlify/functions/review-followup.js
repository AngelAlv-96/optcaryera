// Review Follow-up — Segundo toque a clientes que respondieron positivo
// Busca quienes respondieron "Todo excelente" o "Buenas promos" hace 2-5 días
// y les envía un recordatorio amable con el link de Google Maps
// Netlify Scheduled Function o manual: GET /.netlify/functions/review-followup?key=SECRET

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_WA = process.env.TWILIO_WA_NUMBER;
const BLAST_KEY = process.env.BLAST_KEY || 'caryera2026';

const MAX_PER_RUN = 30;

// Days after positive response to send follow-up
const FOLLOWUP_MIN_DAYS = 2;
const FOLLOWUP_MAX_DAYS = 5;

const MAPS_LINKS = {
  'Américas': 'https://g.page/r/CV9ZD9ZPVjvbEBM/review',
  'Pinocelli': 'https://g.page/r/Cdzzax18yI15EBM/review',
  'Magnolia': 'https://g.page/r/CTVxzblIsQ6IEBM/review'
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
  let num = phone.replace(/[\s\-\(\)\+]/g, '');
  if (num.length === 10) num = '521' + num;
  if (num.length === 12 && num.startsWith('52') && num[2] !== '1') num = '521' + num.slice(2);
  return num;
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
      console.error(`[REVIEW-FOLLOWUP] WA error ${data.error_code}: ${data.message}`);
      return false;
    }
    return true;
  } catch (e) {
    console.error('[REVIEW-FOLLOWUP] WA exception:', e.message);
    return false;
  }
}

async function saveToHistory(phone, role, content) {
  try {
    await supaREST('POST', 'clari_conversations', {
      phone: normalizePhone(phone),
      role,
      content,
      user_name: 'review-followup'
    });
  } catch (e) { console.error('[REVIEW-FOLLOWUP] Save history error:', e.message); }
}

exports.handler = async function(event) {
  // Auth for manual invocation
  const qs = event.queryStringParameters || {};
  const isScheduled = event.httpMethod === 'OPTIONS' || !event.httpMethod;
  if (!isScheduled && qs.key !== BLAST_KEY) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Key inválida. Usa ?key=TU_CLAVE' }) };
  }

  const dryRun = qs.dry === '1';

  console.log(`[REVIEW-FOLLOWUP] Inicio${dryRun ? ' (DRY RUN)' : ''}`);

  try {
    // ⏰ Guard de horario: solo enviar entre 10am-8pm hora Chihuahua
    const nowCH = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chihuahua' }));
    const hora = nowCH.getHours();
    if (hora < 10 || hora >= 20) {
      console.log(`[REVIEW-FOLLOWUP] ⏰ Fuera de horario (${hora}:${String(nowCH.getMinutes()).padStart(2,'0')} Chihuahua). No se envían mensajes.`);
      return { statusCode: 200, body: JSON.stringify({ ok: true, enviados: 0, mensaje: 'Fuera de horario permitido (10am-8pm CST)' }) };
    }

    const now = new Date();
    // Window: positive responses from FOLLOWUP_MIN_DAYS to FOLLOWUP_MAX_DAYS ago
    const dateFrom = new Date(now);
    dateFrom.setDate(dateFrom.getDate() - FOLLOWUP_MAX_DAYS);
    const dateTo = new Date(now);
    dateTo.setDate(dateTo.getDate() - FOLLOWUP_MIN_DAYS);

    // Find positive review responses in the window
    // These contain "[Review Response]" AND the Maps link (meaning they responded positively)
    const positiveResponses = await supaREST('GET',
      `clari_conversations?content=ilike.*[Review Response]*estrellitas*&created_at=gte.${dateFrom.toISOString()}&created_at=lte.${dateTo.toISOString()}&select=phone,content,created_at&order=created_at.desc&limit=200`
    );

    // Also check for "buenas promos" responses
    const promoResponses = await supaREST('GET',
      `clari_conversations?content=ilike.*[Review Response]*promos*&created_at=gte.${dateFrom.toISOString()}&created_at=lte.${dateTo.toISOString()}&select=phone,content,created_at&order=created_at.desc&limit=200`
    );

    // Combine and deduplicate by phone
    const allPositive = [...(positiveResponses || []), ...(promoResponses || [])];
    const byPhone = {};
    for (const r of allPositive) {
      if (!byPhone[r.phone]) byPhone[r.phone] = r;
    }

    const phones = Object.keys(byPhone);
    console.log(`[REVIEW-FOLLOWUP] ${phones.length} respuestas positivas en ventana ${FOLLOWUP_MIN_DAYS}-${FOLLOWUP_MAX_DAYS} días`);

    if (!phones.length) {
      return { statusCode: 200, body: JSON.stringify({ ok: true, enviados: 0, mensaje: 'No hay follow-ups pendientes' }) };
    }

    // Check which ones already got a follow-up OR expressed negative sentiment after
    const alreadyFollowed = new Set();
    const unhappyClients = new Set();
    const NEGATIVE_WORDS = ['mal', 'pésim', 'queja', 'molest', 'enojad', 'no me gust', 'decepcion', 'terrible', 'horrible', 'reclam', 'devol', 'regres'];

    for (let i = 0; i < phones.length; i += 20) {
      const batch = phones.slice(i, i + 20);
      const phoneFilter = batch.map(p => `"${p}"`).join(',');
      try {
        // Already followed up?
        const existing = await supaREST('GET',
          `clari_conversations?phone=in.(${phoneFilter})&content=ilike.*[Review Followup]*&select=phone&limit=200`
        );
        if (existing) existing.forEach(e => alreadyFollowed.add(e.phone));

        // Check for negative messages AFTER the positive response (last 7 days)
        const recentMsgs = await supaREST('GET',
          `clari_conversations?phone=in.(${phoneFilter})&role=eq.user&created_at=gte.${dateFrom.toISOString()}&select=phone,content&limit=500`
        );
        if (recentMsgs) {
          for (const msg of recentMsgs) {
            const lower = (msg.content || '').toLowerCase();
            if (NEGATIVE_WORDS.some(w => lower.includes(w))) {
              unhappyClients.add(msg.phone);
              console.log(`[REVIEW-FOLLOWUP] ⚠ ${msg.phone} tiene mensaje negativo, skip`);
            }
          }
        }
      } catch (e) {
        console.warn('[REVIEW-FOLLOWUP] Check existing error:', e.message);
      }
    }

    console.log(`[REVIEW-FOLLOWUP] ${alreadyFollowed.size} ya tienen follow-up, ${unhappyClients.size} con sentimiento negativo`);

    // Filter: no follow-up yet AND no negative sentiment
    const toSend = phones
      .filter(p => !alreadyFollowed.has(p) && !unhappyClients.has(p))
      .slice(0, MAX_PER_RUN);

    console.log(`[REVIEW-FOLLOWUP] ${toSend.length} por enviar`);

    if (dryRun) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          ok: true, dryRun: true,
          positivosEnVentana: phones.length,
          yaConFollowup: alreadyFollowed.size,
          porEnviar: toSend.length,
          phones: toSend
        }, null, 2)
      };
    }

    // Extract sucursal from original [Review] entry for each phone
    let enviados = 0;
    for (const phone of toSend) {
      // Find the original [Review] entry to get sucursal
      let sucursal = '';
      try {
        const reviewEntry = await supaREST('GET',
          `clari_conversations?phone=eq.${phone}&content=ilike.*[Review] Encuesta*&select=content&order=created_at.desc&limit=1`
        );
        if (reviewEntry && reviewEntry[0]) {
          const sucMatch = reviewEntry[0].content.match(/Sucursal:\s*([^\n,]+)/);
          sucursal = sucMatch ? sucMatch[1].trim() : '';
        }
      } catch (e) { /* use default */ }

      const mapsLink = MAPS_LINKS[sucursal] || MAPS_LINKS['Américas'];

      // Find customer name from pacientes via clari_conversations user_name
      let nombre = '';
      try {
        const userMsg = await supaREST('GET',
          `clari_conversations?phone=eq.${phone}&role=eq.user&select=user_name&order=created_at.desc&limit=1`
        );
        if (userMsg && userMsg[0] && userMsg[0].user_name) {
          nombre = userMsg[0].user_name.split(' ')[0];
        }
      } catch (e) { /* use generic */ }

      const greeting = nombre ? `¡Hola ${nombre}! ` : '¡Hola! ';
      const followupMsg = greeting + 'Hace unos días nos dijiste que tu experiencia en Car & Era fue buena 😊\n\n' +
        '¿Ya pudiste dejarnos tu reseña? Solo toma 30 segundos y nos ayuda muchísimo:\n\n' +
        '⭐ ' + mapsLink + '\n\n' +
        'Con tu reseña, más personas en Juárez pueden encontrarnos. ¡Gracias! 🙏👓';

      const ok = await sendWA(phone, followupMsg);

      if (ok) {
        await saveToHistory(phone, 'assistant', `[Review Followup] Recordatorio enviado — Sucursal: ${sucursal || 'N/A'}`);
        enviados++;
        console.log(`[REVIEW-FOLLOWUP] ✓ ${nombre || phone}`);
      }

      // Rate limit
      await new Promise(resolve => setTimeout(resolve, 1500));
    }

    console.log(`[REVIEW-FOLLOWUP] Completado: ${enviados}/${toSend.length}`);
    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, enviados, total: toSend.length })
    };

  } catch (e) {
    console.error('[REVIEW-FOLLOWUP] Error:', e.message);
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
