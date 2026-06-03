// Vittoria Inauguración — Cupón (lente solar graduado gratis primeros clientes + 2x1)
// Segmento: 103 que respondieron a una reactivación en 2026 y NO compraron.
// Manual: GET /.netlify/functions/vittoria-inauguracion-blast?key=SECRET   (dry run: &dry=1)
// Reglas blast: MAX 10/run, dedup por tag, re-check por fono antes de enviar, fail-closed,
// excluye compradores recientes, guard de horario 10am-8pm CST. (Mismo patrón que promo-2x1-blast.)

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_WA = process.env.TWILIO_WA_NUMBER;
const BLAST_KEY = process.env.BLAST_KEY || 'caryera2026';

const MAX_PER_RUN = 10;
const RATE_LIMIT_MS = 1500;
const DEDUP_DAYS = 60;
const DEDUP_TAG = 'Vittoria-Inauguracion';
const TEMPLATE_SID = 'HX3c766b536c05ef3eb9229259efee2825'; // vittoria_inauguracion_cupon (sin variables)

// Lista embebida (evita escritura a app_config). 103 contactos: respondieron a reactivación 2026, no compraron.
const CONTACTS = [{"name":"","phone":"5216571912051"},{"name":"","phone":"5216561057464"},{"name":"","phone":"5216561069823"},{"name":"","phone":"5216561116536"},{"name":"","phone":"5216561133624"},{"name":"","phone":"5216561158259"},{"name":"","phone":"5216561200550"},{"name":"","phone":"5216561254329"},{"name":"","phone":"5216561262562"},{"name":"","phone":"5216561275635"},{"name":"","phone":"5216561277245"},{"name":"","phone":"5216561281370"},{"name":"","phone":"5216561323639"},{"name":"","phone":"5216561330885"},{"name":"","phone":"5216561484406"},{"name":"","phone":"5216561607640"},{"name":"","phone":"5216561771056"},{"name":"","phone":"5216568244592"},{"name":"","phone":"5216568279968"},{"name":"","phone":"5216568520364"},{"name":"","phone":"5216568521956"},{"name":"","phone":"5216568541726"},{"name":"","phone":"5216568584016"},{"name":"","phone":"5216568989719"},{"name":"","phone":"5216561865761"},{"name":"","phone":"5216561912272"},{"name":"","phone":"5216562033293"},{"name":"","phone":"5216562159187"},{"name":"","phone":"5216562449898"},{"name":"","phone":"5216562507559"},{"name":"","phone":"5216562624763"},{"name":"","phone":"5216562801118"},{"name":"","phone":"5216562842841"},{"name":"","phone":"5216562873659"},{"name":"","phone":"5216562999769"},{"name":"","phone":"5216563044370"},{"name":"","phone":"5216563073161"},{"name":"","phone":"5216563080998"},{"name":"","phone":"5216563176052"},{"name":"","phone":"5216563216668"},{"name":"","phone":"5216563391085"},{"name":"","phone":"5216563473746"},{"name":"","phone":"5216563505182"},{"name":"","phone":"5216563506933"},{"name":"","phone":"5216563522572"},{"name":"","phone":"5216563740333"},{"name":"","phone":"5216563932144"},{"name":"","phone":"5216564025992"},{"name":"","phone":"5216564193394"},{"name":"","phone":"5216564197656"},{"name":"","phone":"5216564199196"},{"name":"","phone":"5216564258440"},{"name":"","phone":"5216564270013"},{"name":"","phone":"5216564412427"},{"name":"","phone":"5216564473925"},{"name":"","phone":"5216564583422"},{"name":"","phone":"5216564680414"},{"name":"","phone":"5216564806682"},{"name":"","phone":"5216564989008"},{"name":"","phone":"5216564995409"},{"name":"","phone":"5216565107013"},{"name":"","phone":"5216565288582"},{"name":"","phone":"5216565290830"},{"name":"","phone":"5216565717689"},{"name":"","phone":"5216565737824"},{"name":"","phone":"5216565741492"},{"name":"","phone":"5216565803666"},{"name":"","phone":"5216565841178"},{"name":"","phone":"5216565878298"},{"name":"","phone":"5216565906072"},{"name":"","phone":"5216565907024"},{"name":"","phone":"5216565957215"},{"name":"","phone":"5216566002477"},{"name":"","phone":"5216566009642"},{"name":"","phone":"5216566010777"},{"name":"","phone":"5216566015416"},{"name":"","phone":"5216566069060"},{"name":"","phone":"5216566263239"},{"name":"","phone":"5216566430121"},{"name":"","phone":"5216566571495"},{"name":"","phone":"5216566590355"},{"name":"","phone":"5216566606570"},{"name":"","phone":"5216566962290"},{"name":"","phone":"5216567051831"},{"name":"","phone":"5216567476601"},{"name":"","phone":"5216567485689"},{"name":"","phone":"5216567516767"},{"name":"","phone":"5216567550300"},{"name":"","phone":"5216567557218"},{"name":"","phone":"5216567665031"},{"name":"","phone":"5216567667089"},{"name":"","phone":"5216567669296"},{"name":"","phone":"5216567705758"},{"name":"","phone":"5216567770310"},{"name":"","phone":"5216568155341"},{"name":"","phone":"5216568174431"},{"name":"Alma Delia","phone":"5216562138870"},{"name":"Elda","phone":"5216563092728"},{"name":"ISELA","phone":"5216565284540"},{"name":"Israel","phone":"5216566002991"},{"name":"JUAN FRANCISCO","phone":"5216566600208"},{"name":"LUIS ANTINIO","phone":"5216561050032"},{"name":"MAYANIN","phone":"5216561776805"}];

