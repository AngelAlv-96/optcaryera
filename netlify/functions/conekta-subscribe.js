// ⛔ DEPRECATED (v204) — Conekta abandonado, usando Clip para pagos
// /.netlify/functions/conekta-subscribe
// Creates a Conekta HostedPayment checkout for subscriptions
// Uses Conekta REST API directly (zero npm dependencies)
// Env vars: CONEKTA_PRIVATE_KEY, SUPABASE_SERVICE_ROLE_KEY, GOOGLE_CLIENT_ID

const CONEKTA_KEY = process.env.CONEKTA_PRIVATE_KEY;
const SUPA_URL = process.env.SUPABASE_URL || 'https://icsnlgeereepesbrdjhf.supabase.co';
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SITE_URL = process.env.URL || 'https://optcaryera.netlify.app';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;

// === Conekta REST helper ===
async function conektaAPI(method, path, data) {
  var opts = {
    method: method,
    headers: {
      'Authorization': 'Bearer ' + CONEKTA_KEY,
      'Accept': 'application/vnd.conekta-v2.2.0+json',
      'Content-Type': 'application/json'
    }
  };
  if (data) opts.body = JSON.stringify(data);
  var resp = await fetch('https://api.conekta.io' + path, opts);
  var json = await resp.json();
  if (!resp.ok) throw new Error('Conekta API error: ' + JSON.stringify(json));
  return json;
}

// === Google ID token verification ===
async function verifyGoogleToken(token) {
  try {
    var resp = await fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(token));
    if (!resp.ok) return null;
    var data = await resp.json();
    if (GOOGLE_CLIENT_ID && data.aud !== GOOGLE_CLIENT_ID) return null;
    return data; // { sub, email, name, picture, ... }
  } catch (e) { return null; }
}

exports.handler = async (event) => {
  var headers = {
    'Access-Control-Allow-Origin': SITE_URL,
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  try {
    var body = JSON.parse(event.body || '{}');
    var google_token = body.google_token;
    var items = body.items || [];
    var telefono = body.telefono || '';
    var sucursal = body.sucursal || '';
    var notas = body.notas || '';
    var nombre_override = body.nombre || '';

    if (!google_token) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Se requiere iniciar sesión con Google' }) };
    if (!items.length) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Carrito vacío' }) };

    // Verify Google authentication
    var googleUser = await verifyGoogleToken(google_token);
    if (!googleUser) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Token de Google inválido o expirado. Inicia sesión nuevamente.' }) };

    // === SERVER-SIDE PRICE VALIDATION ===
    var prodResp = await fetch(SUPA_URL + '/rest/v1/productos?categoria=eq.Lente%20de%20contacto&activo=eq.true&select=id,nombre,precio_venta', {
      headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SUPA_KEY }
    });
    var dbProducts = await prodResp.json();
    if (!Array.isArray(dbProducts)) dbProducts = [];

    var priceMap = {};
    dbProducts.forEach(function(p) {
      var normName = (p.nombre || '').trim().toLowerCase();
      if (!priceMap[normName] || p.precio_venta > priceMap[normName]) {
        priceMap[normName] = p.precio_venta;
      }
    });

    var SUB_DISCOUNT = 0.10; // 10% subscription discount
    var subItems = items.filter(function(i) { return i.sub; });

    if (!subItems.length) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'No hay productos con suscripción. Usa el flujo de compra normal.' }) };
    }

    // Validate all sub items have same frequency
    var freqs = [];
    subItems.forEach(function(i) { if (freqs.indexOf(i.sub.freq) === -1) freqs.push(i.sub.freq); });
    if (freqs.length > 1) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Todos los productos de suscripción deben tener la misma frecuencia.' }) };
    }

    var freq = freqs[0]; // 30, 60, or 90 days
    var months = freq === 30 ? 1 : freq === 60 ? 2 : 3;

    // Validate prices and calculate total
    var totalCents = 0;
    var lineItems = [];
    for (var vi = 0; vi < subItems.length; vi++) {
      var item = subItems[vi];
      var normItemName = (item.nombre || '').trim().toLowerCase();
      var dbPrice = priceMap[normItemName];
      if (!dbPrice) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Producto no encontrado: ' + item.nombre }) };
      }
      var discountedPrice = Math.round(dbPrice * (1 - SUB_DISCOUNT));
      item.precio = discountedPrice;
      var itemTotalCents = discountedPrice * item.qty * 100;
      totalCents += itemTotalCents;
      lineItems.push({
        name: item.nombre + (item.grad ? ' [' + item.grad + ']' : ''),
        quantity: item.qty,
        unit_price: discountedPrice * 100 // Conekta uses centavos
      });
    }

    var clienteName = nombre_override || googleUser.name || googleUser.email;
    var freqLabel = months === 1 ? 'Mensual' : months === 2 ? 'Bimestral' : 'Trimestral';

    // === Create or reuse Conekta Plan ===
    // Plan ID based on total amount and frequency (reusable for same combos)
    var planId = 'lc-' + freq + 'd-' + totalCents;
    var planName = 'LC Suscripción ' + freqLabel + ' $' + (totalCents / 100).toLocaleString('es-MX');

    try {
      // Try to get existing plan
      await conektaAPI('GET', '/plans/' + planId);
    } catch (e) {
      // Plan doesn't exist, create it
      await conektaAPI('POST', '/plans', {
        id: planId,
        name: planName,
        amount: totalCents,
        currency: 'MXN',
        interval: 'month',
        frequency: months,
        trial_period_days: 0,
        max_retries: 3,
        retry_delay_hours: 48
      });
    }

    // === Create Conekta Order with HostedPayment checkout ===
    var itemsCompact = subItems.map(function(i) {
      return { n: i.nombre, k: i.key || '', q: i.qty, p: i.precio, g: i.grad || '', f: i.sub.freq };
    });

    var orderData = {
      currency: 'MXN',
      customer_info: {
        name: clienteName,
        email: googleUser.email,
        phone: '+52' + telefono.replace(/\D/g, '').replace(/^52/, '').replace(/^1/, '')
      },
      line_items: lineItems,
      checkout: {
        allowed_payment_methods: ['card'],
        type: 'HostedPayment',
        success_url: SITE_URL + '/tienda.html?pago=ok',
        failure_url: SITE_URL + '/tienda.html?pago=cancelado',
        plan_ids: [planId],
        monthly_installments_enabled: false,
        expires_at: Math.floor(Date.now() / 1000) + 3600 // 1 hour expiry
      },
      metadata: {
        sucursal: sucursal,
        telefono: telefono,
        cliente_nombre: clienteName,
        notas: (notas || '').substring(0, 200),
        items_json: JSON.stringify(itemsCompact).substring(0, 500),
        google_sub: googleUser.sub
      }
    };

    var order = await conektaAPI('POST', '/orders', orderData);

    // Extract checkout URL from response
    var checkoutUrl = order.checkout && order.checkout.url;
    if (!checkoutUrl) {
      throw new Error('No checkout URL in Conekta response');
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        checkout_url: checkoutUrl,
        order_id: order.id
      })
    };

  } catch (err) {
    console.error('conekta-subscribe error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message || 'Error interno' }) };
  }
};
