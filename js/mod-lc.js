// ═══════════════════════════════════════════════════════════
// MÓDULO LENTES DE CONTACTO v166
// Catálogo LC (cards + specs) · CRM Recompra · Estadísticas
// ═══════════════════════════════════════════════════════════

var _lcModProds = [];
var _lcParamsCache = null;
var _lcImgCache = {};
var _lcActiveTab = 'catalogo';
var _lcData = [];
var _lcFiltered = [];
var _lcUploadKey = null;
var _lcSalesCount = null; // { producto_id: qty_sold }

// ── BRAND MAP (same as tienda.html) ──
var LC_BRAND_MAP = {
  'acuvue':'Acuvue','air':'Air Optix','air optix':'Air Optix','biofinity':'Biofinity',
  'biomedics':'Biomedics','biotrue':'Biotrue','bausch+lomb':'Bausch+Lomb','ultra':'Bausch+Lomb',
  'soflens':'Bausch+Lomb','dailies':'Dailies','freshlook':'FreshLook','lenticon':'Lenticon',
  'lumitoric':'Lenticon','avaira':'Avaira','clariti':'Clariti','o2':'O2 Optix',
  'total30':'Total30','precision1':'Precision1','infuse':'Infuse','start':'Start',
  'halloween':'Especial'
};

// ── FREQ MAP ──
var LC_FREQ_MAP = {};
(function() {
  [1].forEach(function(d){ LC_FREQ_MAP[d] = 'Diario'; });
  [14,15].forEach(function(d){ LC_FREQ_MAP[d] = 'Quincenal'; });
  [30].forEach(function(d){ LC_FREQ_MAP[d] = 'Mensual'; });
  [90].forEach(function(d){ LC_FREQ_MAP[d] = 'Trimestral'; });
})();

function _lcGetFreq(prod) {
  var f = prod.frecuencia_cambio_dias;
  if (f && LC_FREQ_MAP[f]) return LC_FREQ_MAP[f];
  var n = (prod.nombre || '').toUpperCase();
  if (/1[\s-]?DAY|DAILY|DAILIES|DIARIO/i.test(n)) return 'Diario';
  if (/QUINCEN/i.test(n)) return 'Quincenal';
  if (/TRIMEST/i.test(n)) return 'Trimestral';
  return 'Mensual';
}

// ═══════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════

async function initLcModule() {
  var grid = document.getElementById('lc-card-grid');
  if (grid) grid.innerHTML = '<div style="padding:24px;text-align:center;color:var(--muted);font-size:12px"><span class="spinner-sm"></span> Cargando...</div>';

  try {
    var [prodRes, cfgRes] = await Promise.all([
      db.from('productos').select('id,nombre,marca,precio_venta,categoria,stock,pares_por_caja,frecuencia_cambio_dias,duracion_dias,activo,departamento,notas').ilike('categoria', '%contacto%').order('nombre'),
      db.from('app_config').select('id,value').in('id', ['lc_parametros', 'lc_imagenes'])
    ]);

    _lcModProds = prodRes.data || [];
    _lcParamsCache = null;
    _lcImgCache = {};

    // Load LC sales count (background, non-blocking)
    if (!_lcSalesCount) _lcLoadSalesCount();

    if (cfgRes.data) {
      cfgRes.data.forEach(function(r) {
        try {
          if (r.id === 'lc_parametros') _lcParamsCache = JSON.parse(r.value);
          if (r.id === 'lc_imagenes') _lcImgCache = JSON.parse(r.value);
        } catch(e) {}
      });
    }
  } catch(e) {
    toast('Error cargando LC: ' + e.message, true);
    _lcModProds = [];
  }

  // Show admin-only elements
  var isAdmin = currentUser?.rol === 'admin';
  var btnTienda = document.getElementById('btn-lc-catalogo-tienda');
  var btnNuevo = document.getElementById('btn-lc-nuevo');
  if (btnTienda) btnTienda.style.display = isAdmin ? '' : 'none';
  if (btnNuevo) btnNuevo.style.display = isAdmin ? '' : 'none';

  // CRM y Estadísticas solo admin
  var tabCrm = document.getElementById('lc-tab-crm');
  var tabEst = document.getElementById('lc-tab-estadisticas');
  if (tabCrm) tabCrm.style.display = isAdmin ? '' : 'none';
  if (tabEst) tabEst.style.display = isAdmin ? '' : 'none';

  // Si no es admin y el tab activo es CRM/estadísticas, forzar catálogo
  if (!isAdmin && _lcActiveTab !== 'catalogo') _lcActiveTab = 'catalogo';

  lcSwitchTab(_lcActiveTab);
}

// ═══════════════════════════════════════════════════════════
// TABS
// ═══════════════════════════════════════════════════════════

function lcSwitchTab(tab) {
  _lcActiveTab = tab;
  ['catalogo', 'crm', 'estadisticas'].forEach(function(t) {
    var content = document.getElementById('lc-content-' + t);
    var tabBtn = document.getElementById('lc-tab-' + t);
    if (content) content.style.display = t === tab ? '' : 'none';
    if (tabBtn) { tabBtn.classList.toggle('active', t === tab); }
  });

  if (tab === 'catalogo') lcRenderCatalogo();
  else if (tab === 'crm') cargarLcCrm();
  else if (tab === 'estadisticas') lcRenderEstadisticas();
}

// ═══════════════════════════════════════════════════════════
// CATÁLOGO TAB — cards con specs
// ═══════════════════════════════════════════════════════════

function lcRenderCatalogo() {
  var grouped = lcGroupProducts(_lcModProds);
  var params = _lcParamsCache || {};
  var imgMap = _lcImgCache || {};

  // Populate marca filter dynamically
  var marcaSel = document.getElementById('lc-marca-filter');
  if (marcaSel && marcaSel.options.length <= 1) {
    var marcas = {};
    grouped.forEach(function(p) { if (p.marca) marcas[p.marca] = true; });
    Object.keys(marcas).sort().forEach(function(m) {
      marcaSel.innerHTML += '<option value="' + m + '">' + m + '</option>';
    });
  }

  // Apply filters
  var filtered = _lcApplyFilters(grouped);

  // Stats
  var statsEl = document.getElementById('lc-cat-stats');
  if (statsEl) {
    var byType = { 'Esférico': 0, 'Tórico': 0, 'Multifocal': 0, 'Color': 0 };
    grouped.forEach(function(p) { if (byType[p.tipo] !== undefined) byType[p.tipo]++; });
    statsEl.innerHTML =
      '<div style="background:var(--surface);border:1px solid rgba(255,255,255,0.05);border-radius:8px;padding:6px 12px;font-size:12px;color:var(--white)">' +
      '<span style="font-weight:700;color:var(--beige)">' + grouped.length + '</span> productos' +
      '</div>' +
      Object.keys(byType).map(function(t) {
        return '<div style="background:var(--surface);border:1px solid rgba(255,255,255,0.05);border-radius:8px;padding:6px 12px;font-size:11px;color:var(--muted)">' +
          t + ': <span style="color:var(--white);font-weight:600">' + byType[t] + '</span></div>';
      }).join('');
  }

  // Render cards
  var grid = document.getElementById('lc-card-grid');
  if (!grid) return;

  if (!filtered.length) {
    grid.innerHTML = '<div style="padding:24px;text-align:center;color:var(--muted);font-size:12px">Sin productos LC</div>';
    return;
  }

  grid.innerHTML = filtered.map(function(p) {
    return lcRenderCard(p, imgMap, params);
  }).join('');
}

function _lcApplyFilters(grouped) {
  var q = (document.getElementById('lc-cat-search')?.value || '').toLowerCase().trim();
  var tipo = document.getElementById('lc-tipo-filter')?.value || '';
  var marca = document.getElementById('lc-marca-filter')?.value || '';
  var freq = document.getElementById('lc-freq-filter')?.value || '';

  return grouped.filter(function(p) {
    if (q && !(p.nombre + ' ' + p.marca).toLowerCase().includes(q)) return false;
    if (tipo && p.tipo !== tipo) return false;
    if (marca && p.marca !== marca) return false;
    if (freq && p.frecuencia !== freq) return false;
    return true;
  });
}

function lcFilterCatalogo() {
  lcRenderCatalogo();
}

