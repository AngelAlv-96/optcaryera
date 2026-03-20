// /.netlify/functions/stripe-subscribe
// Creates a Stripe Checkout Session in subscription mode
// Uses Stripe REST API directly (zero npm dependencies)
// Env vars: STRIPE_SECRET_KEY, SUPABASE_SERVICE_ROLE_KEY

const STRIPE_KEY = process.env.STRIPE_SECRET_KEY;
const SUPA_URL = process.env.SUPABASE_URL || 'https://icsnlgeereepesbrdjhf.supabase.co';
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SITE_URL = process.env.URL || 'https://optcaryera.netlify.app';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;

// === Stripe REST helpers (no SDK needed) ===
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
        } else {
          result[nk + '[' + i + ']'] = String(item);
        }
      });
    } else {
      result[nk] = String(val);
    }
  }
  return result;
}

async function stripeAPI(method, path, data) {
  var opts = {
    method: method,
    headers: { 'Authorization': 'Bearer ' + STRIPE_KEY }
  };
  if (data) {
    opts.headers['Content-Type'] = 'application/x-www-form-urlencoded';
    opts.body = new URLSearchParams(flattenParams(data)).toString();
  }
  var resp = await fetch('https://api.stripe.com/v1' + path, opts);
  var json = await resp.json();
  if (!resp.ok) throw new Error('Stripe API error: ' + JSON.stringify(json));
  return json;
}

// === Google ID token verification ===
async function verifyGoogleToken(token) {
  try {
    var resp = await fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(token));
    if (!resp.ok) return null;
    var data = await resp.json();
    // Verify audience matches our client ID
    if (GOOGLE_CLIENT_ID && data.aud !== GOOGLE_CLIENT_ID) return null;
    return data; // { sub, email, name, picture, ... }
  } catch (e) { return null; }
}

// === Find or create Stripe customer by email ===
async function findOrCreateStripeCustomer(googleUser, telefono) {
  // Search existing Stripe customer by email
  var search = await stripeAPI('GET', '/customers?email=' + encodeURIComponent(googleUser.email) + '&limit=1');
  if (search.data && search.data.length > 0) {
    var existing = search.data[0];
    // Update metadata if needed
    if (!existing.metadata || existing.metadata.google_id !== googleUser.sub) {
      await stripeAPI('POST', '/customers/' + existing.id, {
        metadata: { google_id: googleUser.sub, telefono: telefono || '' }
      });
    }
    return existing;
  }
  // Create new customer
  return await stripeAPI('POST', '/customers', {
    email: googleUser.email,
    name: googleUser.name || googleUser.email,
    metadata: { google_id: googleUser.sub, telefono: telefono || '' }
  });
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
    // Fetch real prices from DB to prevent price manipulation from frontend
    var prodResp = await fetch(SUPA_URL + '/rest/v1/productos?categoria=eq.Lente%20de%20contacto&activo=eq.true&select=id,nombre,precio_venta', {
      headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SUPA_KEY }
    });
    var dbProducts = await prodResp.json();
    if (!Array.isArray(dbProducts)) dbProducts = [];

    // Build lookup: normalize name → max precio_venta (products may have multiple entries)
    var priceMap = {};
    dbProducts.forEach(function(p) {
      var normName = (p.nombre || '').trim().toLowerCase();
      if (!priceMap[normName] || p.precio_venta > priceMap[normName]) {
        priceMap[normName] = p.precio_venta;
      }
    });

    // Validate and override prices from DB
    var SUB_DISCOUNT = 0.10; // 10% subscription discount
    for (var vi = 0; vi < items.length; vi++) {
      var item = items[vi];
      var normItemName = (item.nombre || '').trim().toLowerCase();
      var dbPrice = priceMap[normItemName];
      if (!dbPrice) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Producto no encontrado: ' + item.nombre }) };
      }
      // For subscriptions, apply 10% discount to DB price; for one-time, use DB price as-is
      var expectedPrice = item.sub ? Math.round(dbPrice * (1 - SUB_DISCOUNT)) : dbPrice;
      // Override with server-validated price (ignore whatever the client sent)
      item.precio = expectedPrice;
    }

    // Find or create Stripe customer
    var customer = await findOrCreateStripeCustomer(googleUser, telefono);

    // Separate subscription and one-time items
    var subItems = items.filter(function(i) { return i.sub; });
    var oneTimeItems = items.filter(function(i) { return !i.sub; });

    // Validate: all subscription items must share same frequency
    if (subItems.length > 0) {
      var freqs = [];
      subItems.forEach(function(i) { if (freqs.indexOf(i.sub.freq) === -1) freqs.push(i.sub.freq); });
      if (freqs.length > 1) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Todos los productos de suscripción deben tener la misma frecuencia. Separa los pedidos por frecuencia.' }) };
      }
    }

    // Build Stripe line_items (using server-validated prices)
    var lineItems = [];

    subItems.forEach(function(item) {
      var months = item.sub.freq === 30 ? 1 : item.sub.freq === 60 ? 2 : 3;
      lineItems.push({
        price_data: {
          currency: 'mxn',
          product_data: { name: item.nombre + (item.grad ? ' [' + item.grad + ']' : '') },
          unit_amount: Math.round(item.precio * 100),
          recurring: { interval: 'month', interval_count: months }
        },
        quantity: item.qty
      });
    });

    oneTimeItems.forEach(function(item) {
      lineItems.push({
        price_data: {
          currency: 'mxn',
          product_data: { name: item.nombre + (item.grad ? ' [' + item.grad + ']' : '') },
          unit_amount: Math.round(item.precio * 100)
        },
        quantity: item.qty
      });
    });

    // Compact items JSON for metadata (Stripe limit: 500 chars per value)
    var itemsCompact = items.map(function(i) {
      return { n: i.nombre, k: i.key || '', q: i.qty, p: i.precio, g: i.grad || '', f: i.sub ? i.sub.freq : 0 };
    });

    var clienteName = nombre_override || googleUser.name || googleUser.email;

    // Build Checkout Session parameters
    var sessionData = {
      customer: customer.id,
      line_items: lineItems,
      mode: subItems.length > 0 ? 'subscription' : 'payment',
      success_url: SITE_URL + '/tienda.html?pago=ok&session_id={CHECKOUT_SESSION_ID}',
      cancel_url: SITE_URL + '/tienda.html?pago=cancelado',
      locale: 'es',
      payment_method_types: ['card'],
      metadata: {
        sucursal: sucursal,
        telefono: telefono,
        cliente_nombre: clienteName,
        items_json: JSON.stringify(itemsCompact).substring(0, 500)
      }
    };

    // For subscriptions, attach metadata to the subscription itself (persists across renewals)
    if (subItems.length > 0) {
      var subCompact = subItems.map(function(i) {
        return { n: i.nombre, k: i.key || '', q: i.qty, p: i.precio, g: i.grad || '', f: i.sub.freq };
      });
      sessionData.subscription_data = {
        metadata: {
          sucursal: sucursal,
          telefono: telefono,
          cliente_nombre: clienteName,
          notas: notas.substring(0, 200),
          items_json: JSON.stringify(subCompact).substring(0, 500)
        }
      };
    }

    var session = await stripeAPI('POST', '/checkout/sessions', sessionData);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        checkout_url: session.url,
        session_id: session.id
      })
    };

  } catch (err) {
    console.error('stripe-subscribe error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message || 'Error interno' }) };
  }
};
