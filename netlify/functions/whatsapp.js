// /.netlify/functions/whatsapp.js
// WhatsApp via Twilio API — sends text and template messages
// Saves ALL outbound messages to clari_conversations for full history
// Env vars: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WA_NUMBER

const TWILIO_SID   = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_WA    = process.env.TWILIO_WA_NUMBER || 'whatsapp:+5216563110094';
const SUPA_URL     = process.env.SUPABASE_URL || 'https://icsnlgeereepesbrdjhf.supabase.co';
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

const TWILIO_API = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`;

const BASE_USERS = {
  'americas':  { pass: 'americas01',  rol: 'sucursal' },
  'pinocelli': { pass: 'pinocelli01', rol: 'sucursal' },
  'magnolia':  { pass: 'magnolia01',  rol: 'sucursal' },
  'gerencia':  { pass: 'car2024ge',   rol: 'gerencia' },
  'admin':     { pass: 'car2024ad',   rol: 'admin' },
  'carera':    { pass: 'carera2024',  rol: 'admin' },
};

async function getCustomUsers() {
  try {
    const res = await fetch(`${SUPA_URL}/rest/v1/app_config?id=eq.custom_users&select=value`, {
      headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` }
    });
    const data = await res.json();
    if (data?.[0]?.value) {
      const v = data[0].value;
      return typeof v === 'string' ? JSON.parse(v) : v;
    }
  } catch(e) {}
  return {};
}