function lcRenderCard(prod, imgMap, params) {
  var imgUrl = imgMap[prod.key] || '';
  var paramKey = _lcFindParamKey(prod.nombre, params);
  var p = paramKey ? params[paramKey] : null;

  var imgHtml = imgUrl
    ? '<img src="' + imgUrl + '" alt="' + prod.nombre + '" style="max-height:110px;max-width:85%;object-fit:contain" onerror="this.style.display=\'none\'">'
    : '<div style="font-size:40px;opacity:.3">👁</div>';

  var specHtml = '';
  if (p) {
    var specs = [];
    if (p.dkt) specs.push('Dk/t ' + p.dkt);
    if (p.h2o) specs.push('H₂O ' + p.h2o + '%');
    if (p.uv) specs.push('UV ✓');
    if (p.mat) specs.push(p.mat);
    specHtml = specs.length ? '<div class="lc-card-specs">' + specs.map(function(s) { return '<span>' + s + '</span>'; }).join('') + '</div>' : '';
  }

  var tipoBadge = '<span class="lc-badge lc-badge-tipo">' + (prod.tipo || 'Esf') + '</span>';
  var freqBadge = prod.frecuencia ? '<span class="lc-badge lc-badge-freq">' + prod.frecuencia + '</span>' : '';
  var stockBadge = prod.hasStock ? '<span class="lc-badge lc-badge-stock">En stock</span>' : '<span class="lc-badge lc-badge-nostock">Sobre pedido</span>';
  var inactivoBadge = prod.inactivo ? '<span style="font-size:9px;color:#e74c3c;background:rgba(231,76,60,0.15);padding:1px 5px;border-radius:4px">No disponible</span>' : '';

  // PWR range
  var pwrHtml = '';
  if (p && p.pwr) {
    pwrHtml = '<div style="font-size:9px;color:var(--muted);margin-top:3px">Esfera: ' + (p.pwr.min || '') + ' a ' + (p.pwr.max || '') + '</div>';
  }

  return '<div class="lc-card" style="' + (prod.inactivo ? 'opacity:.5;' : '') + '" onclick="lcShowDetail(\'' + prod.key.replace(/'/g, "\\'") + '\')">' +
    '<div class="lc-card-img">' + imgHtml + '</div>' +
    '<div class="lc-card-body">' +
      '<div class="lc-card-brand">' + (prod.marca || '') + '</div>' +
      '<div class="lc-card-name" title="' + prod.nombre + '">' + prod.nombre + '</div>' +
      '<div class="lc-card-meta">' + tipoBadge + freqBadge + stockBadge + inactivoBadge + '</div>' +
      specHtml +
      pwrHtml +
      '<div class="lc-card-price">$' + (prod.precio || 0).toLocaleString('es-MX') + '</div>' +
    '</div>' +
  '</div>';
}

function _lcFindParamKey(nombre, params) {
  if (!params || !nombre) return null;
  var n = nombre.toLowerCase().replace(/\s+/g, '_');
  // Direct match
  if (params[n]) return n;
  // Fuzzy: find key that shares most words
  var words = nombre.toUpperCase().split(/[\s_]+/);
  var bestKey = null, bestScore = 0;
  Object.keys(params).forEach(function(k) {
    var kWords = k.toUpperCase().replace(/_/g, ' ').split(/\s+/);
    var score = 0;
    words.forEach(function(w) { if (kWords.indexOf(w) >= 0) score++; });
    if (score > bestScore && score >= 2) { bestScore = score; bestKey = k; }
  });
  return bestKey;
}

// ═══════════════════════════════════════════════════════════
// DETALLE PRODUCTO LC (modal)
// ═══════════════════════════════════════════════════════════

function lcShowDetail(key) {
  var grouped = lcGroupProducts(_lcModProds);
  var prod = grouped.find(function(p) { return p.key === key; });
  if (!prod) return;

  var params = _lcParamsCache || {};
  var imgMap = _lcImgCache || {};
  var paramKey = _lcFindParamKey(prod.nombre, params);
  var p = paramKey ? params[paramKey] : null;
  var imgUrl = imgMap[prod.key] || '';

  var imgHtml = imgUrl
    ? '<img src="' + imgUrl + '" style="max-height:200px;max-width:100%;object-fit:contain;border-radius:8px">'
    : '<div style="height:120px;display:flex;align-items:center;justify-content:center;font-size:60px;opacity:.2">👁</div>';

  // Build specs table
  var specsHtml = '';
  if (p) {
    var rows = [];
    if (p.pwr) rows.push('<tr><td>Esfera (PWR)</td><td>' + (p.pwr.min||'') + ' a ' + (p.pwr.max||'') + ' (pasos ' + (p.pwr.step||'0.25') + ')</td></tr>');
    if (p.cyl && p.cyl.length) rows.push('<tr><td>Cilindro (CYL)</td><td>' + p.cyl.join(', ') + '</td></tr>');
    if (p.axis) rows.push('<tr><td>Eje (AXIS)</td><td>' + (p.axis.min||0) + '° a ' + (p.axis.max||180) + '° (pasos ' + (p.axis.step||10) + ')</td></tr>');
    if (p.add && p.add.length) rows.push('<tr><td>ADD</td><td>' + p.add.join(', ') + '</td></tr>');
    if (p.bc) rows.push('<tr><td>BC</td><td>' + (Array.isArray(p.bc) ? p.bc.join(', ') : p.bc) + '</td></tr>');
    if (p.dia) rows.push('<tr><td>DIA</td><td>' + p.dia + '</td></tr>');
    if (p.mat) rows.push('<tr><td>Material</td><td>' + p.mat + '</td></tr>');
    if (p.dkt) rows.push('<tr><td>Dk/t</td><td>' + p.dkt + '</td></tr>');
    if (p.h2o) rows.push('<tr><td>H₂O</td><td>' + p.h2o + '%</td></tr>');
    rows.push('<tr><td>UV</td><td>' + (p.uv ? '✓ Sí' : '✗ No') + '</td></tr>');
    if (p.colors && p.colors.length) rows.push('<tr><td>Colores</td><td>' + p.colors.join(', ') + '</td></tr>');
    if (p.box) rows.push('<tr><td>Presentaciones</td><td>' + (Array.isArray(p.box) ? p.box.join(', ') : p.box) + '</td></tr>');
    if (p.nota) rows.push('<tr><td>Nota</td><td style="color:#d4b84a">' + p.nota + '</td></tr>');

    specsHtml = '<table style="width:100%;border-collapse:collapse;font-size:12px;margin-top:12px">' +
      '<thead><tr><th colspan="2" style="text-align:left;padding:6px 8px;color:var(--beige);font-size:13px;border-bottom:1px solid rgba(255,255,255,0.08)">Parámetros técnicos</th></tr></thead>' +
      '<tbody>' + rows.map(function(r) { return r.replace(/<tr>/, '<tr style="border-bottom:1px solid rgba(255,255,255,0.04)">').replace(/<td>/, '<td style="padding:5px 8px;color:var(--muted);width:120px;font-size:11px">').replace(/<td>/, '<td style="padding:5px 8px;color:var(--white);font-size:12px">'); }).join('') +
      '</tbody></table>';
  } else {
    specsHtml = '<div style="padding:12px;text-align:center;color:var(--muted);font-size:11px;margin-top:12px;background:var(--surface2);border-radius:8px">Sin parámetros técnicos registrados</div>';
  }

  var isAdm = currentUser?.rol === 'admin' || currentUser?.rol === 'gerencia';
  var editBtn = currentUser?.rol === 'admin'
    ? '<button class="btn btn-g btn-sm" onclick="lcEditParams(\'' + (paramKey || prod.key).replace(/'/g, "\\'") + '\',\'' + prod.nombre.replace(/'/g, "\\'") + '\')" style="font-size:11px">✏️ Editar parámetros</button>'
    : '';
  var prodId = prod.prods && prod.prods[0] ? prod.prods[0].id : '';
  var allInactivo = prod.inactivo;
  var precioBtn = isAdm && prodId
    ? '<button class="btn btn-g btn-sm" onclick="lcEditPrecio(\'' + prodId + '\')" style="font-size:11px">💲 Precio</button>'
    : '';
  var activoBtn = isAdm && prodId
    ? '<button class="btn btn-g btn-sm" onclick="lcToggleActivo(\'' + prodId + '\',' + (!allInactivo) + ')" style="font-size:11px">' + (allInactivo ? '✅ Activar' : '🚫 Desactivar') + '</button>'
    : '';

  var el = document.createElement('div');
  el.className = 'm-overlay open';
  el.id = 'lc-detail-modal';
  el.innerHTML = '<div class="modal" style="max-width:520px;max-height:85vh;overflow-y:auto">' +
    '<div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:10px">' +
      '<div>' +
        '<div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.04em">' + (prod.marca || '') + '</div>' +
        '<h3 style="font-family:\'Cormorant Garamond\',serif;font-size:20px;color:var(--beige);margin:2px 0">' + prod.nombre + '</h3>' +
        '<div style="display:flex;gap:4px;flex-wrap:wrap">' +
          '<span class="lc-badge lc-badge-tipo">' + prod.tipo + '</span>' +
          (prod.frecuencia ? '<span class="lc-badge lc-badge-freq">' + prod.frecuencia + '</span>' : '') +
        '</div>' +
      '</div>' +
      '<button onclick="document.getElementById(\'lc-detail-modal\').remove()" style="background:none;border:none;color:var(--muted);font-size:20px;cursor:pointer;padding:0 4px">✕</button>' +
    '</div>' +
    '<div style="text-align:center;background:rgba(255,255,255,0.02);border-radius:10px;padding:16px;margin-bottom:12px">' + imgHtml + '</div>' +
    '<div style="font-size:22px;font-weight:700;color:var(--beige)">$' + (prod.precio || 0).toLocaleString('es-MX') + '</div>' +
    specsHtml +
    (allInactivo ? '<div style="background:rgba(231,76,60,0.12);border:1px solid rgba(231,76,60,0.3);border-radius:8px;padding:8px 12px;margin-top:10px;font-size:11px;color:#e74c3c;text-align:center">🚫 Producto no disponible — no aparece en POS ni tienda</div>' : '') +
    '<div class="m-actions" style="margin-top:14px;flex-wrap:wrap">' +
      precioBtn + activoBtn + editBtn +
      '<button class="btn btn-g" onclick="document.getElementById(\'lc-detail-modal\').remove()">Cerrar</button>' +
    '</div>' +
  '</div>';

  document.body.appendChild(el);
}

// ═══════════════════════════════════════════════════════════
// EDITAR PARÁMETROS LC (modal)
// ═══════════════════════════════════════════════════════════

function lcEditParams(paramKey, prodNombre) {
  var params = _lcParamsCache || {};
  var p = params[paramKey] || {};

  var el = document.createElement('div');
  el.className = 'm-overlay open';
  el.id = 'lc-params-modal';
  el.style.zIndex = '10002';

  var html = '<div class="modal" style="max-width:560px;max-height:85vh;overflow-y:auto">' +
    '<h3 style="font-family:\'Cormorant Garamond\',serif;font-size:18px;color:var(--beige);margin-bottom:12px">✏️ Parámetros: ' + prodNombre + '</h3>' +
    '<div class="lc-param-grid">' +
      '<div><label>PWR Mín</label><input type="text" id="lcp-pwr-min" value="' + (p.pwr?.min || '') + '"></div>' +
      '<div><label>PWR Máx</label><input type="text" id="lcp-pwr-max" value="' + (p.pwr?.max || '') + '"></div>' +
      '<div><label>PWR Pasos</label><input type="text" id="lcp-pwr-step" value="' + (p.pwr?.step || '0.25') + '"></div>' +
      '<div><label>Material</label><input type="text" id="lcp-mat" value="' + (p.mat || '') + '"></div>' +
      '<div style="grid-column:span 2"><label>CYL (separar con coma)</label><input type="text" id="lcp-cyl" value="' + (p.cyl ? p.cyl.join(', ') : '') + '"></div>' +
      '<div><label>AXIS Mín</label><input type="text" id="lcp-axis-min" value="' + (p.axis?.min || '') + '"></div>' +
      '<div><label>AXIS Máx</label><input type="text" id="lcp-axis-max" value="' + (p.axis?.max || '') + '"></div>' +
      '<div><label>AXIS Pasos</label><input type="text" id="lcp-axis-step" value="' + (p.axis?.step || '') + '"></div>' +
      '<div><label>Dk/t</label><input type="text" id="lcp-dkt" value="' + (p.dkt || '') + '"></div>' +
      '<div style="grid-column:span 2"><label>ADD (separar con coma)</label><input type="text" id="lcp-add" value="' + (p.add ? p.add.join(', ') : '') + '"></div>' +
      '<div><label>BC</label><input type="text" id="lcp-bc" value="' + (p.bc ? (Array.isArray(p.bc) ? p.bc.join(', ') : p.bc) : '') + '"></div>' +
      '<div><label>DIA</label><input type="text" id="lcp-dia" value="' + (p.dia || '') + '"></div>' +
      '<div><label>H₂O (%)</label><input type="text" id="lcp-h2o" value="' + (p.h2o || '') + '"></div>' +
      '<div><label style="display:flex;align-items:center;gap:6px"><input type="checkbox" id="lcp-uv"' + (p.uv ? ' checked' : '') + '> Filtro UV</label></div>' +
      '<div style="grid-column:span 2"><label>Colores (separar con coma)</label><input type="text" id="lcp-colors" value="' + (p.colors ? p.colors.join(', ') : '') + '"></div>' +
      '<div style="grid-column:span 2"><label>Presentaciones / caja (separar con coma)</label><input type="text" id="lcp-box" value="' + (p.box ? (Array.isArray(p.box) ? p.box.join(', ') : p.box) : '') + '"></div>' +
      '<div style="grid-column:span 2"><label>Nota</label><textarea id="lcp-nota" style="min-height:40px;background:var(--surface2);border:1px solid rgba(255,255,255,0.09);border-radius:6px;padding:6px 10px;color:var(--white);font-size:12px;width:100%;box-sizing:border-box;font-family:\'DM Sans\',sans-serif">' + (p.nota || '') + '</textarea></div>' +
    '</div>' +
    '<div class="m-actions" style="margin-top:14px">' +
      '<button class="btn btn-g" onclick="document.getElementById(\'lc-params-modal\').remove()">Cancelar</button>' +
      '<button class="btn btn-p" onclick="lcSaveParams(\'' + paramKey.replace(/'/g, "\\'") + '\')">Guardar</button>' +
    '</div>' +
  '</div>';

  el.innerHTML = html;
  document.body.appendChild(el);
}

async function lcSaveParams(paramKey) {
  var _v = function(id) { return document.getElementById(id)?.value?.trim() || ''; };
  var _csv = function(id) {
    var v = _v(id);
    if (!v) return [];
    return v.split(',').map(function(s) { return s.trim(); }).filter(Boolean);
  };
  var _num = function(id) { var v = _v(id); return v ? parseFloat(v) : null; };

  var updated = {
    pwr: { min: _num('lcp-pwr-min'), max: _num('lcp-pwr-max'), step: _num('lcp-pwr-step') || 0.25 },
    mat: _v('lcp-mat') || null,
    dkt: _num('lcp-dkt'),
    h2o: _num('lcp-h2o'),
    uv: document.getElementById('lcp-uv')?.checked || false,
    bc: _csv('lcp-bc').map(Number).filter(function(n) { return !isNaN(n); }),
    dia: _v('lcp-dia') || null,
    box: _csv('lcp-box'),
    nota: _v('lcp-nota') || null
  };

  // CYL
  var cylVals = _csv('lcp-cyl').map(Number).filter(function(n) { return !isNaN(n); });
  if (cylVals.length) updated.cyl = cylVals;

  // AXIS
  var axMin = _num('lcp-axis-min'), axMax = _num('lcp-axis-max'), axStep = _num('lcp-axis-step');
  if (axMin !== null || axMax !== null) updated.axis = { min: axMin || 0, max: axMax || 180, step: axStep || 10 };

  // ADD
  var addVals = _csv('lcp-add');
  if (addVals.length) updated.add = addVals;

  // Colors
  var colors = _csv('lcp-colors');
  if (colors.length) updated.colors = colors;

  // Clean nulls
  Object.keys(updated).forEach(function(k) { if (updated[k] === null) delete updated[k]; });
  if (updated.bc && !updated.bc.length) delete updated.bc;

  // Merge into full params
  var allParams = Object.assign({}, _lcParamsCache || {});
  allParams[paramKey] = updated;

  try {
    var res = await fetch('/.netlify/functions/dbwrite', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'upsert', table: 'app_config',
        auth: { id: currentUser?.id, pass: currentUser?.pass },
        data: { id: 'lc_parametros', value: JSON.stringify(allParams) }
      })
    });
    var data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Error guardando');

    _lcParamsCache = allParams;
    toast('✓ Parámetros guardados');
    document.getElementById('lc-params-modal')?.remove();
    document.getElementById('lc-detail-modal')?.remove();
    lcRenderCatalogo();
  } catch(e) {
    toast('Error: ' + e.message, true);
  }
}

