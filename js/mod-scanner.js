// mod-scanner.js — Extracted from index.html
// Lines 15058-15272

function makeQR(text) {
  var qr = qrcode(0, 'H'); // auto version, ECC High (30%)
  qr.addData(text);
  qr.make();
  return qr;
}

function qrToSVG(text, cellSize) {
  var qr = makeQR(text);
  cellSize = cellSize || 3;
  var count = qr.getModuleCount();
  var quiet = 4;
  var size = (count + quiet * 2) * cellSize;
  var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '" style="display:block;margin:0 auto">';
  svg += '<rect width="' + size + '" height="' + size + '" fill="#fff"/>';
  for (var r = 0; r < count; r++) {
    for (var col = 0; col < count; col++) {
      if (qr.isDark(r, col)) {
        svg += '<rect x="' + ((col + quiet) * cellSize) + '" y="' + ((r + quiet) * cellSize) + '" width="' + cellSize + '" height="' + cellSize + '" fill="#000"/>';
      }
    }
  }
  svg += '</svg>';
  return svg;
}

function qrToCanvas(canvas, text, cellSize) {
  var qr = makeQR(text);
  cellSize = cellSize || 3;
  var count = qr.getModuleCount();
  var quiet = 4;
  var size = (count + quiet * 2) * cellSize;
  canvas.width = size;
  canvas.height = size;
  var ctx = canvas.getContext('2d');
  ctx.fillStyle = '#1a1410';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#e2c6a6';
  for (var r = 0; r < count; r++) {
    for (var col = 0; col < count; col++) {
      if (qr.isDark(r, col)) {
        ctx.fillRect((col + quiet) * cellSize, (r + quiet) * cellSize, cellSize, cellSize);
      }
    }
  }
}

async function abrirScanOrden() {
  if (!('BarcodeDetector' in window)) {
    var code = prompt('Ingresa el folio o código de la orden:');
    if (code) buscarOrdenPorCodigo(code.trim());
    return;
  }

  var overlay = document.createElement('div');
  overlay.id = 'scan-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.9);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px';

  overlay.innerHTML = '<div style="color:var(--beige);font-size:16px;font-weight:700;margin-bottom:16px">Escanear código de barras</div>' +
    '<video id="scan-video" style="width:100%;max-width:400px;border-radius:12px;border:2px solid rgba(226,198,166,0.3)" autoplay playsinline></video>' +
    '<div style="color:var(--muted);font-size:12px;margin-top:12px">Apunta la cámara al código de barras de la orden</div>' +
    '<div style="display:flex;gap:10px;margin-top:16px">' +
    '<button onclick="cerrarScanner()" style="padding:10px 24px;background:var(--surface2);color:var(--white);border:1px solid rgba(255,255,255,0.1);border-radius:8px;font-size:13px;cursor:pointer;font-family:Outfit,sans-serif">Cancelar</button>' +
    '<button onclick="cerrarScanner();var c=prompt(\x27Ingresar folio manual:\x27);if(c)buscarOrdenPorCodigo(c.trim())" style="padding:10px 24px;background:var(--surface2);color:var(--beige);border:1px solid rgba(226,198,166,0.2);border-radius:8px;font-size:13px;cursor:pointer;font-family:Outfit,sans-serif">Escribir folio</button>' +
    '</div>';

  document.body.appendChild(overlay);

  try {
    var stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    var video = document.getElementById('scan-video');
    video.srcObject = stream;
    window._scanStream = stream;

    var detector = new BarcodeDetector({ formats: ['code_128', 'qr_code', 'ean_13', 'ean_8'] });
    window._scanInterval = setInterval(async function() {
      if (video.readyState !== video.HAVE_ENOUGH_DATA) return;
      try {
        var barcodes = await detector.detect(video);
        if (barcodes.length > 0) {
          var val = barcodes[0].rawValue;
          cerrarScanner();
          buscarOrdenPorCodigo(val);
        }
      } catch(e) {}
    }, 300);
  } catch(e) {
    cerrarScanner();
    var code = prompt('No se pudo acceder a la cámara.\nIngresa el folio manualmente:');
    if (code) buscarOrdenPorCodigo(code.trim());
  }
}

