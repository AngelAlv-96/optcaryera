// mod-landings.js — Extracted from index.html
// Lines 15587-15994

let lpData = [];
let lpBgBase64 = ''; // current background image base64 (for local preview of new images)
let lpBgUrl = '';    // URL from Supabase Storage (saved/uploaded)
let lpNeedsUpload = false; // true when a NEW image was selected and needs uploading

async function cargarLandings() {
  const cont = document.getElementById('lp-list');
  cont.innerHTML = '<div style="text-align:center;color:var(--muted);font-size:13px;padding:20px">Cargando...</div>';
  try {
    const { data, error } = await db.from('landing_pages').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    lpData = data || [];
  } catch(e) {
    console.error('[Landings] Could not load from DB:', e.message);
    toast('⚠️ No se pudo cargar de BD: ' + (e.message || 'tabla no existe'), true);
    if (!lpData.length) {
      cont.innerHTML = '<div style="text-align:center;color:var(--muted);font-size:13px;padding:30px">' +
        '<div style="font-size:32px;margin-bottom:10px">🚀</div>' +
        '<div>No hay landing pages a&uacute;n</div>' +
        '<div style="font-size:11px;margin-top:6px;color:var(--muted)">Crea tu primera p&aacute;gina con el bot&oacute;n <b>+ Nueva Landing</b></div>' +
        '<div style="font-size:10px;margin-top:12px;padding:8px 12px;background:rgba(226,198,166,0.06);border-radius:8px;color:var(--beige);max-width:360px;margin-left:auto;margin-right:auto">💡 Si no tienes la tabla <code>landing_pages</code> en Supabase, las landings se guardan solo en esta sesi&oacute;n. Puedes descargar el HTML directamente.</div>' +
        '</div>';
      return;
    }
  }
  renderLpList();
}

function renderLpList() {
  const cont = document.getElementById('lp-list');
  if (!lpData.length) {
    cont.innerHTML = '<div style="text-align:center;color:var(--muted);font-size:13px;padding:30px">' +
      '<div style="font-size:32px;margin-bottom:10px">🚀</div>' +
      '<div>No hay landing pages a&uacute;n</div>' +
      '<div style="font-size:11px;margin-top:6px">Crea tu primera p&aacute;gina con el bot&oacute;n <b>+ Nueva Landing</b></div></div>';
    return;
  }
  const estadoColors = { activa:'#72c47e', pausada:'#d4b84a', borrador:'#7a7570' };
  cont.innerHTML = '<div style="display:grid;gap:8px">' + lpData.map(lp => {
    const col = estadoColors[lp.estado] || '#7a7570';
    const hasImg = lp.bg_image ? ' · 🖼' : '';
    return '<div style="display:flex;align-items:center;gap:12px;padding:12px 14px;background:var(--surface2);border-radius:10px;border:1px solid rgba(255,255,255,0.04)">' +
      '<div style="font-size:28px;flex-shrink:0">' + (lp.emoji || '📄') + '</div>' +
      '<div style="flex:1;min-width:0">' +
        '<div style="display:flex;align-items:center;gap:8px">' +
          '<span style="font-weight:600;font-size:13px;color:var(--white)">' + escH(lp.nombre || 'Sin nombre') + '</span>' +
          '<span style="font-size:9px;padding:2px 8px;border-radius:10px;background:' + col + '22;color:' + col + ';font-weight:700;text-transform:uppercase;letter-spacing:.5px">' + (lp.estado || 'borrador') + '</span>' +
        '</div>' +
        '<div style="font-size:11px;color:var(--muted);margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + escH(lp.mensaje || '') + '</div>' +
        '<div style="font-size:10px;color:var(--muted);margin-top:3px;opacity:0.6">' + (lp.archivo || lp.nombre_archivo || '') + '.html' + hasImg + ' · ' + (lp.wa_numero === '5216561967020' ? '📱Op' : '📢Ads') + (lp.estado === 'activa' ? ' · <span style="color:#72c47e">🌐 /l/' + escH(lp.archivo || '') + '</span>' : '') + '</div>' +
      '</div>' +
      '<div style="display:flex;gap:6px;flex-shrink:0">' +
        '<button class="btn btn-g btn-sm" onclick="lpCopiarLink(\'' + lp.id + '\')" style="font-size:11px;padding:5px 10px;background:rgba(114,184,196,0.08);color:#72b8c4" title="Copiar link">🔗</button>' +
        '<button class="btn btn-g btn-sm" onclick="lpEditar(\'' + lp.id + '\')" style="font-size:11px;padding:5px 10px">✏️</button>' +
        '<button class="btn btn-g btn-sm" onclick="lpDescargarById(\'' + lp.id + '\')" style="font-size:11px;padding:5px 10px;background:rgba(37,211,102,0.08);color:#25D366">⬇</button>' +
        '<button class="btn btn-g btn-sm" onclick="lpEliminar(\'' + lp.id + '\')" style="font-size:11px;padding:5px 10px;color:#e08080">🗑</button>' +
      '</div>' +
    '</div>';
  }).join('') + '</div>';
}