// ═══════════════════════════════════════════════════════════
// CRM RECOMPRA (migrado de index.html)
// ═══════════════════════════════════════════════════════════

async function cargarLcCrm() {
  var list = document.getElementById('lc-list');
  if (list) list.innerHTML = '<div style="padding:24px;text-align:center;color:var(--muted);font-size:12px"><span class="spinner-sm"></span> Cargando...</div>';
  try {
    var r = await db.from('lc_seguimiento').select('*, pacientes(nombre, apellidos, telefono)').order('fecha_recompra', { ascending: true });
    if (r.error) throw r.error;
    _lcData = r.data || [];
  } catch(e) { toast('Error cargando LC: ' + e.message, true); _lcData = []; }
  renderLcStats();
  filtrarLcCrm();
  // Update badges
  var hoy = hoyLocal();
  var vencidos = _lcData.filter(function(r) { return r.estado === 'activo' && r.fecha_recompra <= hoy; }).length;
  var badge = document.getElementById('badge-lc-crm');
  if (badge) { badge.style.display = vencidos > 0 ? '' : 'none'; badge.textContent = vencidos; }
  var badgeTab = document.getElementById('badge-lc-crm-tab');
  if (badgeTab) { badgeTab.style.display = vencidos > 0 ? '' : 'none'; badgeTab.textContent = vencidos; }
}

function renderLcStats() {
  var hoy = hoyLocal();
  var hoyD = new Date(hoy);
  var d7 = new Date(hoyD); d7.setDate(d7.getDate() + 7);
  var d15 = new Date(hoyD); d15.setDate(d15.getDate() + 15);
  var d30 = new Date(hoyD); d30.setDate(d30.getDate() + 30);
  var activos = _lcData.filter(function(r) { return r.estado === 'activo'; });
  var vencidos = activos.filter(function(r) { return r.fecha_recompra <= hoy; }).length;
  var prox7 = activos.filter(function(r) { return r.fecha_recompra > hoy && r.fecha_recompra <= d7.toISOString().slice(0,10); }).length;
  var prox15 = activos.filter(function(r) { return r.fecha_recompra > hoy && r.fecha_recompra <= d15.toISOString().slice(0,10); }).length;
  var prox30 = activos.filter(function(r) { return r.fecha_recompra > hoy && r.fecha_recompra <= d30.toISOString().slice(0,10); }).length;
  var recomprados = _lcData.filter(function(r) { return r.estado === 'recomprado'; }).length;
  var stats = document.getElementById('lc-stats');
  if (!stats) return;
  stats.innerHTML = [
    { lbl:'Vencidos', val:vencidos, color:'#e08080', icon:'🔴' },
    { lbl:'Próx 7d', val:prox7, color:'#d4b84a', icon:'⚠️' },
    { lbl:'Próx 15d', val:prox15, color:'#8ab0e8', icon:'📅' },
    { lbl:'Próx 30d', val:prox30, color:'#72b8c4', icon:'📆' },
    { lbl:'Total activos', val:activos.length, color:'var(--beige)', icon:'👁' },
    { lbl:'Recomprados', val:recomprados, color:'#72c47e', icon:'✅' }
  ].map(function(s) { return '<div style="background:var(--surface);border:1px solid rgba(255,255,255,0.05);border-radius:8px;padding:8px 12px;text-align:center"><div style="font-size:18px;font-weight:700;color:'+s.color+'">'+s.val+'</div><div style="font-size:9px;color:var(--muted);text-transform:uppercase">'+s.icon+' '+s.lbl+'</div></div>'; }).join('');
}

function filtrarLcCrm() {
  var q = (document.getElementById('lc-search')?.value || '').toLowerCase().trim();
  var filtro = document.getElementById('lc-filtro-estado')?.value || 'pendientes';
  var sucFiltro = document.getElementById('lc-filtro-suc')?.value || '';
  var hoy = hoyLocal();
  var hoyD = new Date(hoy);
  var f = _lcData;
  if (filtro === 'vencidos') f = f.filter(function(r) { return r.estado === 'activo' && r.fecha_recompra <= hoy; });
  else if (filtro === 'proximos7') { var d=new Date(hoyD); d.setDate(d.getDate()+7); f = f.filter(function(r) { return r.estado === 'activo' && r.fecha_recompra > hoy && r.fecha_recompra <= d.toISOString().slice(0,10); }); }
  else if (filtro === 'proximos15') { var d=new Date(hoyD); d.setDate(d.getDate()+15); f = f.filter(function(r) { return r.estado === 'activo' && r.fecha_recompra > hoy && r.fecha_recompra <= d.toISOString().slice(0,10); }); }
  else if (filtro === 'proximos30') { var d=new Date(hoyD); d.setDate(d.getDate()+30); f = f.filter(function(r) { return r.estado === 'activo' && r.fecha_recompra > hoy && r.fecha_recompra <= d.toISOString().slice(0,10); }); }
  else if (filtro === 'pendientes') f = f.filter(function(r) { return r.estado === 'activo'; });
  else if (filtro === 'recomprado') f = f.filter(function(r) { return r.estado === 'recomprado'; });
  if (sucFiltro) f = f.filter(function(r) { return r.sucursal === sucFiltro; });
  if (q) f = f.filter(function(r) { var pac = r.pacientes ? (r.pacientes.nombre||'')+' '+(r.pacientes.apellidos||'') : ''; return (pac+' '+r.producto).toLowerCase().includes(q); });
  _lcFiltered = f;
  renderLcList();
}

