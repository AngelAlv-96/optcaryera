// ═══════════════════════════════════════════════════════════
// MÓDULO CONTABILIDAD v170
// Estado de Resultados · Gastos · Flujo de Efectivo · Facturación
// ═══════════════════════════════════════════════════════════

var _contActiveTab = 'resultados';
var _contGastos = [];
var _contPeriodo = 'mes';
var _contFechaInicio = '';
var _contFechaFin = '';
var _contSucursal = '';
var _contEditId = null;

var _contCategorias = {
  'Renta y servicios':      ['Renta local','Luz','Agua','Internet','Teléfono','Limpieza','Mantenimiento'],
  'Nómina y personal':      ['Sueldos','IMSS','Aguinaldo','Vacaciones','Bonos','Comisiones pagadas','Uniformes'],
  'Proveedores/materiales': ['Materiales ópticos','Armazones','Lentes de contacto','Soluciones','Accesorios','Empaques'],
  'Otros operativos':       ['Publicidad','Software','Papelería','Transporte','Impuestos','Seguros','Bancarios','Otros']
};

// ═══════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════

function _contHoy() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chihuahua' });
}

function _contMoney(n) {
  return '$' + (n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function _contGetRange(periodo) {
  var hoy = _contHoy();
  var d = new Date(hoy + 'T12:00:00');
  if (periodo === 'dia') return { inicio: hoy, fin: hoy };
  if (periodo === 'semana') {
    var day = d.getDay();
    var diff = day === 0 ? 6 : day - 1;
    var lunes = new Date(d);
    lunes.setDate(d.getDate() - diff);
    return { inicio: lunes.toLocaleDateString('en-CA'), fin: hoy };
  }
  if (periodo === 'mes') {
    return { inicio: hoy.substring(0, 8) + '01', fin: hoy };
  }
  return { inicio: _contFechaInicio || hoy, fin: _contFechaFin || hoy };
}

function _contUtcRange(fi, ff) {
  var start = new Date(fi + 'T00:00:00-06:00').toISOString();
  var end = new Date(ff + 'T23:59:59-06:00').toISOString();
  return { start: start, end: end };
}

function _contFechaCorta(f) {
  if (!f) return '—';
  var p = f.split('-');
  return p[2] + '/' + p[1];
}

function _contFechaLarga(f) {
  if (!f) return '—';
  try {
    return new Date(f + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch(e) { return f; }
}

// ═══════════════════════════════════════════════════════════
// INIT & TAB SWITCH
// ═══════════════════════════════════════════════════════════

function initContabilidad() {
  var r = _contGetRange('mes');
  _contFechaInicio = r.inicio;
  _contFechaFin = r.fin;
  _contPeriodo = 'mes';
  _contSucursal = '';
  contSwitchTab(_contActiveTab);
}

function contSwitchTab(tab) {
  _contActiveTab = tab;
  var tabs = ['resultados', 'gastos', 'flujo', 'facturacion'];
  tabs.forEach(function(t) {
    var el = document.getElementById('cont-content-' + t);
    var btn = document.getElementById('cont-tab-' + t);
    if (el) el.style.display = t === tab ? '' : 'none';
    if (btn) btn.classList.toggle('active', t === tab);
  });
  if (tab === 'resultados') contCargarResultados();
  if (tab === 'gastos') contCargarGastos();
  if (tab === 'flujo') contCargarFlujo();
  if (tab === 'facturacion') contRenderFacturacion();
}

// ═══════════════════════════════════════════════════════════
// FILTROS BAR (shared)
// ═══════════════════════════════════════════════════════════

function _contRenderFiltros(containerId, onRefresh) {
  var r = _contGetRange(_contPeriodo);
  _contFechaInicio = r.inicio;
  _contFechaFin = r.fin;
  var html = '<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:16px">';
  html += '<div style="display:flex;gap:2px;background:var(--surface2);border-radius:8px;padding:2px">';
  ['dia','semana','mes','custom'].forEach(function(p) {
    var label = p === 'dia' ? 'Hoy' : p === 'semana' ? 'Semana' : p === 'mes' ? 'Mes' : 'Rango';
    html += '<button class="btn btn-sm" style="padding:4px 10px;font-size:11px;border-radius:6px;' + (_contPeriodo === p ? 'background:var(--accent);color:#000' : 'background:transparent;color:var(--muted)') + '" onclick="_contPeriodo=\'' + p + '\';' + onRefresh + '">' + label + '</button>';
  });
  html += '</div>';
  if (_contPeriodo === 'custom') {
    html += '<input type="date" value="' + _contFechaInicio + '" style="background:var(--surface2);border:1px solid rgba(255,255,255,0.1);border-radius:6px;padding:4px 8px;color:var(--text);font-size:11px" onchange="_contFechaInicio=this.value;' + onRefresh + '">';
    html += '<span style="color:var(--muted);font-size:11px">a</span>';
    html += '<input type="date" value="' + _contFechaFin + '" style="background:var(--surface2);border:1px solid rgba(255,255,255,0.1);border-radius:6px;padding:4px 8px;color:var(--text);font-size:11px" onchange="_contFechaFin=this.value;' + onRefresh + '">';
  }
  html += '<select style="background:var(--surface2);border:1px solid rgba(255,255,255,0.1);border-radius:6px;padding:4px 8px;color:var(--text);font-size:11px" onchange="_contSucursal=this.value;' + onRefresh + '">';
  html += '<option value=""' + (!_contSucursal ? ' selected' : '') + '>Todas las sucursales</option>';
  ['Américas','Pinocelli','Magnolia'].forEach(function(s) {
    html += '<option value="' + s + '"' + (_contSucursal === s ? ' selected' : '') + '>' + s + '</option>';
  });
  html += '</select>';
  html += '<span style="font-size:11px;color:var(--muted)">' + _contFechaLarga(_contFechaInicio) + ' — ' + _contFechaLarga(_contFechaFin) + '</span>';
  html += '</div>';
  return html;
}

// ═══════════════════════════════════════════════════════════
// TAB 1: ESTADO DE RESULTADOS
// ═══════════════════════════════════════════════════════════

async function contCargarResultados() {
  var cont = document.getElementById('cont-content-resultados');
  if (!cont) return;
  cont.innerHTML = _contRenderFiltros('cont-content-resultados', 'contCargarResultados()') +
    '<div style="text-align:center;padding:32px;color:var(--muted);font-size:12px"><span class="spinner-sm"></span> Cargando estado de resultados...</div>';

  var r = _contGetRange(_contPeriodo);
  var utc = _contUtcRange(r.inicio, r.fin);

  try {
    // Parallel queries
    var pagosQ = db.from('venta_pagos').select('monto,metodo_pago,created_at,ventas(sucursal,estado)').gte('created_at', utc.start).lte('created_at', utc.end);
    var credAbQ = db.from('creditos_abonos').select('monto,metodo_pago,created_at,sucursal').gte('created_at', utc.start).lte('created_at', utc.end);
    var comprasQ = db.from('compras_lab').select('total,fecha,sucursal').gte('fecha', r.inicio).lte('fecha', r.fin);
    var gastosQ = db.from('gastos').select('monto,categoria,fecha,sucursal').gte('fecha', r.inicio).lte('fecha', r.fin);

    if (_contSucursal) {
      comprasQ = comprasQ.eq('sucursal', _contSucursal);
      gastosQ = gastosQ.eq('sucursal', _contSucursal);
    }

    var results = await Promise.all([pagosQ, credAbQ, comprasQ, gastosQ]);
    var pagos = (results[0].data || []).filter(function(p) {
      if (!p.ventas || p.ventas.estado === 'Cancelada') return false;
      if (_contSucursal && p.ventas.sucursal !== _contSucursal) return false;
      return true;
    });
    var credAb = (results[1].data || []).filter(function(a) {
      if (_contSucursal && a.sucursal !== _contSucursal) return false;
      return true;
    });
    var compras = results[2].data || [];
    var gastos = results[3].data || [];

    // Ingresos by method
    var ingresosPorMetodo = {};
    var totalIngresos = 0;
    pagos.forEach(function(p) {
      var m = p.metodo_pago || 'Otro';
      ingresosPorMetodo[m] = (ingresosPorMetodo[m] || 0) + parseFloat(p.monto || 0);
      totalIngresos += parseFloat(p.monto || 0);
    });
    credAb.forEach(function(a) {
      var m = (a.metodo_pago || 'Otro') + ' (abonos)';
      ingresosPorMetodo[m] = (ingresosPorMetodo[m] || 0) + parseFloat(a.monto || 0);
      totalIngresos += parseFloat(a.monto || 0);
    });

    // Egresos
    var totalCompras = 0;
    compras.forEach(function(c) { totalCompras += parseFloat(c.total || 0); });
    var egresosPorCat = { 'Materiales ópticos (Lab)': totalCompras };
    var totalGastos = 0;
    gastos.forEach(function(g) {
      var cat = g.categoria || 'Sin categoría';
      egresosPorCat[cat] = (egresosPorCat[cat] || 0) + parseFloat(g.monto || 0);
      totalGastos += parseFloat(g.monto || 0);
    });
    var totalEgresos = totalCompras + totalGastos;
    var utilidadBruta = totalIngresos - totalCompras;
    var utilidadNeta = totalIngresos - totalEgresos;
    var margen = totalIngresos > 0 ? (utilidadBruta / totalIngresos * 100).toFixed(1) : '0.0';

    // Render
    var html = _contRenderFiltros('cont-content-resultados', 'contCargarResultados()');

    // Stat cards
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:20px">';
    html += _contStatCard('Ingresos', totalIngresos, '#4ade80', '📈');
    html += _contStatCard('Egresos', totalEgresos, '#f87171', '📉');
    html += _contStatCard('Utilidad bruta', utilidadBruta, utilidadBruta >= 0 ? '#60a5fa' : '#f87171', '💰', margen + '% margen');
    html += _contStatCard('Utilidad neta', utilidadNeta, utilidadNeta >= 0 ? '#a78bfa' : '#f87171', '🏦');
    html += '</div>';

    // Desglose ingresos
    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">';
    html += '<div style="background:var(--surface);border-radius:12px;padding:16px">';
    html += '<h4 style="font-size:13px;margin-bottom:12px;color:var(--text)">Desglose de Ingresos</h4>';
    var sortedIng = Object.entries(ingresosPorMetodo).sort(function(a,b) { return b[1] - a[1]; });
    if (sortedIng.length === 0) html += '<p style="font-size:11px;color:var(--muted)">Sin ingresos en este periodo</p>';
    sortedIng.forEach(function(e) {
      var pct = totalIngresos > 0 ? (e[1] / totalIngresos * 100).toFixed(1) : 0;
      html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.04);font-size:12px">';
      html += '<span style="color:var(--muted)">' + e[0] + '</span>';
      html += '<span style="color:#4ade80;font-weight:600">' + _contMoney(e[1]) + ' <span style="color:var(--muted);font-weight:400;font-size:10px">(' + pct + '%)</span></span>';
      html += '</div>';
    });
    html += '</div>';

    // Desglose egresos
    html += '<div style="background:var(--surface);border-radius:12px;padding:16px">';
    html += '<h4 style="font-size:13px;margin-bottom:12px;color:var(--text)">Desglose de Egresos</h4>';
    var sortedEgr = Object.entries(egresosPorCat).sort(function(a,b) { return b[1] - a[1]; });
    if (sortedEgr.length === 0) html += '<p style="font-size:11px;color:var(--muted)">Sin egresos en este periodo</p>';
    sortedEgr.forEach(function(e) {
      var pct = totalEgresos > 0 ? (e[1] / totalEgresos * 100).toFixed(1) : 0;
      html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.04);font-size:12px">';
      html += '<span style="color:var(--muted)">' + e[0] + '</span>';
      html += '<span style="color:#f87171;font-weight:600">' + _contMoney(e[1]) + ' <span style="color:var(--muted);font-weight:400;font-size:10px">(' + pct + '%)</span></span>';
      html += '</div>';
    });
    html += '</div>';
    html += '</div>';

    cont.innerHTML = html;
  } catch(err) {
    cont.innerHTML = _contRenderFiltros('cont-content-resultados', 'contCargarResultados()') +
      '<div style="padding:24px;text-align:center;color:#f87171;font-size:12px">Error: ' + err.message + '</div>';
  }
}

function _contStatCard(label, value, color, icon, sublabel) {
  return '<div style="background:var(--surface);border-radius:12px;padding:16px">' +
    '<div style="font-size:11px;color:var(--muted);margin-bottom:4px">' + icon + ' ' + label.toUpperCase() + '</div>' +
    '<div style="font-size:22px;font-weight:700;color:' + color + '">' + _contMoney(value) + '</div>' +
    (sublabel ? '<div style="font-size:10px;color:var(--muted);margin-top:2px">' + sublabel + '</div>' : '') +
    '</div>';
}

// ═══════════════════════════════════════════════════════════
// TAB 2: GASTOS
// ═══════════════════════════════════════════════════════════

async function contCargarGastos() {
  var cont = document.getElementById('cont-content-gastos');
  if (!cont) return;
  cont.innerHTML = '<div style="text-align:center;padding:32px;color:var(--muted);font-size:12px"><span class="spinner-sm"></span> Cargando gastos...</div>';

  var r = _contGetRange(_contPeriodo);

  try {
    var gastosQ = db.from('gastos').select('*').gte('fecha', r.inicio).lte('fecha', r.fin).order('fecha', { ascending: false });
    var comprasQ = db.from('compras_lab').select('id,fecha,total,proveedor,sucursal,folio').gte('fecha', r.inicio).lte('fecha', r.fin).order('fecha', { ascending: false });

    if (_contSucursal) {
      gastosQ = gastosQ.eq('sucursal', _contSucursal);
      comprasQ = comprasQ.eq('sucursal', _contSucursal);
    }

    var results = await Promise.all([gastosQ, comprasQ]);
    var gastos = results[0].data || [];
    var compras = results[1].data || [];

    // Merge
    var items = [];
    gastos.forEach(function(g) {
      items.push({ tipo: 'gasto', id: g.id, fecha: g.fecha, concepto: g.concepto, monto: parseFloat(g.monto || 0), categoria: g.categoria, subcategoria: g.subcategoria, sucursal: g.sucursal, comprobante_url: g.comprobante_url, nota: g.nota, registrado_por: g.registrado_por });
    });
    compras.forEach(function(c) {
      items.push({ tipo: 'compra', id: c.id, fecha: c.fecha, concepto: (c.proveedor || 'Compra Lab') + (c.folio ? ' #' + c.folio : ''), monto: parseFloat(c.total || 0), categoria: 'Proveedores/materiales', subcategoria: 'Materiales ópticos', sucursal: c.sucursal || '—', nota: null, registrado_por: null });
    });
    items.sort(function(a, b) { return b.fecha > a.fecha ? 1 : b.fecha < a.fecha ? -1 : 0; });

    _contGastos = items;

    // Stats
    var totalMes = 0;
    var porCat = {};
    items.forEach(function(i) {
      totalMes += i.monto;
      porCat[i.categoria] = (porCat[i.categoria] || 0) + i.monto;
    });

    // Render
    var html = _contRenderFiltros('cont-content-gastos', 'contCargarGastos()');

    // Button + stats
    html += '<div style="display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin-bottom:16px">';
    html += '<button class="btn btn-p btn-sm" onclick="contMostrarFormGasto()" style="font-size:12px">+ Nuevo gasto</button>';
    html += '<div style="font-size:13px;font-weight:600;color:#f87171">' + _contMoney(totalMes) + ' <span style="font-weight:400;font-size:11px;color:var(--muted)">total periodo</span></div>';
    var catEntries = Object.entries(porCat).sort(function(a,b) { return b[1] - a[1]; });
    catEntries.forEach(function(e) {
      html += '<span style="font-size:10px;background:var(--surface2);padding:3px 8px;border-radius:6px;color:var(--muted)">' + e[0] + ': ' + _contMoney(e[1]) + '</span>';
    });
    html += '</div>';

    // Form container
    html += '<div id="cont-form-gasto" style="display:none;margin-bottom:16px"></div>';

    // Table
    if (items.length === 0) {
      html += '<div style="padding:32px;text-align:center;color:var(--muted);font-size:12px">Sin gastos en este periodo</div>';
    } else {
      html += '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12px">';
      html += '<thead><tr style="border-bottom:1px solid rgba(255,255,255,0.08)">';
      html += '<th style="padding:8px;text-align:left;color:var(--muted);font-size:10px">FECHA</th>';
      html += '<th style="padding:8px;text-align:left;color:var(--muted);font-size:10px">CONCEPTO</th>';
      html += '<th style="padding:8px;text-align:left;color:var(--muted);font-size:10px">CATEGORÍA</th>';
      html += '<th style="padding:8px;text-align:left;color:var(--muted);font-size:10px">SUCURSAL</th>';
      html += '<th style="padding:8px;text-align:right;color:var(--muted);font-size:10px">MONTO</th>';
      html += '<th style="padding:8px;text-align:center;color:var(--muted);font-size:10px">ACCIONES</th>';
      html += '</tr></thead><tbody>';
      items.forEach(function(i) {
        var isCompra = i.tipo === 'compra';
        html += '<tr style="border-bottom:1px solid rgba(255,255,255,0.04)">';
        html += '<td style="padding:8px">' + _contFechaCorta(i.fecha) + '</td>';
        html += '<td style="padding:8px">' + i.concepto + (isCompra ? ' <span style="font-size:9px;background:#3b82f6;color:white;padding:1px 5px;border-radius:4px">Compra Lab</span>' : '') + '</td>';
        html += '<td style="padding:8px;color:var(--muted)">' + i.categoria + (i.subcategoria ? ' · ' + i.subcategoria : '') + '</td>';
        html += '<td style="padding:8px;color:var(--muted)">' + i.sucursal + '</td>';
        html += '<td style="padding:8px;text-align:right;font-weight:600;color:#f87171">' + _contMoney(i.monto) + '</td>';
        html += '<td style="padding:8px;text-align:center">';
        if (!isCompra) {
          html += '<button class="btn btn-g" style="padding:2px 6px;font-size:10px;margin-right:4px" onclick="contEditarGasto(' + i.id + ')">✏️</button>';
          html += '<button class="btn btn-g" style="padding:2px 6px;font-size:10px" onclick="contEliminarGasto(' + i.id + ')">🗑</button>';
        }
        if (i.comprobante_url) {
          html += '<button class="btn btn-g" style="padding:2px 6px;font-size:10px;margin-left:4px" onclick="window.open(\'' + i.comprobante_url + '\',\'_blank\')">📷</button>';
        }
        html += '</td>';
        html += '</tr>';
      });
      html += '</tbody></table></div>';
    }

    cont.innerHTML = html;
  } catch(err) {
    cont.innerHTML = '<div style="padding:24px;text-align:center;color:#f87171;font-size:12px">Error: ' + err.message + '</div>';
  }
}

function contMostrarFormGasto(editData) {
  _contEditId = editData ? editData.id : null;
  var f = document.getElementById('cont-form-gasto');
  if (!f) return;
  var d = editData || { fecha: _contHoy(), concepto: '', monto: '', categoria: '', subcategoria: '', sucursal: currentUser?.sucursal || 'Américas', nota: '' };
  var html = '<div style="background:var(--surface);border-radius:12px;padding:16px">';
  html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">';
  html += '<h4 style="font-size:13px;color:var(--text)">' + (editData ? '✏️ Editar gasto' : '+ Nuevo gasto') + '</h4>';
  html += '<button class="btn btn-g btn-sm" onclick="contCerrarFormGasto()" style="font-size:10px">✕ Cerrar</button>';
  html += '</div>';

  // Photo OCR
  html += '<div style="margin-bottom:12px;padding:10px;background:var(--surface2);border-radius:8px;border:1px dashed rgba(255,255,255,0.1)">';
  html += '<div style="display:flex;gap:8px;align-items:center">';
  html += '<label style="cursor:pointer;font-size:11px;color:var(--accent)" for="cont-file">📷 Subir comprobante (OCR automático)</label>';
  html += '<input type="file" id="cont-file" accept="image/*" capture="environment" style="display:none" onchange="contProcesarFoto(this)">';
  html += '<span id="cont-ocr-status" style="font-size:10px;color:var(--muted)"></span>';
  html += '</div>';
  html += '<div id="cont-preview" style="display:none;margin-top:8px"><img id="cont-img" style="max-width:200px;border-radius:6px"></div>';
  html += '</div>';

  html += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">';
  html += '<div><label style="font-size:10px;color:var(--muted);display:block;margin-bottom:2px">Fecha</label><input type="date" id="cont-fecha" value="' + d.fecha + '" style="width:100%;background:var(--surface2);border:1px solid rgba(255,255,255,0.1);border-radius:6px;padding:6px 8px;color:var(--text);font-size:12px"></div>';
  html += '<div><label style="font-size:10px;color:var(--muted);display:block;margin-bottom:2px">Monto</label><input type="number" id="cont-monto" value="' + (d.monto || '') + '" step="0.01" placeholder="0.00" style="width:100%;background:var(--surface2);border:1px solid rgba(255,255,255,0.1);border-radius:6px;padding:6px 8px;color:var(--text);font-size:12px"></div>';
  html += '<div><label style="font-size:10px;color:var(--muted);display:block;margin-bottom:2px">Sucursal</label><select id="cont-suc" style="width:100%;background:var(--surface2);border:1px solid rgba(255,255,255,0.1);border-radius:6px;padding:6px 8px;color:var(--text);font-size:12px">';
  ['Américas','Pinocelli','Magnolia'].forEach(function(s) {
    html += '<option' + (d.sucursal === s ? ' selected' : '') + '>' + s + '</option>';
  });
  html += '</select></div>';
  html += '</div>';

  html += '<div style="margin-top:10px"><label style="font-size:10px;color:var(--muted);display:block;margin-bottom:2px">Concepto</label><input type="text" id="cont-concepto" value="' + (d.concepto || '') + '" placeholder="Ej: Renta local Américas marzo" style="width:100%;background:var(--surface2);border:1px solid rgba(255,255,255,0.1);border-radius:6px;padding:6px 8px;color:var(--text);font-size:12px"></div>';

  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px">';
  html += '<div><label style="font-size:10px;color:var(--muted);display:block;margin-bottom:2px">Categoría</label><select id="cont-cat" onchange="contUpdateSubcats()" style="width:100%;background:var(--surface2);border:1px solid rgba(255,255,255,0.1);border-radius:6px;padding:6px 8px;color:var(--text);font-size:12px"><option value="">Seleccionar...</option>';
  Object.keys(_contCategorias).forEach(function(c) {
    html += '<option' + (d.categoria === c ? ' selected' : '') + '>' + c + '</option>';
  });
  html += '</select></div>';
  html += '<div><label style="font-size:10px;color:var(--muted);display:block;margin-bottom:2px">Subcategoría</label><select id="cont-subcat" style="width:100%;background:var(--surface2);border:1px solid rgba(255,255,255,0.1);border-radius:6px;padding:6px 8px;color:var(--text);font-size:12px"><option value="">Seleccionar...</option></select></div>';
  html += '</div>';

  html += '<div style="margin-top:10px"><label style="font-size:10px;color:var(--muted);display:block;margin-bottom:2px">Nota (opcional)</label><input type="text" id="cont-nota" value="' + (d.nota || '') + '" placeholder="Observaciones" style="width:100%;background:var(--surface2);border:1px solid rgba(255,255,255,0.1);border-radius:6px;padding:6px 8px;color:var(--text);font-size:12px"></div>';

  html += '<div style="margin-top:12px;display:flex;gap:8px">';
  html += '<button class="btn btn-p btn-sm" id="cont-btn-guardar" onclick="contGuardarGasto()" style="font-size:12px">' + (editData ? 'Guardar cambios' : 'Registrar gasto') + '</button>';
  html += '<button class="btn btn-g btn-sm" onclick="contCerrarFormGasto()" style="font-size:12px">Cancelar</button>';
  html += '</div>';
  html += '</div>';
  f.innerHTML = html;
  f.style.display = '';

  // Set subcats if editing
  if (d.categoria) {
    setTimeout(function() {
      contUpdateSubcats();
      if (d.subcategoria) document.getElementById('cont-subcat').value = d.subcategoria;
    }, 50);
  }
}

function contCerrarFormGasto() {
  var f = document.getElementById('cont-form-gasto');
  if (f) { f.style.display = 'none'; f.innerHTML = ''; }
  _contEditId = null;
}

function contUpdateSubcats() {
  var cat = document.getElementById('cont-cat').value;
  var sel = document.getElementById('cont-subcat');
  sel.innerHTML = '<option value="">Seleccionar...</option>';
  if (cat && _contCategorias[cat]) {
    _contCategorias[cat].forEach(function(s) {
      sel.innerHTML += '<option>' + s + '</option>';
    });
  }
}

async function contProcesarFoto(input) {
  var file = input.files && input.files[0];
  if (!file) return;
  var st = document.getElementById('cont-ocr-status');
  st.innerHTML = '<span style="color:var(--accent)">⏳ Analizando comprobante... 10-20s</span>';

  // Preview
  var reader = new FileReader();
  reader.onload = function(e) {
    document.getElementById('cont-img').src = e.target.result;
    document.getElementById('cont-preview').style.display = '';
  };
  reader.readAsDataURL(file);

  var base64 = await new Promise(function(res, rej) {
    var r = new FileReader();
    r.onload = function() { res(r.result.split(',')[1]); };
    r.onerror = function() { rej(new Error('Error leyendo archivo')); };
    r.readAsDataURL(file);
  });

  var mediaType = file.type || 'image/jpeg';

  try {
    var resp = await fetch('/.netlify/functions/ia-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        max_tokens: 1024,
        system: 'Eres un asistente que extrae datos de comprobantes de gastos (tickets, facturas, recibos). ' +
          'Extrae: concepto (qué se pagó), monto (total en MXN), fecha (YYYY-MM-DD), establecimiento/proveedor. ' +
          'Si es un ticket de CFE/TELMEX/agua → categoría "Renta y servicios". Si es nómina → "Nómina y personal". ' +
          'Si es compra de materiales → "Proveedores/materiales". Si es otro → "Otros operativos". ' +
          'RESPONDE ÚNICAMENTE con JSON object sin markdown: {"concepto":"...","monto":123.45,"fecha":"2026-03-23","categoria":"...","subcategoria":"..."}',
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
            { type: 'text', text: 'Extrae los datos de este comprobante de gasto. Responde SOLO JSON.' }
          ]
        }],
        auth: { id: currentUser?.uid || currentUser?.id, pass: currentUser?.pass }
      })
    });
    var data = await resp.json();
    var text = (data.content && data.content[0] && data.content[0].text) || data.text || '';
    text = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    var parsed = JSON.parse(text);

    if (parsed.concepto) document.getElementById('cont-concepto').value = parsed.concepto;
    if (parsed.monto) document.getElementById('cont-monto').value = parsed.monto;
    if (parsed.fecha) document.getElementById('cont-fecha').value = parsed.fecha;
    if (parsed.categoria) {
      document.getElementById('cont-cat').value = parsed.categoria;
      contUpdateSubcats();
      if (parsed.subcategoria) setTimeout(function() { document.getElementById('cont-subcat').value = parsed.subcategoria; }, 50);
    }
    st.innerHTML = '<span style="color:#4ade80">✓ Datos extraídos</span>';

    // Upload image to Supabase Storage
    try {
      var uploadResp = await fetch('/.netlify/functions/img-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bucket: 'chat-media',
          path: 'gastos/' + Date.now() + '_' + file.name.replace(/[^a-zA-Z0-9.]/g, '_'),
          base64: base64,
          contentType: mediaType,
          auth: { id: currentUser?.uid || currentUser?.id, pass: currentUser?.pass }
        })
      });
      var uploadData = await uploadResp.json();
      if (uploadData.url) {
        window._contComprobanteUrl = uploadData.url;
        st.innerHTML += ' <span style="color:#60a5fa">📷 Imagen guardada</span>';
      }
    } catch(ue) { console.warn('Upload comprobante error:', ue); }
  } catch(err) {
    st.innerHTML = '<span style="color:#f87171">Error OCR: ' + err.message + '</span>';
  }
}

