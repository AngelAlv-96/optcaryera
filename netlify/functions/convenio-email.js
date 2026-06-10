// convenio-email.js — Correo de bienvenida al aprobar un convenio empresarial
// Envía desde opticas@caryera.mx vía SMTP de Gmail (sin dependencias npm — cliente SMTP mínimo sobre TLS).
// Requiere env vars: GMAIL_USER (opticas@caryera.mx) + GMAIL_APP_PASSWORD (contraseña de aplicación de Google).
// Si no están configuradas, responde { ok:false, error:'email_no_configurado' } sin romper el flujo (el WA sigue saliendo).
// Auth: mismo patrón que whatsapp.js (BASE_USERS + custom_users) — solo usuarios del sistema pueden disparar el envío.
// El destinatario NUNCA viene del request: se lee de empresas_convenio (anti-abuso).

const tls = require('tls');

const SUPA_URL = process.env.SUPABASE_URL || 'https://icsnlgeereepesbrdjhf.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_PASS = process.env.GMAIL_APP_PASSWORD;

const BASE_USERS = process.env.AUTH_USERS ? JSON.parse(process.env.AUTH_USERS) : {
  'americas':  { pass: 'americas01',  rol: 'sucursal' },
  'pinocelli': { pass: 'pinocelli01', rol: 'sucursal' },
  'magnolia':  { pass: 'magnolia01',  rol: 'sucursal' },
  'gerencia':  { pass: 'car2024ge',   rol: 'gerencia' },
  'admin':     { pass: 'car2024ad',   rol: 'admin' },
  'carera':    { pass: 'carera2024',  rol: 'admin' },
  'vittoria':  { pass: 'vittoria01',  rol: 'sucursal' },
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
  } catch (e) {}
  return {};
}

// ── Cliente SMTP mínimo (smtp.gmail.com:465, TLS implícito, AUTH LOGIN) ──
// Anti-spam: multipart/alternative (texto plano + HTML), Date y Message-ID explícitos.
function smtpSend({ from, fromName, to, subject, html, text }) {
  return new Promise((resolve, reject) => {
    const socket = tls.connect(465, 'smtp.gmail.com', { servername: 'smtp.gmail.com' });
    let buffer = '';
    let step = 0;
    const fail = (msg) => { try { socket.destroy(); } catch (e) {} reject(new Error(msg)); };
    const timer = setTimeout(() => fail('SMTP timeout'), 20000);

    const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');
    const b64wrap = (s) => b64(s).replace(/(.{76})/g, '$1\r\n');
    // Subject con acentos → RFC 2047
    const subjEnc = '=?UTF-8?B?' + b64(subject) + '?=';
    const fromEnc = '=?UTF-8?B?' + b64(fromName) + '?=';
    // Date RFC 5322 + Message-ID propios (su ausencia es señal de spam)
    const d = new Date();
    const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'], months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const p2 = (n) => String(n).padStart(2, '0');
    const dateHdr = days[d.getUTCDay()] + ', ' + p2(d.getUTCDate()) + ' ' + months[d.getUTCMonth()] + ' ' + d.getUTCFullYear() + ' ' + p2(d.getUTCHours()) + ':' + p2(d.getUTCMinutes()) + ':' + p2(d.getUTCSeconds()) + ' +0000';
    const msgId = '<' + Date.now() + '.' + Math.random().toString(36).slice(2, 10) + '@caryera.mx>';
    const boundary = 'cye-' + Date.now().toString(36);
    // multipart/alternative: texto plano + HTML (los correos solo-HTML puntúan peor en filtros)
    const message =
      'From: ' + fromEnc + ' <' + from + '>\r\n' +
      'To: <' + to + '>\r\n' +
      'Subject: ' + subjEnc + '\r\n' +
      'Date: ' + dateHdr + '\r\n' +
      'Message-ID: ' + msgId + '\r\n' +
      'MIME-Version: 1.0\r\n' +
      'Content-Type: multipart/alternative; boundary="' + boundary + '"\r\n' +
      '\r\n' +
      '--' + boundary + '\r\n' +
      'Content-Type: text/plain; charset=utf-8\r\n' +
      'Content-Transfer-Encoding: base64\r\n' +
      '\r\n' + b64wrap(text || 'Tu convenio empresarial con Ópticas Car & Era está activo.') + '\r\n' +
      '--' + boundary + '\r\n' +
      'Content-Type: text/html; charset=utf-8\r\n' +
      'Content-Transfer-Encoding: base64\r\n' +
      '\r\n' + b64wrap(html) + '\r\n' +
      '--' + boundary + '--\r\n';

    // Secuencia: [código esperado, comando a enviar después]
    const steps = [
      { expect: 220, send: 'EHLO caryera.mx' },
      { expect: 250, send: 'AUTH LOGIN' },
      { expect: 334, send: b64(GMAIL_USER) },
      { expect: 334, send: b64(GMAIL_PASS) },
      { expect: 235, send: 'MAIL FROM:<' + from + '>' },
      { expect: 250, send: 'RCPT TO:<' + to + '>' },
      { expect: 250, send: 'DATA' },
      { expect: 354, send: message + '.' },
      { expect: 250, send: 'QUIT' },
      { expect: 221, send: null }
    ];

    socket.on('data', (chunk) => {
      buffer += chunk.toString();
      // Esperar línea final del código (formato "250 ..." sin guión)
      if (!/^\d{3} [^]*\r\n$/m.test(buffer) && !/\r\n$/.test(buffer)) return;
      const m = buffer.match(/^(\d{3})([ -])/m);
      if (!m) return;
      // Si es multilinea (250-...), esperar a que llegue la línea "250 "
      const lastLine = buffer.trim().split('\r\n').pop();
      if (/^\d{3}-/.test(lastLine)) return;
      const code = parseInt(lastLine.slice(0, 3), 10);
      buffer = '';
      const s = steps[step];
      if (!s) return;
      if (code !== s.expect) {
        clearTimeout(timer);
        return fail('SMTP paso ' + step + ': esperaba ' + s.expect + ', llegó ' + code + ' (' + lastLine.slice(0, 120) + ')');
      }
      if (s.send !== null) socket.write(s.send + '\r\n');
      step++;
      if (step >= steps.length) { clearTimeout(timer); socket.end(); resolve(true); }
    });
    socket.on('error', (e) => { clearTimeout(timer); fail('SMTP socket: ' + e.message); });
  });
}