function renderLcList() {
  var list = document.getElementById('lc-list');
  if (!list) return;
  if (!_lcFiltered.length) { list.innerHTML = '<div style="padding:24px;text-align:center;color:var(--muted);font-size:12px">Sin registros</div>'; return; }
  var hoy = hoyLocal();
  list.innerHTML = _lcFiltered.map(function(r) {
    var pac = r.pacientes ? (r.pacientes.nombre||'')+' '+(r.pacientes.apellidos||'') : 'Sin paciente';
    var tel = r.pacientes?.telefono || '';
    var diasRest = Math.round((new Date(r.fecha_recompra) - new Date(hoy)) / 86400000);
    var vencido = diasRest <= 0;
    var urgente = diasRest > 0 && diasRest <= 7;
    var borderColor = vencido ? 'rgba(224,128,128,0.2)' : urgente ? 'rgba(212,184,74,0.2)' : 'rgba(255,255,255,0.04)';
    var diasLbl = vencido ? '<span style="color:#e08080;font-weight:700">Vencido hace '+ Math.abs(diasRest) +' días</span>' : '<span style="color:'+(urgente?'#d4b84a':'#72c47e')+'">Faltan '+diasRest+' días</span>';
    var estadoBadge = r.estado === 'recomprado' ? '<span style="font-size:8px;padding:1px 5px;background:rgba(114,196,126,0.15);color:#72c47e;border-radius:4px;font-weight:700">✅ RECOMPRADO</span>' : '';
    var notifBadge = r.notificado ? '<span style="font-size:8px;padding:1px 5px;background:rgba(56,189,248,0.12);color:#38bdf8;border-radius:4px">📱 Notificado</span>' : '';
    var canalBadge = r.canal_venta ? '<span style="font-size:8px;padding:1px 4px;background:rgba(56,189,248,0.08);color:#38bdf8;border-radius:3px">'+r.canal_venta+'</span>' : '';
    return '<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--surface);border:1px solid '+borderColor+';border-radius:10px">' +
      '<div style="flex:1;min-width:0">' +
        '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap"><span style="font-size:13px;font-weight:700;color:var(--white)">'+pac+'</span>'+estadoBadge+notifBadge+canalBadge+'</div>' +
        '<div style="font-size:11px;color:var(--beige);margin-top:2px">👁 '+r.producto+'</div>' +
        '<div style="font-size:10px;color:var(--muted);margin-top:1px">Compra: '+r.fecha_compra+' · '+(r.cantidad_cajas>1?r.cantidad_cajas+' cajas · ':'')+r.duracion_dias+'d → Recompra: <b style="color:'+(vencido?'#e08080':'var(--white)')+'">'+r.fecha_recompra+'</b> · '+r.sucursal+'</div>' +
        '<div style="font-size:10px;margin-top:2px">'+diasLbl+'</div>' +
      '</div>' +
      '<div style="display:flex;flex-direction:column;gap:4px;flex-shrink:0">' +
        (r.estado === 'activo' && tel ? '<button onclick="lcEnviarWA(\''+r.id+'\',\''+tel.replace(/'/g,"\\'")+'\')" class="btn btn-g" style="font-size:10px;padding:4px 8px;white-space:nowrap">📱 WA</button>' : '') +
        (r.estado === 'activo' ? '<button onclick="lcMarcarRecomprado(\''+r.id+'\')" class="btn btn-g" style="font-size:10px;padding:4px 8px;white-space:nowrap;color:#72c47e">✅ Recompró</button>' : '') +
      '</div>' +
    '</div>';
  }).join('');
}

async function lcEnviarWA(lcId, tel) {
  var reg = _lcData.find(function(r) { return r.id === lcId; });
  if (!reg) return;
  var pac = reg.pacientes ? (reg.pacientes.nombre||'').split(' ')[0] : 'Cliente';
  var msg = 'Hola ' + pac + ', le recordamos que es tiempo de renovar sus lentes de contacto (' + reg.producto + '). ¡Le esperamos en Ópticas Car & Era!\n\nHorario:\nLun.-Sab. 10:00am-7:00pm | Dom. 11:00am-5:00pm';
  var cleanTel = tel.replace(/\D/g, '');
  if (cleanTel.length === 10) cleanTel = '52' + cleanTel;
  if (!cleanTel.startsWith('521')) cleanTel = cleanTel.replace(/^52/, '521');
  try {
    var res = await fetch('/.netlify/functions/whatsapp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to: cleanTel, message: msg }) });
    if (res.ok) {
      toast('📱 Recordatorio enviado a ' + pac);
      await db.from('lc_seguimiento').update({ notificado: true, fecha_notificacion: new Date().toISOString() }).eq('id', lcId);
      var r = _lcData.find(function(x) { return x.id === lcId; });
      if (r) { r.notificado = true; r.fecha_notificacion = new Date().toISOString(); }
      filtrarLcCrm();
      return;
    }
  } catch(e) {}
  window.open('https://wa.me/' + cleanTel + '?text=' + encodeURIComponent(msg), '_blank');
  await db.from('lc_seguimiento').update({ notificado: true, fecha_notificacion: new Date().toISOString() }).eq('id', lcId);
  var r2 = _lcData.find(function(x) { return x.id === lcId; });
  if (r2) { r2.notificado = true; }
  filtrarLcCrm();
}

async function lcMarcarRecomprado(lcId) {
  if (!confirm('¿Marcar como recomprado?')) return;
  await db.from('lc_seguimiento').update({ estado: 'recomprado', updated_at: new Date().toISOString() }).eq('id', lcId);
  toast('✅ Marcado como recomprado');
  cargarLcCrm();
}

// ═══════════════════════════════════════════════════════════
// ESTADÍSTICAS TAB
// ═══════════════════════════════════════════════════════════

async function lcRenderEstadisticas() {
  var container = document.getElementById('lc-estadisticas-container');
  if (!container) return;
  container.innerHTML = '<div style="padding:24px;text-align:center;color:var(--muted);font-size:12px"><span class="spinner-sm"></span> Cargando estadísticas...</div>';

  try {
    // Last 6 months of LC sales
    var sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    var desde = sixMonthsAgo.toISOString().slice(0, 10);

    var { data: ventas } = await db.from('ventas').select('id, fecha, sucursal, total').gte('fecha', desde).eq('estado', 'Liquidada');
    var ventaIds = (ventas || []).map(function(v) { return v.id; });

    var items = [];
    if (ventaIds.length) {
      // Batch fetch in chunks of 200
      for (var i = 0; i < ventaIds.length; i += 200) {
        var chunk = ventaIds.slice(i, i + 200);
        var { data: batch } = await db.from('venta_items').select('venta_id, producto_id, descripcion, cantidad, precio_unitario').in('venta_id', chunk);
        if (batch) items = items.concat(batch);
      }
    }

    // Match LC items
    var lcProdIds = _lcModProds.map(function(p) { return p.id; });
    var lcItems = items.filter(function(it) {
      if (it.producto_id && lcProdIds.indexOf(it.producto_id) >= 0) return true;
      var desc = (it.descripcion || '').toLowerCase();
      return desc.includes('lente de contacto') || desc.includes('lentes de contacto');
    });

    // Sales by brand
    var byBrand = {};
    lcItems.forEach(function(it) {
      var desc = (it.descripcion || '').toUpperCase();
      var brand = 'Otro';
      Object.keys(LC_BRAND_MAP).forEach(function(k) {
        if (desc.indexOf(k.toUpperCase()) >= 0 && LC_BRAND_MAP[k] !== 'Especial') brand = LC_BRAND_MAP[k];
      });
      if (!byBrand[brand]) byBrand[brand] = { qty: 0, revenue: 0 };
      byBrand[brand].qty += (it.cantidad || 1);
      byBrand[brand].revenue += (it.cantidad || 1) * (it.precio_unitario || 0);
    });

    // Monthly trend
    var byMonth = {};
    lcItems.forEach(function(it) {
      var v = ventas.find(function(vt) { return vt.id === it.venta_id; });
      if (!v) return;
      var mes = v.fecha.slice(0, 7); // YYYY-MM
      if (!byMonth[mes]) byMonth[mes] = { qty: 0, revenue: 0 };
      byMonth[mes].qty += (it.cantidad || 1);
      byMonth[mes].revenue += (it.cantidad || 1) * (it.precio_unitario || 0);
    });

    // Top products
    var byProduct = {};
    lcItems.forEach(function(it) {
      var name = it.descripcion || 'Sin nombre';
      if (!byProduct[name]) byProduct[name] = { qty: 0, revenue: 0 };
      byProduct[name].qty += (it.cantidad || 1);
      byProduct[name].revenue += (it.cantidad || 1) * (it.precio_unitario || 0);
    });
    var topProducts = Object.keys(byProduct).map(function(k) { return { name: k, qty: byProduct[k].qty, revenue: byProduct[k].revenue }; })
      .sort(function(a, b) { return b.qty - a.qty; }).slice(0, 8);

    // Total revenue
    var totalRevenue = lcItems.reduce(function(sum, it) { return sum + (it.cantidad || 1) * (it.precio_unitario || 0); }, 0);
    var totalQty = lcItems.reduce(function(sum, it) { return sum + (it.cantidad || 1); }, 0);

    // Render
    var html = '';

    // Summary cards
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;margin-bottom:16px">' +
      '<div style="background:var(--surface);border:1px solid rgba(255,255,255,0.05);border-radius:8px;padding:12px;text-align:center"><div style="font-size:22px;font-weight:700;color:var(--beige)">$' + totalRevenue.toLocaleString('es-MX', {maximumFractionDigits:0}) + '</div><div style="font-size:10px;color:var(--muted)">Ingresos LC (6 meses)</div></div>' +
      '<div style="background:var(--surface);border:1px solid rgba(255,255,255,0.05);border-radius:8px;padding:12px;text-align:center"><div style="font-size:22px;font-weight:700;color:var(--white)">' + totalQty + '</div><div style="font-size:10px;color:var(--muted)">Cajas vendidas</div></div>' +
      '<div style="background:var(--surface);border:1px solid rgba(255,255,255,0.05);border-radius:8px;padding:12px;text-align:center"><div style="font-size:22px;font-weight:700;color:#72c47e">' + Object.keys(byBrand).length + '</div><div style="font-size:10px;color:var(--muted)">Marcas activas</div></div>' +
      '<div style="background:var(--surface);border:1px solid rgba(255,255,255,0.05);border-radius:8px;padding:12px;text-align:center"><div style="font-size:22px;font-weight:700;color:#8ab0e8">' + _lcModProds.length + '</div><div style="font-size:10px;color:var(--muted)">Productos en catálogo</div></div>' +
    '</div>';

    // Ventas por marca
    var brandEntries = Object.keys(byBrand).map(function(k) { return { brand: k, qty: byBrand[k].qty, revenue: byBrand[k].revenue }; }).sort(function(a,b) { return b.revenue - a.revenue; });
    var maxBrandRev = brandEntries.length ? brandEntries[0].revenue : 1;

    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">';

    // Left: by brand
    html += '<div style="background:var(--surface);border:1px solid rgba(255,255,255,0.05);border-radius:10px;padding:14px">' +
      '<div style="font-size:13px;font-weight:700;color:var(--beige);margin-bottom:10px">Ventas por marca</div>';
    brandEntries.forEach(function(b) {
      var pct = Math.round(b.revenue / maxBrandRev * 100);
      html += '<div style="margin-bottom:6px">' +
        '<div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:2px"><span style="color:var(--white)">' + b.brand + '</span><span style="color:var(--muted)">' + b.qty + ' uds · $' + b.revenue.toLocaleString('es-MX',{maximumFractionDigits:0}) + '</span></div>' +
        '<div style="height:6px;background:rgba(255,255,255,0.04);border-radius:3px;overflow:hidden"><div style="height:100%;width:' + pct + '%;background:var(--beige);border-radius:3px"></div></div>' +
      '</div>';
    });
    html += '</div>';

    // Right: top products
    html += '<div style="background:var(--surface);border:1px solid rgba(255,255,255,0.05);border-radius:10px;padding:14px">' +
      '<div style="font-size:13px;font-weight:700;color:var(--beige);margin-bottom:10px">Top productos</div>';
    var maxProdQty = topProducts.length ? topProducts[0].qty : 1;
    topProducts.forEach(function(p, i) {
      var pct = Math.round(p.qty / maxProdQty * 100);
      html += '<div style="margin-bottom:6px">' +
        '<div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:2px"><span style="color:var(--white);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:60%">' + (i+1) + '. ' + p.name + '</span><span style="color:var(--muted);white-space:nowrap">' + p.qty + ' uds</span></div>' +
        '<div style="height:6px;background:rgba(255,255,255,0.04);border-radius:3px;overflow:hidden"><div style="height:100%;width:' + pct + '%;background:#8ab0e8;border-radius:3px"></div></div>' +
      '</div>';
    });
    html += '</div></div>';

    // Monthly trend
    var months = Object.keys(byMonth).sort();
    var maxMonthRev = Math.max.apply(null, months.map(function(m) { return byMonth[m].revenue; }).concat([1]));
    html += '<div style="background:var(--surface);border:1px solid rgba(255,255,255,0.05);border-radius:10px;padding:14px;margin-top:12px">' +
      '<div style="font-size:13px;font-weight:700;color:var(--beige);margin-bottom:10px">Tendencia mensual</div>' +
      '<div style="display:flex;align-items:flex-end;gap:8px;height:120px">';
    months.forEach(function(m) {
      var d = byMonth[m];
      var pct = Math.round(d.revenue / maxMonthRev * 100);
      var monthName = new Date(m + '-15').toLocaleDateString('es-MX', { month: 'short' });
      html += '<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:2px">' +
        '<div style="font-size:9px;color:var(--muted)">$' + (d.revenue/1000).toFixed(0) + 'k</div>' +
        '<div style="width:100%;max-width:40px;height:' + Math.max(pct, 4) + '%;background:var(--beige);border-radius:4px 4px 0 0"></div>' +
        '<div style="font-size:9px;color:var(--muted)">' + monthName + '</div>' +
      '</div>';
    });
    html += '</div></div>';

    container.innerHTML = html;
  } catch(e) {
    container.innerHTML = '<div style="padding:24px;text-align:center;color:#e08080;font-size:12px">Error cargando estadísticas: ' + e.message + '</div>';
  }
}

// ═══════════════════════════════════════════════════════════
// GROUPING (migrado de index.html)
// ═══════════════════════════════════════════════════════════

async function _lcLoadSalesCount() {
  try {
    var sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    var desde = sixMonthsAgo.toISOString().slice(0, 10);
    // Get LC product IDs
    var lcIds = _lcModProds.map(function(p) { return p.id; });
    if (!lcIds.length) return;
    // Fetch venta_items for LC products in last 6 months
    var counts = {};
    for (var i = 0; i < lcIds.length; i += 200) {
      var chunk = lcIds.slice(i, i + 200);
      var { data } = await db.from('venta_items').select('producto_id, cantidad').in('producto_id', chunk);
      if (data) data.forEach(function(it) {
        counts[it.producto_id] = (counts[it.producto_id] || 0) + (it.cantidad || 1);
      });
    }
    _lcSalesCount = counts;
    // Re-render if catalog is visible
    if (_lcActiveTab === 'catalogo' && document.getElementById('lc-card-grid')) lcRenderCatalogo();
    if (_vtaLcOpen && document.getElementById('vta-lc-grid')) vtaLcRender();
  } catch(e) { _lcSalesCount = {}; }
}

function lcGroupProducts(rawProducts) {
  var groups = {};
  rawProducts.forEach(function(p) {
    var name = (p.nombre||'').toUpperCase().trim();
    var baseName = name
      .replace(/\s*[-+]\d+\.\d+(\s*[-+]\d+\.\d+)?\s*\*?\s*\d*\s*/g, ' ')
      .replace(/\s*(NEGATIVOS?|POSITIVOS?|ESFERICOS?|NEUTROS?|PLANOS?)\s*/gi, ' ')
      .replace(/\s*(GRAY|BLUE|GREEN|HONEY|BROWN|HAZEL|VERDE|BRILLANT|STERLING)\s*[-\w]*/gi, '')
      .replace(/\s*(DESDE|HASTA|DE|A)\s*[-+]?\d+[\d.]*/gi, '')
      .replace(/\s*\(.*?\)\s*/g, ' ')
      .replace(/\s*\d+\s*(LENTE|CAJA)S?\s*/gi, '')
      .replace(/\s*(CILINDROS?)\s*[-\w\s.]*/gi, '')
      .replace(/\s*(ALTOS?|BAJOS?)\s*/gi, '')
      .replace(/\s+/g, ' ').trim();
    if (!baseName || baseName.length < 3) baseName = name.split(/\s+/).slice(0,3).join(' ');
    var tipo = 'Esférico';
    if (/TORIC|ASTIGMAT/i.test(name)) tipo = 'Tórico';
    else if (/MULTIFOCAL/i.test(name)) tipo = 'Multifocal';
    else if (/COLOR|FRESH\s*LOOK/i.test(name) && !/ONE DAY|ONEDAY/i.test(name)) tipo = 'Color';
    var key = baseName + '|' + tipo;
    if (!groups[key]) { groups[key] = { precios: [], marca: (p.marca||'').trim(), stocks: [], freqs: [], prods: [], hasInactivo: false }; }
    if (p.activo === false) groups[key].hasInactivo = true;
    var pv = parseFloat(p.precio_venta)||0;
    if (pv > 0) groups[key].precios.push(pv);
    groups[key].stocks.push(p.stock || 0);
    groups[key].freqs.push(p.frecuencia_cambio_dias || 30);
    groups[key].prods.push(p);
  });

  return Object.keys(groups).map(function(key) {
    var parts = key.split('|');
    var g = groups[key];
    var precios = g.precios.sort(function(a,b){return a-b;});
    var cleanName = parts[0].replace(/\b\w/g, function(c){return c.toUpperCase();}).replace(/\b(De|Con|Para|En|Al|El|La|Los|Las|Y|O|A)\b/gi, function(m){return m.toLowerCase();});
    var rawName = (cleanName.split(' ')[0]||'').toLowerCase();
    var rawMarca = (g.marca||'').toLowerCase();
    var marca = LC_BRAND_MAP[rawName] || LC_BRAND_MAP[rawMarca] || g.marca || cleanName.split(' ')[0];
    var totalStock = g.stocks.reduce(function(a,b){return a+b;},0);
    var freq = g.freqs[0] || 30;
    return {
      key: cleanName.toLowerCase().replace(/\s+/g,'_'),
      nombre: cleanName,
      marca: marca,
      tipo: parts[1],
      precio: precios.length ? precios[Math.floor(precios.length/2)] : 0,
      hasStock: totalStock > 0,
      frecuencia: _lcGetFreq({ frecuencia_cambio_dias: freq, nombre: cleanName }),
      prods: g.prods,
      inactivo: g.hasInactivo && g.prods.every(function(x){return x.activo===false;})
    };
  }).filter(function(p){return p.precio>0;}).sort(function(a,b){
    // Sort by sales count (most sold first), fallback to alphabetical
    var salesA = 0, salesB = 0;
    if (_lcSalesCount) {
      (a.prods || []).forEach(function(p) { salesA += (_lcSalesCount[p.id] || 0); });
      (b.prods || []).forEach(function(p) { salesB += (_lcSalesCount[p.id] || 0); });
    }
    if (salesA !== salesB) return salesB - salesA;
    return (a.marca||'').localeCompare(b.marca||'') || a.nombre.localeCompare(b.nombre);
  });
}

// ═══════════════════════════════════════════════════════════
// CATÁLOGO TIENDA (modal admin — migrado de index.html)
// ═══════════════════════════════════════════════════════════

async function abrirCatalogoTienda() {
  toast('Cargando catálogo LC...');
  try {
    var all = [], offset = 0;
    while(true) {
      var res = await db.from('productos').select('id,nombre,marca,precio_venta,categoria').ilike('categoria','%contacto%').range(offset,offset+499).limit(500);
      if (!res.data || !res.data.length) break;
      all = all.concat(res.data);
      if (res.data.length < 500) break;
      offset += 500;
    }
    var imgRes = await db.from('app_config').select('value').eq('id','lc_imagenes').limit(1);
    var imgMap = {};
    try { imgMap = JSON.parse((imgRes.data && imgRes.data[0]) ? imgRes.data[0].value : '{}'); } catch(e) {}

    var grouped = lcGroupProducts(all);
    var conImg = grouped.filter(function(g){ return !!imgMap[g.key]; }).length;

    var el = document.createElement('div');
    el.className = 'm-overlay open';
    el.id = 'catalogo-tienda-modal';
    var box = document.createElement('div');
    box.className = 'm-box';
    box.style.cssText = 'max-width:820px;max-height:90vh;overflow-y:auto;padding:20px;background:var(--surface)';

    var html = '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">' +
      '<div><h3 style="font-family:Cormorant Garamond,serif;font-size:20px;color:var(--beige);margin:0">🛒 Catálogo Tienda Online</h3>' +
      '<div style="font-size:11px;color:var(--muted);margin-top:2px">' + grouped.length + ' productos agrupados · ' + conImg + ' con imagen · (' + all.length + ' SKUs en BD)</div></div>' +
      '<div style="display:flex;gap:6px;align-items:center">' +
        '<a href="/tienda" target="_blank" class="btn btn-g btn-sm" style="font-size:11px;text-decoration:none;color:var(--accent)">👁 Ver tienda</a>' +
        '<button onclick="document.getElementById(\'catalogo-tienda-modal\').remove()" style="background:none;border:none;color:var(--muted);font-size:20px;cursor:pointer">✕</button>' +
      '</div></div>';

    html += '<input type="file" id="lc-img-input" accept="image/*" style="display:none" onchange="lcUploadImg(this)">';

    html += '<div style="border-radius:10px;border:1px solid rgba(255,255,255,.08);overflow:hidden">' +
      '<table style="width:100%;border-collapse:collapse;font-size:12px">' +
      '<thead><tr style="background:rgba(255,255,255,.03)">' +
      '<th style="padding:8px;text-align:center;width:60px;color:var(--muted);font-size:10px">IMAGEN</th>' +
      '<th style="padding:8px;text-align:left;color:var(--muted);font-size:10px">PRODUCTO</th>' +
      '<th style="padding:8px;text-align:center;color:var(--muted);font-size:10px">TIPO</th>' +
      '<th style="padding:8px;text-align:center;color:var(--muted);font-size:10px">PRECIO</th>' +
      '<th style="padding:8px;text-align:center;width:70px;color:var(--muted);font-size:10px">ACCIÓN</th>' +
      '</tr></thead><tbody>';

    grouped.forEach(function(p) {
      var imgUrl = imgMap[p.key] || '';
      var imgHtml = imgUrl
        ? '<img src="'+imgUrl+'" style="width:44px;height:44px;object-fit:contain;border-radius:6px;background:rgba(255,255,255,.04)" onerror="this.src=\'\';">'
        : '<div style="width:44px;height:44px;border-radius:6px;background:rgba(255,255,255,.04);display:flex;align-items:center;justify-content:center;font-size:18px;color:var(--muted)">👁</div>';

      html += '<tr style="border-top:1px solid rgba(255,255,255,.04)" data-key="'+p.key+'">' +
        '<td style="padding:6px 8px;text-align:center">' + imgHtml + '</td>' +
        '<td style="padding:6px 8px"><div style="font-weight:600;color:var(--white)">' + p.nombre + '</div><div style="font-size:10px;color:var(--muted)">' + (p.marca||'') + '</div></td>' +
        '<td style="padding:6px 8px;text-align:center;font-size:11px">' + (p.tipo||'Esf') + '</td>' +
        '<td style="padding:6px 8px;text-align:center;font-family:Outfit;color:var(--accent)">$' + (p.precio||0).toLocaleString('es-MX') + '</td>' +
        '<td style="padding:6px 8px;text-align:center">' +
          '<button onclick="lcClickUpload(\''+p.key+'\')" style="background:rgba(107,163,212,.1);border:1px solid rgba(107,163,212,.2);border-radius:6px;padding:3px 8px;color:#6ba3d4;cursor:pointer;font-size:11px;font-family:DM Sans,sans-serif" title="Subir imagen">📸</button>' +
          (imgUrl ? ' <button onclick="lcRemoveImg(\''+p.key+'\')" style="background:none;border:none;color:#f04a6a;cursor:pointer;font-size:11px" title="Quitar imagen">✕</button>' : '') +
        '</td></tr>';
    });

    html += '</tbody></table></div>';
    box.innerHTML = html;
    el.appendChild(box);
    document.body.appendChild(el);
    window._lcImgMap = imgMap;
    window._lcGrouped = grouped;
  } catch(e) { toast('Error: ' + e.message, true); console.error(e); }
}

function lcClickUpload(key) {
  _lcUploadKey = key;
  document.getElementById('lc-img-input').click();
}

async function lcUploadImg(input) {
  var file = input.files[0];
  if (!file || !_lcUploadKey) return;
  input.value = '';
  toast('Subiendo imagen...');
  var reader = new FileReader();
  reader.onload = async function(e) {
    try {
      var res = await fetch('/.netlify/functions/img-upload', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ auth: { id: currentUser?.id, pass: currentUser?.pass }, image_base64: e.target.result, filename: 'lc-' + _lcUploadKey })
      });
      var data = await res.json();
      if (!data.ok) { toast('Error: ' + (data.error||''), true); return; }
      var imgMap = window._lcImgMap || {};
      imgMap[_lcUploadKey] = data.url;
      await fetch('/.netlify/functions/dbwrite', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ action: 'upsert', table: 'app_config', auth: { id: currentUser?.id, pass: currentUser?.pass }, data: { id: 'lc_imagenes', value: JSON.stringify(imgMap) } })
      });
      toast('✓ Imagen guardada');
      document.getElementById('catalogo-tienda-modal')?.remove();
      abrirCatalogoTienda();
    } catch(err) { toast('Error subiendo: ' + err.message, true); }
  };
  reader.readAsDataURL(file);
}