function cerrarScanner() {
  if (window._scanInterval) { clearInterval(window._scanInterval); window._scanInterval = null; }
  if (window._scanStream) { window._scanStream.getTracks().forEach(function(t){t.stop();}); window._scanStream = null; }
  var overlay = document.getElementById('scan-overlay');
  if (overlay) overlay.remove();
}

async function buscarOrdenPorCodigo(code) {
  if (!code) return;
  toast('Buscando orden: ' + code + '...');

  var { data, error } = await db.from('ordenes_laboratorio')
    .select('id, notas_laboratorio, estado_lab, pacientes(nombre, apellidos)')
    .ilike('notas_laboratorio', '%Folio: ' + code + '%')
    .limit(20);

  if (data && data.length > 0) {
    var exact = data.filter(function(o){ return getFolioFromOrder(o) === code; });
    if (exact.length > 0) {
      verResumenOrden(exact[0].id);
      return;
    }
  }

  var { data: d2 } = await db.from('ordenes_laboratorio')
    .select('id, notas_laboratorio, estado_lab')
    .ilike('id', code + '%')
    .limit(1);

  if (d2 && d2.length > 0) {
    verResumenOrden(d2[0].id);
    return;
  }

  var { data: d3 } = await db.from('ordenes_laboratorio')
    .select('id')
    .eq('id', code)
    .limit(1);

  if (d3 && d3.length > 0) {
    verResumenOrden(d3[0].id);
    return;
  }

  toast('No se encontró orden con código: ' + code, true);
}

function scanLabInput(val) {
  val = (val || '').trim();
  if (!val) return;
  buscarOrdenPorCodigo(val);
}

async function reimprimirOrdenLab(orderId) {
  const { data: o, error } = await db.from('ordenes_laboratorio').select('*, pacientes(nombre, apellidos)').eq('id', orderId).single();
  if (error || !o) { toast('Error al cargar orden', true); return; }

  const pac = o.pacientes;
  const nombre = pac ? `${pac.nombre||''} ${pac.apellidos||''}`.trim() : '\u2014';
  const notasRaw = o.notas_laboratorio || '';
  const folio = notasRaw.match(/Folio: ([^\s|]+)/)?.[1] || '';
  const entrega = o.fecha_entrega ? new Date(o.fecha_entrega+'T12:00').toLocaleDateString('es-MX',{day:'2-digit',month:'short',year:'numeric'}) : '\u2014';
  const hora = o.hora_entrega || '';
  const suc = o.sucursal || 'CAR & ERA';
  const isLC = o.tipo_lente === 'Lente de Contacto';

  const row = (l,v) => v ? `<div class="t-row"><span>${l}:</span><span>${v}</span></div>` : '';

  let t = `<div class="t-logo">${suc}</div><hr class="t-hr">`;

  const qrLabel = folio || orderId.slice(0,8).toUpperCase();
  t += `<div style="text-align:center;padding:6px 0">${qrToSVG(qrLabel, 5)}</div>`;

  t += row('Folio', folio);
  t += row('Paciente', nombre);
  t += row('Entrega', entrega + (hora ? ' \u00b7 ' + hora : ''));

  if (isLC) {
    t += `<div class="t-row" style="font-weight:700;text-align:center;padding:4px 0;border-top:1px dashed #bbb;border-bottom:1px dashed #bbb;margin:4px 0">LENTES DE CONTACTO</div>`;
    t += row('Marca', o.material);
    t += row('Programa', o.tratamiento);
  }

  t += `<table class="t-rx-tbl"><thead><tr><th></th><th>ESF</th><th>CIL</th><th>EJE</th></tr></thead><tbody>`;
  t += `<tr><td class="t-rx-lbl">OD</td><td>${o.od_esfera||''}</td><td>${o.od_cilindro||''}</td><td>${o.od_eje||''}</td></tr>`;
  t += `<tr><td class="t-rx-lbl">OI</td><td>${o.oi_esfera||''}</td><td>${o.oi_cilindro||''}</td><td>${o.oi_eje||''}</td></tr>`;
  t += `</tbody></table>`;

  const addOD = o.od_add || '';
  const addOI = o.oi_add || '';
  const dip = o.dip || notasRaw.match(/DIP:\s*(\S+)/)?.[1] || '';
  const alt = o.altura || notasRaw.match(/ALT:\s*(\S+)/)?.[1] || '';
  if (addOD || dip || alt) {
    t += `<div class="t-rx-row3">`;
    if (dip) t += `<span>DP: <strong>${dip}</strong></span>`;
    if (addOD) t += `<span>ADD: <strong>${addOD}</strong></span>`;
    if (alt) t += `<span>ALT: <strong>${alt}</strong></span>`;
    t += `</div>`;
  }

  t += '<hr class="t-hr">';

  if (!isLC) {
    t += row('Tipo', o.tipo_lente);
    t += row('Material', o.material);
    t += row('Tratamiento', o.tratamiento);
    if (o.tinte && o.tinte !== 'Sin tinte') t += row('Tinte', o.tinte);
  }

  const urg = notasRaw.match(/Urgencia:\s*([^|]+)/)?.[1]?.trim();
  if (urg && urg !== 'Normal') t += row('Urgencia', urg);

  if (o.armazon) t += row('Armaz\u00f3n', o.armazon);

  const notasClean = notasRaw.replace(/\|\s*(Folio|Urgencia|DIP|ALT|LC_TIPO|LC_MISMA_RX|LC_OD|LC_OI|LC_REEMPLAZO|LC_VIGENCIA|LC_ADAPTACION):[^|]*/g, '').replace(/\|\s*LOG:\[[^\]]*\][^|]*/g, '').replace(/^\s*\|\s*/, '').replace(/\s*\|\s*$/, '').trim();
  if (notasClean) t += `<hr class="t-hr"><div class="t-row t-notas"><span>Notas:</span><span>${notasClean}</span></div>`;

  t += `<div style="text-align:center;margin-top:8px;font-size:11px;color:#999">REIMPRESION</div>`;

  silentPrint(t);
  toast('\u2705 Reimprimiendo orden ' + (folio || ''));
}