function emailText(emp, cfg) {
  const pct = (emp.beneficios && emp.beneficios.descuento_pct) || cfg.descuento_pct || 15;
  const regalo = (emp.beneficios && emp.beneficios.regalo_monto) || cfg.regalo_monto || 500;
  const minimo = (emp.beneficios && emp.beneficios.regalo_compra_minima) || cfg.regalo_compra_minima || 2000;
  return '¡Bienvenido al programa, ' + emp.nombre + '!\n\n' +
    'Tu convenio empresarial con Ópticas Car & Era ya está activo.\n\n' +
    'CÓDIGO DE CONVENIO: ' + emp.codigo + '\n\n' +
    'Beneficios para tus empleados (y su familia directa):\n' +
    '- ' + pct + '% de descuento en lentes completos (acumulable con la promoción vigente)\n' +
    '- $' + regalo + ' de regalo cada año por empleado (en compras desde $' + minimo + ')\n' +
    '- El mismo descuento aplica para esposa(o) e hijos\n' +
    '- Meses sin intereses con Aplazo, sin tarjeta de crédito\n' +
    '- Examen de la vista gratis, sin cita\n\n' +
    'Cómo lo usan: presentan el código ' + emp.codigo + ' junto con su gafete o credencial de trabajo en cualquier sucursal. Sin cita.\n\n' +
    'Tu kit de bienvenida (pase con QR, flyer para imprimir e imagen para compartir con tu equipo):\n' +
    'https://caryera.mx/convenio-kit?c=' + emp.codigo + '\n\n' +
    'Si deseas mantener el control de tus empleados (altas de nuevos ingresos y bajas), usa el portal de tu empresa — a cada empleado que registres le enviamos su pase por WhatsApp:\n' +
    'https://caryera.mx/portal-empresa?c=' + emp.codigo + '\n\n' +
    'Ópticas Car & Era · Ciudad Juárez, Chih.\n' +
    'Américas · Pinocelli · Magnolia · Plaza Vía Vittoria\n' +
    'WhatsApp 656 311 0094 · caryera.mx';
}

