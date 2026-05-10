// One-shot: corregir respuestas de Clari que dijeron 5pm el 10-may-2026
// Día de las Madres — cierre real a las 3pm

const SUPA_URL = 'https://icsnlgeereepesbrdjhf.supabase.co';

const TARGETS = [
  { psid: '2793774220729386', channel: 'page' },
  { psid: '35331371299843766', channel: 'page' },
  { psid: '26741077495519774', channel: 'page' }
];

const MENSAJE = 'Corrección — hoy domingo 10 de mayo cerramos a las 3:00pm por Día de las Madres, no a las 5pm como te dije antes. Disculpa la confusión 🌷';
const TAG = '[Correccion-Horario-3pm]';

async function supaFetch(path, options = {}) {
  const url = SUPA_URL + '/rest/v1/' + path;
  const headers = {
    'apikey': process.env.SUPABASE_SERVICE_ROLE,
    'Authorization': 'Bearer ' + process.env.SUPABASE_SERVICE_ROLE,
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };
  const r = await fetch(url, { ...options, headers });
  if (options.method && options.method !== 'GET') return r.ok;
  return r.json();
}

async function alreadySent(psid) {
  const path = 'clari_conversations?phone=eq.' + psid + '&content=ilike.*' + encodeURIComponent(TAG.replace(/[\[\]]/g, '%')) + '*&select=id&limit=1';
  const rows = await supaFetch(path);
  return Array.isArray(rows) && rows.length > 0;
}

async function logSent(psid) {
  await supaFetch('clari_conversations', {
    method: 'POST',
    body: JSON.stringify({
      phone: psid,
      role: 'assistant',
      content: TAG + ' ' + MENSAJE,
      user_name: 'clari-messenger',
      created_at: new Date().toISOString()
    })
  });
}

async function sendMessenger(psid) {
  const url = 'https://graph.facebook.com/v18.0/me/messages?access_token=' + process.env.META_PAGE_TOKEN;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { id: psid },
      message: { text: MENSAJE },
      messaging_type: 'RESPONSE'
    })
  });
  const j = await r.json();
  return { ok: r.ok, status: r.status, data: j };
}

exports.handler = async (event) => {
  const key = event.queryStringParameters && event.queryStringParameters.key;
  if (key !== process.env.BLAST_KEY) {
    return { statusCode: 401, body: 'Unauthorized' };
  }

  const results = [];
  for (const t of TARGETS) {
    try {
      if (await alreadySent(t.psid)) {
        results.push({ psid: t.psid, status: 'skipped' });
        continue;
      }
      const send = await sendMessenger(t.psid);
      if (send.ok) {
        await logSent(t.psid);
        results.push({ psid: t.psid, status: 'sent' });
      } else {
        results.push({ psid: t.psid, status: 'failed', err: send.data });
      }
    } catch (e) {
      results.push({ psid: t.psid, status: 'error', err: e.message });
    }
    await new Promise(r => setTimeout(r, 800));
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ results }, null, 2)
  };
};