async function lcRemoveImg(key) {
  if (!confirm('¿Quitar la imagen de este producto?')) return;
  var imgMap = window._lcImgMap || {};
  delete imgMap[key];
  await fetch('/.netlify/functions/dbwrite', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ action: 'upsert', table: 'app_config', auth: { id: currentUser?.id, pass: currentUser?.pass }, data: { id: 'lc_imagenes', value: JSON.stringify(imgMap) } })
  });
  toast('✓ Imagen eliminada');
  document.getElementById('catalogo-tienda-modal')?.remove();
  abrirCatalogoTienda();
}

// ═══════════════════════════════════════════════════════════
// POS — Vista rápida LC + agregar al carrito con graduación
// ═══════════════════════════════════════════════════════════

var _vtaLcOpen = false;
var _vtaLcLoaded = false;

async function vtaLcToggle() {
  var panel = document.getElementById('vta-lc-panel');
  if (!panel) return;
  _vtaLcOpen = !_vtaLcOpen;
  var rxBanner = document.getElementById('vta-lc-rx-banner');
  // Closing — hide everything
  if (!_vtaLcOpen) {
    panel.style.display = 'none';
    if (rxBanner) rxBanner.style.display = 'none';
    return;
  }
  // Auto-trigger guía de entrenamiento la primera vez
  if (!localStorage.getItem('lc_guia_completada') && typeof iniciarGuiaEntrenamiento === 'function') {
    localStorage.setItem('lc_guia_completada', '1');
    setTimeout(function() { iniciarGuiaEntrenamiento('ventaLC'); }, 400);
  }
  // If has Rx data not yet converted — show only banner, hide catalog
  if (_vtaLcRxData && !_vtaLcRxData.hasLcRx) {
    vtaLcShowRxPrompt();
    panel.style.display = 'none'; // catalog hidden until Rx is converted
    return;
  }
  panel.style.display = _vtaLcOpen ? '' : 'none';
  // Show/hide Rx banner with LC panel
  if (_vtaLcOpen && _vtaLcRxData) {
    vtaLcShowRxPrompt();
  } else {
    if (rxBanner) rxBanner.style.display = 'none';
  }
  if (_vtaLcOpen && !_vtaLcLoaded) {
    panel.querySelector('#vta-lc-grid').innerHTML = '<div style="padding:12px;text-align:center;color:var(--muted);font-size:11px"><span class="spinner-sm"></span> Cargando...</div>';
    try {
      if (!_lcModProds.length) {
        var [prodRes, cfgRes] = await Promise.all([
          db.from('productos').select('id,nombre,marca,precio_venta,categoria,stock,pares_por_caja,frecuencia_cambio_dias,duracion_dias,activo,departamento').eq('activo', true).ilike('categoria', '%contacto%').order('nombre'),
          db.from('app_config').select('id,value').in('id', ['lc_parametros', 'lc_imagenes'])
        ]);
        _lcModProds = prodRes.data || [];
        if (cfgRes.data) {
          cfgRes.data.forEach(function(r) {
            try {
              if (r.id === 'lc_parametros') _lcParamsCache = JSON.parse(r.value);
              if (r.id === 'lc_imagenes') _lcImgCache = JSON.parse(r.value);
            } catch(e) {}
          });
        }
      }
      _vtaLcLoaded = true;
      if (!_lcSalesCount) _lcLoadSalesCount();
      // Populate marca filter
      var marcaSel = document.getElementById('vta-lc-marca');
      if (marcaSel && marcaSel.options.length <= 1) {
        var grouped = lcGroupProducts(_lcModProds);
        var marcas = {};
        grouped.forEach(function(p) { if (p.marca) marcas[p.marca] = true; });
        Object.keys(marcas).sort().forEach(function(m) {
          marcaSel.innerHTML += '<option value="' + m + '">' + m + '</option>';
        });
      }
      vtaLcRender();
    } catch(e) {
      panel.querySelector('#vta-lc-grid').innerHTML = '<div style="padding:12px;text-align:center;color:#e08080;font-size:11px">Error: ' + e.message + '</div>';
    }
  }
}