function emailHTML(emp, cfg) {
  const pct = (emp.beneficios && emp.beneficios.descuento_pct) || cfg.descuento_pct || 15;
  const regalo = (emp.beneficios && emp.beneficios.regalo_monto) || cfg.regalo_monto || 500;
  const minimo = (emp.beneficios && emp.beneficios.regalo_compra_minima) || cfg.regalo_compra_minima || 2000;
  const kitUrl = 'https://caryera.mx/convenio-kit?c=' + encodeURIComponent(emp.codigo);
  const portalUrl = 'https://caryera.mx/portal-empresa?c=' + encodeURIComponent(emp.codigo);
  const beige = '#b08d5f', dark = '#1e1e1e', cream = '#f7f3ed';
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:${cream};font-family:Arial,Helvetica,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:${cream};padding:24px 0">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e8e0d4">
  <tr><td style="background:${dark};padding:26px 30px;text-align:center">
    <div style="color:#e2c6a6;font-size:11px;letter-spacing:4px">&Oacute;PTICAS</div>
    <div style="color:#e2c6a6;font-size:30px;font-family:Georgia,serif;letter-spacing:1px">Car &amp; Era</div>
    <div style="color:#9a948e;font-size:11px;letter-spacing:2px;margin-top:4px">CONVENIOS EMPRESARIALES</div>
  </td></tr>
  <tr><td style="padding:30px 34px 10px">
    <h1 style="margin:0 0 8px;font-size:21px;color:${dark}">&iexcl;Bienvenido al programa, ${emp.nombre}! 🎉</h1>
    <p style="margin:0 0 18px;font-size:14px;color:#555;line-height:1.6">Tu convenio empresarial ya est&aacute; <strong>activo</strong>. A partir de hoy, todos tus colaboradores y su familia directa tienen beneficios exclusivos en nuestras 4 sucursales de Ciudad Ju&aacute;rez.</p>
    <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="background:${cream};border:2px dashed ${beige};border-radius:12px;padding:18px">
      <div style="font-size:11px;letter-spacing:2px;color:#888">C&Oacute;DIGO DE CONVENIO DE TU EMPRESA</div>
      <div style="font-size:34px;font-weight:bold;color:${dark};letter-spacing:4px;margin-top:6px">${emp.codigo}</div>
    </td></tr></table>
    <p style="margin:18px 0 6px;font-size:14px;color:${dark}"><strong>Beneficios para tus empleados:</strong></p>
    <table cellpadding="0" cellspacing="0" style="font-size:13.5px;color:#555;line-height:1.9">
      <tr><td>💳&nbsp; <strong>${pct}% de descuento</strong> en lentes completos (acumulable con la promoci&oacute;n vigente)</td></tr>
      <tr><td>🎁&nbsp; <strong>$${regalo} de regalo cada a&ntilde;o</strong> por empleado (en compras desde $${minimo.toLocaleString('en-US')})</td></tr>
      <tr><td>👨‍👩‍👧&nbsp; El mismo descuento aplica para <strong>esposa(o) e hijos</strong></td></tr>
      <tr><td>📅&nbsp; <strong>Meses sin intereses</strong> con Aplazo, sin tarjeta de cr&eacute;dito</td></tr>
      <tr><td>👁️&nbsp; <strong>Examen de la vista gratis</strong>, sin cita</td></tr>
    </table>
    <p style="margin:18px 0 6px;font-size:14px;color:${dark}"><strong>&iquest;C&oacute;mo lo usan tus empleados?</strong></p>
    <p style="margin:0;font-size:13.5px;color:#555;line-height:1.7">Solo presentan el c&oacute;digo <strong>${emp.codigo}</strong> junto con su gafete o credencial de trabajo en cualquier sucursal. Sin cita, sin registro previo.</p>
  </td></tr>
  <tr><td style="padding:22px 34px" align="center">
    <a href="${kitUrl}" style="display:inline-block;background:${dark};color:#e2c6a6;text-decoration:none;font-size:15px;font-weight:bold;padding:14px 30px;border-radius:10px">📋 Ver tu kit de bienvenida</a>
    <p style="margin:12px 0 0;font-size:12px;color:#999;line-height:1.6">En el kit encuentras tu c&oacute;digo con QR, un <strong>flyer listo para imprimir</strong> y una <strong>imagen para compartir</strong> con tu equipo por WhatsApp o correo interno.</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:18px"><tr><td align="center" style="background:${cream};border-radius:12px;padding:16px 20px">
      <p style="margin:0 0 10px;font-size:13px;color:#555;line-height:1.6">👥 Si deseas mantener el control de tus empleados — <strong>altas de nuevos ingresos y bajas</strong> de quienes dejen de laborar — usa este portal. Adem&aacute;s, a cada empleado que registres <strong>le enviamos su pase directo por WhatsApp</strong>.</p>
      <a href="${portalUrl}" style="display:inline-block;background:#ffffff;color:${dark};text-decoration:none;font-size:13.5px;font-weight:bold;padding:11px 24px;border-radius:9px;border:1.5px solid ${beige}">🏢 Portal de tu empresa</a>
    </td></tr></table>
  </td></tr>
  <tr><td style="background:${cream};padding:16px 34px;text-align:center;border-top:1px solid #e8e0d4">
    <p style="margin:0;font-size:12px;color:#999">&Oacute;pticas Car &amp; Era &middot; Ciudad Ju&aacute;rez, Chihuahua<br>Am&eacute;ricas &middot; Pinocelli &middot; Magnolia &middot; Plaza V&iacute;a Vittoria<br>WhatsApp: 656 311 0094 &middot; caryera.mx</p>
  </td></tr>
</table>
</td></tr></table></body></html>`;
}

exports.handler = async (event) => {
  const H = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Content-Type': 'application/json' };
  const out = (code, obj) => ({ statusCode: code, headers: H, body: JSON.stringify(obj) });
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: H, body: '' };
  if (event.httpMethod !== 'POST') return out(405, { ok: false, error: 'Method not allowed' });

  let body;
  try { body = JSON.parse(event.body); } catch (e) { return out(400, { ok: false, error: 'JSON inválido' }); }

  // Auth de usuario del sistema (mismo patrón que whatsapp.js)
  const auth = body.auth;
  if (!auth?.id || !auth?.pass) return out(401, { ok: false, error: 'Auth required' });
  const custom = await getCustomUsers();
  const allUsers = { ...BASE_USERS };
  Object.entries(custom).forEach(([uid, u]) => { if (u?.pass) allUsers[uid] = { pass: u.pass, rol: u.rol || 'sucursal' }; });
  const user = allUsers[auth.id];
  if (!user || user.pass !== auth.pass) return out(401, { ok: false, error: 'Auth failed' });

  if (!GMAIL_USER || !GMAIL_PASS) return out(200, { ok: false, error: 'email_no_configurado' });

  const empresaId = parseInt(body.empresa_id);
  if (!empresaId) return out(400, { ok: false, error: 'empresa_id requerido' });

  try {
    // Empresa y config se leen del servidor — el request no decide destinatario ni contenido
    const [empRes, cfgRes] = await Promise.all([
      fetch(`${SUPA_URL}/rest/v1/empresas_convenio?id=eq.${empresaId}&select=*&limit=1`, { headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` } }),
      fetch(`${SUPA_URL}/rest/v1/app_config?id=eq.convenio_config&select=value`, { headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` } })
    ]);
    const emps = await empRes.json();
    const emp = Array.isArray(emps) && emps[0];
    if (!emp) return out(200, { ok: false, error: 'empresa_no_encontrada' });
    if (emp.status !== 'activa') return out(200, { ok: false, error: 'empresa_no_activa' });
    if (!emp.email) return out(200, { ok: false, error: 'sin_correo' });
    let cfg = {};
    try { const c = await cfgRes.json(); cfg = c?.[0]?.value ? JSON.parse(c[0].value) : {}; } catch (e) {}

    await smtpSend({
      from: GMAIL_USER,
      fromName: 'Ópticas Car & Era',
      to: emp.email,
      subject: 'Tu convenio empresarial está activo — Ópticas Car & Era',
      html: emailHTML(emp, cfg),
      text: emailText(emp, cfg)
    });
    return out(200, { ok: true, to: emp.email });
  } catch (e) {
    console.error('[convenio-email]', e.message);
    return out(200, { ok: false, error: e.message });
  }
};
