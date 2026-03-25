// Review Blast — Envío masivo de encuesta de opinión a clientes no encuestados
// Endpoint manual: GET /.netlify/functions/review-blast?dias=30&key=SECRET
// Busca ventas liquidadas de los últimos N días, descarta ya encuestados, envía a todos
// Usar cuando se quiera un push masivo; el cron diario (review-cron) sigue normal después
//
// Modo dry run (?dry=1): responde con lista de clientes SIN enviar
// Modo cleanup (?cleanup=1): elimina registros [Review] duplicados en clari_conversations
// Modo envío real: envía en lotes de 20, con verificación anti-duplicado antes de cada envío

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_WA = process.env.TWILIO_WA_NUMBER;
const BLAST_KEY = process.env.BLAST_KEY || 'caryera2026';

const TEMPLATE_SID = 'HX80c7577a56dea4c6a675a9a7ea5c5cea';
const MAX_PER_RUN = 120;

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
      console.error(`[REVIEW-BLAST] WA error ${data.error_code}: ${data.message}`);
      return false;
    }
    return true;
  } catch (e) {
    console.error('[REVIEW-BLAST] WA exception:', e.message);
    return false;
  }
}

async function saveToHistory(phone, role, content) {
  try {
    await supaREST('POST', 'clari_conversations', {
      phone: normalizePhone(phone),
      role,
      content,
      user_name: 'review-blast'
    });
  } catch (e) { console.error('[REVIEW-BLAST] Save history error:', e.message); }
}

