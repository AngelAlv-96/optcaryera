// Cupón solar 3x1 — envío por FACEBOOK MESSENGER a conversaciones con ventana abierta (24h)
// que NO recibieron el cupón. Mismo cupón que el de WhatsApp (solar graduado gratis, último día 30-jun).
// Manual: GET /.netlify/functions/cupon-msn-blast?key=BLAST_KEY   (dry run: &dry=1)
// Reglas de blast: re-check por PSID antes de enviar (fail-closed), dedup por tag, sleep entre envíos.
// El token META_PAGE_TOKEN solo existe en el entorno de Netlify (por eso esto corre como función).

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
const META_PAGE_TOKEN = process.env.META_PAGE_TOKEN;
const GRAPH_API = 'https://graph.facebook.com/v25.0';
const BLAST_KEY = process.env.BLAST_KEY || 'caryera2026';

const DEDUP_TAG = 'Cupon-Solar-3x1';
const FLYER = 'https://optcaryera.netlify.app/cupon-solar-graduado.jpg';
const MSG = '🎟️ ¡Hoy es el último día! Presenta este cupón en cualquier sucursal y tu LENTE SOLAR GRADUADO va GRATIS al comprar tus lentes con el 2x1. Solo HOY 30 de junio 👓☀️ — Ópticas Car & Era';
const RATE_LIMIT_MS = 1200;

async function supaREST(method, path, body) {
  const opts = { method, headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=representation' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(SUPABASE_URL + '/rest/v1/' + path, opts);
  if (!res.ok) { const t = await res.text(); throw new Error('Supabase ' + method + ' ' + path + ': ' + res.status + ' ' + t); }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function sendMeta(psid, type, payload) {
  const body = type === 'image'
    ? { recipient: { id: psid }, message: { attachment: { type: 'image', payload: { url: FLYER, is_reusable: true } } }, messaging_type: 'RESPONSE' }
    : { recipient: { id: psid }, message: { text: payload }, messaging_type: 'RESPONSE' };
  const res = await fetch(GRAPH_API + '/me/messages?access_token=' + META_PAGE_TOKEN, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.error) return { ok: false, err: (j.error && (j.error.code + ':' + j.error.message)) || res.status };
  return { ok: true };
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

exports.handler = async (event) => {
  const key = (event.queryStringParameters || {}).key;
  const dry = (event.queryStringParameters || {}).dry === '1';
  if (key !== BLAST_KEY) return { statusCode: 401, body: 'unauthorized' };
  if (!META_PAGE_TOKEN) return { statusCode: 500, body: JSON.stringify({ error: 'no META_PAGE_TOKEN' }) };

  // Conversaciones de Messenger con ventana abierta (mensaje del usuario en últimas 24h) y SIN cupón
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const rows = await supaREST('GET', "clari_conversations?user_name=eq.clari-messenger&role=eq.user&created_at=gte." + since + "&select=phone,created_at&order=created_at.desc&limit=200");
  const seen = {}, psids = [];
  (rows || []).forEach(r => { if (r.phone && !seen[r.phone]) { seen[r.phone] = 1; psids.push(r.phone); } });

  const results = { ventana_abierta: psids.length, enviados: 0, saltados: 0, fallidos: 0, detalle: [] };

  for (const psid of psids) {
    // re-check fail-closed: ¿ya tiene cupón?
    let yaTiene = false;
    try {
      const ex = await supaREST('GET', "clari_conversations?phone=eq." + psid + "&content=ilike.*" + DEDUP_TAG + "*&select=phone&limit=1");
      yaTiene = ex && ex.length > 0;
    } catch (e) { results.saltados++; results.detalle.push(psid + ' skip(recheck-fail)'); continue; }
    if (yaTiene) { results.saltados++; continue; }

    if (dry) { results.detalle.push(psid + ' (dry)'); continue; }

    const img = await sendMeta(psid, 'image');
    if (!img.ok) { results.fallidos++; results.detalle.push(psid + ' img-fail ' + img.err); await sleep(RATE_LIMIT_MS); continue; }
    await sleep(600);
    const txt = await sendMeta(psid, 'text', MSG);
    if (!txt.ok) { results.fallidos++; results.detalle.push(psid + ' txt-fail ' + txt.err); await sleep(RATE_LIMIT_MS); continue; }

    results.enviados++;
    try { await supaREST('POST', 'clari_conversations', { phone: psid, role: 'assistant', content: '[' + DEDUP_TAG + '] Cupón solar gratis (último día 30-jun) enviado por Messenger (ventana abierta)', user_name: 'clari-messenger' }); } catch (e) {}
    await sleep(RATE_LIMIT_MS);
  }

  return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(results, null, 2) };
};