function lpNueva() {
  document.getElementById('lp-edit-id').value = '';
  document.getElementById('lp-nombre').value = '';
  document.getElementById('lp-titulo').value = '';
  document.getElementById('lp-subtitulo').value = '';
  document.getElementById('lp-emoji').value = '';
  document.getElementById('lp-mensaje').value = '';
  document.getElementById('lp-archivo').value = '';
  document.getElementById('lp-btn-texto').value = 'Abrir WhatsApp';
  document.getElementById('lp-delay').value = '3';
  document.getElementById('lp-estado').value = 'borrador';
  document.getElementById('lp-wa-numero').value = '5216563110094';
  document.getElementById('lp-form-title').textContent = 'Nueva Landing Page';
  lpBgBase64 = '';
  lpBgUrl = '';
  lpNeedsUpload = false;
  lpLimpiarImagenUI();
  document.getElementById('lp-form-card').style.display = '';
  document.getElementById('lp-form-card').scrollIntoView({ behavior:'smooth', block:'start' });
  lpPreviewUpdate();
}

function lpEditar(id) {
  const lp = lpData.find(l => l.id === id);
  if (!lp) return;
  document.getElementById('lp-edit-id').value = lp.id;
  document.getElementById('lp-nombre').value = lp.nombre || '';
  document.getElementById('lp-titulo').value = lp.titulo || '';
  document.getElementById('lp-subtitulo').value = lp.subtitulo || '';
  document.getElementById('lp-emoji').value = lp.emoji || '';
  document.getElementById('lp-mensaje').value = lp.mensaje || '';
  document.getElementById('lp-archivo').value = lp.archivo || lp.nombre_archivo || '';
  document.getElementById('lp-btn-texto').value = lp.btn_texto || 'Abrir WhatsApp';
  document.getElementById('lp-delay').value = lp.delay || '3';
  document.getElementById('lp-estado').value = lp.estado || 'borrador';
  document.getElementById('lp-wa-numero').value = lp.wa_numero || '5216563110094';
  document.getElementById('lp-form-title').textContent = 'Editar: ' + (lp.nombre || '');
  lpBgBase64 = '';
  lpBgUrl = '';
  lpNeedsUpload = false;
  const savedImg = lp.bg_image || '';
  if (savedImg.startsWith('http')) {
    lpBgUrl = savedImg;
    document.getElementById('lp-bg-name').textContent = 'Imagen guardada ✓';
    document.getElementById('lp-bg-clear').style.display = '';
    document.getElementById('lp-bg-preview').style.display = '';
    document.getElementById('lp-bg-thumb').src = savedImg;
  } else if (savedImg.startsWith('data:')) {
    lpBgBase64 = savedImg;
    lpNeedsUpload = true;
    document.getElementById('lp-bg-name').textContent = 'Imagen (pendiente de subir)';
    document.getElementById('lp-bg-clear').style.display = '';
    document.getElementById('lp-bg-preview').style.display = '';
    document.getElementById('lp-bg-thumb').src = savedImg;
  } else {
    lpLimpiarImagenUI();
  }
  document.getElementById('lp-form-card').style.display = '';
  document.getElementById('lp-form-card').scrollIntoView({ behavior:'smooth', block:'start' });
  lpPreviewUpdate();
}

function lpCancelar() {
  document.getElementById('lp-form-card').style.display = 'none';
  lpBgBase64 = '';
  lpBgUrl = '';
  lpNeedsUpload = false;
}

function lpCargarImagen(input) {
  const file = input.files[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) { toast('Imagen muy grande (máx 5MB). Comprime la imagen primero.'); return; }
  const reader = new FileReader();
  reader.onload = function(e) {
    lpBgBase64 = e.target.result;
    lpBgUrl = ''; // clear old URL — new image takes priority
    lpNeedsUpload = true;
    document.getElementById('lp-bg-name').textContent = file.name;
    document.getElementById('lp-bg-clear').style.display = '';
    document.getElementById('lp-bg-preview').style.display = '';
    document.getElementById('lp-bg-thumb').src = lpBgBase64;
    lpPreviewUpdate();
  };
  reader.readAsDataURL(file);
}