async function getWhatsAppConfig() {
  try {
    const res = await fetch(`${SUPA_URL}/rest/v1/app_config?id=eq.whatsapp_config&select=value`, {
      headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` }
    });
    const data = await res.json();
    if (data?.[0]?.value) {
      const v = data[0].value;
      return typeof v === 'string' ? JSON.parse(v) : v;
    }
  } catch(e) {}
  return {};
}

function normalizePhone(phone) {
  let num = phone.replace(/[\s\-\(\)\+]/g, '');
  if (num.length === 10) num = '521' + num;
  if (num.length === 12 && num.startsWith('52') && num[2] !== '1') num = '521' + num.slice(2);
  return num;
}

async function saveToHistory(phone, role, content, source) {
  if (!SERVICE_KEY) return;
  try {
    await fetch(`${SUPA_URL}/rest/v1/clari_conversations`, {
      method: 'POST',
      headers: {
        'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json', 'Prefer': 'return=minimal'
      },
      body: JSON.stringify({ phone: normalizePhone(phone), role, content, user_name: source || null })
    });
  } catch(e) { console.error('[SaveHistory]', e.message); }
}

// Send free-form text message via Twilio
async function sendTextMessage(to, text) {
  const toNum = normalizePhone(to);
  const auth = Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString('base64');
  const params = new URLSearchParams();
  params.append('From', TWILIO_WA);
  params.append('To', `whatsapp:+${toNum}`);
  params.append('Body', text);
  const res = await fetch(TWILIO_API, {
    method: 'POST',
    headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString()
  });
  const data = await res.json();
  if (data.error_code || data.code) throw new Error(data.message || JSON.stringify(data));
  return data;
}

// Send template message via Twilio Content API
async function sendTemplateMessage(to, contentSid, variables) {
  const toNum = normalizePhone(to);
  const auth = Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString('base64');
  const params = new URLSearchParams();
  params.append('From', TWILIO_WA);
  params.append('To', `whatsapp:+${toNum}`);
  params.append('ContentSid', contentSid);
  if (variables && Object.keys(variables).length) {
    // Clean all variable values — ensure strings, trim whitespace, no empty values
    const clean = {};
    Object.entries(variables).forEach(([k, v]) => {
      const val = String(v || '').trim();
      clean[k] = val || '-';
    });
    console.log('[WA] Template:', contentSid, 'Vars:', JSON.stringify(clean));
    params.append('ContentVariables', JSON.stringify(clean));
  }
  const res = await fetch(TWILIO_API, {
    method: 'POST',
    headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString()
  });
  const data = await res.json();
  if (data.error_code || data.code) {
    console.error('[WA] Twilio error:', data.error_code, data.message);
    throw new Error(data.message || JSON.stringify(data));
  }
  return data;
}

function templateToText(templateName, variables) {
  const descriptions = {
    'lentes_listos': '🎉 Tus lentes están listos para recoger',
    'ticket_digital': '🧾 Ticket digital enviado',
    'comprobante_abono': '💰 Comprobante de abono enviado',
    'corte_caja_resumen': '📊 Resumen de corte de caja'
  };
  let text = descriptions[templateName] || '📋 Template: ' + templateName;
  if (variables) {
    var vals = Object.values(variables);
    if (vals.length) text += '\n' + vals.join(' | ');
  }
  return text;
}

exports.handler = async (event) => {
  const H = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: H, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: H, body: JSON.stringify({ error: 'Method not allowed' }) };

  if (!TWILIO_TOKEN || !TWILIO_SID) {
    return { statusCode: 503, headers: H, body: JSON.stringify({ error: 'Twilio no configurado.', code: 'NOT_CONFIGURED' }) };
  }

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, headers: H, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const { action, auth } = body;
  if (!auth?.id || !auth?.pass) return { statusCode: 401, headers: H, body: JSON.stringify({ error: 'Auth required' }) };

  const custom = await getCustomUsers();
  const allUsers = { ...BASE_USERS };
  Object.entries(custom).forEach(([uid, u]) => { if (u?.pass) allUsers[uid] = { pass: u.pass, rol: u.rol || 'sucursal' }; });
  const user = allUsers[auth.id];
  if (!user || user.pass !== auth.pass) return { statusCode: 401, headers: H, body: JSON.stringify({ error: 'Auth failed' }) };

  const sourceLabel = body.source || auth.id;

  try {
    switch (action) {

      case 'send': {
        const { phone, message, template, template_variables } = body;
        if (!phone) return { statusCode: 400, headers: H, body: JSON.stringify({ error: 'phone required' }) };

        let result, historyText;
        if (template) {
          // template = ContentSid from Twilio, template_variables = {1: "val", 2: "val"}
          result = await sendTemplateMessage(phone, template, template_variables);
          historyText = templateToText(template, template_variables);
        } else if (message) {
          result = await sendTextMessage(phone, message);
          historyText = message;
        } else {
          return { statusCode: 400, headers: H, body: JSON.stringify({ error: 'message or template required' }) };
        }
        await saveToHistory(phone, 'assistant', `[Sistema] ${historyText}`, sourceLabel);
        return { statusCode: 200, headers: H, body: JSON.stringify({ ok: true, result: { sid: result.sid, status: result.status } }) };
      }

      case 'send_bulk': {
        const { phones, message, template, template_variables } = body;
        if (!phones?.length) return { statusCode: 400, headers: H, body: JSON.stringify({ error: 'phones[] required' }) };
        const historyText = template ? templateToText(template, template_variables) : message;
        const results = [];
        for (const phone of phones) {
          try {
            let r;
            if (template) { r = await sendTemplateMessage(phone, template, template_variables); }
            else { r = await sendTextMessage(phone, message); }
            results.push({ phone, ok: true, id: r.sid });
            await saveToHistory(phone, 'assistant', `[Sistema] ${historyText}`, sourceLabel);
          } catch (err) { results.push({ phone, ok: false, error: err.message }); }
        }
        const sent = results.filter(r => r.ok).length;
        return { statusCode: 200, headers: H, body: JSON.stringify({ ok: true, sent, total: phones.length, results }) };
      }

      case 'send_corte': {
        const { message } = body;
        if (!message) return { statusCode: 400, headers: H, body: JSON.stringify({ error: 'message required' }) };
        const config = await getWhatsAppConfig();
        const recipients = config?.recipients_corte || [];
        if (!recipients.length) return { statusCode: 400, headers: H, body: JSON.stringify({ error: 'No hay destinatarios para corte.', code: 'NO_RECIPIENTS' }) };
        const results = [];
        for (const phone of recipients) {
          try {
            const r = await sendTextMessage(phone, message);
            results.push({ phone, ok: true, id: r.sid });
            await saveToHistory(phone, 'assistant', `[Corte] ${message}`, sourceLabel);
          } catch (err) { results.push({ phone, ok: false, error: err.message }); }
        }
        const sent = results.filter(r => r.ok).length;
        return { statusCode: 200, headers: H, body: JSON.stringify({ ok: true, sent, total: recipients.length, results }) };
      }

      case 'send_corte_template': {
        const { template, template_variables } = body;
        if (!template) return { statusCode: 400, headers: H, body: JSON.stringify({ error: 'template required' }) };
        const configT = await getWhatsAppConfig();
        const recipientsT = configT?.recipients_corte || [];
        if (!recipientsT.length) return { statusCode: 400, headers: H, body: JSON.stringify({ error: 'No hay destinatarios para corte.', code: 'NO_RECIPIENTS' }) };
        const resultsT = [];
        const histText = templateToText('corte_caja_resumen', template_variables);
        for (const phone of recipientsT) {
          try {
            const r = await sendTemplateMessage(phone, template, template_variables);
            resultsT.push({ phone, ok: true, id: r.sid });
            await saveToHistory(phone, 'assistant', `[Corte] ${histText}`, sourceLabel);
          } catch (err) { resultsT.push({ phone, ok: false, error: err.message }); }
        }
        const sentT = resultsT.filter(r => r.ok).length;
        return { statusCode: 200, headers: H, body: JSON.stringify({ ok: true, sent: sentT, total: recipientsT.length, results: resultsT }) };
      }

      case 'status': {
        const config = await getWhatsAppConfig();
        return { statusCode: 200, headers: H, body: JSON.stringify({
          configured: true, provider: 'twilio',
          has_recipients_corte: (config?.recipients_corte?.length || 0) > 0,
          recipients_corte_count: config?.recipients_corte?.length || 0
        })};
      }

      default:
        return { statusCode: 400, headers: H, body: JSON.stringify({ error: 'Invalid action: ' + action }) };
    }
  } catch (err) {
    console.error('[whatsapp-twilio]', err);
    return { statusCode: 500, headers: H, body: JSON.stringify({ error: err.message }) };
  }
};
