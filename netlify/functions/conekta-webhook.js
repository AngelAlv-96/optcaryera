// /.netlify/functions/conekta-webhook
// Handles Conekta webhook events for subscription payments
// On each successful payment: creates venta, registers payment, notifies via WA
// Zero npm dependencies
// Env vars: CONEKTA_PRIVATE_KEY, CONEKTA_WEBHOOK_KEY, SUPABASE_SERVICE_ROLE_KEY

const crypto = require('crypto');

const CONEKTA_KEY = process.env.CONEKTA_PRIVATE_KEY;
const WEBHOOK_KEY = process.env.CONEKTA_WEBHOOK_KEY;
const SUPA_URL = process.env.SUPABASE_URL || 'https://icsnlgeereepesbrdjhf.supabase.co';
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SITE_URL = process.env.URL || 'https://optcaryera.netlify.app';

// === Conekta REST helper ===
async function conektaAPI(method, path) {
  var resp = await fetch('https://api.conekta.io' + path, {
    method: method,
    headers: {
      'Authorization': 'Bearer ' + CONEKTA_KEY,
      'Accept': 'application/vnd.conekta-v2.2.0+json'
    }
  });
  return resp.json();
}

// === Supabase REST ===
async function supaREST(method, path, body) {
  var opts = {
    method: method,
    headers: {
      'apikey': SUPA_KEY,
      'Authorization': 'Bearer ' + SUPA_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    }
  };
  if (body) opts.body = JSON.stringify(body);
  var resp = await fetch(SUPA_URL + '/rest/v1/' + path, opts);
  return resp.json();
}

// === WhatsApp send ===
async function sendWA(to, text) {
  try {
    await fetch(SITE_URL + '/.netlify/functions/whatsapp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, text })
    });
  } catch (e) { console.error('WA error:', e.message); }
}

// === Load admin phones from config ===
async function getAdminPhones() {
  try {
    var data = await supaREST('GET', 'app_config?id=eq.whatsapp_config&select=value');
    if (data && data[0] && data[0].value) {
      var cfg = typeof data[0].value === 'string' ? JSON.parse(data[0].value) : data[0].value;
      return cfg.admin_phones || [];
    }
  } catch (e) {}
  return [];
}

// === Verify Conekta webhook signature ===
function verifyWebhookSignature(payload, digestHeader) {
  if (!WEBHOOK_KEY || !digestHeader) return !WEBHOOK_KEY; // Skip if no key configured
  try {
    var expected = crypto.createHmac('sha256', WEBHOOK_KEY)
      .update(payload)
      .digest('base64');
    return digestHeader === expected || digestHeader === 'SHA-256=' + expected;
  } catch (e) { return false; }
}

// === Process successful subscription payment ===
async function handleSubscriptionPaid(data) {
  var order = data.object || data;
  var meta = order.metadata || {};

  if (!meta.items_json) {
    console.log('No items_json in order metadata, skipping');
    return;
  }

  var items;
  try { items = JSON.parse(meta.items_json); } catch (e) { console.error('Parse items error:', e); return; }

  var orderId = order.id || 'unknown';
  var total = (order.amount || 0) / 100;

  // Duplicate detection
  var existing = await supaREST('GET', 'venta_pagos?referencia=eq.conekta_' + orderId + '&select=id');
  if (existing && existing.length > 0) {
    console.log('Order already processed:', orderId);
    return;
  }

  var folio = 'ONL-SUB-' + Date.now().toString(36).toUpperCase();
  var freqLabel = items[0] && items[0].f === 30 ? 'Mensual' : items[0] && items[0].f === 60 ? 'Bimestral' : 'Trimestral';
  var isFirst = true; // TODO: detect renewals vs first payment from Conekta event type

  var desc = items.map(function(i) { return (i.n || i.nombre) + ' x' + i.q + (i.g ? ' [' + i.g + ']' : ''); }).join(', ');
  var customerName = meta.cliente_nombre || (order.customer_info && order.customer_info.name) || 'N/A';
  var customerEmail = (order.customer_info && order.customer_info.email) || '';

  // Create venta
  var ventaData = {
    paciente_id: null,
    sucursal: 'Online',
    folio: folio,
    total: total,
    monto_pagado: total,
    pagado: total,
    saldo: 0,
    estado: 'Liquidada',
    canal_venta: 'Tienda Web',
    sucursal_entrega: meta.sucursal || 'Américas',
    asesor: 'Suscripción Auto',
    notas: (isFirst ? '🆕 SUSCRIPCIÓN NUEVA' : '🔄 RENOVACIÓN') + ' (' + freqLabel + ')' +
      '\nCliente: ' + customerName +
      '\nEmail: ' + customerEmail +
      '\nTel: ' + (meta.telefono || '') +
      '\nConekta Order: ' + orderId +
      '\nProductos: ' + desc +
      (meta.notas ? '\nNotas: ' + meta.notas : ''),
    created_at: new Date().toISOString()
  };

  var venta = await supaREST('POST', 'ventas', ventaData);

  // Register payment
  if (venta && venta[0]) {
    await supaREST('POST', 'venta_pagos', {
      venta_id: venta[0].id,
      monto: total,
      metodo: 'Link de pago',
      referencia: 'conekta_' + orderId,
      created_at: new Date().toISOString()
    });
  }

  // Notify admins via WhatsApp
  var adminPhones = await getAdminPhones();
  var emoji = isFirst ? '🆕🔄' : '🔄💳';
  var waAdmin = emoji + ' *SUSCRIPCIÓN ' + (isFirst ? 'NUEVA' : 'RENOVACIÓN') + '*\n' +
    '👤 ' + customerName + '\n' +
    '📧 ' + customerEmail + '\n' +
    '📱 ' + (meta.telefono || 'N/A') + '\n' +
    '🏪 ' + (meta.sucursal || 'N/A') + '\n' +
    '📅 ' + freqLabel + '\n\n' +
    items.map(function(i) {
      return '• ' + (i.n || i.nombre) + ' x' + i.q + ' $' + (i.p * i.q).toLocaleString('es-MX');
    }).join('\n') +
    '\n\n💰 *$' + total.toLocaleString('es-MX') + '* (pagado Conekta)\n📋 ' + folio;

  for (var i = 0; i < adminPhones.length; i++) {
    await sendWA(adminPhones[i], waAdmin);
  }

  // Notify customer via WhatsApp
  if (meta.telefono) {
    var waClient = isFirst
      ? '✅ *¡Suscripción activada!*\n\nTus lentes de contacto llegarán ' + freqLabel.toLowerCase() + 'mente a ' + (meta.sucursal || 'tu sucursal') + '.\n\n📋 Pedido: ' + folio + '\n💰 $' + total.toLocaleString('es-MX') + '\n\nTe avisaremos cuando estén listos para recoger.'
      : '🔄 *Renovación automática*\n\nTu pedido ' + freqLabel.toLowerCase() + ' ha sido procesado y pagado.\n\n📋 Pedido: ' + folio + '\n💰 $' + total.toLocaleString('es-MX') + '\n\nTe avisaremos cuando estén listos en ' + (meta.sucursal || 'tu sucursal') + '.';
    await sendWA(meta.telefono, waClient);
  }

  // Register in lc_seguimiento
  if (venta && venta[0]) {
    var nextDays = items[0] ? items[0].f : 30;
    var nextDate = new Date(Date.now() + nextDays * 86400000).toISOString().split('T')[0];
    try {
      await supaREST('POST', 'lc_seguimiento', {
        venta_id: venta[0].id,
        telefono: meta.telefono || '',
        producto: items.map(function(i) { return i.n || i.nombre; }).join(', '),
        fecha_recompra: nextDate,
        tipo: 'suscripcion',
        notas: 'Suscripción automática ' + freqLabel,
        created_at: new Date().toISOString()
      });
    } catch (e) { console.log('lc_seguimiento insert skipped:', e.message); }
  }

  console.log('Order created:', folio, 'for Conekta order:', orderId);
  return folio;
}

