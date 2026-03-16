// mod-catalogo.js — Extracted from index.html
// Lines 14830-15057

var REGLAS_MAP = {'VS':'VS','Monofocal':'VS','Ocupacional':'VS','Bifocal F/T':'Bif F/T','Bifocal Blended':'Bif Semi-invisible','Progresivo':'Progresivo'};
var _reglasCache = null;

async function cargarReglasMateriales() {
  if (_reglasCache) return _reglasCache;
  var resp = await db.from('reglas_materiales').select('*').eq('activo', true);
  if (resp.error) { console.error('Error cargando reglas:', resp.error); return []; }
  _reglasCache = resp.data || [];
  return _reglasCache;
}

function getTipoVisionDB() {
  var tip = document.getElementById('o-tip') ? document.getElementById('o-tip').value : '';
  return REGLAS_MAP[tip] || tip;
}

async function cascadeMaterial() {
  try {
    var reglas = await cargarReglasMateriales();
    var tv = getTipoVisionDB();
    var matSel = document.getElementById('o-mat');
    var traSel = document.getElementById('o-tra');
    var serieSel = document.getElementById('o-serie');
    matSel.innerHTML = '<option value="">\u2014 Seleccionar \u2014</option>';
    traSel.innerHTML = '<option value="">\u2014 Seleccionar \u2014</option>';
    if (serieSel) serieSel.value = '';
    var mpd = document.getElementById('mat-precio-display');
    if (mpd) mpd.style.display = 'none';
    
    if (tv === 'Ocupacional' || !tv) {
      ['CR-39','Hi Index','Policarbonato','Ultra-thin 1.67','Super Ultra-thin 1.74'].forEach(function(m){
        matSel.innerHTML += '<option value="'+m+'">'+m+'</option>';
      });
      return;
    }
    console.log('cascadeMat: tv='+tv+' reglas='+reglas.length);
    var mats = [...new Set(reglas.filter(function(r){return r.tipo_vision===tv && r.material;}).map(function(r){return r.material;}))];
    console.log('cascadeMat: found '+mats.length+' materials:', mats);
    var ord = ['CR-39','Hi Index','Policarbonato','Ultra-thin 1.67','Super Ultra-thin 1.74'];
    mats.sort(function(a,b){return (ord.indexOf(a)===-1?99:ord.indexOf(a))-(ord.indexOf(b)===-1?99:ord.indexOf(b));});
    mats.forEach(function(m){ matSel.innerHTML += '<option value="'+m+'">'+m+'</option>'; });
  } catch(e) { console.error('cascadeMaterial error:', e); toast('Error cargando materiales: '+e.message, true); }
}

async function cascadeTratamiento() {
  try {
    var reglas = await cargarReglasMateriales();
    var tv = getTipoVisionDB();
    var mat = document.getElementById('o-mat').value;
    var traSel = document.getElementById('o-tra');
    var serieSel = document.getElementById('o-serie');
    traSel.innerHTML = '<option value="">\u2014 Seleccionar \u2014</option>';
    if (serieSel) serieSel.value = '';
    var mpd = document.getElementById('mat-precio-display');
    if (mpd) mpd.style.display = 'none';
    if (!mat || !tv) { console.log('cascadeTra: no mat/tv', mat, tv); return; }
    console.log('cascadeTra: tv='+tv+' mat='+mat+' reglas='+reglas.length);
    var trats = [...new Set(reglas.filter(function(r){return r.tipo_vision===tv && r.material===mat;}).map(function(r){return r.tratamiento;}))];
    console.log('cascadeTra: found '+trats.length+' tratamientos:', trats);
    var ord = ['Blanco','AR','Anti-Blue AR','Blue Light','Foto AR','Foto Sin AR','Foto Anti-Blue AR','Foto Blue Light','Foto Blue Light Gen 9','Foto Colors','Polarizado','Panoramic 360 Blue','Panoramic 360 Foto','Tinte Solar'];
    trats.sort(function(a,b){var ia=ord.indexOf(a),ib=ord.indexOf(b);return (ia===-1?99:ia)-(ib===-1?99:ib);});
    trats.forEach(function(t){ traSel.innerHTML += '<option value="'+t+'">'+t+'</option>'; });
    if (trats.length === 0) { console.warn('cascadeTra: 0 results. Sample reglas:', reglas.slice(0,3)); }
  } catch(e) { console.error('cascadeTratamiento error:', e); toast('Error cargando tratamientos: '+e.message, true); }
}

