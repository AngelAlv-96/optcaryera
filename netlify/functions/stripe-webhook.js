// /.netlify/functions/stripe-webhook
// Handles Stripe webhook events for subscription payments
// On each successful payment: creates venta, registers payment, notifies via WA
// Uses Node.js crypto for signature verification (no Stripe SDK needed)
// Env vars: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, SUPABASE_SERVICE_ROLE_KEY

const crypto = require('crypto');

const STRIPE_KEY = process.env.STRIPE_SECRET_KEY;
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const SUPA_URL = process.env.SUPABASE_URL || 'https://icsnlgeereepesbrdjhf.supabase.co';
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SITE_URL = process.env.URL || 'https://optcaryera.netlify.app';

// === Stripe helpers ===
function flattenParams(obj, prefix) {
  var result = {};
  for (var key in obj) {
    if (!obj.hasOwnProperty(key)) continue;
    var nk = prefix ? prefix + '[' + key + ']' : key;
    var val = obj[key];
    if (val === null || val === undefined) continue;
    if (typeof val === 'object' && !Array.isArray(val)) {
      Object.assign(result, flattenParams(val, nk));
    } else if (Array.isArray(val)) {
      val.forEach(function(item, i) {
        if (typeof item === 'object' && item !== null) {
          Object.assign(result, flattenParams(item, nk + '[' + i + ']'));
        } else { result[nk + '[' + i + ']'] = String(item); }
      });
    } else { result[nk] = String(val); }
  }
  return result;
}

async function stripeAPI(method, path, data) {
  var opts = { method, headers: { 'Authorization': 'Bearer ' + STRIPE_KEY } };
  if (data) {
    opts.headers['Content-Type'] = 'application/x-www-form-urlencoded';
    opts.body = new URLSearchParams(flattenParams(data)).toString();
  }
  var resp = await fetch('https://api.stripe.com/v1' + path, opts);
  return resp.json();
}

// === Webhook signature verification (replaces stripe.webhooks.constructEvent) ===
function verifyWebhookSignature(payload, sigHeader, secret) {
  if (!sigHeader || !secret) return false;
  var parts = { timestamp: null, signatures: [] };
  sigHeader.split(',').forEach(function(part) {
    var kv = part.split('=');
    if (kv[0] === 't') parts.timestamp = kv[1];
    if (kv[0] === 'v1') parts.signatures.push(kv[1]);
  });
  if (!parts.timestamp || !parts.signatures.length) return false;
  // Tolerance: 5 minutes
  if (Math.floor(Date.now() / 1000) - parseInt(parts.timestamp) > 300) return false;
  var expected = crypto.createHmac('sha256', secret)
    .update(parts.timestamp + '.' + payload)
    .digest('hex');
  return parts.signatures.some(function(sig) {
    try { return crypto.timingSafeEqual(Buffer.from(sig, 'utf8'), Buffer.from(expected, 'utf8')); }
    catch (e) { return false; }
  });
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

// === Process successful invoice payment ===
async function handlePaymentSucceeded(invoice) {
  if (!invoice.subscription) return; // Only handle subscription invoices

  // Get subscription details (has our metadata)
  var subscription = await stripeAPI('GET', '/subscriptions/' + invoice.subscription);
  var meta = subscription.metadata || {};

  if (!meta.items_json) {
    console.log('No items_json in subscription metadata, skipping order creation');
    return;
  }

  var items;
  try { items = JSON.parse(meta.items_json); } catch (e) { console.error('Parse items error:', e); return; }

  var folio = 'ONL-SUB-' + Date.now().toString(36).toUpperCase();
  var total = invoice.amount_paid / 100;
  var isFirst = invoice.billing_reason === 'subscription_create';
  var freqLabel = items[0] && items[0].f === 30 ? 'Mensual' : items[0] && items[0].f === 60 ? 'Bimestral' : 'Trimestral';

  // Get customer info from Stripe
  var customer = await stripeAPI('GET', '/customers/' + invoice.customer);

  var desc = items.map(function(i) { return (i.n || i.nombre) + ' x' + i.q + (i.g ? ' [' + i.g + ']' : ''); }).join(', ');

  // Duplicate detection: check if we already processed this invoice
  var existing = await supaREST('GET', 'venta_pagos?referencia=eq.stripe_' + invoice.id + '&select=id');
  if (existing && existing.length > 0) {
    console.log('Invoice already processed:', invoice.id);
    return;
  }

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
      '\nCliente: ' + (meta.cliente_nombre || customer.name || 'N/A') +
      '\nEmail: ' + (customer.email || '') +
      '\nTel: ' + (meta.telefono || '') +
      '\nStripe Invoice: ' + invoice.id +
      '\nSubscription: ' + invoice.subscription +
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
      referencia: 'stripe_' + invoice.id,
      created_at: new Date().toISOString()
    });
  }

  // Notify admins via WhatsApp
  var adminPhones = await getAdminPhones();
  var emoji = isFirst ? '🆕🔄' : '🔄💳';
  var waAdmin = emoji + ' *SUSCRIPCIÓN ' + (isFirst ? 'NUEVA' : 'RENOVACIÓN') + '*\n' +
    '👤 ' + (meta.cliente_nombre || customer.name || 'N/A') + '\n' +
    '📧 ' + (customer.email || '') + '\n' +
    '📱 ' + (meta.telefono || 'N/A') + '\n' +
    '🏪 ' + (meta.sucursal || 'N/A') + '\n' +
    '📅 ' + freqLabel + '\n\n' +
    items.map(function(i) {
      return '• ' + (i.n || i.nombre) + ' x' + i.q + ' $' + (i.p * i.q).toLocaleString('es-MX');
    }).join('\n') +
    '\n\n💰 *$' + total.toLocaleString('es-MX') + '* (pagado automático)\n📋 ' + folio;

  for (var i = 0; i < adminPhones.length; i++) {
    await sendWA(adminPhones[i], waAdmin);
  }

  // Notify customer via WhatsApp
  if (meta.telefono) {
    var waClient = isFirst
      ? '✅ *¡Suscripción activada!*\n\nTus lentes de contacto llegarán ' + freqLabel.toLowerCase() + 'mente a ' + (meta.sucursal || 'tu sucursal') + '.\n\n📋 Pedido: ' + folio + '\n💰 $' + total.toLocaleString('es-MX') + '\n\nTe avisaremos cuando estén listos para recoger. Puedes gestionar tu suscripción desde tu cuenta en nuestra tienda.'
      : '🔄 *Renovación automática*\n\nTu pedido ' + freqLabel.toLowerCase() + ' ha sido procesado y pagado.\n\n📋 Pedido: ' + folio + '\n💰 $' + total.toLocaleString('es-MX') + '\n\nTe avisaremos cuando estén listos en ' + (meta.sucursal || 'tu sucursal') + '.';
    await sendWA(meta.telefono, waClient);
  }

  // Register in lc_seguimiento for LC tracking
  if (venta && venta[0]) {
    var nextDays = items[0] ? items[0].f : 30;
    var nextDate = new Date(Date.now() + nextDays * 86400000).toISOString().split('T')[0];
    // Try to update existing lc_seguimiento or create new
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

  console.log('Order created:', folio, 'for invoice:', invoice.id);
  return folio;
}

