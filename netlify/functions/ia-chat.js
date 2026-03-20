// Netlify Serverless Function — Proxy seguro para Anthropic API
// Soporta texto y vision (imágenes base64)
// La API key se configura como variable de entorno en Netlify Dashboard

const SUPA_URL = process.env.SUPABASE_URL || 'https://icsnlgeereepesbrdjhf.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const BASE_USERS = {
  'americas':  { pass: 'americas01' },
  'pinocelli': { pass: 'pinocelli01' },
  'magnolia':  { pass: 'magnolia01' },
  'gerencia':  { pass: 'car2024ge' },
  'admin':     { pass: 'car2024ad' },
  'carera':    { pass: 'carera2024' },
  'laboratorio': { pass: 'lab2024' },
};

async function getCustomUsers() {
  try {
    const res = await fetch(`${SUPA_URL}/rest/v1/app_config?id=eq.custom_users&select=value`, {
      headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` }
    });
    const data = await res.json();
    if (data?.[0]?.value) {
      const v = data[0].value;
      return typeof v === 'string' ? JSON.parse(v) : v;
    }
  } catch(e) {}
  return {};
}

exports.handler = async (event) => {
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Handle preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) {
    return {
      statusCode: 500, headers,
      body: JSON.stringify({ error: 'API key no configurada. Agrega ANTHROPIC_API_KEY en Netlify > Site Settings > Environment Variables.' })
    };
  }

  try {
    const { system, messages, max_tokens, auth } = JSON.parse(event.body);

    // === AUTH REQUIRED ===
    if (!auth?.id || !auth?.pass) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Auth required' }) };
    }
    const custom = await getCustomUsers();
    const allUsers = { ...BASE_USERS };
    Object.entries(custom).forEach(([uid, u]) => { if (u?.pass) allUsers[uid] = { pass: u.pass }; });
    const user = allUsers[auth.id];
    if (!user || user.pass !== auth.pass) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Auth failed' }) };
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: Math.min(max_tokens || 1024, 4096),
        system,
        messages: messages.slice(-10)
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        statusCode: response.status, headers,
        body: JSON.stringify({ error: data.error?.message || 'Error de API Anthropic' })
      };
    }

    return {
      statusCode: 200, headers,
      body: JSON.stringify({ content: data.content })
    };
  } catch (err) {
    return {
      statusCode: 500, headers,
      body: JSON.stringify({ error: 'Error interno: ' + err.message })
    };
  }
};