function vtaLcRender() {
  var grid = document.getElementById('vta-lc-grid');
  if (!grid) return;
  var grouped = lcGroupProducts(_lcModProds);
  var imgMap = _lcImgCache || {};

  // Filters
  var tipo = document.getElementById('vta-lc-tipo')?.value || '';
  var marca = document.getElementById('vta-lc-marca')?.value || '';
  var q = (document.getElementById('vta-lc-q')?.value || '').toLowerCase().trim();

  var filtered = grouped.filter(function(p) {
    if (tipo && p.tipo !== tipo) return false;
    if (marca && p.marca !== marca) return false;
    if (q && !(p.nombre + ' ' + p.marca).toLowerCase().includes(q)) return false;
    return true;
  });

  if (!filtered.length) {
    grid.innerHTML = '<div style="padding:12px;text-align:center;color:var(--muted);font-size:11px">Sin resultados</div>';
    return;
  }

  grid.innerHTML = filtered.map(function(p) {
    var imgUrl = imgMap[p.key] || '';
    var imgHtml = imgUrl
      ? '<img src="' + imgUrl + '" onerror="this.style.display=\'none\'">'
      : '<div style="font-size:24px;opacity:.2">👁</div>';
    return '<div class="vta-lc-mc" onclick="vtaLcGradPicker(\'' + p.key.replace(/'/g, "\\'") + '\')">' +
      '<div class="vta-lc-mc-img">' + imgHtml + '</div>' +
      '<div class="vta-lc-mc-body">' +
        '<div class="vta-lc-mc-name" title="' + p.nombre + '">' + p.nombre + '</div>' +
        '<div class="vta-lc-mc-meta"><span class="lc-badge lc-badge-tipo" style="font-size:7px;padding:1px 4px">' + p.tipo + '</span> ' + (p.marca || '') + '</div>' +
        '<div class="vta-lc-mc-price">$' + (p.precio || 0).toLocaleString('es-MX') + '</div>' +
      '</div>' +
    '</div>';
  }).join('');
}

function vtaLcGradPicker(key) {
  var grouped = lcGroupProducts(_lcModProds);
  var prod = grouped.find(function(p) { return p.key === key; });
  if (!prod) return;

  var params = _lcParamsCache || {};
  var paramKey = _lcFindParamKey(prod.nombre, params);
  var p = paramKey ? params[paramKey] : null;

  // Determine fields by type
  var tipo = prod.tipo || 'Esférico';
  var showCyl = tipo === 'Tórico';
  var showAxis = tipo === 'Tórico';
  var showAdd = tipo === 'Multifocal';
  var showColor = tipo === 'Color';

  // Generate PWR options
  var pwrOpts = '<option value="">—</option>';
  if (p && p.pwr) {
    var min = p.pwr.min || -12, max = p.pwr.max || 8, step = p.pwr.step || 0.25;
    for (var v = min; v <= max + 0.001; v += step) {
      var val = Math.round(v * 100) / 100;
      var lbl = val > 0 ? '+' + val.toFixed(2) : val.toFixed(2);
      pwrOpts += '<option value="' + val + '">' + lbl + '</option>';
    }
  } else {
    for (var v = -12; v <= 8.001; v += 0.25) {
      var val = Math.round(v * 100) / 100;
      var lbl = val > 0 ? '+' + val.toFixed(2) : val.toFixed(2);
      pwrOpts += '<option value="' + val + '">' + lbl + '</option>';
    }
  }

  // CYL options
  var cylOpts = '<option value="">—</option>';
  if (p && p.cyl && p.cyl.length) {
    p.cyl.forEach(function(c) { cylOpts += '<option value="' + c + '">' + c.toFixed(2) + '</option>'; });
  } else if (showCyl) {
    for (var c = -0.75; c >= -2.75; c -= 0.50) { cylOpts += '<option value="' + c + '">' + c.toFixed(2) + '</option>'; }
  }

  // AXIS options
  var axisOpts = '<option value="">—</option>';
  if (p && p.axis) {
    var aMin = p.axis.min || 0, aMax = p.axis.max || 180, aStep = p.axis.step || 10;
    for (var a = aMin; a <= aMax; a += aStep) { axisOpts += '<option value="' + a + '">' + a + '°</option>'; }
  } else if (showAxis) {
    for (var a = 0; a <= 180; a += 10) { axisOpts += '<option value="' + a + '">' + a + '°</option>'; }
  }

  // ADD options
  var addOpts = '<option value="">—</option>';
  if (p && p.add && p.add.length) {
    p.add.forEach(function(a) { addOpts += '<option value="' + a + '">' + a + '</option>'; });
  } else if (showAdd) {
    ['Low', 'Med', 'High'].forEach(function(a) { addOpts += '<option value="' + a + '">' + a + '</option>'; });
  }

  // Color options
  var colorOpts = '<option value="">—</option>';
  if (p && p.colors && p.colors.length) {
    p.colors.forEach(function(c) { colorOpts += '<option value="' + c + '">' + c + '</option>'; });
  }

  function eyeFields(prefix, label) {
    var html = '<div style="font-size:11px;font-weight:700;color:var(--beige);margin:8px 0 4px;border-top:1px solid rgba(255,255,255,0.06);padding-top:8px">' + label + '</div>';
    html += '<div class="vta-lc-grad-row">';
    html += '<div><label>Esfera (PWR)</label><select id="' + prefix + '-pwr">' + pwrOpts + '</select></div>';
    if (showCyl) html += '<div><label>Cilindro (CYL)</label><select id="' + prefix + '-cyl">' + cylOpts + '</select></div>';
    if (showAxis) html += '<div><label>Eje (AXIS)</label><select id="' + prefix + '-axis">' + axisOpts + '</select></div>';
    if (showAdd) html += '<div><label>ADD</label><select id="' + prefix + '-add">' + addOpts + '</select></div>';
    if (showColor) html += '<div><label>Color</label><select id="' + prefix + '-color">' + colorOpts + '</select></div>';
    if (!showCyl && !showAxis && !showAdd && !showColor) html += '<div></div>'; // spacer
    html += '</div>';
    return html;
  }

  var el = document.createElement('div');
  el.className = 'm-overlay open';
  el.id = 'vta-lc-grad-modal';
  el.innerHTML = '<div class="modal" style="max-width:420px">' +
    '<h3 style="font-family:\'Cormorant Garamond\',serif;font-size:16px;color:var(--beige);margin-bottom:8px">👁 ' + prod.nombre + '</h3>' +
    '<div style="font-size:11px;color:var(--muted);margin-bottom:8px"><span class="lc-badge lc-badge-tipo">' + tipo + '</span> ' + (prod.marca || '') + ' · $' + (prod.precio || 0).toLocaleString('es-MX') + '</div>' +
    '<label style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--muted);cursor:pointer;margin-bottom:4px"><input type="checkbox" id="vta-lc-same-grad" checked onchange="vtaLcToggleSame()"> Misma graduación ambos ojos</label>' +
    '<div id="vta-lc-eyes-same">' +
      eyeFields('vta-lc-bo', '👁 Ambos ojos (OD=OI)') +
    '</div>' +
    '<div id="vta-lc-eyes-diff" style="display:none">' +
      eyeFields('vta-lc-od', '👁 Ojo Derecho (OD)') +
      eyeFields('vta-lc-oi', '👁 Ojo Izquierdo (OI)') +
    '</div>' +
    '<div style="display:flex;align-items:center;gap:8px;margin-top:10px;border-top:1px solid rgba(255,255,255,0.06);padding-top:10px">' +
      '<label style="font-size:11px;color:var(--muted)">Cajas:</label>' +
      '<input type="number" id="vta-lc-qty" value="1" min="1" max="20" style="width:50px;background:var(--surface2);border:1px solid rgba(255,255,255,0.09);border-radius:6px;padding:6px 8px;color:var(--white);font-size:13px;text-align:center;font-family:\'Outfit\',sans-serif">' +
    '</div>' +
    '<div class="m-actions" style="margin-top:12px">' +
      '<button class="btn btn-g" onclick="document.getElementById(\'vta-lc-grad-modal\').remove()">Cancelar</button>' +
      '<button class="btn btn-p" onclick="vtaLcAddToCart(\'' + key.replace(/'/g, "\\'") + '\')">Agregar $' + (prod.precio || 0).toLocaleString('es-MX') + '</button>' +
    '</div>' +
  '</div>';

  document.body.appendChild(el);
}

function vtaLcToggleSame() {
  var same = document.getElementById('vta-lc-same-grad')?.checked;
  document.getElementById('vta-lc-eyes-same').style.display = same ? '' : 'none';
  document.getElementById('vta-lc-eyes-diff').style.display = same ? 'none' : '';
}

function _vtaLcGetEye(prefix) {
  var pwr = document.getElementById(prefix + '-pwr')?.value || '';
  var cyl = document.getElementById(prefix + '-cyl')?.value || '';
  var axis = document.getElementById(prefix + '-axis')?.value || '';
  var add = document.getElementById(prefix + '-add')?.value || '';
  var color = document.getElementById(prefix + '-color')?.value || '';
  var parts = [];
  if (pwr) parts.push(parseFloat(pwr) > 0 ? '+' + parseFloat(pwr).toFixed(2) : parseFloat(pwr).toFixed(2));
  if (cyl) parts.push('CYL ' + parseFloat(cyl).toFixed(2));
  if (axis) parts.push('EJE ' + axis + '°');
  if (add) parts.push('ADD ' + add);
  if (color) parts.push(color);
  return parts.join(' ');
}

function vtaLcAddToCart(key) {
  var grouped = lcGroupProducts(_lcModProds);
  var prod = grouped.find(function(p) { return p.key === key; });
  if (!prod) return;

  var same = document.getElementById('vta-lc-same-grad')?.checked;
  var qty = parseInt(document.getElementById('vta-lc-qty')?.value) || 1;

  var gradDesc = '';
  if (same) {
    var grad = _vtaLcGetEye('vta-lc-bo');
    if (grad) gradDesc = ' · ' + grad;
  } else {
    var od = _vtaLcGetEye('vta-lc-od');
    var oi = _vtaLcGetEye('vta-lc-oi');
    if (od || oi) gradDesc = ' · OD:' + (od || '—') + ' / OI:' + (oi || '—');
  }

  // Find the best matching real product
  var realProd = prod.prods && prod.prods.length ? prod.prods[0] : null;
  var prodId = realProd ? realProd.id : null;
  var precio = prod.precio || 0;
  var descripcion = prod.nombre + gradDesc;

  // Add to vtaItems (global from index.html)
  if (typeof vtaItems !== 'undefined') {
    vtaItems.push({
      producto_id: prodId,
      descripcion: descripcion,
      cantidad: qty,
      precio_unitario: precio,
      descuento_item: 0,
      subtotal: precio * qty,
      categoria: 'Lente de contacto'
    });
    if (typeof renderVtaItems === 'function') renderVtaItems();
  }

  toast('👁 ' + prod.nombre + ' agregado');
  document.getElementById('vta-lc-grad-modal')?.remove();
  // Contraer panel LC
  var panel = document.getElementById('vta-lc-panel');
  if (panel) { panel.style.display = 'none'; _vtaLcOpen = false; }
}

// ═══════════════════════════════════════════════════════════
// POS — Rx Final → auto LC con graduación + orden lab
// ═══════════════════════════════════════════════════════════

var _vtaLcRxData = null; // { rxFinal, rxLC, hasLcRx, pacNombre, pacienteId }
var _vtaLcRxMode = false; // true when filtering by Rx

function _lcRound025(val) {
  return Math.round(val * 4) / 4;
}

async function vtaLcCheckRx(pacienteId, pacNombre) {
  // Hide previous banner
  var banner = document.getElementById('vta-lc-rx-banner');
  if (banner) banner.style.display = 'none';
  _vtaLcRxData = null;
  _vtaLcRxMode = false;

  try {
    var { data: hc } = await db.from('historias_clinicas')
      .select('od_esfera,od_cilindro,od_eje,od_add,oi_esfera,oi_cilindro,oi_eje,oi_add,lc_od_esfera,lc_od_cilindro,lc_od_eje,lc_od_add,lc_oi_esfera,lc_oi_cilindro,lc_oi_eje,lc_oi_add')
      .eq('paciente_id', pacienteId)
      .order('created_at', { ascending: false })
      .limit(1);

    if (!hc || !hc.length) return;
    var h = hc[0];

    // Check if has Rx Final
    var hasRxFinal = !!(h.od_esfera || h.oi_esfera);
    if (!hasRxFinal) return;

    // Check if already has LC Rx
    var hasLcRx = !!(h.lc_od_esfera || h.lc_oi_esfera);

    var rxFinal = {
      od_esfera: parseFloat(h.od_esfera) || 0,
      od_cilindro: parseFloat(h.od_cilindro) || 0,
      od_eje: h.od_eje || '',
      od_add: h.od_add || '',
      oi_esfera: parseFloat(h.oi_esfera) || 0,
      oi_cilindro: parseFloat(h.oi_cilindro) || 0,
      oi_eje: h.oi_eje || '',
      oi_add: h.oi_add || ''
    };

    var rxLC;
    if (hasLcRx) {
      // Use existing LC Rx
      rxLC = {
        od_esfera: parseFloat(h.lc_od_esfera) || 0,
        od_cilindro: parseFloat(h.lc_od_cilindro) || 0,
        od_eje: h.lc_od_eje || '',
        od_add: h.lc_od_add || '',
        oi_esfera: parseFloat(h.lc_oi_esfera) || 0,
        oi_cilindro: parseFloat(h.lc_oi_cilindro) || 0,
        oi_eje: h.lc_oi_eje || '',
        oi_add: h.lc_oi_add || ''
      };
    } else {
      // Convert using vertex formula
      var odConv = vertexConvert(rxFinal.od_esfera, rxFinal.od_cilindro, 12);
      var oiConv = vertexConvert(rxFinal.oi_esfera, rxFinal.oi_cilindro, 12);
      rxLC = {
        od_esfera: _lcRound025(odConv.esf),
        od_cilindro: _lcRound025(odConv.cil),
        od_eje: rxFinal.od_eje,
        od_add: rxFinal.od_add,
        oi_esfera: _lcRound025(oiConv.esf),
        oi_cilindro: _lcRound025(oiConv.cil),
        oi_eje: rxFinal.oi_eje,
        oi_add: rxFinal.oi_add
      };
    }

    _vtaLcRxData = { rxFinal: rxFinal, rxLC: rxLC, hasLcRx: hasLcRx, pacNombre: pacNombre, pacienteId: pacienteId };
    // Banner se muestra al abrir panel LC, no al seleccionar paciente
  } catch(e) { console.warn('[LC Rx] Error:', e.message); }
}

function _lcFmtEye(esf, cil, eje, add) {
  var parts = [];
  if (esf) parts.push((esf > 0 ? '+' : '') + esf.toFixed(2));
  if (cil) parts.push((cil > 0 ? '+' : '') + cil.toFixed(2));
  if (eje) parts.push('x' + eje + '°');
  if (add) parts.push('ADD ' + add);
  return parts.join(' ') || '—';
}

function vtaLcShowRxPrompt() {
  if (!_vtaLcRxData) return;
  var banner = document.getElementById('vta-lc-rx-banner');
  if (!banner) return;

  var rx = _vtaLcRxData.rxLC;
  var pacEl = document.getElementById('vta-lc-rx-pac');
  var detailEl = document.getElementById('vta-lc-rx-detail');

  var btn = document.getElementById('vta-lc-rx-btn');
  if (_vtaLcRxData.hasLcRx) {
    // Ya tiene Rx LC — mostrar graduación directo
    pacEl.innerHTML = '👁 ' + _vtaLcRxData.pacNombre;
    detailEl.innerHTML =
      '<span style="color:var(--white)">OD:</span> ' + _lcFmtEye(rx.od_esfera, rx.od_cilindro, rx.od_eje, rx.od_add) +
      ' &nbsp;|&nbsp; <span style="color:var(--white)">OI:</span> ' + _lcFmtEye(rx.oi_esfera, rx.oi_cilindro, rx.oi_eje, rx.oi_add);
    btn.textContent = 'Filtrar por Rx';
    btn.disabled = false;
    btn.onclick = vtaLcUseRx;
  } else {
    // No tiene Rx LC — preguntar si convertir
    pacEl.innerHTML = '👁 ' + _vtaLcRxData.pacNombre;
    detailEl.innerHTML = '<span style="font-size:10px;color:#e0c77a">Tiene Rx Final registrada. ¿Convertir a Rx para lentes de contacto?</span>';
    btn.textContent = 'Convertir Rx';
    btn.disabled = false;
    btn.onclick = vtaLcConvertAndSaveRx;
  }

  banner.style.display = '';
}

async function vtaLcConvertAndSaveRx() {
  if (!_vtaLcRxData || !_vtaLcRxData.pacienteId) return;
  var btn = document.getElementById('vta-lc-rx-btn');
  btn.disabled = true;
  btn.textContent = '⏳ Guardando...';
  try {
    var rx = _vtaLcRxData.rxLC;
    // Get HC id for this patient
    var { data: hcRows } = await db.from('historias_clinicas')
      .select('id')
      .eq('paciente_id', _vtaLcRxData.pacienteId)
      .order('created_at', { ascending: false })
      .limit(1);
    if (hcRows && hcRows.length) {
      await db.from('historias_clinicas').update({
        lc_od_esfera: rx.od_esfera || null,
        lc_od_cilindro: rx.od_cilindro || null,
        lc_od_eje: rx.od_eje || null,
        lc_od_add: rx.od_add || null,
        lc_oi_esfera: rx.oi_esfera || null,
        lc_oi_cilindro: rx.oi_cilindro || null,
        lc_oi_eje: rx.oi_eje || null,
        lc_oi_add: rx.oi_add || null
      }).eq('id', hcRows[0].id);
    }
    // Mark as saved
    _vtaLcRxData.hasLcRx = true;
    // Re-render banner as "already has Rx LC"
    vtaLcShowRxPrompt();
    if (typeof showToast === 'function') showToast('Rx LC guardada en historia clínica', 'ok');
    // Auto-filter by Rx
    vtaLcUseRx();
  } catch(e) {
    btn.disabled = false;
    btn.textContent = 'Convertir y guardar Rx LC';
    if (typeof showToast === 'function') showToast('Error al guardar: ' + e.message, 'error');
  }
}

async function vtaLcUseRx() {
  if (!_vtaLcRxData) return;
  _vtaLcRxMode = true;

  // Ensure LC data is loaded
  if (!_lcModProds.length || !_lcParamsCache) {
    await vtaLcToggle(); // this loads data and opens panel
  } else {
    var panel = document.getElementById('vta-lc-panel');
    if (panel) { panel.style.display = ''; _vtaLcOpen = true; }
  }

  // Re-render with Rx filter
  vtaLcRender();

  // Scroll to panel
  document.getElementById('vta-lc-panel')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function _vtaLcIsCompatible(prod, rxLC, params) {
  // Use prod.key directly for param lookup (more reliable than fuzzy name match)
  var p = params[prod.key] || null;
  if (!p) {
    // Fallback to fuzzy name match
    var paramKey = _lcFindParamKey(prod.nombre, params);
    p = paramKey ? params[paramKey] : null;
  }

  var tipo = prod.tipo || 'Esférico';
  var odCil = Math.abs(rxLC.od_cilindro || 0);
  var oiCil = Math.abs(rxLC.oi_cilindro || 0);
  var hasCil = odCil > 0.01 || oiCil > 0.01;
  var odAdd = parseFloat(rxLC.od_add) || 0;
  var oiAdd = parseFloat(rxLC.oi_add) || 0;
  var hasAdd = odAdd > 0 || oiAdd > 0;

  // Filter by type based on patient's Rx
  if (tipo === 'Tórico' && !hasCil) return false;        // No CYL → no necesita tórico
  if (tipo === 'Multifocal' && !hasAdd) return false;     // No ADD → no necesita multifocal
  if (tipo === 'Esférico' && hasCil) return false;        // Tiene CYL → necesita tórico, no esférico
  if (tipo === 'Esférico' && hasAdd) return false;        // Tiene ADD → necesita multifocal
  if (tipo === 'Color' && hasCil) return false;           // Color es esférico, no sirve con CYL
  if (tipo === 'Color' && hasAdd) return false;           // Color no tiene ADD

  // Check sphere range
  if (p && p.pwr) {
    var inRange = function(val, min, max) { return val >= min - 0.001 && val <= max + 0.001; };
    var odOk = inRange(rxLC.od_esfera, p.pwr.min, p.pwr.max);
    var oiOk = inRange(rxLC.oi_esfera, p.pwr.min, p.pwr.max);
    if (!odOk && !oiOk) return false;
  }

  // Check CYL values for tóricos — optometrista elige el CYL disponible más cercano
  if (tipo === 'Tórico' && p && p.cyl && p.cyl.length) {
    // Find closest available CYL for each eye
    var closestOD = Math.min.apply(null, p.cyl.map(function(c){ return Math.abs(Math.abs(c) - odCil); }));
    var closestOI = Math.min.apply(null, p.cyl.map(function(c){ return Math.abs(Math.abs(c) - oiCil); }));
    // Allow if at least one eye has a CYL within 0.50 (one step)
    if (closestOD > 0.51 && closestOI > 0.51) return false;
  }

  // Check ADD values for multifocales
  if (tipo === 'Multifocal' && p && p.add && p.add.length) {
    var maxAdd = Math.max(odAdd, oiAdd);
    // Most LC multifocals use Low/Med/High, check if any ADD range covers the value
    // If add values are strings like "Low", "Med", "High" just allow
    if (typeof p.add[0] === 'number') {
      var addAvail = p.add.some(function(a) { return Math.abs(a - maxAdd) < 0.26; });
      if (!addAvail) return false;
    }
  }

  return true;
}

// Override vtaLcRender to support Rx filter mode
var _vtaLcRenderOriginal = vtaLcRender;

vtaLcRender = function() {
  var grid = document.getElementById('vta-lc-grid');
  if (!grid) return;
  var grouped = lcGroupProducts(_lcModProds);
  var imgMap = _lcImgCache || {};
  var params = _lcParamsCache || {};

  // Filters
  var tipo = document.getElementById('vta-lc-tipo')?.value || '';
  var marca = document.getElementById('vta-lc-marca')?.value || '';
  var q = (document.getElementById('vta-lc-q')?.value || '').toLowerCase().trim();

  var filtered = grouped.filter(function(p) {
    if (tipo && p.tipo !== tipo) return false;
    if (marca && p.marca !== marca) return false;
    if (q && !(p.nombre + ' ' + p.marca).toLowerCase().includes(q)) return false;
    return true;
  });

  // Apply Rx filter if active
  if (_vtaLcRxMode && _vtaLcRxData) {
    filtered = filtered.filter(function(p) {
      return _vtaLcIsCompatible(p, _vtaLcRxData.rxLC, params);
    });
  }

  // Show "Ver todos" / "Filtrado por Rx" indicator
  var rxIndicator = '';
  if (_vtaLcRxMode && _vtaLcRxData) {
    rxIndicator = '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;padding:4px 8px;background:rgba(138,176,232,0.08);border-radius:6px">' +
      '<span style="font-size:9px;color:#8ab0e8">🎯 Filtrado por Rx del paciente (' + filtered.length + ' compatibles)</span>' +
      '<button onclick="_vtaLcRxMode=false;vtaLcRender()" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:9px;text-decoration:underline">Ver todos</button>' +
    '</div>';
  }

  if (!filtered.length) {
    grid.innerHTML = rxIndicator + '<div style="padding:12px;text-align:center;color:var(--muted);font-size:11px">Sin productos compatibles con esta graduación</div>';
    return;
  }

  // In Rx mode, clicking adds directly (no picker)
  var clickAction = _vtaLcRxMode ? 'vtaLcAutoAdd' : 'vtaLcGradPicker';

  grid.innerHTML = rxIndicator + filtered.map(function(p) {
    var imgUrl = imgMap[p.key] || '';
    var imgHtml = imgUrl
      ? '<img src="' + imgUrl + '" onerror="this.style.display=\'none\'">'
      : '<div style="font-size:24px;opacity:.2">👁</div>';
    return '<div class="vta-lc-mc" onclick="' + clickAction + '(\'' + p.key.replace(/'/g, "\\'") + '\')">' +
      '<div class="vta-lc-mc-img">' + imgHtml + '</div>' +
      '<div class="vta-lc-mc-body">' +
        '<div class="vta-lc-mc-name" title="' + p.nombre + '">' + p.nombre + '</div>' +
        '<div class="vta-lc-mc-meta"><span class="lc-badge lc-badge-tipo" style="font-size:7px;padding:1px 4px">' + p.tipo + '</span> ' + (p.marca || '') + '</div>' +
        '<div class="vta-lc-mc-price">$' + (p.precio || 0).toLocaleString('es-MX') + '</div>' +
      '</div>' +
    '</div>';
  }).join('');
};

async function vtaLcAutoAdd(key) {
  if (!_vtaLcRxData) { vtaLcGradPicker(key); return; }

  var grouped = lcGroupProducts(_lcModProds);
  var prod = grouped.find(function(p) { return p.key === key; });
  if (!prod) return;

  var rx = _vtaLcRxData.rxLC;
  var same = rx.od_esfera === rx.oi_esfera && rx.od_cilindro === rx.oi_cilindro;

  // Build description with graduation
  var gradDesc = '';
  function fmtG(esf, cil, eje, add) {
    var parts = [];
    if (esf) parts.push((esf > 0 ? '+' : '') + esf.toFixed(2));
    if (cil) parts.push('CYL' + (cil > 0 ? '+' : '') + cil.toFixed(2));
    if (eje) parts.push('EJE' + eje + '°');
    if (add) parts.push('ADD' + add);
    return parts.join(' ') || 'Plano';
  }
  if (same) {
    gradDesc = ' · ' + fmtG(rx.od_esfera, rx.od_cilindro, rx.od_eje, rx.od_add);
  } else {
    gradDesc = ' · OD:' + fmtG(rx.od_esfera, rx.od_cilindro, rx.od_eje, rx.od_add) +
               ' / OI:' + fmtG(rx.oi_esfera, rx.oi_cilindro, rx.oi_eje, rx.oi_add);
  }

  var realProd = prod.prods && prod.prods.length ? prod.prods[0] : null;
  var prodId = realProd ? realProd.id : null;
  var precio = prod.precio || 0;
  var descripcion = prod.nombre + gradDesc;

  // Add to cart with LC order data (order created at checkout)
  if (typeof vtaItems !== 'undefined') {
    vtaItems.push({
      producto_id: prodId,
      descripcion: descripcion,
      cantidad: 1,
      precio_unitario: precio,
      descuento_item: 0,
      subtotal: precio,
      categoria: 'Lente de contacto',
      _lcOrderData: { prod: prod, rxLC: rx }
    });
    if (typeof renderVtaItems === 'function') renderVtaItems();
  }

  toast('👁 ' + prod.nombre + ' agregado al carrito');

  // Collapse panel
  var panel = document.getElementById('vta-lc-panel');
  if (panel) { panel.style.display = 'none'; _vtaLcOpen = false; }
  _vtaLcRxMode = false;
}

async function vtaLcCreateOrder(prod, rxLC, folio, pacienteId, sucursal, fechaEntrega, horaEntrega) {
  if (!pacienteId) return;

  var same = rxLC.od_esfera === rxLC.oi_esfera && rxLC.od_cilindro === rxLC.oi_cilindro;
  var freq = prod.frecuencia || 'Mensual';
  var marca = prod.marca || '';
  var nombre = prod.nombre || '';

  var lcNotas = [
    'LC_TIPO: Lente de Contacto',
    'LC_MISMA_RX: ' + (same ? 'Sí' : 'No'),
    'LC_OD: ' + marca + ' ' + nombre + ' PWR:' + (rxLC.od_esfera || 0) + ' CIL:' + (rxLC.od_cilindro || '') + ' EJE:' + (rxLC.od_eje || '') + ' ADD:' + (rxLC.od_add || '') + ' Cajas:1'
  ];
  if (!same) {
    lcNotas.push('LC_OI: ' + marca + ' ' + nombre + ' PWR:' + (rxLC.oi_esfera || 0) + ' CIL:' + (rxLC.oi_cilindro || '') + ' EJE:' + (rxLC.oi_eje || '') + ' ADD:' + (rxLC.oi_add || ''));
  }
  lcNotas.push('LC_REEMPLAZO: ' + freq);
  if (folio) lcNotas.push('Folio: ' + folio);
  lcNotas.push('Generada desde POS');

  var payload = {
    paciente_id: pacienteId,
    estado_lab: 'Enviado al lab',
    sucursal: sucursal || '',
    armazon: '',
    tipo_lente: 'Lente de Contacto',
    material: marca + ' ' + nombre,
    tratamiento: freq,
    tinte: '',
    od_esfera: String(rxLC.od_esfera || ''),
    od_cilindro: String(rxLC.od_cilindro || ''),
    od_eje: String(rxLC.od_eje || ''),
    od_add: String(rxLC.od_add || ''),
    oi_esfera: String(same ? rxLC.od_esfera : rxLC.oi_esfera || ''),
    oi_cilindro: String(same ? rxLC.od_cilindro : rxLC.oi_cilindro || ''),
    oi_eje: String(same ? rxLC.od_eje : rxLC.oi_eje || ''),
    oi_add: String(same ? rxLC.od_add : rxLC.oi_add || ''),
    fecha_entrega: fechaEntrega || null,
    hora_entrega: horaEntrega || null,
    notas_laboratorio: lcNotas.join(' | ')
  };

  try {
    await db.from('ordenes_laboratorio').insert(payload);
  } catch(e) {
    console.warn('[LC Orden] Error creando orden:', e.message);
    if (typeof showToast === 'function') showToast('⚠️ Error en orden LC: ' + e.message, true);
  }
}

// ═══════════════════════════════════════════════════════════
// EDICIÓN RÁPIDA PRECIO + TOGGLE ACTIVO (LC)
// ═══════════════════════════════════════════════════════════

async function lcEditPrecio(prodId) {
  var p = _lcModProds.find(function(x){return x.id===prodId;});
  if(!p) return;
  var nuevo = prompt('Nuevo precio para:\n'+p.nombre+'\n\nPrecio actual: $'+Number(p.precio_venta).toLocaleString('es-MX'), p.precio_venta);
  if(nuevo===null) return;
  nuevo = parseFloat(nuevo);
  if(!nuevo||nuevo<=0){toast('Precio inválido',true);return;}
  var {error} = await db.from('productos').update({precio_venta:nuevo,updated_at:new Date().toISOString()}).eq('id',prodId);
  if(error){toast('Error: '+error.message,true);return;}
  p.precio_venta = nuevo;
  toast('✓ Precio actualizado a $'+nuevo.toLocaleString('es-MX'));
  var modal = document.getElementById('lc-detail-modal');
  if(modal) modal.remove();
  lcRenderCatalogo();
}

async function lcToggleActivo(prodId, desactivar) {
  var p = _lcModProds.find(function(x){return x.id===prodId;});
  if(!p) return;
  var nuevoEstado = !desactivar;
  if(desactivar && !confirm('¿Desactivar "'+p.nombre+'"?\nNo aparecerá en POS ni tienda.')){return;}
  var {error} = await db.from('productos').update({activo:nuevoEstado,updated_at:new Date().toISOString()}).eq('id',prodId);
  if(error){toast('Error: '+error.message,true);return;}
  p.activo = nuevoEstado;
  toast(nuevoEstado ? '✓ '+p.nombre+' activado' : '✓ '+p.nombre+' desactivado');
  var modal = document.getElementById('lc-detail-modal');
  if(modal) modal.remove();
  lcRenderCatalogo();
}