function lpLimpiarImagen() {
  lpBgBase64 = '';
  lpBgUrl = '';
  lpNeedsUpload = false;
  lpLimpiarImagenUI();
  lpPreviewUpdate();
}

function lpLimpiarImagenUI() {
  document.getElementById('lp-bg-name').textContent = 'Sin imagen (fondo oscuro)';
  document.getElementById('lp-bg-clear').style.display = 'none';
  document.getElementById('lp-bg-preview').style.display = 'none';
  document.getElementById('lp-bg-thumb').src = '';
  document.getElementById('lp-bg-file').value = '';
}

function lpPreviewUpdate() {
  const titulo = document.getElementById('lp-titulo').value || 'Tu título aquí';
  const subtitulo = document.getElementById('lp-subtitulo').value;
  const emoji = document.getElementById('lp-emoji').value;
  const btnTexto = document.getElementById('lp-btn-texto').value || 'Abrir WhatsApp';
  const delay = document.getElementById('lp-delay').value || '3';

  document.getElementById('lp-prev-titulo').textContent = titulo;
  document.getElementById('lp-prev-subtitulo').textContent = subtitulo;
  document.getElementById('lp-prev-subtitulo').style.display = subtitulo ? '' : 'none';
  const emojiEl = document.getElementById('lp-prev-emoji');
  emojiEl.textContent = emoji;
  emojiEl.style.display = emoji ? '' : 'none';
  document.getElementById('lp-prev-btn').textContent = btnTexto;
  document.getElementById('lp-prev-delay').textContent = delay;

  const bgEl = document.getElementById('lp-prev-bg');
  const ovEl = document.getElementById('lp-prev-overlay');
  const imgSrc = lpBgBase64 || lpBgUrl;
  if (imgSrc) {
    bgEl.style.backgroundImage = 'url(' + imgSrc + ')';
    bgEl.style.display = '';
    ovEl.style.display = '';
    document.getElementById('lp-preview').style.background = 'transparent';
  } else {
    bgEl.style.display = 'none';
    ovEl.style.display = 'none';
    document.getElementById('lp-preview').style.background = '#0a0a0a';
  }
}

function lpGetFormData() {
  return {
    nombre: document.getElementById('lp-nombre').value.trim(),
    titulo: document.getElementById('lp-titulo').value.trim(),
    subtitulo: document.getElementById('lp-subtitulo').value.trim(),
    emoji: document.getElementById('lp-emoji').value.trim(),
    mensaje: document.getElementById('lp-mensaje').value.trim(),
    archivo: document.getElementById('lp-archivo').value.trim().replace(/\.html$/,'').replace(/[^a-zA-Z0-9\-_]/g,'-'),
    btn_texto: document.getElementById('lp-btn-texto').value.trim() || 'Abrir WhatsApp',
    delay: parseInt(document.getElementById('lp-delay').value) || 3,
    estado: document.getElementById('lp-estado').value || 'borrador',
    wa_numero: document.getElementById('lp-wa-numero').value || '5216563110094',
    bg_image: lpBgUrl || lpBgBase64 || '' // URL preferred; lpGuardar overrides after upload
  };
}

async function lpSubirImagen(archivoSlug) {
  if (!lpBgBase64 || !lpNeedsUpload) return lpBgUrl || '';
  try {
    document.getElementById('lp-bg-name').textContent = 'Subiendo imagen...';
    const res = await fetch('/.netlify/functions/img-upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        auth: { id: currentUser?.id, pass: currentUser?.pass },
        image_base64: lpBgBase64,
        filename: archivoSlug || 'landing'
      })
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || 'Error al subir imagen');
    lpBgUrl = data.url;
    lpNeedsUpload = false;
    document.getElementById('lp-bg-name').textContent = 'Imagen subida ✓';
    return data.url;
  } catch(e) {
    console.error('[Landing] Image upload error:', e);
    toast('⚠️ Error al subir imagen: ' + e.message, true);
    return '';
  }
}

