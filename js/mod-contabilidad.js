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
      // gastos: no filter by sucursal in query — filter in JS to include General (null)
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
    var gastos = (results[3].data || []).filter(function(g) {
      if (_contSucursal) return !g.sucursal || g.sucursal === _contSucursal;
      return true;
    });

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
    var comprasQ = db.from('compras_lab').select('id,fecha,total,proveedor,sucursal').gte('fecha', r.inicio).lte('fecha', r.fin).order('fecha', { ascending: false });

    if (_contSucursal) {
      // Only filter compras by sucursal; gastos filtered in JS to include General (null)
      comprasQ = comprasQ.eq('sucursal', _contSucursal);
    }

    var results = await Promise.all([gastosQ, comprasQ]);
    var gastos = results[0].data || [];
    var compras = results[1].data || [];

    // Filter gastos in JS: include matching sucursal + General (null/empty)
    if (_contSucursal) {
      gastos = gastos.filter(function(g) { return !g.sucursal || g.sucursal === _contSucursal; });
    }

    // Merge
    var items = [];
    gastos.forEach(function(g) {
      items.push({ tipo: 'gasto', id: g.id, fecha: g.fecha, concepto: g.concepto, monto: parseFloat(g.monto || 0), categoria: g.categoria, subcategoria: g.subcategoria, sucursal: g.sucursal, metodo_pago: g.metodo_pago, comprobante_url: g.comprobante_url, nota: g.nota, registrado_por: g.registrado_por });
    });
    compras.forEach(function(c) {
      items.push({ tipo: 'compra', id: c.id, fecha: c.fecha, concepto: (c.proveedor || 'Compra Lab'), monto: parseFloat(c.total || 0), categoria: 'Proveedores/materiales', subcategoria: 'Materiales ópticos', sucursal: c.sucursal || 'General', nota: null, registrado_por: null });
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
      html += '<th style="padding:8px;text-align:left;color:var(--muted);font-size:10px">MÉTODO</th>';
      html += '<th style="padding:8px;text-align:right;color:var(--muted);font-size:10px">MONTO</th>';
      html += '<th style="padding:8px;text-align:center;color:var(--muted);font-size:10px">ACCIONES</th>';
      html += '</tr></thead><tbody>';
      items.forEach(function(i) {
        var isCompra = i.tipo === 'compra';
        html += '<tr style="border-bottom:1px solid rgba(255,255,255,0.04)">';
        html += '<td style="padding:8px">' + _contFechaCorta(i.fecha) + '</td>';
        html += '<td style="padding:8px">' + i.concepto + (isCompra ? ' <span style="font-size:9px;background:#3b82f6;color:white;padding:1px 5px;border-radius:4px">Compra Lab</span>' : '') + '</td>';
        html += '<td style="padding:8px;color:var(--muted)">' + i.categoria + (i.subcategoria ? ' · ' + i.subcategoria : '') + '</td>';
        html += '<td style="padding:8px;color:var(--muted)">' + (i.sucursal || 'General') + '</td>';
        html += '<td style="padding:8px;color:var(--muted);font-size:11px">' + (i.metodo_pago || '') + '</td>';
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
  var d = editData || { fecha: _contHoy(), concepto: '', monto: '', categoria: '', subcategoria: '', sucursal: currentUser?.sucursal || '', nota: '', metodo_pago: '' };
  var html = '<div style="background:var(--surface);border-radius:12px;padding:16px">';
  html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">';
  html += '<h4 style="font-size:13px;color:var(--text)">' + (editData ? '✏️ Editar gasto' : '+ Nuevo gasto') + '</h4>';
  html += '<button class="btn btn-g btn-sm" onclick="contCerrarFormGasto()" style="font-size:10px">✕ Cerrar</button>';
  html += '</div>';

  // Photo OCR
  html += '<div style="margin-bottom:12px;padding:10px;background:var(--surface2);border-radius:8px;border:1px dashed rgba(255,255,255,0.1)">';
  html += '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">';
  html += '<label style="cursor:pointer;font-size:11px;color:var(--accent)" for="cont-file">📎 Subir comprobante (OCR automático)</label>';
  html += '<input type="file" id="cont-file" accept="image/*,application/pdf,.pdf" capture="environment" style="display:none" onchange="contProcesarFoto(this)">';
  html += '<span style="font-size:9px;color:var(--muted)">Fotos, PDF</span>';
  html += '<span id="cont-ocr-status" style="font-size:10px;color:var(--muted)"></span>';
  html += '</div>';
  html += '<div id="cont-preview" style="display:none;margin-top:8px"><img id="cont-img" style="max-width:200px;border-radius:6px"></div>';
  html += '</div>';

  html += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:10px">';
  html += '<div><label style="font-size:10px;color:var(--muted);display:block;margin-bottom:2px">Fecha</label><input type="date" id="cont-fecha" value="' + d.fecha + '" style="width:100%;background:var(--surface2);border:1px solid rgba(255,255,255,0.1);border-radius:6px;padding:6px 8px;color:var(--text);font-size:12px"></div>';
  html += '<div><label style="font-size:10px;color:var(--muted);display:block;margin-bottom:2px">Monto</label><input type="number" id="cont-monto" value="' + (d.monto || '') + '" step="0.01" placeholder="0.00" style="width:100%;background:var(--surface2);border:1px solid rgba(255,255,255,0.1);border-radius:6px;padding:6px 8px;color:var(--text);font-size:12px"></div>';
  html += '<div><label style="font-size:10px;color:var(--muted);display:block;margin-bottom:2px">Sucursal</label><select id="cont-suc" style="width:100%;background:var(--surface2);border:1px solid rgba(255,255,255,0.1);border-radius:6px;padding:6px 8px;color:var(--text);font-size:12px">';
  html += '<option value=""' + (!d.sucursal ? ' selected' : '') + '>General</option>';
  ['Américas','Pinocelli','Magnolia'].forEach(function(s) {
    html += '<option' + (d.sucursal === s ? ' selected' : '') + '>' + s + '</option>';
  });
  html += '</select></div>';
  html += '<div><label style="font-size:10px;color:var(--muted);display:block;margin-bottom:2px">Método pago</label><select id="cont-metodo" style="width:100%;background:var(--surface2);border:1px solid rgba(255,255,255,0.1);border-radius:6px;padding:6px 8px;color:var(--text);font-size:12px">';
  ['Efectivo','Tarjeta','Transferencia','Cheque','Otro'].forEach(function(m) {
    html += '<option' + (d.metodo_pago === m ? ' selected' : '') + '>' + m + '</option>';
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

  var mediaType = file.type || 'image/jpeg';
  var isImage = mediaType.startsWith('image/');
  var isPDF = mediaType === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

  if (!isImage && !isPDF) {
    st.innerHTML = '<span style="color:#f87171">Formato no soportado. Usa foto o PDF.</span>';
    return;
  }

  // Preview (solo imágenes)
  if (isImage) {
    var reader = new FileReader();
    reader.onload = function(e) {
      document.getElementById('cont-img').src = e.target.result;
      document.getElementById('cont-preview').style.display = '';
    };
    reader.readAsDataURL(file);
  } else {
    document.getElementById('cont-preview').style.display = 'none';
  }

  var base64 = await new Promise(function(res, rej) {
    var r = new FileReader();
    r.onload = function() { res(r.result.split(',')[1]); };
    r.onerror = function() { rej(new Error('Error leyendo archivo')); };
    r.readAsDataURL(file);
  });

  // Construir content block según tipo de archivo
  var fileBlock;
  if (isPDF) {
    fileBlock = { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } };
  } else {
    fileBlock = { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } };
  }

  try {
    var resp = await fetch('/.netlify/functions/ia-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        max_tokens: 1024,
        system: 'Eres un asistente que extrae datos de comprobantes de gastos (tickets, facturas, recibos, PDFs, XMLs de CFDI). ' +
          'Extrae: concepto (qué se pagó), monto (total en MXN), fecha (YYYY-MM-DD), establecimiento/proveedor, método de pago. ' +
          'Si es un ticket de CFE/TELMEX/agua → categoría "Renta y servicios". Si es nómina → "Nómina y personal". ' +
          'Si es compra de materiales → "Proveedores/materiales". Si es otro → "Otros operativos". ' +
          'metodo_pago debe ser uno de: "Efectivo", "Tarjeta", "Transferencia", "Cheque", "Otro". Si no se puede determinar, usa "Otro". ' +
          'RESPONDE ÚNICAMENTE con JSON object sin markdown: {"concepto":"...","monto":123.45,"fecha":"2026-03-23","categoria":"...","subcategoria":"...","metodo_pago":"..."}',
        messages: [{
          role: 'user',
          content: [
            fileBlock,
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
    if (parsed.metodo_pago) document.getElementById('cont-metodo').value = parsed.metodo_pago;
    st.innerHTML = '<span style="color:#4ade80">✓ Datos extraídos' + (isPDF ? ' (PDF)' : '') + '</span>';

    // Upload solo imágenes a Supabase Storage (documentos no se guardan)
    if (isImage) {
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
    }
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
    var metodo_pago = document.getElementById('cont-metodo').value;
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
      sucursal: sucursal || null,
      metodo_pago: metodo_pago || null,
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
      // gastos: filter in JS to include General (null)
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
    var gastos = (results[2].data || []).filter(function(g) {
      if (_contSucursal) return !g.sucursal || g.sucursal === _contSucursal;
      return true;
    });
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
// TAB 4: FACTURACIÓN CFDI
// ═══════════════════════════════════════════════════════════

var _factCatalogos = {
  regimen: [
    {v:'601',t:'General de Ley Personas Morales'},
    {v:'603',t:'Personas Morales con Fines no Lucrativos'},
    {v:'605',t:'Sueldos y Salarios'},
    {v:'606',t:'Arrendamiento'},
    {v:'612',t:'Personas Físicas con Act. Empresarial'},
    {v:'616',t:'Sin obligaciones fiscales'},
    {v:'621',t:'Incorporación Fiscal'},
    {v:'625',t:'RESICO Personas Físicas'},
    {v:'626',t:'RESICO Personas Morales'}
  ],
  uso: [
    {v:'G01',t:'Adquisición de mercancías'},
    {v:'G03',t:'Gastos en general'},
    {v:'D01',t:'Honorarios médicos, dentales y gastos hospitalarios'},
    {v:'S01',t:'Sin efectos fiscales'}
  ],
  formaPago: [
    {v:'01',t:'Efectivo'},
    {v:'03',t:'Transferencia electrónica'},
    {v:'04',t:'Tarjeta de crédito'},
    {v:'28',t:'Tarjeta de débito'},
    {v:'99',t:'Por definir'}
  ]
};

// Store emitidas for local filtering
var _factEmitidas = [];

async function contRenderFacturacion() {
  var cont = document.getElementById('cont-content-facturacion');
  if (!cont) return;
  cont.innerHTML = '<div style="text-align:center;padding:32px;color:var(--muted);font-size:12px"><span class="spinner-sm"></span> Cargando facturas...</div>';

  try {
    var facturasRes = await db.from('facturas').select('*').order('created_at', { ascending: false }).limit(200);
    var allFacturas = facturasRes.data || [];
    var pendientes = allFacturas.filter(function(f) { return f.status === 'pending'; });
    _factEmitidas = allFacturas.filter(function(f) { return f.status !== 'pending'; });

    // Update sidebar badge
    _contActualizarBadgeFacturas(pendientes.length);

    var html = '<div style="display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin-bottom:16px">';
    html += '<button class="btn btn-p btn-sm" onclick="contMostrarFormFactura()" style="font-size:12px">🧾 Registrar factura</button>';
    html += '<span style="font-size:12px;color:var(--muted)">' + _factEmitidas.filter(function(f){return f.status==='valid'}).length + ' emitidas</span>';
    if (pendientes.length > 0) html += '<span style="font-size:11px;background:rgba(245,166,35,0.15);color:#f5a623;padding:3px 8px;border-radius:6px;font-weight:600">' + pendientes.length + ' pendientes</span>';
    html += '</div>';

    // Form container
    html += '<div id="cont-form-factura" style="display:none;margin-bottom:16px"></div>';

    // Pending requests
    if (pendientes.length > 0) {
      // Fetch venta status + paciente data for all pending
      var pendFolios = pendientes.map(function(p) { return p.venta_folio; });
      var { data: ventasStatus } = await db.from('ventas').select('folio,estado,total,paciente_id,pacientes(nombre,apellidos,datos_fiscales)').in('folio', pendFolios);
      var statusMap = {};
      (ventasStatus || []).forEach(function(v) { statusMap[v.folio] = v; });

      html += '<div style="background:var(--surface);border-radius:12px;padding:16px;margin-bottom:16px;border:1px solid rgba(245,166,35,0.15)">';
      html += '<h4 style="font-size:13px;margin-bottom:10px;color:#f5a623">📋 Solicitudes pendientes (' + pendientes.length + ')</h4>';

      pendientes.forEach(function(p) {
        var vs = statusMap[p.venta_folio] || {};
        var esLiquidada = vs.estado === 'Liquidada';
        var pac = vs.pacientes || {};
        var pacNombre = pac.nombre ? (pac.nombre + ' ' + (pac.apellidos || '')).trim() : '';
        var df = pac.datos_fiscales || {};
        if (typeof df === 'string') try { df = JSON.parse(df); } catch(e) { df = {}; }

        // Card per pending request
        html += '<div style="background:var(--surface2);border-radius:10px;padding:12px;margin-bottom:8px;border:1px solid rgba(255,255,255,0.04)">';
        // Header row
        html += '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;cursor:pointer" onclick="this.parentElement.querySelector(\'.fact-detail\').style.display=this.parentElement.querySelector(\'.fact-detail\').style.display===\'none\'?\'\':\'none\'">';
        html += '<span style="font-weight:700;font-size:13px;color:var(--beige)">' + p.venta_folio + '</span>';
        html += '<span style="font-size:11px;color:var(--text)">' + (p.rfc_cliente || '') + '</span>';
        html += '<span style="font-size:11px;color:var(--muted)">' + (p.razon_social || '') + '</span>';
        html += '<span style="font-size:9px;padding:2px 6px;border-radius:4px;font-weight:600;' + (esLiquidada ? 'background:rgba(74,222,128,0.15);color:#4ade80' : 'background:rgba(245,166,35,0.15);color:#f5a623') + '">' + (vs.estado || '—') + '</span>';
        if (vs.total) html += '<span style="font-size:11px;color:var(--accent);font-weight:600;margin-left:auto">' + _contMoney(vs.total) + '</span>';
        html += '<span style="font-size:10px;color:var(--muted)">▼</span>';
        html += '</div>';

        // Expandable detail
        html += '<div class="fact-detail" style="display:none;margin-top:10px;padding-top:10px;border-top:1px solid rgba(255,255,255,0.06)">';
        html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;font-size:11px;margin-bottom:10px">';
        if (pacNombre) html += '<div><span style="color:var(--muted);font-size:9px;display:block">PACIENTE</span>' + pacNombre + '</div>';
        html += '<div><span style="color:var(--muted);font-size:9px;display:block">RFC</span>' + (p.rfc_cliente || '—') + '</div>';
        html += '<div><span style="color:var(--muted);font-size:9px;display:block">RAZÓN SOCIAL</span>' + (p.razon_social || '—') + '</div>';

        // Show fiscal data from patient or from request context
        var regLabel = '';
        if (df.regimen_fiscal) {
          var found = (_factCatalogos.regimen || []).find(function(r) { return r.v === df.regimen_fiscal; });
          regLabel = found ? df.regimen_fiscal + ' - ' + found.t : df.regimen_fiscal;
        }
        html += '<div><span style="color:var(--muted);font-size:9px;display:block">RÉGIMEN</span>' + (regLabel || '—') + '</div>';
        html += '<div><span style="color:var(--muted);font-size:9px;display:block">CP FISCAL</span>' + (df.cp_fiscal || '—') + '</div>';
        html += '<div><span style="color:var(--muted);font-size:9px;display:block">EMAIL</span>' + (df.email || '—') + '</div>';
        html += '<div><span style="color:var(--muted);font-size:9px;display:block">SOLICITADO</span>' + _contFechaCorta(p.created_at?.substring(0, 10)) + '</div>';
        html += '<div><span style="color:var(--muted);font-size:9px;display:block">TOTAL VENTA</span>' + (vs.total ? _contMoney(vs.total) : '—') + '</div>';
        html += '</div>';

        // Actions
        html += '<div style="display:flex;gap:6px;flex-wrap:wrap">';
        if (esLiquidada) {
          html += '<button class="btn btn-p" style="padding:5px 14px;font-size:11px" onclick="event.stopPropagation();contMarcarEmitidaRapido(' + p.id + ',\'' + p.venta_folio + '\')">✅ Marcar emitida</button>';
          html += '<button class="btn btn-g" style="padding:5px 10px;font-size:11px" onclick="event.stopPropagation();contFacturarDesdeHistorial(\'' + p.venta_folio + '\')">📝 Editar y emitir</button>';
        } else {
          html += '<span style="font-size:11px;color:var(--muted);padding:5px 0">⏳ Esperando pago — no se puede emitir</span>';
        }
        html += '<button class="btn btn-g" style="padding:5px 8px;font-size:11px;color:#f87171" onclick="event.stopPropagation();contEliminarSolicitud(' + p.id + ')">✕ Eliminar</button>';
        html += '</div>';

        html += '</div>'; // fact-detail
        html += '</div>'; // card
      });
      html += '</div>'; // section
    }

    // ── Emitidas section with search & filters ──
    html += '<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:12px">';
    html += '<h4 style="font-size:13px;color:var(--text);margin:0">Facturas emitidas</h4>';
    html += '<input type="text" id="fact-search" placeholder="Buscar folio, RFC o razón social..." oninput="contFiltrarEmitidas()" style="flex:1;min-width:180px;background:var(--surface);border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:6px 10px;color:var(--text);font-size:11px">';
    html += '<select id="fact-periodo" onchange="contFiltrarEmitidas()" style="background:var(--surface);border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:6px 8px;color:var(--text);font-size:11px">';
    html += '<option value="all">Todo</option><option value="1">Este mes</option><option value="3">Últimos 3 meses</option><option value="12">Último año</option>';
    html += '</select>';
    html += '<span id="fact-count" style="font-size:10px;color:var(--muted)"></span>';
    html += '</div>';
    html += '<div id="fact-emitidas-table"></div>';

    cont.innerHTML = html;
    contFiltrarEmitidas();
  } catch(err) {
    cont.innerHTML = '<div style="padding:24px;text-align:center;color:#f87171;font-size:12px">Error: ' + err.message + '</div>';
  }
}

function contFiltrarEmitidas() {
  var search = (document.getElementById('fact-search')?.value || '').trim().toLowerCase();
  var periodo = document.getElementById('fact-periodo')?.value || 'all';
  var container = document.getElementById('fact-emitidas-table');
  if (!container) return;

  var filtered = _factEmitidas;

  // Filter by search
  if (search) {
    filtered = filtered.filter(function(f) {
      return (f.venta_folio || '').toLowerCase().indexOf(search) >= 0 ||
        (f.rfc_cliente || '').toLowerCase().indexOf(search) >= 0 ||
        (f.razon_social || '').toLowerCase().indexOf(search) >= 0;
    });
  }

  // Filter by period
  if (periodo !== 'all') {
    var meses = parseInt(periodo);
    var desde = new Date();
    desde.setMonth(desde.getMonth() - meses);
    var desdeStr = desde.toISOString().substring(0, 10);
    filtered = filtered.filter(function(f) {
      return (f.created_at || '') >= desdeStr;
    });
  }

  document.getElementById('fact-count').textContent = filtered.length + ' resultado' + (filtered.length !== 1 ? 's' : '');

  if (filtered.length === 0) {
    container.innerHTML = '<div style="padding:24px;text-align:center;color:var(--muted);font-size:12px">Sin facturas' + (search ? ' para "' + search + '"' : '') + '</div>';
    return;
  }

  var html = '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12px">';
  html += '<thead><tr style="border-bottom:1px solid rgba(255,255,255,0.08)">';
  html += '<th style="padding:8px;text-align:left;color:var(--muted);font-size:10px">FOLIO</th>';
  html += '<th style="padding:8px;text-align:left;color:var(--muted);font-size:10px">RFC</th>';
  html += '<th style="padding:8px;text-align:left;color:var(--muted);font-size:10px">RAZÓN SOCIAL</th>';
  html += '<th style="padding:8px;text-align:right;color:var(--muted);font-size:10px">TOTAL</th>';
  html += '<th style="padding:8px;text-align:left;color:var(--muted);font-size:10px">FECHA</th>';
  html += '<th style="padding:8px;text-align:center;color:var(--muted);font-size:10px">STATUS</th>';
  html += '</tr></thead><tbody>';
  filtered.forEach(function(f) {
    var isCancelled = f.status === 'cancelled';
    html += '<tr style="border-bottom:1px solid rgba(255,255,255,0.04);' + (isCancelled ? 'opacity:0.5' : '') + '">';
    html += '<td style="padding:8px;font-weight:600">' + f.venta_folio + '</td>';
    html += '<td style="padding:8px">' + (f.rfc_cliente || '—') + '</td>';
    html += '<td style="padding:8px;color:var(--muted)">' + (f.razon_social || '—') + '</td>';
    html += '<td style="padding:8px;text-align:right;color:var(--accent)">' + _contMoney(f.total) + '</td>';
    html += '<td style="padding:8px;color:var(--muted)">' + _contFechaCorta(f.created_at?.substring(0, 10)) + '</td>';
    html += '<td style="padding:8px;text-align:center"><span style="font-size:9px;padding:2px 6px;border-radius:4px;font-weight:600;' + (isCancelled ? 'background:rgba(248,113,113,0.15);color:#f87171' : 'background:rgba(74,222,128,0.15);color:#4ade80') + '">' + (isCancelled ? 'Cancelada' : 'Emitida') + '</span></td>';
    html += '</tr>';
  });
  html += '</tbody></table></div>';
  container.innerHTML = html;
}

function _contActualizarBadgeFacturas(count) {
  var badge = document.getElementById('badge-facturas');
  if (badge) {
    badge.style.display = count > 0 ? '' : 'none';
    badge.textContent = count;
  }
}

function contMostrarFormFactura() {
  var f = document.getElementById('cont-form-factura');
  if (!f) return;
  var html = '<div style="background:var(--surface);border-radius:12px;padding:16px">';
  html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">';
  html += '<h4 style="font-size:13px;color:var(--text)">🧾 Registrar factura emitida</h4>';
  html += '<button class="btn btn-g btn-sm" onclick="contCerrarFormFactura()" style="font-size:10px">✕ Cerrar</button>';
  html += '</div>';

  // Buscar venta
  html += '<div style="margin-bottom:12px"><label style="font-size:10px;color:var(--muted);display:block;margin-bottom:2px">Folio de venta</label>';
  html += '<div style="display:flex;gap:8px"><input type="text" id="fact-folio" placeholder="Ej: AME-0001" style="flex:1;background:var(--surface2);border:1px solid rgba(255,255,255,0.1);border-radius:6px;padding:6px 8px;color:var(--text);font-size:12px">';
  html += '<button class="btn btn-g btn-sm" onclick="contBuscarVentaFactura()" style="font-size:11px">Buscar</button></div></div>';

  // Venta preview
  html += '<div id="fact-venta-preview" style="display:none;margin-bottom:12px;padding:10px;background:var(--surface2);border-radius:8px"></div>';

  // Datos fiscales
  html += '<div id="fact-datos-fiscales" style="display:none">';
  html += '<h5 style="font-size:12px;color:var(--text);margin-bottom:8px">Datos fiscales del cliente</h5>';
  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">';
  html += '<div><label style="font-size:10px;color:var(--muted);display:block;margin-bottom:2px">RFC</label><input type="text" id="fact-rfc" placeholder="XAXX010101000" maxlength="13" style="width:100%;background:var(--surface2);border:1px solid rgba(255,255,255,0.1);border-radius:6px;padding:6px 8px;color:var(--text);font-size:12px;text-transform:uppercase"></div>';
  html += '<div><label style="font-size:10px;color:var(--muted);display:block;margin-bottom:2px">Razón social</label><input type="text" id="fact-razon" placeholder="Nombre o empresa" style="width:100%;background:var(--surface2);border:1px solid rgba(255,255,255,0.1);border-radius:6px;padding:6px 8px;color:var(--text);font-size:12px"></div>';
  html += '</div>';
  html += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-top:10px">';

  html += '<div><label style="font-size:10px;color:var(--muted);display:block;margin-bottom:2px">Régimen fiscal</label><select id="fact-regimen" style="width:100%;background:var(--surface2);border:1px solid rgba(255,255,255,0.1);border-radius:6px;padding:6px 8px;color:var(--text);font-size:11px"><option value="">Seleccionar...</option>';
  _factCatalogos.regimen.forEach(function(r) { html += '<option value="' + r.v + '">' + r.v + ' - ' + r.t + '</option>'; });
  html += '</select></div>';

  html += '<div><label style="font-size:10px;color:var(--muted);display:block;margin-bottom:2px">Código Postal fiscal</label><input type="text" id="fact-cp" placeholder="32000" maxlength="5" style="width:100%;background:var(--surface2);border:1px solid rgba(255,255,255,0.1);border-radius:6px;padding:6px 8px;color:var(--text);font-size:12px"></div>';

  html += '<div><label style="font-size:10px;color:var(--muted);display:block;margin-bottom:2px">Uso CFDI</label><select id="fact-uso" style="width:100%;background:var(--surface2);border:1px solid rgba(255,255,255,0.1);border-radius:6px;padding:6px 8px;color:var(--text);font-size:11px">';
  _factCatalogos.uso.forEach(function(u) { html += '<option value="' + u.v + '"' + (u.v === 'G03' ? ' selected' : '') + '>' + u.v + ' - ' + u.t + '</option>'; });
  html += '</select></div>';
  html += '</div>';

  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px">';
  html += '<div><label style="font-size:10px;color:var(--muted);display:block;margin-bottom:2px">Email del cliente (opcional)</label><input type="email" id="fact-email" placeholder="cliente@email.com" style="width:100%;background:var(--surface2);border:1px solid rgba(255,255,255,0.1);border-radius:6px;padding:6px 8px;color:var(--text);font-size:12px"></div>';
  html += '<div><label style="font-size:10px;color:var(--muted);display:block;margin-bottom:2px">UUID fiscal (opcional)</label><input type="text" id="fact-uuid" placeholder="UUID de la factura emitida en SAT" style="width:100%;background:var(--surface2);border:1px solid rgba(255,255,255,0.1);border-radius:6px;padding:6px 8px;color:var(--text);font-size:12px"></div>';
  html += '</div>';

  html += '<div style="margin-top:12px"><button class="btn btn-p btn-sm" id="fact-btn-emitir" onclick="contEmitirFactura()" style="font-size:12px">✅ Marcar como emitida</button></div>';
  html += '</div>';

  html += '</div>';
  f.innerHTML = html;
  f.style.display = '';
}

function contCerrarFormFactura() {
  var f = document.getElementById('cont-form-factura');
  if (f) { f.style.display = 'none'; f.innerHTML = ''; }
  window._factVentaFolio = null;
}

async function contBuscarVentaFactura() {
  var folio = (document.getElementById('fact-folio').value || '').trim().toUpperCase();
  if (!folio) { toast('Ingresa un folio', 'warn'); return; }

  var preview = document.getElementById('fact-venta-preview');
  preview.innerHTML = '<span style="font-size:11px;color:var(--muted)">Buscando...</span>';
  preview.style.display = '';

  try {
    // Search by exact folio or partial match
    var { data: ventas } = await db.from('ventas').select('folio,total,sucursal,estado,created_at,paciente_id,asesor,pacientes(nombre,apellidos)').ilike('folio', '%' + folio + '%').order('created_at', { ascending: false }).limit(5);
    var venta = ventas && ventas[0];
    if (!venta) { preview.innerHTML = '<span style="font-size:11px;color:#f87171">Venta no encontrada</span>'; return; }
    // If multiple matches, show selector
    if (ventas.length > 1) {
      var opts = ventas.map(function(v) {
        return '<div style="padding:6px 8px;cursor:pointer;border-bottom:1px solid rgba(255,255,255,0.04);font-size:11px" onmouseover="this.style.background=\'var(--surface2)\'" onmouseout="this.style.background=\'transparent\'" onclick="document.getElementById(\'fact-folio\').value=\'' + v.folio + '\';contBuscarVentaFactura()"><b>' + v.folio + '</b> · ' + (v.pacientes ? (v.pacientes.nombre + ' ' + (v.pacientes.apellidos||'')).trim() : '—') + ' · ' + v.sucursal + ' · $' + Number(v.total).toFixed(2) + '</div>';
      }).join('');
      preview.innerHTML = '<div style="font-size:10px;color:var(--muted);margin-bottom:4px">Múltiples resultados — selecciona:</div>' + opts;
      return;
    }
    if (venta.estado === 'Cancelada') { preview.innerHTML = '<span style="font-size:11px;color:#f87171">Esta venta está cancelada</span>'; return; }
    if (venta.estado !== 'Liquidada') { preview.innerHTML = '<span style="font-size:11px;color:#f5a623">Solo se puede facturar ventas liquidadas (saldo $0). Esta venta tiene estado: ' + venta.estado + '</span>'; return; }

    // Check if already invoiced
    var { data: existing } = await db.from('facturas').select('id').eq('venta_folio', venta.folio).eq('status', 'valid').limit(1);
    if (existing && existing.length > 0) { preview.innerHTML = '<span style="font-size:11px;color:#f5a623">Esta venta ya tiene factura vigente</span>'; return; }

    window._factVentaFolio = venta.folio;
    preview.innerHTML = '<div style="display:flex;justify-content:space-between;font-size:12px"><span><b>' + venta.folio + '</b> · ' + (venta.pacientes ? (venta.pacientes.nombre + ' ' + (venta.pacientes.apellidos||'')).trim() : '—') + ' · ' + venta.sucursal + '</span><span style="font-weight:700;color:var(--accent)">' + _contMoney(venta.total) + '</span></div>';

    // Show fiscal data form
    document.getElementById('fact-datos-fiscales').style.display = '';

    // Auto-fill if patient has saved fiscal data
    if (venta.paciente_id) {
      try {
        var { data: pac } = await db.from('pacientes').select('datos_fiscales').eq('id', venta.paciente_id).single();
        if (pac && pac.datos_fiscales) {
          var df = typeof pac.datos_fiscales === 'string' ? JSON.parse(pac.datos_fiscales) : pac.datos_fiscales;
          if (df.rfc) document.getElementById('fact-rfc').value = df.rfc;
          if (df.razon_social) document.getElementById('fact-razon').value = df.razon_social;
          if (df.regimen_fiscal) document.getElementById('fact-regimen').value = df.regimen_fiscal;
          if (df.cp_fiscal) document.getElementById('fact-cp').value = df.cp_fiscal;
          if (df.uso_cfdi) document.getElementById('fact-uso').value = df.uso_cfdi;
          if (df.email) document.getElementById('fact-email').value = df.email;
          preview.innerHTML += '<div style="font-size:10px;color:#4ade80;margin-top:4px">✓ Datos fiscales cargados del paciente</div>';
        }
      } catch(e) {}
    }
  } catch(err) {
    preview.innerHTML = '<span style="font-size:11px;color:#f87171">Error: ' + err.message + '</span>';
  }
}

async function contEmitirFactura() {
  if (window._actionBusy && window._actionBusy['emitirFactura']) return;
  if (!window._actionBusy) window._actionBusy = {};
  window._actionBusy['emitirFactura'] = true;
  var btn = document.getElementById('fact-btn-emitir');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Guardando...'; }

  try {
    var folio = window._factVentaFolio;
    if (!folio) { toast('Busca una venta primero', 'warn'); return; }

    var rfc = (document.getElementById('fact-rfc').value || '').trim().toUpperCase();
    var razon = (document.getElementById('fact-razon').value || '').trim();
    var regimen = document.getElementById('fact-regimen').value;
    var cp = (document.getElementById('fact-cp').value || '').trim();
    var uso = document.getElementById('fact-uso').value;
    var email = (document.getElementById('fact-email').value || '').trim();
    var uuid = (document.getElementById('fact-uuid').value || '').trim();

    if (!rfc || !razon) {
      toast('Completa al menos RFC y razón social', 'warn');
      return;
    }

    // Get venta total
    var { data: ventas } = await db.from('ventas').select('total,paciente_id').eq('folio', folio).limit(1);
    var venta = ventas && ventas[0];

    // Delete pending request if exists, then insert as valid
    try { await db.from('facturas').delete().eq('venta_folio', folio).eq('status', 'pending'); } catch(e) {}

    await db.from('facturas').insert({
      venta_folio: folio,
      facturapi_id: uuid || ('manual_' + Date.now()),
      rfc_cliente: rfc,
      razon_social: razon,
      total: venta ? Number(venta.total) : 0,
      status: 'valid'
    });

    // Save fiscal data to patient for reuse
    if (venta && venta.paciente_id) {
      try {
        await db.from('pacientes').update({
          datos_fiscales: { rfc: rfc, razon_social: razon, regimen_fiscal: regimen, cp_fiscal: cp, uso_cfdi: uso, email: email }
        }).eq('id', venta.paciente_id);
      } catch(e) {}
    }

    toast('Factura registrada como emitida', 'ok');
    contCerrarFormFactura();
    contRenderFacturacion();
  } catch(err) {
    toast('Error: ' + err.message, 'err');
  } finally {
    window._actionBusy['emitirFactura'] = false;
    if (btn) { btn.disabled = false; btn.textContent = '✅ Marcar como emitida'; }
  }
}

async function contMarcarEmitidaRapido(facturaId, folio) {
  if (!confirm('¿Marcar la factura de ' + folio + ' como emitida?')) return;
  try {
    var upd = { status: 'valid', facturapi_id: 'manual_' + Date.now() };
    // Ensure total is set from the actual venta (solicitudes from portal may have total=0)
    var { data: ventas } = await db.from('ventas').select('total').eq('folio', folio).limit(1);
    if (ventas && ventas[0] && Number(ventas[0].total) > 0) upd.total = Number(ventas[0].total);
    await db.from('facturas').update(upd).eq('id', facturaId);
    toast('Factura marcada como emitida', 'ok');
    contRenderFacturacion();
  } catch(err) {
    toast('Error: ' + err.message, 'err');
  }
}

async function contEliminarSolicitud(id) {
  if (!confirm('¿Eliminar esta solicitud de factura?')) return;
  try {
    await db.from('facturas').delete().eq('id', id);
    toast('Solicitud eliminada', 'ok');
    contRenderFacturacion();
  } catch(err) { toast('Error: ' + err.message, 'err'); }
}

// Helper: facturar desde historial de ventas (Nancy va directo a emitir)
function contFacturarDesdeHistorial(folio) {
  go('contabilidad');
  setTimeout(function() {
    contSwitchTab('facturacion');
    setTimeout(function() {
      contMostrarFormFactura();
      setTimeout(function() {
        document.getElementById('fact-folio').value = folio;
        contBuscarVentaFactura();
      }, 100);
    }, 200);
  }, 300);
}

// ═══════════════════════════════════════════════════════════
// SOLICITUD DE FACTURA (empleados guardan datos fiscales)
// ═══════════════════════════════════════════════════════════

async function contSolicitarFactura(folio, ventaId) {
  // Check if already has factura
  var { data: existFact } = await db.from('facturas').select('id,status').eq('venta_folio', folio).limit(1);
  if (existFact && existFact.length > 0) {
    if (existFact[0].status === 'valid') {
      toast('Esta venta ya tiene factura emitida', 'warn');
      return;
    }
    if (existFact[0].status === 'pending') {
      toast('Ya hay solicitud de factura para esta venta', 'warn');
      return;
    }
  }

  // Check if patient has saved fiscal data
  var datosPrev = {};
  try {
    var { data: venta } = await db.from('ventas').select('paciente_id').eq('folio', folio).limit(1);
    if (venta && venta[0] && venta[0].paciente_id) {
      var { data: pac } = await db.from('pacientes').select('datos_fiscales').eq('id', venta[0].paciente_id).limit(1);
      if (pac && pac[0] && pac[0].datos_fiscales) {
        datosPrev = typeof pac[0].datos_fiscales === 'string' ? JSON.parse(pac[0].datos_fiscales) : pac[0].datos_fiscales;
      }
    }
  } catch(e) {}

  // Show inline modal in the venta detail
  var wrap = document.getElementById('mvta-acciones');
  if (!wrap) return;
  var html = '<div style="background:var(--surface2);border-radius:10px;padding:12px;margin-top:8px;border:1px solid rgba(196,162,101,0.2)" id="fact-solicitud-form">';
  html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><b style="font-size:12px;color:var(--beige)">🧾 Datos fiscales para factura</b><button class="btn btn-g" style="padding:2px 6px;font-size:10px" onclick="document.getElementById(\'fact-solicitud-form\').remove()">✕</button></div>';
  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">';
  html += '<div><label style="font-size:9px;color:var(--muted)">RFC</label><input type="text" id="sf-rfc" value="' + (datosPrev.rfc || '') + '" placeholder="XAXX010101000" maxlength="13" style="width:100%;padding:5px 6px;background:var(--surface);border:1px solid rgba(255,255,255,0.1);border-radius:6px;color:var(--text);font-size:11px;text-transform:uppercase;box-sizing:border-box"></div>';
  html += '<div><label style="font-size:9px;color:var(--muted)">Razón social</label><input type="text" id="sf-razon" value="' + (datosPrev.razon_social || '') + '" placeholder="Nombre o empresa" style="width:100%;padding:5px 6px;background:var(--surface);border:1px solid rgba(255,255,255,0.1);border-radius:6px;color:var(--text);font-size:11px;box-sizing:border-box"></div>';
  html += '</div>';
  html += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:6px">';
  html += '<div><label style="font-size:9px;color:var(--muted)">Régimen</label><select id="sf-regimen" style="width:100%;padding:5px 4px;background:var(--surface);border:1px solid rgba(255,255,255,0.1);border-radius:6px;color:var(--text);font-size:10px;box-sizing:border-box"><option value="">Seleccionar</option>';
  _factCatalogos.regimen.forEach(function(r) { html += '<option value="' + r.v + '"' + (datosPrev.regimen_fiscal === r.v ? ' selected' : '') + '>' + r.v + ' - ' + r.t + '</option>'; });
  html += '</select></div>';
  html += '<div><label style="font-size:9px;color:var(--muted)">CP fiscal</label><input type="text" id="sf-cp" value="' + (datosPrev.cp_fiscal || '') + '" placeholder="32000" maxlength="5" style="width:100%;padding:5px 6px;background:var(--surface);border:1px solid rgba(255,255,255,0.1);border-radius:6px;color:var(--text);font-size:11px;box-sizing:border-box"></div>';
  html += '<div><label style="font-size:9px;color:var(--muted)">Email</label><input type="text" id="sf-email" value="' + (datosPrev.email || '') + '" placeholder="email" style="width:100%;padding:5px 6px;background:var(--surface);border:1px solid rgba(255,255,255,0.1);border-radius:6px;color:var(--text);font-size:11px;box-sizing:border-box"></div>';
  html += '</div>';
  html += '<button class="btn btn-p btn-sm" id="sf-btn" onclick="contGuardarSolicitud(\'' + folio + '\')" style="margin-top:8px;font-size:11px">Guardar solicitud de factura</button>';
  html += '</div>';

  // Remove existing form if any
  var old = document.getElementById('fact-solicitud-form');
  if (old) old.remove();
  wrap.insertAdjacentHTML('beforeend', html);
}

async function contGuardarSolicitud(folio) {
  var btn = document.getElementById('sf-btn');
  if (btn.disabled) return;
  btn.disabled = true;
  btn.textContent = '⏳ Guardando...';

  try {
    var rfc = (document.getElementById('sf-rfc').value || '').trim().toUpperCase();
    var razon = (document.getElementById('sf-razon').value || '').trim();
    var regimen = document.getElementById('sf-regimen').value;
    var cp = (document.getElementById('sf-cp').value || '').trim();
    var email = (document.getElementById('sf-email').value || '').trim();

    if (!rfc || !razon) { toast('Mínimo RFC y razón social', 'warn'); return; }

    // Save as pending factura request
    await db.from('facturas').insert({
      venta_folio: folio,
      facturapi_id: 'pending_' + Date.now(),
      rfc_cliente: rfc,
      razon_social: razon,
      total: 0,
      status: 'pending'
    });

    // Save fiscal data to patient
    try {
      var { data: venta } = await db.from('ventas').select('paciente_id').eq('folio', folio).limit(1);
      if (venta && venta[0] && venta[0].paciente_id) {
        await db.from('pacientes').update({
          datos_fiscales: { rfc: rfc, razon_social: razon, regimen_fiscal: regimen, cp_fiscal: cp, email: email }
        }).eq('id', venta[0].paciente_id);
      }
    } catch(e) {}

    toast('Solicitud de factura guardada', 'ok');
    var form = document.getElementById('fact-solicitud-form');
    if (form) form.innerHTML = '<div style="padding:8px;text-align:center;color:#4ade80;font-size:11px">✓ Solicitud guardada — Nancy la verá en Contabilidad</div>';
  } catch(err) {
    toast('Error: ' + err.message, 'err');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Guardar solicitud de factura'; }
  }
}
