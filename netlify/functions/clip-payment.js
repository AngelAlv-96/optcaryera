// /.netlify/functions/clip-payment.js
// Creates a Clip checkout payment link for portal online payments
// Env vars: CLIP_API_KEY, CLIP_API_SECRET

const CLIP_API_KEY = process.env.CLIP_API_KEY;
const CLIP_API_SECRET = process.env.CLIP_API_SECRET;
const CLIP_API_URL = 'https://api.payclip.com/v2/checkout';
const SITE_URL = process.env.URL || 'https://optcaryera.netlify.app';

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  try {
    const { venta_id, folio, amount, paciente_nombre, token_portal } = JSON.parse(event.body || '{}');

    if (!venta_id || !folio || !amount) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing required fields: venta_id, folio, amount' }) };
    }

    if (amount < 1) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Amount must be at least $1' }) };
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
      console.error('Clip API error:', resp.status, JSON.stringify(data));
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