async function contGuardarGasto() {
  if (window._actionBusy && window._actionBusy['guardarGasto']) return;
  if (!window._actionBusy) window._actionBusy = {};
  window._actionBusy['guardarGasto'] = true;
  var btn = document.getElementById('cont-btn-guardar');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Guardando...'; }

  try {
    var concepto = document.getElementById('cont-concepto').value.trim();
    var monto = parseFloat(document.getElementById('cont-monto').value);
    var fecha = document.getElementById('cont-fecha').value;
    var categoria = document.getElementById('cont-cat').value;
    var subcategoria = document.getElementById('cont-subcat').value;
    var sucursal = document.getElementById('cont-suc').value;
    var nota = document.getElementById('cont-nota').value.trim();

    if (!concepto || !monto || !fecha || !categoria) {
      toast('Completa concepto, monto, fecha y categoría', 'warn');
      return;
    }

    var row = {
      concepto: concepto,
      monto: monto,
      fecha: fecha,
      categoria: categoria,
      subcategoria: subcategoria || null,
      sucursal: sucursal,
      nota: nota || null,
      comprobante_url: window._contComprobanteUrl || null,
      registrado_por: currentUser?.nombre || currentUser?.uid || 'admin'
    };

    if (_contEditId) {
      await db.from('gastos').update(row).eq('id', _contEditId);
      toast('Gasto actualizado', 'ok');
    } else {
      await db.from('gastos').insert(row);
      toast('Gasto registrado', 'ok');
    }

    window._contComprobanteUrl = null;
    contCerrarFormGasto();
    contCargarGastos();
  } catch(err) {
    toast('Error: ' + err.message, 'err');
  } finally {
    window._actionBusy['guardarGasto'] = false;
    if (btn) { btn.disabled = false; btn.textContent = _contEditId ? 'Guardar cambios' : 'Registrar gasto'; }
  }
}

