// /.netlify/functions/clip-webhook.js
// Receives Clip checkout webhook when a payment is completed
// Registers the payment in venta_pagos, updates the venta saldo,
// and sends WhatsApp notifications to admin + branch
// Env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WA_NUMBER

const SUPA_URL = process.env.SUPABASE_URL || 'https://icsnlgeereepesbrdjhf.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CLIP_WEBHOOK_TOKEN = process.env.CLIP_WEBHOOK_TOKEN;
const ALLOWED_ORIGIN = process.env.URL || 'https://optcaryera.netlify.app';
const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_WA = process.env.TWILIO_WA_NUMBER || 'whatsapp:+5216563110094';

async function supaREST(method, path, body, extraHeaders) {
  const headers = {
    'apikey': SERVICE_KEY,
    'Authorization': `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json'
  };
  if (extraHeaders) Object.entries(extraHeaders).forEach(([k, v]) => { if (v) headers[k] = v; });
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${SUPA_URL}/rest/v1/${path}`, opts);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { ok: res.ok, status: res.status, data };
}

function normalizePhone(phone) {
  let num = phone.replace(/[\s\-\(\)\+]/g, '');
  if (num.length === 10) num = '521' + num;
  if (num.length === 12 && num.startsWith('52') && num[2] !== '1') num = '521' + num.slice(2);
  return num;
}

async function sendWA(to, text) {
  if (!TWILIO_SID || !TWILIO_TOKEN) return;
  try {
    const toNum = normalizePhone(to);
    const auth = Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString('base64');
    const params = new URLSearchParams();
    params.append('From', TWILIO_WA);
    params.append('To', `whatsapp:+${toNum}`);
    params.append('Body', text);
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
      method: 'POST',
      headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });
    const data = await res.json();
    if (data.error_code) console.warn('WA send error:', data.message);
  } catch (e) { console.warn('WA send failed:', e.message); }
}

async function sendWATemplate(to, contentSid, vars) {
  if (!TWILIO_SID || !TWILIO_TOKEN) return;
  try {
    const toNum = normalizePhone(to);
    const auth = Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString('base64');
    const params = new URLSearchParams();
    params.append('From', TWILIO_WA);
    params.append('To', `whatsapp:+${toNum}`);
    params.append('ContentSid', contentSid);
    params.append('ContentVariables', JSON.stringify(vars));
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
      method: 'POST',
      headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });
    const data = await res.json();
    if (data.error_code) console.warn('WA template send error:', data.message);
  } catch (e) { console.warn('WA template send failed:', e.message); }
}

