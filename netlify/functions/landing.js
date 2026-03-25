// /.netlify/functions/landing.js
// Serve landing pages dynamically from Supabase
// URL pattern: /l/[slug] → fetches from landing_pages table by archivo field

const SUPA_URL = process.env.SUPABASE_URL || 'https://icsnlgeereepesbrdjhf.supabase.co';
const SUPA_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

function escH(s) {
  if (!s) return '';
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function generarHTML(d) {
  const waNum = d.wa_numero || '5216563110094';
  const waUrl = 'https://wa.me/' + waNum + '?text=' + encodeURIComponent(d.mensaje || '');
  const delay = d.delay || 3;
  const hasBg = d.bg_image && d.bg_image.length > 10;
  const bgStyle = hasBg
    ? 'background:url(' + d.bg_image + ') center/cover no-repeat fixed;'
    : 'background:#0a0a0a;';
  const overlayHtml = hasBg
    ? '<div style="position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:0"></div>'
    : '';
  const emojiHtml = d.emoji
    ? '<div class="emoji"><span>' + escH(d.emoji) + '</span></div>'
    : '';

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${escH(d.titulo || d.nombre)} — Ópticas Car &amp; Era</title>
<meta http-equiv="refresh" content="${delay};url=${waUrl}">
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600&family=Outfit:wght@300;400;500;600&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Outfit',sans-serif;${bgStyle}color:#f5f2ee;min-height:100vh;display:flex;align-items:center;justify-content:center;overflow:hidden}
.card{background:rgba(28,27,25,0.82);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);border:1px solid rgba(226,198,166,0.15);border-radius:20px;padding:40px 32px;max-width:400px;width:90%;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,0.5);position:relative;z-index:1}
.logo-top{font-family:'Cormorant Garamond',serif;font-size:18px;color:#e2c6a6;font-weight:600;letter-spacing:2px}
.logo-bot{font-family:'Cormorant Garamond',serif;font-size:24px;color:#f0dfc8;font-weight:500;letter-spacing:4px;margin-top:-2px}
.divider{width:50px;height:1px;background:linear-gradient(90deg,transparent,#e2c6a6,transparent);margin:16px auto}
.titulo{font-size:18px;font-weight:600;color:#fff;margin-top:16px}
.sub{font-size:14px;color:#bbb;margin-top:6px}
.emoji{font-size:52px;margin:24px 0}
@keyframes bounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-12px)}}
.emoji span{display:inline-block;animation:bounce 1.5s infinite}
.wa-btn{display:inline-flex;align-items:center;gap:10px;background:#25D366;color:#fff;padding:14px 32px;border-radius:30px;font-size:15px;font-weight:600;text-decoration:none;transition:transform .15s,box-shadow .15s;box-shadow:0 4px 20px rgba(37,211,102,0.3)}
.wa-btn:hover{transform:scale(1.04);box-shadow:0 6px 25px rgba(37,211,102,0.4)}
.wa-btn svg{width:20px;height:20px;fill:white}
.redir{font-size:11px;color:#888;margin-top:18px}
@keyframes spin{to{transform:rotate(360deg)}}
.spinner{width:20px;height:20px;border:2px solid #333;border-top-color:#25D366;border-radius:50%;animation:spin .8s linear infinite;display:inline-block;vertical-align:middle;margin-right:6px}
.footer{font-size:10px;color:#555;margin-top:24px;letter-spacing:.5px}
</style>
<script async src="https://www.googletagmanager.com/gtag/js?id=G-N84GYVTQKX"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','G-N84GYVTQKX');</script>
<script>!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','26143384325317414');fbq('track','PageView');fbq('track','Lead');</script>
<noscript><img height="1" width="1" style="display:none" src="https://www.facebook.com/tr?id=26143384325317414&ev=PageView&noscript=1"/></noscript>
</head>
<body>
${overlayHtml}
<div class="card">
  <div class="logo-top">ÓPTICAS</div>
  <div class="logo-bot">Car & Era</div>
  <div class="divider"></div>
  ${d.titulo ? '<div class="titulo">' + escH(d.titulo) + '</div>' : ''}
  ${d.subtitulo ? '<div class="sub">' + escH(d.subtitulo) + '</div>' : ''}
  ${emojiHtml}
  <a href="${waUrl}" class="wa-btn">
    <svg viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.832-1.438A9.955 9.955 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2z"/></svg>
    ${escH(d.btn_texto || 'Abrir WhatsApp')}
  </a>
  <div class="redir"><span class="spinner"></span> Redirigiendo en ${delay} segundos...</div>
  <div class="footer">Cd. Juárez, Chihuahua</div>
</div>
<script>setTimeout(function(){window.location.href="${waUrl}"},${delay * 1000});</script>
</body>
</html>`;
}

function paginaNoEncontrada() {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Página no encontrada — Ópticas Car &amp; Era</title>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600&family=Outfit:wght@300;400;500;600&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Outfit',sans-serif;background:#0a0a0a;color:#f5f2ee;min-height:100vh;display:flex;align-items:center;justify-content:center}
.card{background:rgba(28,27,25,0.82);backdrop-filter:blur(24px);border:1px solid rgba(226,198,166,0.15);border-radius:20px;padding:40px 32px;max-width:400px;width:90%;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,0.5)}
.logo-top{font-family:'Cormorant Garamond',serif;font-size:18px;color:#e2c6a6;font-weight:600;letter-spacing:2px}
.logo-bot{font-family:'Cormorant Garamond',serif;font-size:24px;color:#f0dfc8;font-weight:500;letter-spacing:4px;margin-top:-2px}
.divider{width:50px;height:1px;background:linear-gradient(90deg,transparent,#e2c6a6,transparent);margin:16px auto}
.msg{font-size:15px;color:#bbb;margin-top:16px}
.emoji{font-size:48px;margin:20px 0}
</style>
</head>
<body>
<div class="card">
  <div class="logo-top">ÓPTICAS</div>
  <div class="logo-bot">Car & Era</div>
  <div class="divider"></div>
  <div class="emoji">🔍</div>
  <div class="msg">Esta página no existe o ya no está activa.</div>
  <div style="margin-top:20px;font-size:12px;color:#666">Visítanos en nuestras sucursales en Cd. Juárez</div>
</div>
</body>
</html>`;
}

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'public, max-age=300'
  };

  // Extract slug from path: /l/promotresporuno → promotresporuno
  const path = event.path || '';
  const slug = path.replace(/^\/l\//, '').replace(/\.html$/, '').replace(/\/$/, '');

  if (!slug) {
    return { statusCode: 404, headers, body: paginaNoEncontrada() };
  }

  if (!SUPA_KEY) {
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'SUPABASE_KEY no configurada' }) };
  }

  try {
    // Fetch landing page by archivo (slug)
    const res = await fetch(
      `${SUPA_URL}/rest/v1/landing_pages?archivo=eq.${encodeURIComponent(slug)}&estado=eq.activa&select=*&limit=1`,
      {
        headers: {
          'apikey': SUPA_KEY,
          'Authorization': `Bearer ${SUPA_KEY}`
        }
      }
    );

    if (!res.ok) {
      console.error('[Landing] Supabase error:', res.statusText);
      return { statusCode: 404, headers, body: paginaNoEncontrada() };
    }

    const data = await res.json();

    if (!data || data.length === 0) {
      return { statusCode: 404, headers, body: paginaNoEncontrada() };
    }

    const lp = data[0];
    const html = generarHTML(lp);

    return { statusCode: 200, headers, body: html };

  } catch (err) {
    console.error('[Landing] Error:', err.message);
    return { statusCode: 500, headers, body: paginaNoEncontrada() };
  }
};
