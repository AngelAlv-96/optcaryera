// /.netlify/functions/clip-verify.js
// Verifies the real status of a Clip checkout payment
// Called by portal.html after returning from Clip to show real result
// GET https://api.payclip.com/v2/checkout/{payment_request_id}

const CLIP_API_KEY = process.env.CLIP_API_KEY;
const CLIP_API_SECRET = process.env.CLIP_API_SECRET;
const ALLOWED_ORIGIN = process.env.URL || 'https://optcaryera.netlify.app';

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  try {
    const { payment_request_id } = JSON.parse(event.body || '{}');

    if (!payment_request_id) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing payment_request_id' }) };
    }

    if (!CLIP_API_KEY || !CLIP_API_SECRET) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Clip credentials not configured' }) };
    }

    const resp = await fetch(`https://api.payclip.com/v2/checkout/${encodeURIComponent(payment_request_id)}`, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${Buffer.from(CLIP_API_KEY + ':' + CLIP_API_SECRET).toString('base64')}`
      }
    });

    const data = await resp.json();

    if (!resp.ok) {
      console.error('Clip verify error:', resp.status, data);
      return { statusCode: resp.status, headers, body: JSON.stringify({ error: 'Clip API error', status: 'UNKNOWN' }) };
    }

    // Return only what the frontend needs
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        status: data.status,
        amount: data.amount,
        receipt_no: data.receipt_no || null,
        last_status_message: data.last_status_message || null
      })
    };

  } catch (err) {
    console.error('clip-verify error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Internal error', status: 'UNKNOWN' }) };
  }
};