function contEditarGasto(id) {
  var item = _contGastos.find(function(g) { return g.id === id && g.tipo === 'gasto'; });
  if (!item) return;
  contMostrarFormGasto(item);
  document.getElementById('cont-form-gasto').scrollIntoView({ behavior: 'smooth' });
}

async function contEliminarGasto(id) {
  if (!confirm('¿Eliminar este gasto?')) return;
  try {
    await db.from('gastos').delete().eq('id', id);
    toast('Gasto eliminado', 'ok');
    contCargarGastos();
  } catch(err) {
    toast('Error: ' + err.message, 'err');
  }
}

// ═══════════════════════════════════════════════════════════
// TAB 3: FLUJO DE EFECTIVO
// ═══════════════════════════════════════════════════════════

async function contCargarFlujo() {
  var cont = document.getElementById('cont-content-flujo');
  if (!cont) return;
  cont.innerHTML = _contRenderFiltros('cont-content-flujo', 'contCargarFlujo()') +
    '<div style="text-align:center;padding:32px;color:var(--muted);font-size:12px"><span class="spinner-sm"></span> Cargando flujo de efectivo...</div>';

  var r = _contGetRange(_contPeriodo);
  var utc = _contUtcRange(r.inicio, r.fin);

  try {
    var pagosQ = db.from('venta_pagos').select('monto,created_at,ventas(sucursal,estado)').gte('created_at', utc.start).lte('created_at', utc.end);
    var credAbQ = db.from('creditos_abonos').select('monto,created_at,sucursal').gte('created_at', utc.start).lte('created_at', utc.end);
    var gastosQ = db.from('gastos').select('monto,fecha,sucursal').gte('fecha', r.inicio).lte('fecha', r.fin);
    var comprasQ = db.from('compras_lab').select('total,fecha,sucursal').gte('fecha', r.inicio).lte('fecha', r.fin);
    var retirosQ = db.from('retiros_caja').select('monto,created_at,sucursal').gte('created_at', utc.start).lte('created_at', utc.end);

    if (_contSucursal) {
      gastosQ = gastosQ.eq('sucursal', _contSucursal);
      comprasQ = comprasQ.eq('sucursal', _contSucursal);
      retirosQ = retirosQ.eq('sucursal', _contSucursal);
    }

    var results = await Promise.all([pagosQ, credAbQ, gastosQ, comprasQ, retirosQ]);
    var pagos = (results[0].data || []).filter(function(p) {
      if (!p.ventas || p.ventas.estado === 'Cancelada') return false;
      if (_contSucursal && p.ventas.sucursal !== _contSucursal) return false;
      return true;
    });
    var credAb = (results[1].data || []).filter(function(a) {
      return !_contSucursal || a.sucursal === _contSucursal;
    });
    var gastos = results[2].data || [];
    var compras = results[3].data || [];
    var retiros = (results[4].data || []).filter(function(r) {
      return !_contSucursal || r.sucursal === _contSucursal;
    });

    // Totals
    var totalEntradas = 0;
    pagos.forEach(function(p) { totalEntradas += parseFloat(p.monto || 0); });
    credAb.forEach(function(a) { totalEntradas += parseFloat(a.monto || 0); });

    var totalSalidas = 0;
    gastos.forEach(function(g) { totalSalidas += parseFloat(g.monto || 0); });
    compras.forEach(function(c) { totalSalidas += parseFloat(c.total || 0); });
    retiros.forEach(function(r) { totalSalidas += parseFloat(r.monto || 0); });

    var saldoNeto = totalEntradas - totalSalidas;

    // Daily breakdown
    var dayMap = {};
    function addDay(fecha, tipo, monto) {
      if (!dayMap[fecha]) dayMap[fecha] = { entradas: 0, salidas: 0 };
      dayMap[fecha][tipo] += monto;
    }
    pagos.forEach(function(p) { addDay(p.created_at.substring(0, 10), 'entradas', parseFloat(p.monto || 0)); });
    credAb.forEach(function(a) { addDay(a.created_at.substring(0, 10), 'entradas', parseFloat(a.monto || 0)); });
    gastos.forEach(function(g) { addDay(g.fecha, 'salidas', parseFloat(g.monto || 0)); });
    compras.forEach(function(c) { addDay(c.fecha, 'salidas', parseFloat(c.total || 0)); });
    retiros.forEach(function(r) { addDay(r.created_at.substring(0, 10), 'salidas', parseFloat(r.monto || 0)); });

    var days = Object.keys(dayMap).sort();

    // Render
    var html = _contRenderFiltros('cont-content-flujo', 'contCargarFlujo()');

    // Stat cards
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:20px">';
    html += _contStatCard('Total entradas', totalEntradas, '#4ade80', '📥');
    html += _contStatCard('Total salidas', totalSalidas, '#f87171', '📤');
    html += _contStatCard('Saldo neto', saldoNeto, saldoNeto >= 0 ? '#60a5fa' : '#f87171', saldoNeto >= 0 ? '📈' : '📉');
    html += '</div>';

    // Breakdown by type of salida
    var totalGastosMonto = 0, totalComprasMonto = 0, totalRetirosMonto = 0;
    gastos.forEach(function(g) { totalGastosMonto += parseFloat(g.monto || 0); });
    compras.forEach(function(c) { totalComprasMonto += parseFloat(c.total || 0); });
    retiros.forEach(function(r) { totalRetirosMonto += parseFloat(r.monto || 0); });

    html += '<div style="background:var(--surface);border-radius:12px;padding:16px;margin-bottom:16px">';
    html += '<h4 style="font-size:13px;margin-bottom:10px">Detalle de salidas</h4>';
    html += '<div style="display:flex;gap:16px;flex-wrap:wrap;font-size:12px">';
    html += '<span style="color:var(--muted)">Gastos operativos: <b style="color:#f87171">' + _contMoney(totalGastosMonto) + '</b></span>';
    html += '<span style="color:var(--muted)">Compras lab: <b style="color:#f87171">' + _contMoney(totalComprasMonto) + '</b></span>';
    html += '<span style="color:var(--muted)">Retiros caja: <b style="color:#f87171">' + _contMoney(totalRetirosMonto) + '</b></span>';
    html += '</div></div>';

    // Daily table
    if (days.length > 0) {
      html += '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12px">';
      html += '<thead><tr style="border-bottom:1px solid rgba(255,255,255,0.08)">';
      html += '<th style="padding:8px;text-align:left;color:var(--muted);font-size:10px">FECHA</th>';
      html += '<th style="padding:8px;text-align:right;color:var(--muted);font-size:10px">ENTRADAS</th>';
      html += '<th style="padding:8px;text-align:right;color:var(--muted);font-size:10px">SALIDAS</th>';
      html += '<th style="padding:8px;text-align:right;color:var(--muted);font-size:10px">SALDO ACUM.</th>';
      html += '</tr></thead><tbody>';
      var acum = 0;
      days.forEach(function(d) {
        var row = dayMap[d];
        acum += row.entradas - row.salidas;
        html += '<tr style="border-bottom:1px solid rgba(255,255,255,0.04)">';
        html += '<td style="padding:8px">' + _contFechaCorta(d) + '</td>';
        html += '<td style="padding:8px;text-align:right;color:#4ade80">' + (row.entradas > 0 ? '+' + _contMoney(row.entradas) : '—') + '</td>';
        html += '<td style="padding:8px;text-align:right;color:#f87171">' + (row.salidas > 0 ? '-' + _contMoney(row.salidas) : '—') + '</td>';
        html += '<td style="padding:8px;text-align:right;font-weight:600;color:' + (acum >= 0 ? '#60a5fa' : '#f87171') + '">' + _contMoney(acum) + '</td>';
        html += '</tr>';
      });
      html += '</tbody></table></div>';
    }

    cont.innerHTML = html;
  } catch(err) {
    cont.innerHTML = _contRenderFiltros('cont-content-flujo', 'contCargarFlujo()') +
      '<div style="padding:24px;text-align:center;color:#f87171;font-size:12px">Error: ' + err.message + '</div>';
  }
}