async function getWhatsAppConfig() {
  try {
    const res = await supaREST('GET', 'app_config?id=eq.whatsapp_config&select=value');
    if (res.ok && res.data?.[0]?.value) {
      const v = res.data[0].value;
      return typeof v === 'string' ? JSON.parse(v) : v;
    }
  } catch (e) {}
  return {};
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers };

  // Clip sends POST with webhook data
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: '{"error":"Method not allowed"}' };

  // Verify webhook token if configured (add CLIP_WEBHOOK_TOKEN env var + ?token=XXX in Clip dashboard webhook URL)
  if (CLIP_WEBHOOK_TOKEN) {
    const params = event.queryStringParameters || {};
    if (params.token !== CLIP_WEBHOOK_TOKEN) {
      console.warn('Clip webhook: invalid token, got:', params.token || '(none)', 'expected:', CLIP_WEBHOOK_TOKEN.slice(0, 4) + '...');
      return { statusCode: 401, headers, body: '{"error":"Unauthorized"}' };
    }
  }

  try {
    const payload = JSON.parse(event.body || '{}');

    // Clip sends nested payloads — extract from payment_detail or payment_request_detail
    const pd = payload.payment_detail || {};
    const prd = payload.payment_request_detail || {};

    // Log full payload for debugging
    console.log('Clip webhook FULL payload:', JSON.stringify(payload).slice(0, 1500));

    // Extract fields from all possible Clip payload structures
    const statusRaw = payload.status || pd.status_description || prd.status_description || payload.resource_status || '';
    const status = statusRaw.toUpperCase();
    const paymentId = payload.payment_request_id || prd.payment_request_id || pd.payment_request_id || '';
    const receiptNo = payload.receipt_no || pd.receipt_no || '';
    const amount = Number(payload.amount) || Number(pd.amount) || Number(prd.amount) || 0;
    const reference = payload.metadata?.me_reference_id || payload.metadata?.external_reference
      || prd.metadata?.me_reference_id || prd.metadata?.external_reference || '';
    // Clip checkout API returns payment_request_id, postback webhook may include payment_request_code
    const prid = paymentId || prd.payment_request_code || '';

    console.log(`Clip webhook parsed: status=${status}, amount=${amount}, ref=${reference}, prid=${prid}, receipt=${receiptNo}`);

    // Only process completed payments — Clip sends different status strings across webhook types
    const COMPLETED_STATUSES = ['COMPLETED', 'CHECKOUT_COMPLETED', 'PAID'];
    if (!COMPLETED_STATUSES.includes(status)) {
      console.log(`Clip webhook: status=${status}, skipping (not completed/paid)`);
      return { statusCode: 200, headers, body: JSON.stringify({ received: true, action: 'skipped', status }) };
    }

    if (!amount) {
      console.log('Clip webhook: missing amount');
      return { statusCode: 200, headers, body: JSON.stringify({ received: true, action: 'skipped', reason: 'no amount' }) };
    }

    // Find the venta — try by folio first, then by clip_prid in notas
    let ventaRes;
    if (reference) {
      ventaRes = await supaREST('GET', `ventas?folio=eq.${encodeURIComponent(reference)}&select=id,folio,total,pagado,saldo,sucursal,notas,pacientes(nombre,apellidos)`);
    }
    if ((!ventaRes?.ok || !ventaRes?.data?.length) && prid) {
      // Search by payment_request_id saved in notas by clip-payment.js
      ventaRes = await supaREST('GET', `ventas?notas=like.*clip_prid:${encodeURIComponent(prid)}*&select=id,folio,total,pagado,saldo,sucursal,notas,pacientes(nombre,apellidos)`);
      if (ventaRes?.ok && ventaRes?.data?.length) {
        console.log(`Clip webhook: found venta by prid=${prid}, folio=${ventaRes.data[0].folio}`);
      }
    }
    if (!ventaRes?.ok || !ventaRes?.data?.length) {
      console.error('Clip webhook: venta not found for ref=', reference, 'prid=', prid);
      return { statusCode: 200, headers, body: JSON.stringify({ received: true, action: 'error', reason: 'venta not found' }) };
    }

    const venta = ventaRes.data[0];

    // Check for duplicate by receipt_no (stable across all Clip webhook types)
    const dupKey = receiptNo ? `clip_${receiptNo}` : `clip_${prid || paymentId}`;
    const dupCheck = await supaREST('GET', `venta_pagos?venta_id=eq.${venta.id}&referencia=eq.${encodeURIComponent(dupKey)}&select=id`);
    if (dupCheck.ok && dupCheck.data?.length > 0) {
      console.log('Clip webhook: duplicate payment, already registered');
      return { statusCode: 200, headers, body: JSON.stringify({ received: true, action: 'duplicate' }) };
    }

    // Register the payment in venta_pagos
    const pagoBody = {
      venta_id: venta.id,
      monto: amount,
      metodo_pago: 'Link de pago',
      referencia: dupKey,
      notas: `Pago en línea Clip · Recibo: ${receiptNo || 'N/A'}`
    };

    const pagoRes = await supaREST('POST', 'venta_pagos', pagoBody, { 'Prefer': 'return=representation' });
    if (!pagoRes.ok) {
      console.error('Clip webhook: failed to insert pago', pagoRes.data);
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Failed to register payment' }) };
    }

    // Update venta pagado and saldo
    const newPagado = Number(venta.pagado) + amount;
    const newSaldo = Number(venta.total) - newPagado;
    const updateBody = {
      pagado: newPagado,
      saldo: Math.max(0, newSaldo)
    };
    // If fully paid, mark as completed
    if (newSaldo <= 0) updateBody.estado = 'Completada';

    const updateRes = await supaREST('PATCH', `ventas?id=eq.${venta.id}`, updateBody);
    if (!updateRes.ok) {
      console.error('Clip webhook: failed to update venta', updateRes.data);
    }

    console.log(`Clip webhook: payment registered — folio=${venta.folio}, amount=$${amount}, new_saldo=$${Math.max(0, newSaldo)}, ref=${dupKey}`);

    // --- Send WhatsApp notifications ---
    const pacNombre = venta.pacientes ? `${venta.pacientes.nombre || ''} ${venta.pacientes.apellidos || ''}`.trim() : 'Cliente';
    const sucursal = venta.sucursal || 'N/A';
    const saldoFinal = Math.max(0, newSaldo);
    const estadoFinal = saldoFinal <= 0 ? '✅ LIQUIDADA' : `⏳ Saldo restante: $${saldoFinal.toFixed(2)}`;

    const msg = `🔗 *Pago en línea recibido*\n\n` +
      `📋 Folio: *${reference}*\n` +
      `👤 ${pacNombre}\n` +
      `🏪 Suc: ${sucursal}\n` +
      `💰 Abono: *$${amount.toFixed(2)}*\n` +
      `${estadoFinal}\n\n` +
      `💳 Vía Clip · Link de pago`;

    try {
      const waCfg = await getWhatsAppConfig();
      const notifyPhones = new Set();

      // Admin phones always get notified
      (waCfg.admin_phones || []).forEach(p => notifyPhones.add(p));
      // Recipients corte (branch managers) also get notified
      (waCfg.recipients_corte || []).forEach(p => notifyPhones.add(p));

      const promises = [...notifyPhones].map(phone => sendWA(phone, msg));
      await Promise.allSettled(promises);
      console.log(`Clip webhook: WA notifications sent to ${notifyPhones.size} recipients`);

      // --- Send receipt to customer via template ---
      // Extract phone from venta notas (format: "Tel: 6561234567")
      const notasRes = await supaREST('GET', `ventas?id=eq.${venta.id}&select=notas,sucursal_entrega`);
      const ventaNotas = notasRes.ok && notasRes.data?.[0] || {};
      const telMatch = (ventaNotas.notas || '').match(/Tel:\s*(\+?\d[\d\s\-]{6,})/);
      if (telMatch) {
        const clientPhone = telMatch[1].replace(/[\s\-]/g, '');
        const sucEntrega = ventaNotas.sucursal_entrega || sucursal;
        await sendWATemplate(clientPhone, 'HXa41211eb4bdec7a116dc43712be73ad8', {
          '1': reference,
          '2': amount.toLocaleString('es-MX', { minimumFractionDigits: 2 }),
          '3': sucEntrega
        });
        console.log(`Clip webhook: customer receipt sent to ${clientPhone}`);
      } else {
        console.log('Clip webhook: no customer phone found in notas, skipping receipt');
      }
    } catch (waErr) {
      console.warn('Clip webhook: WA notification failed:', waErr.message);
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ received: true, action: 'payment_registered', folio: reference, amount, new_saldo: saldoFinal })
    };

  } catch (err) {
    console.error('clip-webhook error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Internal error' }) };
  }
};
