// mod-produccion.js — Extracted from index.html
// Lines 15273-15586


var _manosOrden = null;

async function manosCargar(val) {
  val = (val || '').trim();
  if (!val) return;
  var input = document.getElementById('manos-input');
  document.getElementById('manos-status').textContent = 'Buscando...';
  document.getElementById('manos-card').style.display = 'none';

  var { data } = await db.from('ordenes_laboratorio')
    .select('*, pacientes(nombre, apellidos)')
    .ilike('notas_laboratorio', '%Folio: ' + val + '%')
    .limit(20);

  if (data && data.length) {
    var exact = data.filter(function(o){ return getFolioFromOrder(o) === val; });
    data = exact.length ? exact : null;
  }

  if (!data || !data.length) {
    var { data: d2 } = await db.from('ordenes_laboratorio')
      .select('*, pacientes(nombre, apellidos)')
      .ilike('id', val + '%').limit(1);
    data = d2;
  }

  if (!data || !data.length) {
    document.getElementById('manos-status').textContent = 'No encontrada: ' + val;
    toast('Orden no encontrada', true);
    input.value = '';
    input.focus();
    return;
  }

  _manosOrden = data[0];

  if (_manosOrden.estado_lab === 'Enviado al lab') {
    var now = new Date().toLocaleString('es-MX', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit', hour12:false });
    var logEntry = ' | LOG:[' + now + '] Enviado al lab → Recibido en lab (Auto-scan Producción)';
    var notas = (_manosOrden.notas_laboratorio || '') + logEntry;
    await db.from('ordenes_laboratorio').update({ estado_lab: 'Recibido en lab', notas_laboratorio: notas }).eq('id', _manosOrden.id);
    _manosOrden.estado_lab = 'Recibido en lab';
    _manosOrden.notas_laboratorio = notas;
    toast('📦 Recibido en lab — ' + ((_manosOrden.notas_laboratorio||'').match(/Folio: ([^\s|]+)/)?.[1] || ''));
    if (typeof loadLab === 'function') loadLab();
  }

  manosRender();
  input.value = '';
  input.focus();
}

function manosRender() {
  var o = _manosOrden;
  if (!o) return;
  var pac = o.pacientes;
  var nombre = pac ? (pac.nombre||'') + ' ' + (pac.apellidos||'') : '\u2014';
  var notasRaw = o.notas_laboratorio || '';
  var folio = notasRaw.match(/Folio: ([^\s|]+)/)?.[1] || '';
  var st = LAB_ESTADOS[o.estado_lab] || LAB_ESTADOS['Enviado al lab'];
  var isLC = o.tipo_lente === 'Lente de Contacto';

  var estadoColor = st.dot;
  document.getElementById('manos-status').innerHTML = '<span style="color:' + estadoColor + '">\u25cf</span> ' + o.estado_lab;

  var h = '<div style="background:var(--surface);border:1px solid rgba(226,198,166,0.15);border-radius:12px;overflow:hidden">';

  h += '<div style="padding:14px 16px;border-bottom:1px solid rgba(255,255,255,0.06);display:flex;justify-content:space-between;align-items:center">';
  h += '<div>';
  h += '<div style="font-size:16px;font-weight:700;color:var(--white)">' + nombre.trim() + '</div>';
  h += '<div style="font-size:12px;color:var(--muted);margin-top:2px">Folio: <strong style="color:var(--beige)">' + folio + '</strong></div>';
  h += '</div>';
  h += '<div style="background:' + estadoColor + '18;color:' + estadoColor + ';border:1px solid ' + estadoColor + '33;padding:4px 12px;border-radius:20px;font-size:11px;font-weight:600">' + o.estado_lab + '</div>';
  h += '</div>';

  var faltMatch = notasRaw.match(/Faltante:\s*(OD|OI)/);
  if (o.estado_lab === 'Faltante' && faltMatch) {
    var ojoLabel = faltMatch[1] === 'OD' ? 'OD — Ojo Derecho' : 'OI — Ojo Izquierdo';
    h += '<div style="padding:8px 16px;background:rgba(224,128,128,0.08);border-bottom:1px solid rgba(224,128,128,0.15);display:flex;align-items:center;gap:8px">';
    h += '<span style="font-size:18px">\ud83d\udc41</span>';
    h += '<div><div style="font-size:12px;font-weight:700;color:#e08080">Material faltante: ' + ojoLabel + '</div>';
    h += '<div style="font-size:11px;color:var(--muted)">Surtir el material faltante y marcar como Surtido</div></div>';
    h += '</div>';
  }

  h += '<div style="padding:12px 16px;display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12px">';
  h += '<div><span style="color:var(--muted)">Tipo:</span> <strong>' + (o.tipo_lente||'') + '</strong></div>';
  h += '<div><span style="color:var(--muted)">Material:</span> <strong>' + (o.material||'') + '</strong></div>';
  h += '<div><span style="color:var(--muted)">Tratamiento:</span> <strong>' + (o.tratamiento||'') + '</strong></div>';
  if (o.tinte && o.tinte !== 'Sin tinte') h += '<div><span style="color:var(--muted)">Tinte:</span> <strong>' + o.tinte + '</strong></div>';
  h += '<div><span style="color:var(--muted)">OD:</span> <strong>' + [o.od_esfera,o.od_cilindro,o.od_eje].filter(Boolean).join(' / ') + '</strong></div>';
  h += '<div><span style="color:var(--muted)">OI:</span> <strong>' + [o.oi_esfera,o.oi_cilindro,o.oi_eje].filter(Boolean).join(' / ') + '</strong></div>';
  var dip = o.dip || notasRaw.match(/DIP:\s*(\S+)/)?.[1] || '';
  var alt = o.altura || notasRaw.match(/ALT:\s*(\S+)/)?.[1] || '';
  if (dip) h += '<div><span style="color:var(--muted)">DIP:</span> <strong>' + dip + '</strong></div>';
  if (alt) h += '<div><span style="color:var(--muted)">ALT:</span> <strong>' + alt + '</strong></div>';
  h += '</div>';

  h += '<div style="padding:12px 16px;border-top:1px solid rgba(255,255,255,0.06);display:flex;gap:8px;flex-wrap:wrap">';
  h += manosAcciones(o);
  h += '</div>';

  h += '</div>';
  document.getElementById('manos-card').innerHTML = h;
  document.getElementById('manos-card').style.display = '';
}

function manosAcciones(o) {
  var estado = o.estado_lab;
  var btns = '';
  var btnStyle = function(color, label, action) {
    return '<button onclick="' + action + '" style="flex:1;min-width:100px;padding:10px 12px;background:' + color + ';color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;font-family:Outfit,sans-serif">' + label + '</button>';
  };
  var btnOutline = function(color, label, action) {
    return '<button onclick="' + action + '" style="flex:1;min-width:100px;padding:10px 12px;background:transparent;color:' + color + ';border:1px solid ' + color + '44;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;font-family:Outfit,sans-serif">' + label + '</button>';
  };

  if (estado === 'Enviado al lab' || estado === 'Recibido en lab') {
    btns += btnStyle('#72c47e', '\u2705 Surtido', "manosAvanzar('" + o.id + "','Surtido')");
    btns += btnOutline('#e08080', '\u274c Faltante', "manosAvanzar('" + o.id + "','Faltante')");
    btns += btnOutline('#e8a84a', '\ud83c\udfe2 Lab externo', "manosAvanzar('" + o.id + "','Tallando en lab externo')");
  } else if (estado === 'Surtido') {
    btns += '<div style="width:100%;margin-bottom:6px"><select id="manos-tecnico" style="width:100%;background:var(--surface);border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:8px 12px;color:var(--white);font-family:Outfit,sans-serif;font-size:13px;outline:none"><option value="">Seleccionar t\u00e9cnico...</option><option>Jorge</option><option>Azael</option></select></div>';
    btns += btnStyle('#d4b84a', '\u2699\ufe0f M\u00e1quina 1', "manosAsignarMaq('" + o.id + "',1)");
    btns += btnStyle('#c8a83e', '\u2699\ufe0f M\u00e1quina 2', "manosAsignarMaq('" + o.id + "',2)");
  } else if (estado.startsWith('En proceso')) {
    btns += btnStyle('#72b8c4', '\u2705 Biselado listo', "manosTerminarMaq('" + o.id + "')");
    btns += btnOutline('#e08080', '\u21a9\ufe0f Devolver', "manosAvanzar('" + o.id + "','Devuelto al lab')");
  } else if (estado === 'Biselado completado') {
    btns += btnStyle('#72b8c4', '\ud83d\ude9a Enviar a sucursal', "manosAvanzar('" + o.id + "','En camino a sucursal')");
  } else if (estado === 'En camino a sucursal') {
    btns += btnStyle('#b48ad4', '\ud83d\udce6 Recibido en \u00f3ptica', "manosAvanzar('" + o.id + "','Recibido en \u00f3ptica')");
  } else if (estado === 'Recibido en \u00f3ptica' || estado === 'Recibido en óptica') {
    btns += btnStyle('#72c47e', '\ud83c\udf1f Listo para entrega', "manosAvanzar('" + o.id + "','Listo para entrega')");
  } else if (estado === 'Listo para entrega') {
    btns += btnStyle('#888', '\ud83c\udf89 Entregado', "manosAvanzar('" + o.id + "','Entregado')");
  } else if (estado === 'Tallando en lab externo') {
    btns += btnStyle('#72c47e', '\u2705 Surtido', "manosAvanzar('" + o.id + "','Surtido')");
  } else if (estado === 'Devuelto al lab' || estado === 'Faltante') {
    btns += btnStyle('#72c47e', '\u2705 Surtido', "manosAvanzar('" + o.id + "','Surtido')");
  }

  btns += btnOutline('#999', '\ud83d\udda8 Reimprimir', "reimprimirOrdenLab('" + o.id + "')");
  return btns;
}

async function manosAvanzar(orderId, nuevoEstado) {
  if (nuevoEstado === 'Faltante') { marcarFaltanteManos(orderId); return; }

  var { data: orden } = await db.from('ordenes_laboratorio').select('notas_laboratorio, estado_lab').eq('id', orderId).single();
  if (!orden) { toast('Error', true); return; }

  var oldEstado = orden.estado_lab;
  var now = new Date().toLocaleString('es-MX', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit', hour12:false });
  var logEntry = ' | LOG:[' + now + '] ' + oldEstado + ' \u2192 ' + nuevoEstado + ' (' + (currentUser?.nombre || 'Sistema') + ')';
  var notas = (orden.notas_laboratorio || '') + logEntry;

  if (nuevoEstado === 'Surtido') {
    notas = notas.replace(/\s*\|\s*Faltante:\s*(OD|OI)\s*/g, '');
  }

  var { error } = await db.from('ordenes_laboratorio').update({ estado_lab: nuevoEstado, notas_laboratorio: notas }).eq('id', orderId);
  if (error) { toast('Error: ' + error.message, true); return; }

  toast('\u2705 ' + nuevoEstado);

  if (nuevoEstado === 'Listo para entrega') {
    var { data: ordCheck } = await db.from('ordenes_laboratorio').select('paciente_id, pacientes(nombre, apellidos, telefono)').eq('id', orderId).single();
    if (ordCheck && !ordCheck.pacientes?.telefono) {
      var nomPac = ordCheck.pacientes ? (ordCheck.pacientes.nombre||'') + ' ' + (ordCheck.pacientes.apellidos||'') : '';
      pedirTelefono(ordCheck.paciente_id, nomPac.trim(), orderId);
    }
  }

  var { data: updated } = await db.from('ordenes_laboratorio').select('*, pacientes(nombre, apellidos)').eq('id', orderId).single();
  if (updated) {
    _manosOrden = updated;
    manosRender();
  }

  if (nuevoEstado === 'Entregado' || nuevoEstado === 'En camino a sucursal') {
    setTimeout(function() {
      document.getElementById('manos-card').style.display = 'none';
      document.getElementById('manos-status').textContent = 'Listo \u2014 escanea la siguiente orden';
      _manosOrden = null;
      document.getElementById('manos-input').focus();
    }, 2000);
  }

  if (typeof loadLabTablero === 'function') loadLabTablero();
  manosRefreshMaquinas();
}

async function manosAsignarMaq(orderId, maqNum) {
  var tecnico = document.getElementById('manos-tecnico')?.value;
  if (!tecnico) { toast('Selecciona un técnico primero', true); return; }

  var estadoMaq = 'En proceso Máquina ' + maqNum;
  var { data: ocupada } = await db.from('ordenes_laboratorio').select('id').eq('estado_lab', estadoMaq).limit(1);
  if (ocupada && ocupada.length > 0) { toast('Máquina ' + maqNum + ' está ocupada', true); return; }

  var entrego = prompt('¿Quién entregó el pedido surtido?');
  if (!entrego) return;

  var { data: orden } = await db.from('ordenes_laboratorio').select('notas_laboratorio, estado_lab').eq('id', orderId).single();
  if (!orden) { toast('Error', true); return; }

  var now = new Date();
  var nowStr = now.toLocaleString('es-MX', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit', hour12:false });
  var logEntry = ' | LOG:[' + nowStr + '] ' + orden.estado_lab + ' → ' + estadoMaq + ' (' + (currentUser?.nombre || 'Sistema') + ')';
  var notas = (orden.notas_laboratorio || '') + logEntry + ' | Entregó: ' + entrego;

  var { error } = await db.from('ordenes_laboratorio').update({
    estado_lab: estadoMaq,
    notas_laboratorio: notas,
    lab_tecnico: tecnico,
    lab_hora_inicio: now.toISOString()
  }).eq('id', orderId);

  if (error) { toast('Error: ' + error.message, true); return; }
  toast('✅ Asignado a Máquina ' + maqNum + ' — ' + tecnico);

  var { data: updated } = await db.from('ordenes_laboratorio').select('*, pacientes(nombre, apellidos)').eq('id', orderId).single();
  if (updated) { _manosOrden = updated; manosRender(); }
  document.getElementById('manos-maquinas').style.display = '';
  manosRefreshMaquinas();
  if (typeof loadLabTablero === 'function') loadLabTablero();

  setTimeout(function() {
    document.getElementById('manos-card').style.display = 'none';
    document.getElementById('manos-status').textContent = 'Máquina ' + maqNum + ' en uso — escanea la siguiente orden';
    _manosOrden = null;
    document.getElementById('manos-input').focus();
  }, 1500);
}

async function manosTerminarMaq(orderId) {
  var comentario = prompt('¿Agregar comentario? (opcional)') || '';
  var { data: orden } = await db.from('ordenes_laboratorio').select('notas_laboratorio').eq('id', orderId).single();
  var notas = orden?.notas_laboratorio || '';
  if (comentario.trim()) notas += ' | Comentario máq: ' + comentario.trim();
  notas += ' | Biselado: ' + new Date().toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'});
  var nowStr = new Date().toLocaleString('es-MX', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit', hour12:false });
  notas += ' | LOG:[' + nowStr + '] En proceso → Biselado completado (' + (currentUser?.nombre || 'Sistema') + ')';

  await db.from('ordenes_laboratorio').update({ estado_lab: 'Biselado completado', notas_laboratorio: notas, lab_hora_inicio: null }).eq('id', orderId);
  toast('✅ Biselado completado' + (comentario.trim() ? ' — ' + comentario.trim() : ''));

  var { data: updated } = await db.from('ordenes_laboratorio').select('*, pacientes(nombre, apellidos)').eq('id', orderId).single();
  if (updated) { _manosOrden = updated; manosRender(); }
  manosRefreshMaquinas();
  if (typeof loadLabTablero === 'function') loadLabTablero();
}

async function manosRefreshMaquinas() {
  var panel = document.getElementById('manos-maquinas');
  if (!panel) return;

  var { data: maq1 } = await db.from('ordenes_laboratorio')
    .select('*, pacientes(nombre, apellidos)')
    .eq('estado_lab', 'En proceso Máquina 1').limit(1);
  var { data: maq2 } = await db.from('ordenes_laboratorio')
    .select('*, pacientes(nombre, apellidos)')
    .eq('estado_lab', 'En proceso Máquina 2').limit(1);

  var hasMaq = (maq1 && maq1.length) || (maq2 && maq2.length);
  panel.style.display = hasMaq ? '' : 'none';

  manosRenderOneMaq(1, maq1 && maq1[0], '#d4b84a');
  manosRenderOneMaq(2, maq2 && maq2[0], '#c8a83e');

  if (window._manosTimerInterval) clearInterval(window._manosTimerInterval);
  if (hasMaq) {
    window._manosTimerInterval = setInterval(function() {
      [1,2].forEach(function(n) {
        var el = document.getElementById('manos-timer-' + n);
        var startAttr = el?.dataset?.start;
        if (el && startAttr) {
          el.textContent = formatElapsed(new Date(startAttr));
        }
      });
    }, 1000);
  }
}

function manosRenderOneMaq(num, orden, col) {
  var body = document.getElementById('manos-maq' + num + '-body');
  var stat = document.getElementById('manos-maq' + num + '-status');
  if (!body || !stat) return;

  if (orden) {
    stat.textContent = 'En uso'; stat.style.color = col;
    var folio = (orden.notas_laboratorio||'').match(/Folio: ([^\s|]+)/)?.[1] || '';
    var pac = orden.pacientes;
    var nombre = pac ? (pac.nombre||'') + ' ' + (pac.apellidos||'') : '—';
    var inicio = orden.lab_hora_inicio ? new Date(orden.lab_hora_inicio) : null;
    var tiempoStr = inicio ? formatElapsed(inicio) : '';
    var entrego = (orden.notas_laboratorio||'').match(/Entregó:\s*([^|]+)/)?.[1]?.trim() || '';

    body.innerHTML = '<div style="font-weight:700;font-size:13px;color:var(--beige);margin-bottom:2px">' + (folio||'S/F') + ' — ' + nombre.trim() + '</div>' +
      '<div style="font-size:11px;color:var(--muted)">' + (orden.tipo_lente||'') + ' · ' + (orden.material||'') + '</div>' +
      '<div style="font-size:11px;color:' + col + ';margin-top:2px">' + (orden.lab_tecnico||'—') + (entrego ? ' · Entregó: '+entrego : '') + '</div>' +
      '<div style="font-size:20px;font-weight:700;color:' + col + ';margin-top:4px;font-family:Courier New,monospace" id="manos-timer-' + num + '" data-start="' + (orden.lab_hora_inicio||'') + '">' + tiempoStr + '</div>' +
      '<div style="display:flex;gap:6px;margin-top:8px">' +
        '<button onclick="manosTerminarMaq(\'' + orden.id + '\')" style="flex:1;padding:8px;background:#72b8c4;color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;font-family:Outfit,sans-serif">✅ Terminado</button>' +
        '<button onclick="manosAvanzar(\'' + orden.id + '\',\'Surtido\')" style="padding:8px 12px;background:transparent;color:#e08080;border:1px solid #e0808044;border-radius:8px;font-size:11px;cursor:pointer;font-family:Outfit,sans-serif">↩ Pausar</button>' +
      '</div>';
  } else {
    stat.textContent = 'Libre'; stat.style.color = 'var(--muted)';
    body.innerHTML = '<div style="text-align:center;padding:12px;color:var(--muted);font-size:12px">Disponible</div>';
  }
}