// === Handle payment failed ===
async function handlePaymentFailed(data) {
  var order = data.object || data;
  var meta = order.metadata || {};
  var adminPhones = await getAdminPhones();
  var customerName = meta.cliente_nombre || (order.customer_info && order.customer_info.name) || 'N/A';

  for (var i = 0; i < adminPhones.length; i++) {
    await sendWA(adminPhones[i], '⚠️ *Pago de suscripción fallido (Conekta)*\n👤 ' + customerName + '\n📱 ' + (meta.telefono || 'N/A') + '\nConekta reintentará automáticamente.');
  }

  if (meta.telefono) {
    await sendWA(meta.telefono, '⚠️ No pudimos procesar el pago de tu suscripción de lentes de contacto. Se reintentará automáticamente en unos días. Si necesitas actualizar tu tarjeta, escríbenos por WhatsApp.');
  }
}

// === Handle subscription cancelled ===
async function handleSubscriptionCancelled(data) {
  var subscription = data.object || data;
  var meta = subscription.metadata || {};
  var adminPhones = await getAdminPhones();

  var msg = '❌ *Suscripción cancelada (Conekta)*\n👤 ' + (meta.cliente_nombre || 'N/A') + '\n📱 ' + (meta.telefono || 'N/A');

  for (var i = 0; i < adminPhones.length; i++) {
    await sendWA(adminPhones[i], msg);
  }

  if (meta.telefono) {
    await sendWA(meta.telefono, '😢 Tu suscripción de lentes de contacto ha sido cancelada. Si fue un error o quieres reactivarla, contáctanos por WhatsApp. ¡Te esperamos!');
  }
}

// === Main handler ===
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };

  // Verify webhook signature if configured
  var digestHeader = event.headers['digest'] || event.headers['Digest'] || '';
  if (WEBHOOK_KEY && !verifyWebhookSignature(event.body, digestHeader)) {
    console.error('Webhook signature verification failed');
    return { statusCode: 401, body: 'Invalid signature' };
  }

  var conektaEvent;
  try { conektaEvent = JSON.parse(event.body); }
  catch (e) { return { statusCode: 400, body: 'Invalid JSON' }; }

  console.log('Conekta event:', conektaEvent.type, conektaEvent.id);

  try {
    switch (conektaEvent.type) {
      // Subscription payment events
      case 'order.paid':
      case 'subscription.paid':
        await handleSubscriptionPaid(conektaEvent.data);
        break;

      case 'order.payment_failed':
      case 'subscription.payment_failed':
      case 'charge.payment_failure':
        await handlePaymentFailed(conektaEvent.data);
        break;

      case 'subscription.canceled':
      case 'subscription.cancelled':
        await handleSubscriptionCancelled(conektaEvent.data);
        break;

      default:
        console.log('Unhandled event type:', conektaEvent.type);
    }

    return { statusCode: 200, body: JSON.stringify({ received: true }) };

  } catch (err) {
    console.error('Webhook processing error:', err);
    return { statusCode: 200, body: JSON.stringify({ received: true, error: err.message }) };
  }
};