exports.handler = async function(event) {
  // Auth: requiere key en query string
  const qs = event.queryStringParameters || {};
  if (qs.key !== BLAST_KEY) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Key inválida. Usa ?key=TU_CLAVE' }) };
  }

  const dias = parseInt(qs.dias) || 30;
  const dryRun = qs.dry === '1';
  const cleanup = qs.cleanup === '1';

  // --- MODO CLEANUP: eliminar registros [Review] duplicados ---
  if (cleanup) {
    console.log('[REVIEW-BLAST] Modo cleanup — eliminando duplicados [Review]');
    try {
      const allReviews = await supaREST('GET',
        `clari_conversations?content=ilike.*[Review]*&select=id,phone,content,created_at&order=created_at.asc&limit=500`
      );
      if (!allReviews || !allReviews.length) {
        return { statusCode: 200, body: JSON.stringify({ ok: true, mensaje: 'No hay registros [Review]', eliminados: 0 }) };
      }
      // Agrupar por phone+content, quedarse con el primero, borrar los demás
      const seen = new Set();
      const toDelete = [];
      for (const r of allReviews) {
        const key = `${r.phone}|${r.content}`;
        if (seen.has(key)) {
          toDelete.push(r.id);
        } else {
          seen.add(key);
        }
      }
      console.log(`[REVIEW-BLAST] ${allReviews.length} registros totales, ${toDelete.length} duplicados a eliminar`);
      // Borrar duplicados en batches
      for (let i = 0; i < toDelete.length; i += 20) {
        const batch = toDelete.slice(i, i + 20);
        const idFilter = batch.map(id => `"${id}"`).join(',');
        await supaREST('DELETE', `clari_conversations?id=in.(${idFilter})`);
      }
      return {
        statusCode: 200,
        body: JSON.stringify({ ok: true, totalRegistros: allReviews.length, duplicadosEliminados: toDelete.length }, null, 2)
      };
    } catch (e) {
      console.error('[REVIEW-BLAST] Cleanup error:', e.message);
      return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
    }
  }

  console.log(`[REVIEW-BLAST] Inicio — últimos ${dias} días${dryRun ? ' (DRY RUN)' : ''}`);

  try {
    const now = new Date();
    // Desde N días atrás hasta hace 1 día (mínimo 1 día para que ya hayan recogido)
    const dateFrom = new Date(now);
    dateFrom.setDate(dateFrom.getDate() - dias);
    const dateTo = new Date(now);
    dateTo.setDate(dateTo.getDate() - 1);

    const fromDate = dateFrom.toISOString();
    const toDate = dateTo.toISOString();

    // Traer ventas liquidadas en el rango (paginado)
    let allVentas = [];
    for (let offset = 0; offset < 1000; offset += 200) {
      const batch = await supaREST('GET',
        `ventas?estado=eq.Liquidada&created_at=gte.${fromDate}&created_at=lte.${toDate}&select=id,folio,sucursal,paciente_id,pacientes(nombre,apellidos,telefono)&order=created_at.desc&limit=200&offset=${offset}`
      );
      if (!batch || !batch.length) break;
      allVentas = allVentas.concat(batch);
    }

    if (!allVentas.length) {
      return { statusCode: 200, body: JSON.stringify({ ok: true, mensaje: 'No hay ventas en ese rango', enviados: 0 }) };
    }

    // Filtrar con teléfono y dedup
    const withPhone = allVentas.filter(v => v.pacientes?.telefono);
    const byPhone = {};
    for (const v of withPhone) {
      const phone = normalizePhone(v.pacientes.telefono);
      if (!byPhone[phone]) byPhone[phone] = v;
    }

    // Ya encuestados (últimos 30 días)
    const phones = Object.keys(byPhone);
    const cutoff30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const alreadySent = new Set();

    for (let i = 0; i < phones.length; i += 20) {
      const batch = phones.slice(i, i + 20);
      const phoneFilter = batch.map(p => `"${p}"`).join(',');
      try {
        const existing = await supaREST('GET',
          `clari_conversations?phone=in.(${phoneFilter})&content=ilike.*[Review]*&created_at=gte.${cutoff30d}&select=phone`
        );
        if (existing) existing.forEach(e => alreadySent.add(e.phone));
      } catch (e) {
        console.warn('[REVIEW-BLAST] Check existing error:', e.message);
      }
    }

    const toSend = Object.entries(byPhone)
      .filter(([phone]) => !alreadySent.has(phone))
      .map(([, v]) => v)
      .slice(0, MAX_PER_RUN);

    console.log(`[REVIEW-BLAST] Ventas: ${allVentas.length}, Con tel: ${withPhone.length}, Únicos: ${phones.length}, Ya encuestados: ${alreadySent.size}, Por enviar: ${toSend.length}`);

    // Dry run: solo reportar sin enviar
    if (dryRun) {
      const lista = toSend.map(v => ({
        folio: v.folio,
        sucursal: v.sucursal,
        nombre: `${v.pacientes.nombre || ''} ${v.pacientes.apellidos || ''}`.trim(),
        telefono: v.pacientes.telefono
      }));
      return {
        statusCode: 200,
        body: JSON.stringify({
          ok: true,
          dryRun: true,
          dias,
          totalVentas: allVentas.length,
          conTelefono: withPhone.length,
          clientesUnicos: phones.length,
          yaEncuestados: alreadySent.size,
          porEnviar: toSend.length,
          lista
        }, null, 2)
      };
    }

    // Envío real — procesar en lotes con 1s entre cada mensaje
    // Netlify functions tienen ~26s timeout, suficiente para ~20 mensajes
    // Si hay más, procesa el primer lote y responde cuántos faltan (ejecutar de nuevo)
    const BATCH_LIMIT = 25;
    const batch = toSend.slice(0, BATCH_LIMIT);
    const remaining = toSend.length - batch.length;

    let enviados = 0;
    const resultados = [];

    for (const v of batch) {
      const tel = v.pacientes.telefono;
      const phone = normalizePhone(tel);
      const nombre = (v.pacientes.nombre || 'Cliente').split(' ')[0];
      const sucursal = v.sucursal || 'N/A';

      // Verificación anti-duplicado justo antes de enviar (previene race conditions)
      try {
        const existing = await supaREST('GET',
          `clari_conversations?phone=eq.${phone}&content=ilike.*[Review]*&created_at=gte.${cutoff30d}&select=id&limit=1`
        );
        if (existing && existing.length > 0) {
          console.log(`[REVIEW-BLAST] ⏭ ${nombre} ya encuestado, skip`);
          resultados.push({ folio: v.folio, nombre, sucursal, status: 'ya_encuestado' });
          continue;
        }
      } catch (e) { /* si falla la verificación, intentar enviar de todas formas */ }

      const ok = await sendTemplate(tel, TEMPLATE_SID, { '1': nombre });

      if (ok) {
        await saveToHistory(tel, 'assistant',
          `[Review] Encuesta de opinión enviada — Folio: ${v.folio}, Sucursal: ${sucursal}`
        );
        enviados++;
        resultados.push({ folio: v.folio, nombre, sucursal, status: 'enviado' });
        console.log(`[REVIEW-BLAST] ✓ ${nombre} (${sucursal}) — Folio ${v.folio}`);
      } else {
        resultados.push({ folio: v.folio, nombre, sucursal, status: 'error' });
        console.log(`[REVIEW-BLAST] ✗ ${nombre} (${sucursal}) — Folio ${v.folio}`);
      }

      // Rate limit: 1s entre mensajes
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log(`[REVIEW-BLAST] Completado: ${enviados}/${batch.length} enviados`);

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        dias,
        enviados,
        total: batch.length,
        pendientes: remaining,
        nota: remaining > 0 ? `Quedan ${remaining} más. Ejecuta de nuevo para enviar el siguiente lote.` : 'Todos enviados.',
        resultados
      }, null, 2)
    };

  } catch (e) {
    console.error('[REVIEW-BLAST] Error:', e.message);
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