async function cascadeSerie() {
  var reglas = await cargarReglasMateriales();
  var tv = getTipoVisionDB();
  var mat = document.getElementById('o-mat').value;
  var tra = document.getElementById('o-tra').value;
  var serieSel = document.getElementById('o-serie');
  if (!serieSel) return;
  if (!mat || !tra || !tv) {
    var mpd = document.getElementById('mat-precio-display');
    if (mpd) mpd.style.display = 'none';
    return;
  }
  var series = [...new Set(reglas.filter(function(r){return r.tipo_vision===tv && r.material===mat && r.tratamiento===tra;}).map(function(r){return r.serie;}))];
  serieSel.innerHTML = '<option value="">\u2014</option>';
  if (series.includes(1)) serieSel.innerHTML += '<option value="1">Serie 1</option>';
  if (series.includes(2)) serieSel.innerHTML += '<option value="2">Serie 2</option>';
  if (series.length === 1) { serieSel.value = series[0]; mostrarPrecioMaterial(); }
  else { autoDetectSerie(); }
}

function autoDetectSerie() {
  var odEsf = parseFloat(document.getElementById('o-od-esf') ? document.getElementById('o-od-esf').value : 0) || 0;
  var oiEsf = parseFloat(document.getElementById('o-oi-esf') ? document.getElementById('o-oi-esf').value : 0) || 0;
  var odCil = parseFloat(document.getElementById('o-od-cil') ? document.getElementById('o-od-cil').value : 0) || 0;
  var oiCil = parseFloat(document.getElementById('o-oi-cil') ? document.getElementById('o-oi-cil').value : 0) || 0;
  var maxEsf = Math.max(Math.abs(odEsf), Math.abs(oiEsf));
  var maxCil = Math.max(Math.abs(odCil), Math.abs(oiCil));
  var tv = getTipoVisionDB();
  var serie = 1;
  if (tv === 'VS') {
    if (maxEsf > 5.50 || maxCil > 2.00) serie = 2;
  } else {
    if (maxEsf > 3.00 || maxCil > 0) serie = 2;
  }
  var serieSel = document.getElementById('o-serie');
  if (serieSel) {
    var opt = serieSel.querySelector('option[value="'+serie+'"]');
    if (opt) { serieSel.value = serie; mostrarPrecioMaterial(); }
  }
}

async function mostrarPrecioMaterial() {
  var reglas = await cargarReglasMateriales();
  var tv = getTipoVisionDB();
  var mat = document.getElementById('o-mat').value;
  var tra = document.getElementById('o-tra').value;
  var serie = parseInt(document.getElementById('o-serie') ? document.getElementById('o-serie').value : 0) || 0;
  var display = document.getElementById('mat-precio-display');
  var valor = document.getElementById('mat-precio-valor');
  var nota = document.getElementById('mat-precio-nota');
  if (!display) return;
  if (!tv || !mat || !tra || !serie) { display.style.display='none'; return; }
  var matches = reglas.filter(function(r){return r.tipo_vision===tv && r.material===mat && r.tratamiento===tra && r.serie===serie;});
  if (matches.length === 1) {
    valor.textContent = '$'+Number(matches[0].precio).toLocaleString('es-MX');
    nota.textContent = matches[0].nota || '';
    display.style.display = '';
  } else if (matches.length > 1) {
    var precios = matches.map(function(r){return Number(r.precio);});
    valor.textContent = '$'+Math.min.apply(null,precios).toLocaleString('es-MX')+' - $'+Math.max.apply(null,precios).toLocaleString('es-MX');
    nota.textContent = 'Precio depende del rango de graduacion';
    display.style.display = '';
  } else {
    display.style.display = 'none';
  }
}