// ═══════════════════════════════════════════════════════════
// TAB 4: FACTURACIÓN (placeholder)
// ═══════════════════════════════════════════════════════════

async function contRenderFacturacion() {
  var cont = document.getElementById('cont-content-facturacion');
  if (!cont) return;

  var html = '<div style="background:var(--surface);border-radius:12px;padding:24px;text-align:center;margin-bottom:20px">';
  html += '<div style="font-size:40px;margin-bottom:8px">🧾</div>';
  html += '<h3 style="font-size:16px;margin-bottom:6px;color:var(--text)">Facturación CFDI</h3>';
  html += '<p style="font-size:12px;color:var(--muted);max-width:400px;margin:0 auto">Para emitir facturas electrónicas se requiere contratar un PAC (Proveedor Autorizado de Certificación). Una vez configurado, aquí podrás generar CFDI directamente desde las ventas.</p>';
  html += '</div>';

  // Simple tracking - recent sales that might need invoicing
  html += '<div style="background:var(--surface);border-radius:12px;padding:16px">';
  html += '<h4 style="font-size:13px;margin-bottom:12px;color:var(--text)">Ventas recientes (últimos 30 días)</h4>';
  html += '<p style="font-size:11px;color:var(--muted);margin-bottom:12px">Seguimiento manual de ventas que requieren factura</p>';

  try {
    var hace30 = new Date();
    hace30.setDate(hace30.getDate() - 30);
    var desde = hace30.toISOString();
    var ventasRes = await db.from('ventas').select('folio,total,sucursal,created_at,paciente_nombre').gte('total', 1000).gte('created_at', desde).neq('estado', 'Cancelada').order('created_at', { ascending: false }).limit(50);
    var ventas = ventasRes.data || [];

    if (ventas.length === 0) {
      html += '<p style="font-size:11px;color:var(--muted);text-align:center;padding:16px">Sin ventas mayores a $1,000 en los últimos 30 días</p>';
    } else {
      html += '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12px">';
      html += '<thead><tr style="border-bottom:1px solid rgba(255,255,255,0.08)">';
      html += '<th style="padding:8px;text-align:left;color:var(--muted);font-size:10px">FOLIO</th>';
      html += '<th style="padding:8px;text-align:left;color:var(--muted);font-size:10px">PACIENTE</th>';
      html += '<th style="padding:8px;text-align:right;color:var(--muted);font-size:10px">TOTAL</th>';
      html += '<th style="padding:8px;text-align:left;color:var(--muted);font-size:10px">SUCURSAL</th>';
      html += '<th style="padding:8px;text-align:left;color:var(--muted);font-size:10px">FECHA</th>';
      html += '</tr></thead><tbody>';
      ventas.forEach(function(v) {
        html += '<tr style="border-bottom:1px solid rgba(255,255,255,0.04)">';
        html += '<td style="padding:8px;font-weight:600">' + (v.folio || '—') + '</td>';
        html += '<td style="padding:8px">' + (v.paciente_nombre || '—') + '</td>';
        html += '<td style="padding:8px;text-align:right;color:var(--accent)">' + _contMoney(v.total) + '</td>';
        html += '<td style="padding:8px;color:var(--muted)">' + (v.sucursal || '—') + '</td>';
        html += '<td style="padding:8px;color:var(--muted)">' + _contFechaCorta(v.created_at?.substring(0, 10)) + '</td>';
        html += '</tr>';
      });
      html += '</tbody></table></div>';
    }
  } catch(err) {
    html += '<p style="color:#f87171;font-size:11px">Error: ' + err.message + '</p>';
  }

  html += '</div>';
  cont.innerHTML = html;
}