// ── MOBILE CAMERA SCANNER (html5-qrcode + zoom/torch) ──
var _camScanner = null;
var _camTarget = null;
var _camTrack = null;

function esMobile() {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.innerWidth < 768;
}

function abrirCamaraMobile(targetInputId) {
  _camTarget = targetInputId;
  if (typeof Html5Qrcode === 'undefined') {
    var code = prompt('Cámara no disponible. Ingresa el código:');
    if (code) { aplicarScanResult(code.trim()); }
    return;
  }
  var ov = document.createElement('div');
  ov.id = 'cam-scan-overlay';
  ov.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#000;display:flex;flex-direction:column';
  ov.innerHTML = '<div id="cam-reader" style="flex:1;width:100%;overflow:hidden"></div>'
    + '<div style="padding:10px 16px;background:#111">'
    + '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">'
    + '<button id="cam-torch-btn" onclick="camToggleTorch()" style="background:#222;border:1px solid #555;border-radius:10px;padding:8px 12px;font-size:18px;cursor:pointer;flex-shrink:0">🔦</button>'
    + '<input type="range" id="cam-zoom" min="1" max="5" step="0.1" value="2" oninput="camSetZoom(this.value)" style="flex:1;accent-color:#c9a96e;height:28px">'
    + '<span id="cam-zoom-label" style="color:#c9a96e;font-size:15px;font-weight:800;min-width:40px;text-align:right">2.0x</span>'
    + '</div>'
    + '<div style="display:flex;gap:8px">'
    + '<button onclick="cerrarCamaraMobile()" style="flex:1;background:#333;border:none;border-radius:12px;padding:12px;font-size:14px;font-weight:700;cursor:pointer;color:#fff;font-family:Outfit,sans-serif">✕ Cerrar</button>'
    + '<button onclick="camIngresarManual()" style="flex:1;background:#222;border:1px solid #555;border-radius:12px;padding:12px;font-size:14px;cursor:pointer;color:#ccc;font-family:Outfit,sans-serif">⌨ Manual</button>'
    + '</div></div>';
  document.body.appendChild(ov);
  iniciarCamaraMobile();
}