// === Handle subscription cancelled ===
async function handleSubscriptionDeleted(subscription) {
  var meta = subscription.metadata || {};
  var customer = await stripeAPI('GET', '/customers/' + subscription.customer);
  var adminPhones = await getAdminPhones();

  var msg = '❌ *Suscripción cancelada*\n' +
    '👤 ' + (meta.cliente_nombre || customer.name || 'N/A') + '\n' +
    '📧 ' + (customer.email || '') + '\n' +
    '📱 ' + (meta.telefono || 'N/A');

  for (var i = 0; i < adminPhones.length; i++) {
    await sendWA(adminPhones[i], msg);
  }

  if (meta.telefono) {
    await sendWA(meta.telefono, '😢 Tu suscripción de lentes de contacto ha sido cancelada. Si fue un error o quieres reactivarla, contáctanos por WhatsApp. ¡Te esperamos!');
  }
}

// === Handle payment failed ===
async function handlePaymentFailed(invoice) {
  if (!invoice.subscription) return;
  var subscription = await stripeAPI('GET', '/subscriptions/' + invoice.subscription);
  var meta = subscription.metadata || {};
  var customer = await stripeAPI('GET', '/customers/' + invoice.customer);
  var adminPhones = await getAdminPhones();

  for (var i = 0; i < adminPhones.length; i++) {
    await sendWA(adminPhones[i], '⚠️ *Pago de suscripción fallido*\n👤 ' + (meta.cliente_nombre || customer.name || 'N/A') + '\n📧 ' + (customer.email || '') + '\n📱 ' + (meta.telefono || 'N/A') + '\nStripe reintentará automáticamente.');
  }

  if (meta.telefono) {
    await sendWA(meta.telefono, '⚠️ No pudimos procesar el pago de tu suscripción de lentes de contacto. Se reintentará automáticamente en unos días. Si necesitas actualizar tu tarjeta, accede a "Mi cuenta" en nuestra tienda o escríbenos por WhatsApp.');
  }
}

// === Main handler ===
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };

  // Verify webhook signature
  var sigHeader = event.headers['stripe-signature'];
  if (!verifyWebhookSignature(event.body, sigHeader, WEBHOOK_SECRET)) {
    console.error('Webhook signature verification failed');
    return { statusCode: 400, body: 'Invalid signature' };
  }

  var stripeEvent;
  try { stripeEvent = JSON.parse(event.body); }
  catch (e) { return { statusCode: 400, body: 'Invalid JSON' }; }

  console.log('Stripe event:', stripeEvent.type, stripeEvent.id);

  try {
    switch (stripeEvent.type) {
      case 'invoice.payment_succeeded':
        await handlePaymentSucceeded(stripeEvent.data.object);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(stripeEvent.data.object);
        break;

      case 'invoice.payment_failed':
        await handlePaymentFailed(stripeEvent.data.object);
        break;

      default:
        console.log('Unhandled event type:', stripeEvent.type);
    }

    return { statusCode: 200, body: JSON.stringify({ received: true }) };

  } catch (err) {
    console.error('Webhook processing error:', err);
    // Return 200 to prevent Stripe from retrying (we log the error)
    return { statusCode: 200, body: JSON.stringify({ received: true, error: err.message }) };
  }
};
