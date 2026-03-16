// /.netlify/functions/img-upload.js
// Upload images to Supabase Storage for landing pages
// Returns public URL for use in bg_image field

const SUPA_URL = process.env.SUPABASE_URL || 'https://icsnlgeereepesbrdjhf.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = 'landing-images';

const BASE_USERS = {
  'americas':  { pass: 'americas01',  rol: 'sucursal' },
  'pinocelli': { pass: 'pinocelli01', rol: 'sucursal' },
  'magnolia':  { pass: 'magnolia01',  rol: 'sucursal' },
  'gerencia':  { pass: 'car2024ge',   rol: 'gerencia' },
  'admin':     { pass: 'car2024ad',   rol: 'admin' },
  'carera':    { pass: 'carera2024',  rol: 'admin' },
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
  } catch(e) { /* ignore */ }
  return {};
}

const sbHeaders = () => ({
  'apikey': SERVICE_KEY,
  'Authorization': `Bearer ${SERVICE_KEY}`
});

async function ensureBucket() {
  const check = await fetch(`${SUPA_URL}/storage/v1/bucket/${BUCKET}`, {
    headers: sbHeaders()
  });
  if (check.ok) return;

  const create = await fetch(`${SUPA_URL}/storage/v1/bucket`, {
    method: 'POST',
    headers: { ...sbHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: BUCKET, name: BUCKET, public: true })
  });
  if (!create.ok) {
    const err = await create.text();
    throw new Error(`No se pudo crear bucket "${BUCKET}": ${err}`);
  }
}

exports.handler = async (event) => {
  const H = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: H, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: H, body: JSON.stringify({ error: 'Method not allowed' }) };
  if (!SERVICE_KEY) return { statusCode: 500, headers: H, body: JSON.stringify({ error: 'SUPABASE_SERVICE_ROLE_KEY no configurada' }) };

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, headers: H, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const { auth, image_base64, filename } = body;

  // ── Auth ──
  if (!auth?.id || !auth?.pass) {
    return { statusCode: 401, headers: H, body: JSON.stringify({ error: 'Auth required' }) };
  }
  const custom = await getCustomUsers();
  const allUsers = { ...BASE_USERS };
  Object.entries(custom).forEach(([uid, u]) => {
    if (u?.pass) allUsers[uid] = { pass: u.pass, rol: u.rol || 'sucursal' };
  });
  const user = allUsers[auth.id];
  if (!user || user.pass !== auth.pass) {
    return { statusCode: 401, headers: H, body: JSON.stringify({ error: 'Auth failed' }) };
  }
  // Only admin/gerencia can manage landing pages
  if (!['admin', 'gerencia'].includes(user.rol)) {
    return { statusCode: 403, headers: H, body: JSON.stringify({ error: 'Permisos insuficientes' }) };
  }

  // ── Validate image ──
  if (!image_base64) {
    return { statusCode: 400, headers: H, body: JSON.stringify({ error: 'image_base64 required' }) };
  }

  try {
    // Parse data URI: data:image/jpeg;base64,/9j/4AAQ...
    const match = image_base64.match(/^data:(image\/\w+);base64,(.+)$/);
    if (!match) {
      return { statusCode: 400, headers: H, body: JSON.stringify({ error: 'Formato de imagen inválido. Debe ser data:image/...;base64,...' }) };
    }

    const contentType = match[1]; // e.g. image/jpeg
    const base64Data = match[2];
    const buffer = Buffer.from(base64Data, 'base64');

    // Max 5MB
    if (buffer.length > 5 * 1024 * 1024) {
      return { statusCode: 400, headers: H, body: JSON.stringify({ error: 'Imagen demasiado grande (máx 5MB)' }) };
    }

    // Generate filename
    const ext = contentType.split('/')[1] === 'jpeg' ? 'jpg' : contentType.split('/')[1];
    const safeName = (filename || 'landing').replace(/[^a-zA-Z0-9_-]/g, '-').substring(0, 50);
    const storagePath = `${safeName}-${Date.now()}.${ext}`;

    // Ensure bucket exists
    await ensureBucket();

    // Upload to Supabase Storage
    const uploadRes = await fetch(`${SUPA_URL}/storage/v1/object/${BUCKET}/${storagePath}`, {
      method: 'POST',
      headers: {
        ...sbHeaders(),
        'Content-Type': contentType,
        'x-upsert': 'true'
      },
      body: buffer
    });

    if (!uploadRes.ok) {
      const err = await uploadRes.text();
      throw new Error(`Error subiendo imagen: ${err}`);
    }

    // Build public URL
    const publicUrl = `${SUPA_URL}/storage/v1/object/public/${BUCKET}/${storagePath}`;

    return {
      statusCode: 200,
      headers: H,
      body: JSON.stringify({ ok: true, url: publicUrl, path: storagePath })
    };

  } catch (err) {
    console.error('[img-upload]', err);
    return { statusCode: 500, headers: H, body: JSON.stringify({ error: err.message }) };
  }
};
