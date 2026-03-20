// /.netlify/functions/clip-payment.js
// Creates a Clip checkout payment link for portal online payments
// Env vars: CLIP_API_KEY, CLIP_API_SECRET

const CLIP_API_KEY = process.env.CLIP_API_KEY;
const CLIP_API_SECRET = process.env.CLIP_API_SECRET;
const CLIP_API_URL = 'https://api.payclip.com/v2/checkout';
const SITE_URL = process.env.URL || 'https://optcaryera.netlify.app';
const SUPA_URL = process.env.SUPABASE_URL || 'https://icsnlgeereepesbrdjhf.supabase.co';
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ALLOWED_ORIGIN = SITE_URL;

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  try {
    const { venta_id, folio, amount, paciente_nombre, token_portal } = JSON.parse(event.body || '{}');

    if (!venta_id || !folio || !amount || !token_portal) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing required fields: venta_id, folio, amount, token_portal' }) };
    }

    // Validate token_portal against the venta in Supabase
    const ventaResp = await fetch(
      `${SUPA_URL}/rest/v1/ventas?id=eq.${encodeURIComponent(venta_id)}&token_portal=eq.${encodeURIComponent(token_portal)}&select=id,folio,saldo`,
      { headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}` } }
    );
    const ventaData = await ventaResp.json();
    if (!Array.isArray(ventaData) || ventaData.length === 0) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Token inválido o venta no encontrada' }) };
    }

    if (amount < 1) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Amount must be at least $1' }) };
    }

    // Validate amount does not exceed venta saldo
    const ventaSaldo = Number(ventaData[0].saldo) || 0;
    if (amount > ventaSaldo + 0.01) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: `Monto ($${amount}) excede el saldo pendiente ($${ventaSaldo.toFixed(2)})` }) };
    }

    // Build redirect URLs — return to portal after payment
    const portalUrl = token_portal ? `${SITE_URL}/portal.html?t=${token_portal}` : SITE_URL;

    const clipBody = {
      amount: Number(amount),
      currency: 'MXN',
      purchase_description: `Abono ${folio} - Opticas Car y Era`,
      redirection_url: {
        success: `${portalUrl}${portalUrl.includes('?') ? '&' : '?'}pago=ok`,
        error: `${portalUrl}${portalUrl.includes('?') ? '&' : '?'}pago=error`,
        default: portalUrl
      },
      metadata: {
        me_reference_id: folio,
        customer_info: {
          name: paciente_nombre || 'Cliente'
        }
      },
      webhook_url: `${SITE_URL}/.netlify/functions/clip-webhook`
    };

    // Call Clip API
    const resp = await fetch(CLIP_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${Buffer.from(CLIP_API_KEY + ':' + CLIP_API_SECRET).toString('base64')}`
      },
      body: JSON.stringify(clipBody)
    });

    const data = await resp.json();

    if (!resp.ok) {
      console.error('Clip API error:', resp.status, data?.error || data?.message || 'unknown');
      return { statusCode: resp.status, headers, body: JSON.stringify({ error: 'Clip API error', details: data }) };
    }

    // Return the payment URL to the frontend
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        payment_url: data.payment_request_url,
        payment_request_id: data.payment_request_id,
        status: data.status,
        expires_at: data.expires_at
      })
    };

  } catch (err) {
    console.error('clip-payment error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Internal error' }) };
  }
};