async function supaREST(method, path, body) {
  const opts = { method, headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=representation' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(SUPABASE_URL + '/rest/v1/' + path, opts);
  if (!res.ok) { const txt = await res.text(); throw new Error('Supabase ' + method + ' ' + path + ': ' + res.status + ' ' + txt); }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

function normalizePhone(phone) {
  let num = String(phone).replace(/[\s\-\(\)\+]/g, '');
  if (num.length === 10) num = '521' + num;
  if (num.length === 12 && num.startsWith('52') && num[2] !== '1') num = '521' + num.slice(2);
  return num;
}

async function sendTemplate(to, templateSid) {
  if (!TWILIO_SID || !TWILIO_TOKEN || !TWILIO_WA) return { ok: false, err: 'missing_config' };
  const toNum = normalizePhone(to);
  const auth = Buffer.from(TWILIO_SID + ':' + TWILIO_TOKEN).toString('base64');
  const params = new URLSearchParams();
  const fromNum = TWILIO_WA.startsWith('whatsapp:') ? TWILIO_WA : 'whatsapp:' + TWILIO_WA;
  params.append('From', fromNum);
  params.append('To', 'whatsapp:+' + toNum);
  params.append('ContentSid', templateSid || TEMPLATE_SID);
  params.append('ContentVariables', JSON.stringify({}));
  try {
    const res = await fetch('https://api.twilio.com/2010-04-01/Accounts/' + TWILIO_SID + '/Messages.json', { method: 'POST', headers: { 'Authorization': 'Basic ' + auth, 'Content-Type': 'application/x-www-form-urlencoded' }, body: params.toString() });
    const data = await res.json();
    if (data.error_code) { console.error('[VITTORIA] WA error ' + data.error_code + ': ' + data.message); return { ok: false, err: data.error_code + ':' + data.message }; }
    return { ok: true };
  } catch (e) { console.error('[VITTORIA] WA exception:', e.message); return { ok: false, err: e.message }; }
}

async function saveToHistory(phone, content) {
  try { await supaREST('POST', 'clari_conversations', { phone: normalizePhone(phone), role: 'assistant', content, user_name: 'vittoria-inauguracion' }); }
  catch (e) { console.error('[VITTORIA] Save history error:', e.message); }
}

async function getAdminPhones() {
  try { const cfg = await supaREST('GET', 'app_config?id=eq.whatsapp_config&select=value'); if (cfg && cfg[0]) { const parsed = typeof cfg[0].value === 'string' ? JSON.parse(cfg[0].value) : cfg[0].value; return parsed.admin_phones || ['5216564269961']; } } catch (e) {}
  return ['5216564269961'];
}

async function sendAdminWA(msg) {
  const phones = await getAdminPhones();
  const auth = Buffer.from(TWILIO_SID + ':' + TWILIO_TOKEN).toString('base64');
  const fromNum = TWILIO_WA.startsWith('whatsapp:') ? TWILIO_WA : 'whatsapp:' + TWILIO_WA;
  for (const ap of phones) {
    try { const toNum = normalizePhone(ap); const params = new URLSearchParams(); params.append('From', fromNum); params.append('To', 'whatsapp:+' + toNum); params.append('Body', msg);
      await fetch('https://api.twilio.com/2010-04-01/Accounts/' + TWILIO_SID + '/Messages.json', { method: 'POST', headers: { 'Authorization': 'Basic ' + auth, 'Content-Type': 'application/x-www-form-urlencoded' }, body: params.toString() });
    } catch (e) { console.warn('[VITTORIA] Admin notify error:', e.message); }
  }
}

exports.handler = async function(event) {
  const qs = event.queryStringParameters || {};
  if (qs.key !== BLAST_KEY) return { statusCode: 401, body: JSON.stringify({ error: 'Key invalida. Usa ?key=TU_CLAVE' }) };
  const dryRun = qs.dry === '1';
  // Permite elegir el template aprobado al momento de enviar (?tpl=SID). Default: el de texto.
  const templateSid = (qs.tpl && /^HX[0-9a-f]{32}$/i.test(qs.tpl)) ? qs.tpl : TEMPLATE_SID;

  const nowCH = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chihuahua' }));
  const horaLocal = nowCH.getHours();
  if (horaLocal < 10 || horaLocal >= 20) return { statusCode: 200, body: JSON.stringify({ ok: true, enviados: 0, mensaje: 'Fuera de horario (10am-8pm CST)' }) };

  try {
    const now = new Date();
    const candidates = CONTACTS.map(c => ({ name: c.name || '', phone: normalizePhone(c.phone) }));

    // Dedup por tag en los ultimos DEDUP_DAYS dias
    const alreadySent = new Set();
    const dedupFrom = new Date(now); dedupFrom.setDate(dedupFrom.getDate() - DEDUP_DAYS);
    for (let i = 0; i < candidates.length; i += 20) {
      const batch = candidates.slice(i, i + 20);
      const phoneFilter = batch.map(c => '"' + c.phone + '"').join(',');
      try {
        const msgs = await supaREST('GET', 'clari_conversations?phone=in.(' + phoneFilter + ')&content=ilike.*' + DEDUP_TAG + '*&created_at=gte.' + dedupFrom.toISOString() + '&select=phone&limit=500');
        if (msgs) msgs.forEach(m => alreadySent.add(m.phone));
      } catch (e) {}
    }

    // Excluir compradores ultimos 60 dias (doble seguridad)
    const cut60 = new Date(now); cut60.setDate(cut60.getDate() - 60);
    const recentBuyers = new Set();
    try {
      const ventas = await supaREST('GET', 'ventas?created_at=gte.' + cut60.toISOString() + '&select=pacientes(telefono)&limit=2000');
      if (ventas) ventas.forEach(v => { if (v.pacientes && v.pacientes.telefono) { const norm = normalizePhone(v.pacientes.telefono); if (norm) recentBuyers.add(norm); } });
    } catch (e) { console.warn('[VITTORIA] Warn compradores:', e.message); }

    const eligible = candidates.filter(c => c.phone && c.phone.length >= 12 && !alreadySent.has(c.phone) && !recentBuyers.has(c.phone));
    const limited = eligible.slice(0, MAX_PER_RUN);

    if (dryRun) return { statusCode: 200, body: JSON.stringify({ ok: true, dryRun: true, total: CONTACTS.length, yaContactados: alreadySent.size, compraronReciente: recentBuyers.size, elegibles: eligible.length, enviarEstaVez: limited.length, restantes: eligible.length - limited.length, muestra: limited.map(c => '...' + c.phone.slice(-4)) }, null, 2) };

    let enviados = 0, fallidos = 0; const errores = [];
    for (const c of limited) {
      // Re-check por fono justo antes de enviar (fail-closed)
      try {
        const recheck = await supaREST('GET', 'clari_conversations?phone=eq.' + c.phone + '&content=ilike.*' + DEDUP_TAG + '*&created_at=gte.' + dedupFrom.toISOString() + '&select=id&limit=1');
        if (recheck && recheck.length > 0) { console.log('[VITTORIA] skip ' + c.phone.slice(-4) + ' ya enviado'); continue; }
      } catch (e) { console.warn('[VITTORIA] recheck fallo ' + c.phone.slice(-4) + ', salto:', e.message); continue; }
      const result = await sendTemplate(c.phone, templateSid);
      if (result.ok) { await saveToHistory(c.phone, '[' + DEDUP_TAG + '] Cupon inauguracion Vittoria enviado a ' + (c.name || c.phone.slice(-4))); enviados++; }
      else { fallidos++; errores.push({ phone: c.phone.slice(-4), err: result.err }); }
      await new Promise(r => setTimeout(r, RATE_LIMIT_MS));
    }

    if (enviados > 0 || fallidos > 0) await sendAdminWA('Vittoria Inauguracion - Resumen\n\nEnviados: ' + enviados + '/' + limited.length + '\nFallidos: ' + fallidos + '\nRestantes: ' + (eligible.length - limited.length) + '\nYa contactados: ' + alreadySent.size + '\nCompraron reciente: ' + recentBuyers.size);

    return { statusCode: 200, body: JSON.stringify({ ok: true, enviados, fallidos, total: limited.length, restantes: eligible.length - limited.length, errores: errores.slice(0, 10) }) };
  } catch (err) { console.error('[VITTORIA] Fatal:', err.message); return { statusCode: 500, body: JSON.stringify({ error: err.message }) }; }
};