async function iniciarCamaraMobile() {
  try {
    _camScanner = new Html5Qrcode('cam-reader');
    var config = {
      fps: 15,
      qrbox: function(vw, vh) { var s = Math.min(vw, vh) * 0.7; return { width: s, height: s }; },
      aspectRatio: window.innerHeight / window.innerWidth,
      formatsToSupport: [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15]
    };
    await _camScanner.start(
      { facingMode: { exact: 'environment' } },
      config,
      function(decodedText) {
        cerrarCamaraMobile();
        aplicarScanResult(decodedText);
      },
      function() {}
    );
    // Get video track for zoom/torch
    setTimeout(function() {
      try {
        var video = document.querySelector('#cam-reader video');
        if (video && video.srcObject) {
          _camTrack = video.srcObject.getVideoTracks()[0];
          if (_camTrack) {
            var caps = _camTrack.getCapabilities ? _camTrack.getCapabilities() : {};
            var zoomSlider = document.getElementById('cam-zoom');
            if (caps.zoom) {
              zoomSlider.min = caps.zoom.min;
              zoomSlider.max = Math.min(caps.zoom.max, 8);
              zoomSlider.value = Math.min(2, caps.zoom.max);
              camSetZoom(zoomSlider.value);
            }
            var torchBtn = document.getElementById('cam-torch-btn');
            if (!caps.torch) torchBtn.style.display = 'none';
            // Try to set focus mode to continuous
            if (caps.focusMode && caps.focusMode.includes('continuous')) {
              _camTrack.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(function(){});
            }
          }
        }
      } catch(e) { console.warn('cam capabilities:', e); }
    }, 500);
  } catch(e) {
    cerrarCamaraMobile();
    toast('Error cámara: ' + e, true);
    var code = prompt('Ingresa el código manualmente:');
    if (code) aplicarScanResult(code.trim());
  }
}

function camSetZoom(val) {
  document.getElementById('cam-zoom-label').textContent = Number(val).toFixed(1) + 'x';
  if (_camTrack) {
    try { _camTrack.applyConstraints({ advanced: [{ zoom: Number(val) }] }); } catch(e) {}
  }
}

var _camTorchOn = false;
function camToggleTorch() {
  _camTorchOn = !_camTorchOn;
  if (_camTrack) {
    try { _camTrack.applyConstraints({ advanced: [{ torch: _camTorchOn }] }); } catch(e) {}
  }
  var btn = document.getElementById('cam-torch-btn');
  if (btn) btn.style.background = _camTorchOn ? 'rgba(201,169,110,0.3)' : 'none';
}

function camIngresarManual() {
  cerrarCamaraMobile();
  var code = prompt('Ingresa el código:');
  if (code) aplicarScanResult(code.trim());
}

function aplicarScanResult(val) {
  if (!val || !_camTarget) return;
  var el = document.getElementById(_camTarget);
  if (!el) return;
  el.value = val;
  el.dispatchEvent(new Event('input'));
  var ev = new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true });
  el.dispatchEvent(ev);
  toast('✓ Escaneado: ' + val);
  _camTarget = null;
}

function cerrarCamaraMobile() {
  _camTrack = null;
  _camTorchOn = false;
  if (_camScanner) {
    try { _camScanner.stop().catch(function(){}); } catch(e) {}
    try { _camScanner.clear(); } catch(e) {}
    _camScanner = null;
  }
  var ov = document.getElementById('cam-scan-overlay');
  if (ov) ov.remove();
}

// Inject camera buttons on mobile
document.addEventListener('DOMContentLoaded', function() {
  if (!esMobile()) return;
  var scanFields = [
    { id: 'ord-search' }, { id: 'lab-search' }, { id: 'lp-search' },
    { id: 'surt-input' }, { id: 'vta-pac-search' }, { id: 'vta-prod-search' }, { id: 'gta-search' }
  ];
  scanFields.forEach(function(sf) {
    var el = document.getElementById(sf.id);
    if (!el) return;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = '📷';
    btn.style.cssText = 'position:absolute;right:4px;top:50%;transform:translateY(-50%);background:rgba(226,198,166,0.15);border:1px solid rgba(226,198,166,0.3);border-radius:6px;padding:4px 8px;font-size:16px;cursor:pointer;z-index:2';
    btn.onclick = function() { abrirCamaraMobile(sf.id); };
    var wrap = el.parentElement;
    if (wrap) { wrap.style.position = 'relative'; wrap.appendChild(btn); }
  });
});