async function lpGuardar() {
  const d = lpGetFormData();
  if (!d.nombre) return toast('Ingresa un nombre de campaña');
  if (!d.mensaje) return toast('Ingresa el mensaje de WhatsApp');
  if (!d.archivo) return toast('Ingresa el nombre del archivo');

  const imgUrl = await lpSubirImagen(d.archivo);
  d.bg_image = imgUrl;

  const editId = document.getElementById('lp-edit-id').value;
  const dbData = { ...d };
  try {
    if (editId) {
      const { error } = await db.from('landing_pages').update(dbData).eq('id', editId);
      if (error) throw error;
      const idx = lpData.findIndex(l => l.id === editId);
      if (idx >= 0) lpData[idx] = { ...lpData[idx], ...d };
    } else {
      d.id = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
      d.created_at = new Date().toISOString();
      dbData.id = d.id;
      dbData.created_at = d.created_at;
      const { error } = await db.from('landing_pages').insert(dbData);
      if (error) throw error;
      lpData.unshift(d);
    }
  } catch(e) {
    console.error('[Landings] DB save error:', e.message);
    toast('⚠️ Error al guardar en BD: ' + (e.message || 'tabla no existe') + '. Se guardó solo en sesión — se perderá al refrescar.', true);
    if (editId) {
      const idx = lpData.findIndex(l => l.id === editId);
      if (idx >= 0) lpData[idx] = { ...lpData[idx], ...d };
    } else {
      d.id = Date.now().toString(36) + Math.random().toString(36).slice(2);
      d.created_at = new Date().toISOString();
      lpData.unshift(d);
    }
    renderLpList();
    document.getElementById('lp-form-card').style.display = 'none';
    lpBgBase64 = ''; lpBgUrl = ''; lpNeedsUpload = false;
    return;
  }
  renderLpList();
  document.getElementById('lp-form-card').style.display = 'none';
  lpBgBase64 = ''; lpBgUrl = ''; lpNeedsUpload = false;
  toast('Landing page guardada ✓');
}

async function lpEliminar(id) {
  if (!confirm('¿Eliminar esta landing page?')) return;
  try {
    const { error } = await db.from('landing_pages').delete().eq('id', id);
    if (error) throw new Error(error.message || error);
  } catch(e) {
    console.error('[Landings] DB delete error:', e.message);
    toast('⚠️ Error al eliminar en BD: ' + (e.message || 'tabla no existe'), true);
  }
  lpData = lpData.filter(l => l.id !== id);
  renderLpList();
  toast('Landing eliminada');
}

function lpGenerarHTML(d) {
  const waNum = d.wa_numero || '5216563110094';
  const waUrl = 'https://wa.me/' + waNum + '?text=' + encodeURIComponent(d.mensaje);
  const hasBg = d.bg_image && d.bg_image.length > 10;
  const bgStyle = hasBg
    ? 'background:url(' + d.bg_image + ') center/cover no-repeat fixed;'
    : 'background:#0a0a0a;';
  const overlayHtml = hasBg
    ? '<div style="position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:0"></div>'
    : '';
  const emojiHtml = d.emoji
    ? '<div class="emoji"><span>' + d.emoji + '</span></div>'
    : '';

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${escH(d.titulo || d.nombre)} — Ópticas Car & Era</title>
<meta http-equiv="refresh" content="${d.delay};url=${waUrl}">
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
    ${escH(d.btn_texto)}
  </a>
  <div class="redir"><span class="spinner"></span> Redirigiendo en ${d.delay} segundos...</div>
  <div class="footer">Cd. Juárez, Chihuahua</div>
</div>
<script>setTimeout(function(){window.location.href="${waUrl}"},${d.delay * 1000});<\/script>
</body>
</html>`;
}

function lpDescargar() {
  const d = lpGetFormData();
  if (!d.mensaje) return toast('Ingresa el mensaje de WhatsApp primero');
  if (!d.archivo) return toast('Ingresa el nombre del archivo');
  const html = lpGenerarHTML(d);
  const blob = new Blob([html], { type: 'text/html' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = d.archivo + '.html';
  a.click();
  URL.revokeObjectURL(a.href);
  toast('HTML descargado: ' + d.archivo + '.html ✓');
}

function lpDescargarById(id) {
  const lp = lpData.find(l => l.id === id);
  if (!lp) return;
  const html = lpGenerarHTML(lp);
  const blob = new Blob([html], { type: 'text/html' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (lp.archivo || lp.nombre_archivo || 'landing') + '.html';
  a.click();
  URL.revokeObjectURL(a.href);
  toast('HTML descargado ✓');
}

function lpCopiarLink(id) {
  const lp = lpData.find(l => l.id === id);
  if (!lp) return;
  if (!lp.archivo) return toast('Esta landing no tiene nombre de archivo', true);
  if (lp.estado !== 'activa') return toast('⚠️ Esta landing está en estado "' + (lp.estado || 'borrador') + '". Cámbiala a "activa" para que el link funcione.', true);
  const url = 'https://optcaryera.netlify.app/l/' + lp.archivo;
  navigator.clipboard.writeText(url).then(function() {
    toast('🔗 Link copiado: ' + url);
  }).catch(function() {
    const tmp = document.createElement('textarea');
    tmp.value = url;
    document.body.appendChild(tmp);
    tmp.select();
    document.execCommand('copy');
    document.body.removeChild(tmp);
    toast('🔗 Link copiado: ' + url);
  });
}
