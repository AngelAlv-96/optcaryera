// /.netlify/functions/clip-webhook.js
// Receives Clip checkout webhook when a payment is completed
// Registers the payment in venta_pagos and updates the venta saldo
// Env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

const SUPA_URL = process.env.SUPABASE_URL || 'https://icsnlgeereepesbrdjhf.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

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

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers };

  // Clip sends POST with webhook data
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: '{"error":"Method not allowed"}' };

  try {
    const payload = JSON.parse(event.body || '{}');
    console.log('Clip webhook received:', JSON.stringify(payload));

    const status = payload.status || payload.resource_status || '';
    const paymentId = payload.payment_request_id || '';
    const receiptNo = payload.receipt_no || '';
    const amount = Number(payload.amount) || 0;
    const reference = payload.metadata?.me_reference_id || payload.metadata?.external_reference || '';

    // Only process completed payments
    if (status !== 'COMPLETED' && status !== 'CHECKOUT_COMPLETED') {
      console.log(`Clip webhook: status=${status}, skipping (not completed)`);
      return { statusCode: 200, headers, body: JSON.stringify({ received: true, action: 'skipped', status }) };
    }

    if (!reference || !amount) {
      console.log('Clip webhook: missing reference or amount');
      return { statusCode: 200, headers, body: JSON.stringify({ received: true, action: 'skipped', reason: 'no reference or amount' }) };
    }

    // Find the venta by folio (reference = folio)
    const ventaRes = await supaREST('GET', `ventas?folio=eq.${encodeURIComponent(reference)}&select=id,total,pagado,saldo`);
    if (!ventaRes.ok || !ventaRes.data?.length) {
      console.error('Clip webhook: venta not found for folio', reference);
      return { statusCode: 200, headers, body: JSON.stringify({ received: true, action: 'error', reason: 'venta not found' }) };
    }

    const venta = ventaRes.data[0];

    // Check for duplicate — avoid registering the same payment twice
    const dupCheck = await supaREST('GET', `venta_pagos?venta_id=eq.${venta.id}&referencia=eq.clip_${paymentId}&select=id`);
    if (dupCheck.ok && dupCheck.data?.length > 0) {
      console.log('Clip webhook: duplicate payment, already registered');
      return { statusCode: 200, headers, body: JSON.stringify({ received: true, action: 'duplicate' }) };
    }

    // Register the payment in venta_pagos
    const pagoBody = {
      venta_id: venta.id,
      monto: amount,
      metodo_pago: 'Link de pago',
      referencia: `clip_${paymentId}`,
      notas: `Pago en línea Clip · Recibo: ${receiptNo}`
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

    console.log(`Clip webhook: payment registered — folio=${reference}, amount=$${amount}, new_saldo=$${Math.max(0, newSaldo)}`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ received: true, action: 'payment_registered', folio: reference, amount, new_saldo: Math.max(0, newSaldo) })
    };

  } catch (err) {
    console.error('clip-webhook error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Internal error' }) };
  }
};
