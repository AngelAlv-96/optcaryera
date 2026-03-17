// LC CRM — Auto-reminder via WhatsApp (Clari)
// Runs daily, sends reminders 7 days before fecha_recompra
// Netlify Scheduled Function

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_WA = process.env.TWILIO_WA_NUMBER;

const DIAS_ANTES = 7;

async function supaREST(method, path, body) {
  const opts = {
    method,
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': method === 'PATCH' ? 'return=representation' : 'return=representation'
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

async function enviarWA(to, message) {
  if (!TWILIO_SID || !TWILIO_TOKEN || !TWILIO_WA) {
    console.log('[LC-CRON] Twilio no configurado, skip WA');
    return false;
  }
  let cleanTo = to.replace(/\D/g, '');
  if (cleanTo.length === 10) cleanTo = '52' + cleanTo;
  if (!cleanTo.startsWith('521')) cleanTo = cleanTo.replace(/^52/, '521');

  const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`;
  const params = new URLSearchParams();
  const fromNum = TWILIO_WA.startsWith('whatsapp:') ? TWILIO_WA : `whatsapp:${TWILIO_WA}`;
  params.append('From', fromNum);
  params.append('To', `whatsapp:+${cleanTo}`);
  params.append('Body', message);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params.toString()
    });
    if (res.ok) {
      console.log(`[LC-CRON] WA enviado a +${cleanTo}`);
      return true;
    }
    const err = await res.text();
    console.error(`[LC-CRON] WA error ${res.status}:`, err);
    return false;
  } catch(e) {
    console.error('[LC-CRON] WA exception:', e.message);
    return false;
  }
}

exports.handler = async function(event) {
  console.log('[LC-CRON] Iniciando revisión de recompras LC...');

  try {
    // Calcular fecha objetivo: hoy + 7 días
    const hoy = new Date();
    const target = new Date(hoy);
    target.setDate(target.getDate() + DIAS_ANTES);
    const targetStr = target.toISOString().slice(0, 10);
    const hoyStr = hoy.toISOString().slice(0, 10);

    // Buscar registros activos cuya fecha_recompra sea <= hoy+7 y no notificados
    const registros = await supaREST('GET',
      `lc_seguimiento?estado=eq.activo&notificado=eq.false&fecha_recompra=lte.${targetStr}&select=id,paciente_id,producto,fecha_recompra,sucursal,pacientes(nombre,apellidos,telefono)`
    );

    if (!registros || !registros.length) {
      console.log('[LC-CRON] No hay LC pendientes de notificar');
      return { statusCode: 200, body: JSON.stringify({ ok: true, enviados: 0 }) };
    }

    console.log(`[LC-CRON] ${registros.length} registros por notificar`);
    let enviados = 0;

    for (const r of registros) {
      const tel = r.pacientes?.telefono;
      if (!tel) {
        console.log(`[LC-CRON] Sin teléfono para paciente ${r.paciente_id}, skip`);
        continue;
      }

      const nombre = (r.pacientes?.nombre || 'Cliente').split(' ')[0];
      const diasFaltan = Math.round((new Date(r.fecha_recompra) - hoy) / 86400000);
      const urgencia = diasFaltan <= 0 ? '¡Ya es tiempo de renovar!' : `Le quedan aproximadamente ${diasFaltan} días.`;

      const msg = `Hola ${nombre} 👋\n\nLe recordamos que es tiempo de renovar sus lentes de contacto (${r.producto}). ${urgencia}\n\nPase a Ópticas Car & Era${r.sucursal ? ' — ' + r.sucursal : ''} para re-surtir su receta.\n\nHorario:\nLun.-Sab. 10:00am-7:00pm\nDom. 11:00am-5:00pm\n\n¿Desea agendar o tiene alguna pregunta? Responda este mensaje. 😊`;

      const ok = await enviarWA(tel, msg);
      if (ok) {
        // Marcar como notificado
        await supaREST('PATCH',
          `lc_seguimiento?id=eq.${r.id}`,
          { notificado: true, fecha_notificacion: new Date().toISOString() }
        );
        enviados++;
      }

      // Rate limit: esperar 1.5s entre mensajes
      await new Promise(resolve => setTimeout(resolve, 1500));
    }

    console.log(`[LC-CRON] Completado: ${enviados}/${registros.length} enviados`);
    return { statusCode: 200, body: JSON.stringify({ ok: true, enviados, total: registros.length }) };

  } catch(e) {
    console.error('[LC-CRON] Error:', e.message);
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