document.addEventListener('DOMContentLoaded', function() {
  setTimeout(cascadeMaterial, 500);
  // Pre-fill year 2026 in date fields
  const today = new Date().toISOString().slice(0,10);
  const minDate = new Date().getFullYear() + '-01-01';
  document.querySelectorAll('input[type="date"]').forEach(function(el) {
    if (!el.value && !el.dataset.noDefault) { el.min = minDate; }
  });
  // Set fecha entrega defaults
  ['ord-entrega','vta-fecha-entrega'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el && !el.value) el.min = minDate;
  });
});

function loadCatalogoView() { loadCatalogoTab('VS'); }

async function loadCatalogoTab(tv) {
  document.querySelectorAll('#catv-tabs button').forEach(function(b) {
    b.style.background = '';
    b.style.color = '';
  });
  var tabMap = {'VS':'catv-tab-VS','Bif F/T':'catv-tab-BifFT','Bif Semi-invisible':'catv-tab-BifSI','Progresivo':'catv-tab-Prog'};
  var activeTab = document.getElementById(tabMap[tv]);
  if (activeTab) { activeTab.style.background='var(--beige)'; activeTab.style.color='var(--bg)'; }

  var reglas = await cargarReglasMateriales();
  var filtered = reglas.filter(function(r) { return r.tipo_vision === tv && r.material; });

  var rulesMap = {
    'VS':'<strong>Serie 1:</strong> SPH +4.00 a -6.00 | CIL hasta -2.00 &nbsp;&nbsp;&nbsp; <strong>Serie 2:</strong> ESF \u00b1 5.75 | CIL hasta -2.25',
    'Bif F/T':'<strong>Serie 1:</strong> SPH +3.00 a -2.00 | ADD hasta +3.00 &nbsp;&nbsp;&nbsp; <strong>Serie 2:</strong> Fuera de rango Serie 1',
    'Bif Semi-invisible':'<strong>Serie 1:</strong> SPH +3.00 a -2.00 | ADD hasta +3.00 &nbsp;&nbsp;&nbsp; <strong>Serie 2:</strong> Fuera de rango Serie 1',
    'Progresivo':'<strong>Serie 1:</strong> SPH +3.00 a -2.00 | ADD hasta +3.00 &nbsp;&nbsp;&nbsp; <strong>Serie 2:</strong> Fuera de rango Serie 1'
  };
  document.getElementById('catv-rules').innerHTML = rulesMap[tv] || '';

  var combos = {};
  filtered.forEach(function(r) {
    var key = r.material + '|' + r.tratamiento;
    if (!combos[key]) combos[key] = { material:r.material, tratamiento:r.tratamiento, s1:null, s2:null, nota:r.nota||'' };
    if (r.serie === 1) combos[key].s1 = Number(r.precio);
    if (r.serie === 2) combos[key].s2 = Number(r.precio);
    if (r.nota && !combos[key].nota) combos[key].nota = r.nota;
  });

  var matOrd = ['CR-39','Hi Index','Policarbonato','Ultra-thin 1.67','Super Ultra-thin 1.74'];
  var traOrd = ['Blanco','AR','Anti-Blue AR','Blue Light','Foto AR','Foto Sin AR','Foto Anti-Blue AR','Foto Blue Light','Foto Blue Light Gen 9','Foto Colors','Polarizado','Panoramic 360 Blue','Panoramic 360 Foto','Tinte Solar'];
  var sorted = Object.values(combos).sort(function(a,b) {
    var ma=matOrd.indexOf(a.material),mb=matOrd.indexOf(b.material);
    if (ma!==mb) return (ma===-1?99:ma)-(mb===-1?99:mb);
    return (traOrd.indexOf(a.tratamiento)===-1?99:traOrd.indexOf(a.tratamiento))-(traOrd.indexOf(b.tratamiento)===-1?99:traOrd.indexOf(b.tratamiento));
  });

  var materials = [...new Set(sorted.map(function(r){return r.material;}))];
  var totalCombos = sorted.length;
  var minP = Infinity, maxP = 0;
  sorted.forEach(function(r) {
    if (r.s1 && r.s1 < minP) minP = r.s1;
    if (r.s2 && r.s2 > maxP) maxP = r.s2;
    if (r.s1 && r.s1 > maxP) maxP = r.s1;
    if (r.s2 && r.s2 < minP) minP = r.s2;
  });
  document.getElementById('catv-stats').innerHTML =
    '<div style="background:var(--surface);border:1px solid rgba(255,255,255,0.05);border-radius:8px;padding:8px 14px"><div style="font-size:10px;color:var(--muted)">Materiales</div><div style="font-size:16px;font-weight:700;color:var(--beige)">'+materials.length+'</div></div>' +
    '<div style="background:var(--surface);border:1px solid rgba(255,255,255,0.05);border-radius:8px;padding:8px 14px"><div style="font-size:10px;color:var(--muted)">Combinaciones</div><div style="font-size:16px;font-weight:700;color:var(--beige)">'+totalCombos+'</div></div>' +
    '<div style="background:var(--surface);border:1px solid rgba(255,255,255,0.05);border-radius:8px;padding:8px 14px"><div style="font-size:10px;color:var(--muted)">Rango precios</div><div style="font-size:16px;font-weight:700;color:var(--beige)">$'+(minP===Infinity?0:minP).toLocaleString('es-MX')+' - $'+maxP.toLocaleString('es-MX')+'</div></div>';

  var h = '<table style="width:100%;border-collapse:collapse;font-size:13px">';
  h += '<thead><tr style="background:rgba(226,198,166,0.06)">';
  h += '<th style="text-align:left;padding:12px 14px;color:var(--beige);font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.05em">Material</th>';
  h += '<th style="text-align:left;padding:12px 14px;color:var(--beige);font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.05em">Tratamiento</th>';
  h += '<th style="text-align:right;padding:12px 14px;color:var(--beige);font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.05em">Serie 1</th>';
  h += '<th style="text-align:right;padding:12px 14px;color:var(--beige);font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.05em">Serie 2</th>';
  h += '<th style="text-align:left;padding:12px 14px;color:var(--muted);font-size:10px">Nota</th>';
  h += '</tr></thead><tbody>';

  var lastMat = '';
  sorted.forEach(function(r, i) {
    var showMat = r.material !== lastMat;
    lastMat = r.material;
    var rowBg = showMat ? 'background:rgba(226,198,166,0.03);' : '';
    var topBorder = showMat && i > 0 ? 'border-top:2px solid rgba(226,198,166,0.12);' : 'border-top:1px solid rgba(255,255,255,0.03);';
    h += '<tr style="'+topBorder+rowBg+'">';
    h += '<td style="padding:10px 14px;color:var(--white);font-weight:'+(showMat?'700':'400')+';font-size:'+(showMat?'13px':'12px')+'">'+(showMat?r.material:'')+'</td>';
    h += '<td style="padding:10px 14px;color:var(--white);font-size:12px">'+r.tratamiento+'</td>';
    h += '<td style="padding:10px 14px;text-align:right;font-weight:600;color:'+(r.s1?'var(--white)':'rgba(255,255,255,0.2)')+'">'+(r.s1?'$'+r.s1.toLocaleString('es-MX'):'\u2014')+'</td>';
    h += '<td style="padding:10px 14px;text-align:right;font-weight:600;color:'+(r.s2?'var(--white)':'rgba(255,255,255,0.2)')+'">'+(r.s2?'$'+r.s2.toLocaleString('es-MX'):'\u2014')+'</td>';
    h += '<td style="padding:10px 14px;font-size:10px;color:var(--muted)">'+r.nota+'</td>';
    h += '</tr>';
  });
  h += '</tbody></table>';
  document.getElementById('catv-table').innerHTML = h;
}
