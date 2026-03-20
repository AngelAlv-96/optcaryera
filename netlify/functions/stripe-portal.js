// /.netlify/functions/stripe-portal
// Manages customer subscription portal and status queries
// Actions: 'status' (default) = list subscriptions, 'portal' = redirect to Stripe portal
// Env vars: STRIPE_SECRET_KEY, GOOGLE_CLIENT_ID

const STRIPE_KEY = process.env.STRIPE_SECRET_KEY;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const SITE_URL = process.env.URL || 'https://optcaryera.netlify.app';

// === Stripe REST helpers ===
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

// === Google token verification ===
async function verifyGoogleToken(token) {
  try {
    var resp = await fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(token));
    if (!resp.ok) return null;
    var data = await resp.json();
    if (GOOGLE_CLIENT_ID && data.aud !== GOOGLE_CLIENT_ID) return null;
    return data;
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
    var action = body.action || 'status';

    if (!google_token) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Se requiere autenticación' }) };

    var googleUser = await verifyGoogleToken(google_token);
    if (!googleUser) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Token inválido' }) };

    // Find Stripe customer by email
    var search = await stripeAPI('GET', '/customers?email=' + encodeURIComponent(googleUser.email) + '&limit=1');
    if (!search.data || !search.data.length) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          has_account: false,
          customer: { nombre: googleUser.name, email: googleUser.email },
          subscriptions: []
        })
      };
    }

    var customerId = search.data[0].id;

    // === ACTION: Open Stripe Customer Portal ===
    if (action === 'portal') {
      var portal = await stripeAPI('POST', '/billing_portal/sessions', {
        customer: customerId,
        return_url: SITE_URL + '/tienda.html'
      });
      if (portal.url) {
        return { statusCode: 200, headers, body: JSON.stringify({ portal_url: portal.url }) };
      }
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'No se pudo crear sesión de portal' }) };
    }

    // === ACTION: Get subscription status ===
    var subs = await stripeAPI('GET', '/subscriptions?customer=' + customerId + '&status=all&limit=10');

    var subData = (subs.data || []).map(function(sub) {
      var meta = sub.metadata || {};
      var items = [];
      try { items = JSON.parse(meta.items_json || '[]'); } catch (e) {}

      var freqLabel = 'Mensual';
      if (items.length && items[0].f) {
        freqLabel = items[0].f === 30 ? 'Mensual' : items[0].f === 60 ? 'Bimestral' : 'Trimestral';
      }

      // Map Stripe status to Spanish
      var statusMap = {
        'active': 'Activa',
        'past_due': 'Pago pendiente',
        'canceled': 'Cancelada',
        'unpaid': 'Impaga',
        'trialing': 'En prueba',
        'incomplete': 'Incompleta',
        'incomplete_expired': 'Expirada',
        'paused': 'Pausada'
      };

      return {
        id: sub.id,
        status: sub.status,
        status_label: statusMap[sub.status] || sub.status,
        frecuencia: freqLabel,
        next_payment: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null,
        cancel_at_period_end: sub.cancel_at_period_end,
        items: items.map(function(i) {
          return {
            nombre: i.n || i.nombre || 'Producto',
            precio: i.p || 0,
            qty: i.q || 1,
            graduacion: i.g || ''
          };
        }),
        sucursal: meta.sucursal || '',
        created: new Date(sub.created * 1000).toISOString()
      };
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        has_account: true,
        customer: {
          nombre: googleUser.name || search.data[0].name,
          email: googleUser.email
        },
        subscriptions: subData
      })
    };

  } catch (err) {
    console.error('stripe-portal error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message || 'Error interno' }) };
  }
};
