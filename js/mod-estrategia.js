/* ============================================================
   mod-estrategia.js — Módulo Estrategia: Metas, Histórico, Márgenes
   v182 · Ópticas Car & Era
   ============================================================ */

// ── State ──
var _estActiveTab = 'meta';
var _estKpis = null;      // from app_config
var _estPlan90 = null;    // from app_config
var _estVentasCache = null;
var _estPlan90Dirty = false;
var _estMetas = null;      // from app_config: metas_mensuales
var _estHistDB = null;     // ventas mensuales del sistema nuevo (2026+) por sucursal
var _estLottieInstance = null; // current lottie animation instance for widget

// ── Lottie Animations por stage — URLs .lottie de assets-v2.lottiefiles.com ──
// 7 stages progresivos: sleep → rocket → running → fire → star → celebrate → trophy
var LOTTIE_ANIMS = {
  sleep:     'https://assets-v2.lottiefiles.com/a/816fda52-94c6-11ee-a7d9-1fca7526274d/taEPd2UrOp.lottie',
  rocket:    'https://assets-v2.lottiefiles.com/a/5de84460-a34a-11ee-b470-83e52242919a/SfozhTvKjU.lottie',
  running:   'https://assets-v2.lottiefiles.com/a/0d12473c-e5d7-11ee-8bea-4f67ee283f3d/Z3PQrWrivU.lottie',
  fire:      'https://assets-v2.lottiefiles.com/a/1df4b596-1182-11ee-9fc3-6f8d7094dc00/0xTsgAIerY.lottie',
  star:      'https://assets-v2.lottiefiles.com/a/d304494e-ceef-11ee-913d-8338acb69ea1/TwQtQVx1SA.lottie',
  celebrate: 'https://assets-v2.lottiefiles.com/a/745fc364-117b-11ee-b7ec-9f18a8a356e0/ctpFpJP75f.lottie',
  trophy:    'https://assets-v2.lottiefiles.com/a/e7df6e94-1170-11ee-9640-1b85e6ca1c88/useeXXBWNy.lottie'
};

// ── Ventas históricas SICAR (datos fijos 2021-2026, mensuales) ──
// Formato: { sucursal: { año: [ene,feb,...,dic] } }
// 2026 solo tiene Ene-Feb completos (Mar parcial: 1-4 en SICAR, resto en sistema nuevo)
var SICAR_DATA = {
  americas: {
    2021: [296021,429192,509041,357641,358441,332213,343618,353563,335954,325109,423878,395832],
    2022: [303663,453980,432506,464297,413556,408610,536056,439412,556195,567873,778525,700065],
    2023: [586038,538497,508083,574977,505836,410443,403942,465121,518108,621297,701373,554867],
    2024: [343526,426830,387425,502058,537604,422966,488127,495207,368705,440342,674191,519351],
    2025: [490444,366778,437246,336282,441947,428451,333075,390294,361088,425132,578743,525176],
    2026: [416891,405177,73516,0,0,0,0,0,0,0,0,0]
  },
  pinocelli: {
    2021: [277280,479815,308171,265682,263379,301160,343928,291856,307554,219304,516767,405567],
    2022: [290144,473380,417889,319584,386643,303860,432726,498346,451069,497107,639476,618673],
    2023: [550964,438786,456015,445865,426521,383469,356350,446621,364940,363461,672066,412667],
    2024: [365585,307169,375205,318420,394329,341402,433178,501364,343557,344010,524665,446256],
    2025: [332315,360525,362593,277624,462756,363799,363038,431781,410341,322763,524643,421171],
    2026: [406492,377512,85522,0,0,0,0,0,0,0,0,0]
  },
  magnolia: {
    2021: [262247,392300,301030,194414,222506,264665,263615,175183,402958,271340,290479,229629],
    2022: [155050,288070,195293,213598,261348,184882,220045,255520,314872,246447,360813,373109],
    2023: [342774,270791,228764,272196,229083,207424,218022,274875,281414,208821,339060,236672],
    2024: [243332,137995,144226,126112,137818,173235,163911,124092,143955,148136,201057,165093],
    2025: [102470,168673,178031,123735,117646,147094,148614,165745,172611,157482,227512,163702],
    2026: [141868,121359,20346,0,0,0,0,0,0,0,0,0]
  }
};

var MESES_NOMBRES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

// Estacionalidad contextual
var ESTACIONALIDAD = {
  0: 'Enero es históricamente el mes más flojo del año. Buena época para promociones agresivas.',
  1: 'Febrero marca el rebote post-enero. Buen momento para empujar ventas.',
  2: 'Marzo continúa la recuperación. Mes sólido para todas las sucursales.',
  3: 'Abril es mes estable, sin eventos especiales. Mantener ritmo.',
  4: 'Mayo tiende a ser fuerte. Día de las Madres puede impulsar ventas.',
  5: 'Junio inicia la caída de verano. Considerar promociones para mantener tráfico.',
  6: 'Julio es parte de la caída de verano. Temporada baja moderada.',
  7: 'Agosto muestra recuperación. Regreso a clases puede impulsar.',
  8: 'Septiembre continúa la recuperación pre-temporada alta.',
  9: 'Octubre prepara la temporada alta. Buen momento para planear Buen Fin.',
  10: 'Noviembre es EL MES PICO del año — Buen Fin. Maximizar capacidad y stock.',
  11: 'Diciembre cierra fuerte con compras navideñas. Segundo mejor mes típicamente.'
};

// ── Ayuda contextual (?) ──
var _EST_HELP = {
  kpi:              { t: 'KPI', d: 'Dato clave que medimos para saber si el negocio va bien. Ejemplo: ventas del mes, ticket promedio, reseñas de Google.' },
  roas:             { t: 'ROAS', d: 'Por cada peso que gastamos en anuncios de Facebook/Instagram, cuántos pesos nos regresan en ventas. Si es 3x, por cada $1 de publicidad entran $3.' },
  leads:            { t: 'Leads digitales', d: 'Personas que nos contactaron por redes sociales o internet interesadas en comprar. Más leads = más oportunidades de venta.' },
  retencion:        { t: 'Tasa de retención', d: 'De cada 100 clientes, cuántos regresan a comprar otra vez. Si es 15%, de cada 100 clientes 15 vuelven.' },
  fase:             { t: 'Fase del plan', d: 'El plan de 90 días se divide en 3 fases de 4 semanas. Fase 1: arrancar. Fase 2: ajustar. Fase 3: cerrar fuerte.' },
  ticket:           { t: 'Ticket promedio', d: 'Cuánto gasta en promedio cada cliente por compra. Se calcula: ingreso total ÷ número de ventas.' },
  margen_alerta:    { t: 'Alerta de descuentos', d: 'Si damos muchos descuentos (más del 40% de las ventas), ganamos menos dinero. Verde = bien, amarillo = cuidado, rojo = demasiado descuento.' },
  yoy:              { t: 'YoY (Año vs Año)', d: 'Comparación contra el mismo mes del año pasado. Si marzo 2026 vs marzo 2025 es +10%, quiere decir que vendimos 10% más este año.' },
  trimestre:        { t: 'Trimestres (Q1-Q4)', d: 'El año dividido en 4 bloques de 3 meses: Q1 = Ene-Mar, Q2 = Abr-Jun, Q3 = Jul-Sep, Q4 = Oct-Dic.' },
  estacionalidad:   { t: 'Estacionalidad', d: 'Cada mes tiene su patrón natural. Noviembre siempre es el mejor (Buen Fin), enero el más flojo. Sirve para no asustarnos ni confiarnos.' },
  magnolia_watch:   { t: 'Magnolia Watch', d: 'Seguimiento especial de Magnolia desde que se mudó en marzo 2024. Compara cuánto vende ahora vs lo que vendía antes ($259K/mes promedio en 2023).' },
  magnolia_pct:     { t: 'Porcentaje vs antes', d: 'Cuánto vende Magnolia comparado con antes de mudarse. Ejemplo: -44% significa que vende menos de la mitad de lo que vendía en 2023.' },
  meta_auto:        { t: 'Meta automática', d: 'Se calcula con el promedio de los últimos 3 años dándole más peso a los años recientes, más un 5% de crecimiento. Para Magnolia solo usa 2 años (desde que se mudó).' },
  prom_ponderado:   { t: 'Promedio ponderado', d: 'Promedio que le da más importancia a lo reciente. El año pasado vale 3 veces, el anterior 2 veces, y hace 3 años vale 1 vez. Así la meta se basa más en lo que pasó recientemente.' },
  proyeccion:       { t: 'Proyección', d: 'Si sigues vendiendo al mismo ritmo que llevas, cuánto vas a cerrar el mes. Es un estimado, no es seguro.' },
  ritmo:            { t: 'Ritmo necesario', d: 'Cuánto necesitas vender cada día que queda del mes para llegar a la meta. Cambia todos los días según lo que falta.' },
  tasa_desc:        { t: 'Tasa de descuento', d: 'De cada $100 que se deberían cobrar, cuántos pesos se descuentan. Si es 40%, de cada $100 solo cobras $60.' },
  ventas_con_desc:  { t: 'Ventas con descuento', d: 'De cada 100 ventas, cuántas tuvieron algún descuento. Si es 70%, casi todas las ventas llevan descuento.' },
  crecimiento:      { t: 'Crecimiento %', d: 'Porcentaje extra que le sumamos a la meta para crecer. Por defecto es 5%: si el año pasado vendiste $100K, la meta sería $105K.' }
};

function _estHelp(key) {
  if (!_EST_HELP[key]) return '';
  return ' <span class="est-help-btn" data-esthelp="' + key + '" title="' + _EST_HELP[key].t + '">?</span>';
}

// Popover + CSS (se inyecta una vez)
(function() {
  var style = document.createElement('style');
  style.textContent = [
    '.est-help-btn { display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;border-radius:50%;background:rgba(255,255,255,0.08);color:var(--muted);font-size:10px;font-weight:700;cursor:pointer;vertical-align:middle;margin-left:4px;border:1px solid rgba(255,255,255,0.12);transition:background 0.2s;user-select:none }',
    '.est-help-btn:hover { background:rgba(255,255,255,0.15);color:var(--accent) }',
    '#est-help-popover { position:fixed;z-index:9999;max-width:280px;background:var(--surface);border:1px solid rgba(255,255,255,0.15);border-radius:10px;padding:12px 14px;box-shadow:0 8px 32px rgba(0,0,0,0.5);font-size:13px;line-height:1.45;display:none;pointer-events:auto }',
    '#est-help-popover .est-hp-title { font-weight:700;font-size:14px;margin-bottom:4px;color:var(--accent) }',
    '#est-help-popover .est-hp-text { color:#ccc }',
    '#est-help-popover::before { content:"";position:absolute;top:-6px;left:50%;transform:translateX(-50%);width:12px;height:12px;background:var(--surface);border-left:1px solid rgba(255,255,255,0.15);border-top:1px solid rgba(255,255,255,0.15);transform:translateX(-50%) rotate(45deg) }'
  ].join('\n');
  document.head.appendChild(style);

  // Popover element
  var pop = document.createElement('div');
  pop.id = 'est-help-popover';
  pop.innerHTML = '<div class="est-hp-title"></div><div class="est-hp-text"></div>';
  document.body.appendChild(pop);

  // Delegate click
  document.addEventListener('click', function(e) {
    var btn = e.target.closest('.est-help-btn');
    if (btn) {
      e.stopPropagation();
      var key = btn.getAttribute('data-esthelp');
      var info = _EST_HELP[key];
      if (!info) return;
      pop.querySelector('.est-hp-title').textContent = info.t;
      pop.querySelector('.est-hp-text').textContent = info.d;
      var rect = btn.getBoundingClientRect();
      pop.style.display = 'block';
      // Position below the button
      var popW = pop.offsetWidth;
      var left = rect.left + rect.width / 2 - popW / 2;
      if (left < 8) left = 8;
      if (left + popW > window.innerWidth - 8) left = window.innerWidth - popW - 8;
      var top = rect.bottom + 8;
      if (top + pop.offsetHeight > window.innerHeight - 8) top = rect.top - pop.offsetHeight - 8;
      pop.style.left = left + 'px';
      pop.style.top = top + 'px';
      return;
    }
    // Click outside closes
    if (pop.style.display === 'block') pop.style.display = 'none';
  });
})();

// ── INIT ──
async function initEstrategia() {
  var c1 = document.getElementById('est-content-dashboard');
  if (c1) c1.innerHTML = '<div style="padding:24px;text-align:center"><span class="spinner-sm"></span> Cargando estrategia...</div>';

  try {
    var [cfgRes, ventasRes] = await Promise.all([
      db.from('app_config').select('id,value').in('id', ['kpis_estrategia', 'estrategia_plan90', 'metas_mensuales']),
      _estFetchVentas()
    ]);

    _estKpis = null;
    _estPlan90 = null;
    _estMetas = null;
    if (cfgRes.data) {
      cfgRes.data.forEach(function(r) {
        try {
          if (r.id === 'kpis_estrategia') _estKpis = JSON.parse(r.value);
          if (r.id === 'estrategia_plan90') _estPlan90 = JSON.parse(r.value);
          if (r.id === 'metas_mensuales') _estMetas = JSON.parse(r.value);
        } catch(e) {}
      });
    }
    _estVentasCache = ventasRes;
  } catch(e) {
    toast('Error cargando estrategia: ' + e.message, true);
  }

  // Init defaults if no data yet
  if (!_estKpis) _estKpis = _estDefaultKpis();
  if (!_estPlan90) _estPlan90 = _estDefaultPlan90();
  if (!_estMetas) _estMetas = { crecimiento_pct: 5, overrides: {} };

  // Load historical monthly totals from DB (2026+) for future year calculations
  if (!_estHistDB) await _estLoadHistDB();

  _estPlan90Dirty = false;
  _estPagosLoaded = false;
  estSwitchTab(_estActiveTab);
}

function estSwitchTab(tab) {
  _estActiveTab = tab;
  var tabs = ['meta','dashboard','historico','margenes','plan90'];
  tabs.forEach(function(t) {
    var el = document.getElementById('est-content-' + t);
    var btn = document.getElementById('est-tab-' + t);
    if (el) el.style.display = t === tab ? '' : 'none';
    if (btn) btn.classList.toggle('active', t === tab);
  });
  if (tab === 'meta') _estRenderMeta();
  if (tab === 'dashboard') _estRenderDashboard();
  if (tab === 'historico') _estRenderHistorico();
  if (tab === 'margenes') { _estLoadPagos().then(function() { _estRenderMargenes(); }); return; }
  if (tab === 'plan90') _estRenderPlan90();
}

// ── Fetch ventas del periodo actual ──
async function _estFetchVentas() {
  var now = new Date();
  var y = now.getFullYear();
  var m = String(now.getMonth() + 1).padStart(2, '0');
  var inicio = y + '-' + m + '-01';
  var fin = y + '-' + m + '-' + String(new Date(y, now.getMonth() + 1, 0).getDate()).padStart(2, '0');

  var { data: ventas, error } = await db.from('ventas')
    .select('id,created_at,total,subtotal,sucursal,estado,folio,descuento')
    .gte('created_at', inicio).lte('created_at', fin + 'T23:59:59')
    .neq('estado', 'Cancelada')
    .order('created_at', { ascending: false });

  if (error) console.error('[Estrategia] ventas error:', error);

  // Normalize: add fecha field from created_at using local Chihuahua timezone
  (ventas || []).forEach(function(v) {
    if (v.created_at) {
      v.fecha = new Date(v.created_at).toLocaleDateString('en-CA', { timeZone: 'America/Chihuahua' });
    } else {
      v.fecha = '';
    }
  });

  // Load promo names for margin analysis
  var promoMap = {};
  if (ventas && ventas.length) {
    var vIds = ventas.map(function(v) { return v.id; });
    var { data: promos } = await db.from('venta_promociones')
      .select('venta_id,nombre_promo,descuento_aplicado')
      .in('venta_id', vIds);
    (promos || []).forEach(function(p) {
      promoMap[p.venta_id] = p.nombre_promo;
    });
  }
  (ventas || []).forEach(function(v) { v.promo_nombre = promoMap[v.id] || ''; });

  return { ventas: ventas || [], pagos: [], inicio: inicio, fin: fin };
}

// Lazy load pagos only when Márgenes tab needs them
var _estPagosLoaded = false;
async function _estLoadPagos() {
  if (_estPagosLoaded || !_estVentasCache || !_estVentasCache.ventas.length) return;
  try {
    var ids = _estVentasCache.ventas.map(function(v) { return v.id; });
    var { data } = await db.from('venta_pagos')
      .select('venta_id,monto,metodo_pago')
      .in('venta_id', ids);
    _estVentasCache.pagos = data || [];
    _estPagosLoaded = true;
  } catch(e) {
    console.error('[Estrategia] pagos error:', e);
  }
}

// ── Default KPIs ──
function _estDefaultKpis() {
  return {
    fecha_inicio: '2026-03-24',
    metas: {
      resenas_google: { meta_30: 50, meta_60: 80, meta_90: 120, actual: 0 },
      leads_digitales: { meta_30: 50, meta_60: 100, meta_90: 150, actual: 0 },
      citas_digital: { meta_30: 25, meta_60: 60, meta_90: 100, actual: 0 },
      roas_meta: { meta_30: 2.5, meta_60: 3.5, meta_90: 4.5, actual: 0 },
      followers_ig: { meta_30: 200, meta_60: 500, meta_90: 1000, actual: 0 },
      tasa_retencion: { meta_30: 0, meta_60: 5, meta_90: 15, actual: 0 }
    }
  };
}

// ── Default Plan 90 días ──
function _estDefaultPlan90() {
  return {
    angel: {
      fase1: [
        { text: 'Optimizar Google My Business + 50 reseñas en 30 días', done: false },
        { text: 'Lanzar Meta Ads lead generation $2,500/sem', done: false },
        { text: 'Definir y lanzar Descuento Maquiladero', done: false },
        { text: 'Google Search con keywords de intención alta', done: false },
        { text: '📍 Crear 3 landing pages Magnolia (promo/lentes/examen)', done: false },
        { text: '📍 Configurar template WA magnolia_reactivacion en Twilio', done: false }
      ],
      fase2: [
        { text: 'Escalar ads ganadores x2', done: false },
        { text: 'Lanzar retargeting', done: false },
        { text: 'Google Ads $2,000-$4,000/mes', done: false },
        { text: '📍 Meta Ads geo-targeting zona Magnolia — 3x1 lentes', done: false },
        { text: '📍 Activar reactivación WA clientes dormidos Magnolia', done: false }
      ],
      fase3: [
        { text: 'Lanzar Club de Visión Car & Era ($99-$149/mes)', done: false },
        { text: 'Campaña reactivación clientes históricos WA', done: false },
        { text: 'Medir ROI y ajustar', done: false },
        { text: '📍 Medir conversión Magnolia: reactivados vs nuevos digitales', done: false }
      ],
      notas: ''
    },
    ivon: {
      fase1: [
        { text: '4 videos/semana (behind scenes, testimonial, educativo, estilo)', done: false },
        { text: 'Definir calendario de contenido', done: false }
      ],
      fase2: [
        { text: 'Día de grabación bulk (8-12 videos en 1 día)', done: false },
        { text: 'Comparativa implícita vs competencia', done: false },
        { text: 'Optometrista a cámara como autoridad', done: false }
      ],
      fase3: [
        { text: 'Video testimonial estrella alta calidad', done: false },
        { text: 'Historia real antes/después para ads', done: false }
      ],
      notas: ''
    },
    karen: {
      fase1: [
        { text: 'Base de datos WhatsApp Business lista', done: false },
        { text: 'Coordinar solicitud de reseñas Google', done: false }
      ],
      fase2: [
        { text: 'Protocolo de upsell (blue light + 2do par = +25% ticket)', done: false },
        { text: 'Guía/checklist para equipo', done: false }
      ],
      fase3: [
        { text: 'Entrenamiento experiencia de cliente', done: false },
        { text: 'Seguimiento post-venta', done: false },
        { text: 'Identificar clientes inactivos +12 meses', done: false }
      ],
      notas: ''
    }
  };
}

// ═══════════════════════════════════════════════
// TAB 0: META DEL MES — Metas automáticas por sucursal + proyección
// ═══════════════════════════════════════════════

// Load monthly totals from sistema nuevo (2026+) grouped by year/month/sucursal
async function _estLoadHistDB() {
  _estHistDB = {};
  try {
    // Fetch all completed ventas from system start (2026-03-05) grouped by month
    var { data } = await db.from('ventas')
      .select('created_at,total,sucursal')
      .neq('estado', 'Cancelada')
      .gte('created_at', '2026-03-01')
      .order('created_at', { ascending: true });

    if (!data) return;

    // Group by sucursal → year → month
    var sucMap = { 'americas': true, 'pinocelli': true, 'magnolia': true };
    data.forEach(function(v) {
      var vs = (v.sucursal || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (!sucMap[vs] && vs === 'todas') vs = 'americas';
      if (!sucMap[vs]) return;
      var d = new Date(v.created_at);
      var y = d.getFullYear();
      var m = d.getMonth(); // 0-based
      if (!_estHistDB[vs]) _estHistDB[vs] = {};
      if (!_estHistDB[vs][y]) _estHistDB[vs][y] = [0,0,0,0,0,0,0,0,0,0,0,0];
      _estHistDB[vs][y][m] += (v.total || 0);
    });
  } catch(e) {
    console.error('[Estrategia] histDB error:', e);
  }
}

// Get monthly value for a branch: best of SICAR vs DB
// SICAR = historical (2021-2025 complete, 2026 Jan-Feb full + Mar partial)
// DB = sistema nuevo (2026-Mar+ onwards, grows over time)
// Returns the higher of the two so partial SICAR never masks real DB data
function _estGetMonthVal(sucKey, year, mesIdx) {
  var valSicar = 0, valDB = 0;

  var sicar = SICAR_DATA[sucKey] && SICAR_DATA[sucKey][year];
  if (sicar && sicar[mesIdx] > 0) valSicar = sicar[mesIdx];

  if (_estHistDB && _estHistDB[sucKey] && _estHistDB[sucKey][year]) {
    valDB = Math.round(_estHistDB[sucKey][year][mesIdx]) || 0;
  }

  return Math.max(valSicar, valDB);
}

// Auto-calculate meta for a branch/month using weighted avg of last 3 years + growth %
function _estCalcMeta(sucKey, mesIdx, anio) {
  var grow = (_estMetas && _estMetas.crecimiento_pct) || 5;
  var years, weights;

  // Magnolia: solo post-mudanza (Mar 2024+)
  if (sucKey === 'magnolia') {
    years = [anio - 2, anio - 1];
    weights = [1, 2];
  } else {
    years = [anio - 3, anio - 2, anio - 1];
    weights = [1, 2, 3];
  }

  var sum = 0, wTotal = 0;
  years.forEach(function(y, i) {
    var val = _estGetMonthVal(sucKey, y, mesIdx);
    if (val > 0) {
      sum += val * weights[i];
      wTotal += weights[i];
    }
  });

  var promPonderado = wTotal > 0 ? sum / wTotal : 0;
  return Math.round(promPonderado * (1 + grow / 100));
}

function _estGetMeta(sucKey, mesKey) {
  // Check for manual override first
  if (_estMetas && _estMetas.overrides && _estMetas.overrides[mesKey] && _estMetas.overrides[mesKey][sucKey]) {
    return _estMetas.overrides[mesKey][sucKey];
  }
  // Auto-calculate
  var parts = mesKey.split('-');
  return _estCalcMeta(sucKey, parseInt(parts[1]) - 1, parseInt(parts[0]));
}

function _estRenderMeta() {
  var el = document.getElementById('est-content-meta');
  if (!el) return;

  var v = _estVentasCache || { ventas: [] };
  var ventas = v.ventas;
  var now = new Date();
  var mesIdx = now.getMonth();
  var anio = now.getFullYear();
  var mesNombre = MESES_NOMBRES[mesIdx];
  var mesKey = anio + '-' + String(mesIdx + 1).padStart(2, '0');
  var diasEnMes = new Date(anio, mesIdx + 1, 0).getDate();
  var diaHoy = now.getDate();
  var diasRestantes = diasEnMes - diaHoy;
  var pctTiempo = Math.round(diaHoy / diasEnMes * 100);
  var isAdmin = currentUser?.rol === 'admin';
  var grow = (_estMetas && _estMetas.crecimiento_pct) || 5;

  // Days with sales
  var diasConVenta = {};
  ventas.forEach(function(x) { if (x.fecha) diasConVenta[x.fecha] = true; });
  var numDiasConVenta = Object.keys(diasConVenta).length || 1;
  var diasVentaRestantes = Math.max(1, Math.round(diasRestantes * (numDiasConVenta / Math.max(1, diaHoy))));

  // Current month by sucursal
  var sucDefs = [
    { label: 'Américas', key: 'americas', color: '#4fc3f7' },
    { label: 'Pinocelli', key: 'pinocelli', color: '#ffa726' },
    { label: 'Magnolia', key: 'magnolia', color: '#ce93d8' }
  ];
  var actual = {}; var actualCount = {};
  sucDefs.forEach(function(s) { actual[s.key] = 0; actualCount[s.key] = 0; });
  ventas.forEach(function(x) {
    var vs = (x.sucursal || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    sucDefs.forEach(function(s) {
      if (vs === s.key || (s.key === 'americas' && vs === 'todas')) {
        actual[s.key] += (x.total || 0);
        actualCount[s.key]++;
      }
    });
  });

  // Metas per branch
  var metas = {};
  var metaTotal = 0;
  var actualTotal = 0;
  sucDefs.forEach(function(s) {
    metas[s.key] = _estGetMeta(s.key, mesKey);
    metaTotal += metas[s.key];
    actualTotal += actual[s.key];
  });

  // Check overrides
  var hasOverride = _estMetas && _estMetas.overrides && _estMetas.overrides[mesKey];

  var h = '';

  // Header
  h += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;padding:14px 18px;background:var(--surface2);border-radius:10px">';
  h += '<div style="display:flex;align-items:center;gap:12px">';
  h += '<span style="font-size:28px">🎯</span>';
  h += '<div><div style="font-size:18px;font-weight:700">Meta ' + mesNombre + ' ' + anio + '</div>';
  h += '<div style="font-size:12px;color:var(--muted)">Día ' + diaHoy + ' de ' + diasEnMes + ' · ' + diasRestantes + ' días restantes · Crecimiento +' + grow + '%' + _estHelp('crecimiento') + (hasOverride ? ' · <span style="color:var(--accent)">Meta manual</span>' : ' · Meta automática' + _estHelp('meta_auto')) + '</div></div>';
  h += '</div>';
  if (isAdmin) {
    h += '<button class="btn btn-g btn-sm" onclick="estEditMetas()" title="Editar metas">✏️ Editar</button>';
  }
  h += '</div>';

  // Total progress - big card
  var pctTotal = metaTotal > 0 ? Math.min(100, Math.round(actualTotal / metaTotal * 100)) : 0;
  var totalColor = pctTotal >= pctTiempo ? '#66bb6a' : pctTotal >= pctTiempo * 0.7 ? '#ffa726' : '#ef5350';
  var promDiario = actualTotal / numDiasConVenta;
  var proyTotal = actualTotal + (promDiario * diasVentaRestantes);
  var faltaTotal = metaTotal - actualTotal;

  h += '<div style="padding:20px;background:var(--surface2);border-radius:12px;margin-bottom:20px;border:1px solid rgba(255,255,255,0.06)">';
  h += '<div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:12px">';
  h += '<div><div style="font-size:11px;color:var(--muted);text-transform:uppercase">Meta total empresa</div>';
  h += '<div style="font-size:32px;font-weight:700;margin-top:4px">$' + _estFmt(metaTotal) + '</div></div>';
  h += '<div style="text-align:right"><div style="font-size:11px;color:var(--muted)">Actual</div>';
  h += '<div style="font-size:24px;font-weight:700;color:' + totalColor + '">$' + _estFmt(Math.round(actualTotal)) + '</div></div>';
  h += '</div>';
  // Big progress bar
  h += '<div style="height:16px;background:rgba(255,255,255,0.06);border-radius:8px;overflow:hidden;position:relative">';
  h += '<div style="height:100%;width:' + pctTotal + '%;background:' + totalColor + ';border-radius:8px;transition:width .5s"></div>';
  h += '<div style="position:absolute;top:0;left:' + pctTiempo + '%;width:2px;height:100%;background:rgba(255,255,255,0.6)" title="' + pctTiempo + '% del mes"></div>';
  h += '</div>';
  h += '<div style="display:flex;justify-content:space-between;font-size:11px;color:var(--muted);margin-top:6px">';
  h += '<span>' + pctTotal + '% alcanzado</span>';
  h += '<span>|  ' + pctTiempo + '% del mes</span>';
  h += '<span>Faltan $' + _estFmt(Math.max(0, Math.round(faltaTotal))) + '</span>';
  h += '</div></div>';

  // Projection + pace
  h += '<div class="est-grid-3" style="margin-bottom:20px">';
  h += '<div class="est-card"><div style="font-size:11px;color:var(--muted);text-transform:uppercase">Proyección cierre' + _estHelp('proyeccion') + '</div>';
  var proyColor = proyTotal >= metaTotal ? '#66bb6a' : '#ef5350';
  h += '<div style="font-size:22px;font-weight:700;color:' + proyColor + ';margin:4px 0">$' + _estFmt(Math.round(proyTotal)) + '</div>';
  var proyDiff = metaTotal > 0 ? Math.round((proyTotal - metaTotal) / metaTotal * 100) : 0;
  h += '<div style="font-size:11px;color:' + proyColor + '">' + (proyDiff >= 0 ? '+' : '') + proyDiff + '% vs meta</div></div>';

  h += '<div class="est-card"><div style="font-size:11px;color:var(--muted);text-transform:uppercase">Ritmo actual</div>';
  h += '<div style="font-size:22px;font-weight:700;color:var(--accent);margin:4px 0">$' + _estFmt(Math.round(promDiario)) + '/día</div>';
  h += '<div style="font-size:11px;color:var(--muted)">' + numDiasConVenta + ' días con ventas</div></div>';

  var ritmoNecesario = diasVentaRestantes > 0 && faltaTotal > 0 ? faltaTotal / diasVentaRestantes : 0;
  h += '<div class="est-card"><div style="font-size:11px;color:var(--muted);text-transform:uppercase">Ritmo para llegar a meta' + _estHelp('ritmo') + '</div>';
  if (faltaTotal <= 0) {
    h += '<div style="font-size:22px;font-weight:700;color:#66bb6a;margin:4px 0">META LOGRADA</div>';
  } else {
    var rColor = ritmoNecesario <= promDiario ? '#66bb6a' : ritmoNecesario <= promDiario * 1.3 ? '#ffa726' : '#ef5350';
    h += '<div style="font-size:22px;font-weight:700;color:' + rColor + ';margin:4px 0">$' + _estFmt(Math.round(ritmoNecesario)) + '/día</div>';
    h += '<div style="font-size:11px;color:var(--muted)">en ~' + diasVentaRestantes + ' días restantes</div>';
  }
  h += '</div></div>';

  // Per-branch cards with individual progress
  h += '<h3 style="font-size:15px;margin:4px 0 16px">Meta por sucursal</h3>';
  h += '<div class="est-grid-3">';

  sucDefs.forEach(function(s) {
    var meta = metas[s.key];
    var act = actual[s.key];
    var cnt = actualCount[s.key];
    var pct = meta > 0 ? Math.min(100, Math.round(act / meta * 100)) : 0;
    var falta = meta - act;
    var promS = numDiasConVenta > 0 ? act / numDiasConVenta : 0;
    var proyS = act + (promS * diasVentaRestantes);
    var onTrack = pct >= pctTiempo;
    var barColor = onTrack ? s.color : '#ef5350';

    h += '<div class="est-card" style="border-top:3px solid ' + s.color + '">';
    h += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">';
    h += '<div style="font-size:14px;font-weight:700">' + s.label + '</div>';
    h += '<div style="font-size:11px;color:var(--muted)">' + cnt + ' ventas</div>';
    h += '</div>';

    // Meta vs actual
    h += '<div style="display:flex;justify-content:space-between;margin-bottom:4px">';
    h += '<span style="font-size:11px;color:var(--muted)">Meta: $' + _estFmt(meta) + '</span>';
    h += '<span style="font-size:13px;font-weight:700;color:' + barColor + '">' + pct + '%</span>';
    h += '</div>';

    // Progress bar
    h += '<div style="height:10px;background:rgba(255,255,255,0.06);border-radius:5px;overflow:hidden;position:relative;margin-bottom:8px">';
    h += '<div style="height:100%;width:' + pct + '%;background:' + barColor + ';border-radius:5px;transition:width .5s"></div>';
    h += '<div style="position:absolute;top:0;left:' + pctTiempo + '%;width:2px;height:100%;background:rgba(255,255,255,0.5)"></div>';
    h += '</div>';

    h += '<div style="font-size:20px;font-weight:700;margin:4px 0">$' + _estFmt(Math.round(act)) + '</div>';

    if (falta > 0) {
      var ritmoS = diasVentaRestantes > 0 ? falta / diasVentaRestantes : 0;
      h += '<div style="font-size:11px;color:var(--muted);margin-top:4px">Faltan <strong>$' + _estFmt(Math.round(falta)) + '</strong></div>';
      h += '<div style="font-size:11px;color:var(--muted)">Necesita <strong>$' + _estFmt(Math.round(ritmoS)) + '/día</strong> · Ritmo actual $' + _estFmt(Math.round(promS)) + '/día</div>';
      h += '<div style="font-size:11px;margin-top:2px;color:' + (proyS >= meta ? '#66bb6a' : '#ef5350') + '">Proyección: $' + _estFmt(Math.round(proyS)) + ' ' + (proyS >= meta ? '✓' : '✗') + '</div>';
    } else {
      h += '<div style="font-size:13px;color:#66bb6a;font-weight:600;margin-top:4px">✅ META LOGRADA (+$' + _estFmt(Math.round(-falta)) + ')</div>';
    }

    h += '</div>';
  });
  h += '</div>';

  // Last year comparison table
  h += '<h3 style="font-size:15px;margin:24px 0 12px">Comparativo vs ' + (anio - 1) + '</h3>';
  h += '<div style="overflow-x:auto"><table class="est-table"><thead><tr>';
  h += '<th>Sucursal</th><th>Actual</th><th>' + mesNombre + ' ' + (anio - 1) + '</th><th>Meta ' + anio + '</th><th>Avance</th><th>Proyección</th>';
  h += '</tr></thead><tbody>';

  var lastYearTotal = 0;
  sucDefs.forEach(function(s) {
    var act = actual[s.key];
    var ly = _estGetMonthVal(s.key, anio - 1, mesIdx);
    lastYearTotal += ly;
    var meta = metas[s.key];
    var pct = meta > 0 ? Math.round(act / meta * 100) : 0;
    var promS = numDiasConVenta > 0 ? act / numDiasConVenta : 0;
    var proyS = Math.round(act + promS * diasVentaRestantes);

    h += '<tr><td><strong>' + s.label + '</strong></td>';
    h += '<td>$' + _estFmt(Math.round(act)) + '</td>';
    h += '<td>$' + _estFmt(ly) + '</td>';
    h += '<td>$' + _estFmt(meta) + '</td>';
    h += '<td><div style="display:flex;align-items:center;gap:6px"><div style="width:50px;height:6px;background:rgba(255,255,255,0.08);border-radius:3px;overflow:hidden"><div style="height:100%;width:' + Math.min(100, pct) + '%;background:' + s.color + ';border-radius:3px"></div></div><span style="font-size:11px">' + pct + '%</span></div></td>';
    h += '<td style="color:' + (proyS >= meta ? '#66bb6a' : '#ef5350') + '">$' + _estFmt(proyS) + '</td></tr>';
  });
  h += '<tr style="border-top:2px solid rgba(255,255,255,0.1)">';
  h += '<td><strong>TOTAL</strong></td>';
  h += '<td><strong>$' + _estFmt(Math.round(actualTotal)) + '</strong></td>';
  h += '<td><strong>$' + _estFmt(lastYearTotal) + '</strong></td>';
  h += '<td><strong>$' + _estFmt(metaTotal) + '</strong></td>';
  h += '<td><strong>' + pctTotal + '%</strong></td>';
  h += '<td style="color:' + (proyTotal >= metaTotal ? '#66bb6a' : '#ef5350') + '"><strong>$' + _estFmt(Math.round(proyTotal)) + '</strong></td></tr>';
  h += '</tbody></table></div>';

  // Formula explanation
  h += '<div style="margin-top:16px;padding:12px 16px;background:var(--surface2);border-radius:8px;font-size:11px;color:var(--muted)">';
  h += '<strong>Cómo se calcula la meta automática' + _estHelp('prom_ponderado') + ':</strong> Promedio ponderado del mismo mes en los últimos 3 años ';
  h += '(año más reciente pesa 3x, intermedio 2x, anterior 1x) + ' + grow + '% de crecimiento. ';
  h += 'Magnolia usa solo datos post-mudanza (2024+). Admin puede hacer override manual.';
  h += '</div>';

  el.innerHTML = h;
}

// Edit metas modal
function estEditMetas() {
  if (currentUser?.rol !== 'admin') return;
  var now = new Date();
  var mesIdx = now.getMonth();
  var anio = now.getFullYear();
  var mesKey = anio + '-' + String(mesIdx + 1).padStart(2, '0');
  var mesNombre = MESES_NOMBRES[mesIdx];

  var sucDefs = [
    { label: 'Américas', key: 'americas' },
    { label: 'Pinocelli', key: 'pinocelli' },
    { label: 'Magnolia', key: 'magnolia' }
  ];

  var grow = (_estMetas && _estMetas.crecimiento_pct) || 5;
  var overrides = (_estMetas && _estMetas.overrides && _estMetas.overrides[mesKey]) || {};

  var modal = document.createElement('div');
  modal.className = 'm-overlay open';
  modal.onclick = function(e) { if (e.target === modal) modal.remove(); };

  var box = '<div style="background:var(--surface);border-radius:12px;padding:24px;max-width:420px;width:90%;margin:auto;margin-top:15vh">';
  box += '<h3 style="margin:0 0 16px">Editar metas — ' + mesNombre + ' ' + anio + '</h3>';

  box += '<label style="font-size:12px;color:var(--muted);display:block;margin-bottom:4px">% Crecimiento sobre promedio histórico</label>';
  box += '<input type="number" id="est-edit-grow" value="' + grow + '" min="0" max="50" step="1" style="width:80px;padding:6px 10px;background:var(--surface2);border:1px solid rgba(255,255,255,0.1);border-radius:6px;color:var(--text);font-size:14px;margin-bottom:16px">';

  box += '<p style="font-size:12px;color:var(--muted);margin-bottom:12px">Dejar en $0 para usar meta automática. Poner un valor para override manual:</p>';

  sucDefs.forEach(function(s) {
    var auto = _estCalcMeta(s.key, mesIdx, anio);
    var manual = overrides[s.key] || 0;
    box += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">';
    box += '<span style="width:80px;font-size:13px;font-weight:600">' + s.label + '</span>';
    box += '<input type="number" id="est-edit-' + s.key + '" value="' + manual + '" min="0" step="10000" placeholder="$0 = auto ($' + _estFmt(auto) + ')" style="flex:1;padding:6px 10px;background:var(--surface2);border:1px solid rgba(255,255,255,0.1);border-radius:6px;color:var(--text);font-size:13px">';
    box += '<span style="font-size:10px;color:var(--muted);width:70px">Auto: $' + _estFmt(auto) + '</span>';
    box += '</div>';
  });

  box += '<div style="display:flex;gap:8px;margin-top:16px;justify-content:flex-end">';
  box += '<button class="btn btn-g btn-sm" onclick="this.closest(\'.m-overlay\').remove()">Cancelar</button>';
  box += '<button class="btn btn-p btn-sm" onclick="estSaveMetas()">Guardar</button>';
  box += '</div></div>';

  modal.innerHTML = box;
  document.body.appendChild(modal);
}

async function estSaveMetas() {
  var now = new Date();
  var mesKey = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');

  var grow = parseInt(document.getElementById('est-edit-grow')?.value) || 5;
  if (!_estMetas) _estMetas = { crecimiento_pct: 5, overrides: {} };
  _estMetas.crecimiento_pct = grow;
  if (!_estMetas.overrides) _estMetas.overrides = {};

  var overrides = {};
  ['americas', 'pinocelli', 'magnolia'].forEach(function(key) {
    var val = parseInt(document.getElementById('est-edit-' + key)?.value) || 0;
    if (val > 0) overrides[key] = val;
  });

  if (Object.keys(overrides).length > 0) {
    _estMetas.overrides[mesKey] = overrides;
  } else {
    delete _estMetas.overrides[mesKey];
  }

  try {
    await db.from('app_config').upsert({ id: 'metas_mensuales', value: JSON.stringify(_estMetas) }, { onConflict: 'id' });
    toast('Metas guardadas');
    document.querySelector('.m-overlay')?.remove();
    _estRenderMeta();
  } catch(e) {
    toast('Error: ' + e.message, true);
  }
}

// ═══════════════════════════════════════════════
// TAB 1: DASHBOARD ESTRATÉGICO
// ═══════════════════════════════════════════════
function _estRenderDashboard() {
  var el = document.getElementById('est-content-dashboard');
  if (!el) return;

  var v = _estVentasCache || { ventas: [], pagos: [] };
  var ventas = v.ventas;

  // Calc real-time metrics
  var totalVentas = ventas.length;
  var totalIngreso = ventas.reduce(function(s, x) { return s + (x.total || 0); }, 0);
  var totalSubtotal = ventas.reduce(function(s, x) { return s + (x.subtotal || 0); }, 0);
  var ticketProm = totalVentas > 0 ? Math.round(totalIngreso / totalVentas) : 0;
  var ventasConDesc = ventas.filter(function(x) { return x.subtotal && x.total && x.subtotal > x.total; }).length;
  var pctDesc = totalVentas > 0 ? Math.round(ventasConDesc / totalVentas * 100) : 0;
  var tasaDesc = totalSubtotal > 0 ? Math.round((1 - totalIngreso / totalSubtotal) * 1000) / 10 : 0;

  // By sucursal
  var bySuc = {};
  ventas.forEach(function(x) {
    var s = x.sucursal || 'Otra';
    if (!bySuc[s]) bySuc[s] = { count: 0, total: 0 };
    bySuc[s].count++;
    bySuc[s].total += (x.total || 0);
  });

  // Phase calculation
  var inicio = new Date(_estKpis.fecha_inicio || '2026-03-24');
  var hoy = new Date();
  var diasTranscurridos = Math.max(0, Math.floor((hoy - inicio) / 86400000));
  var semana = Math.floor(diasTranscurridos / 7) + 1;
  var fase = semana <= 4 ? 1 : semana <= 8 ? 2 : 3;
  var faseLabel = fase === 1 ? 'Fase 1 (Sem 1-4)' : fase === 2 ? 'Fase 2 (Sem 5-8)' : 'Fase 3 (Sem 9-12)';

  // Determine which meta column to use based on days
  var metaKey = diasTranscurridos <= 30 ? 'meta_30' : diasTranscurridos <= 60 ? 'meta_60' : 'meta_90';

  // Margin alert
  var alertClass = tasaDesc > 45 ? 'est-alert-red' : tasaDesc > 40 ? 'est-alert-yellow' : 'est-alert-green';
  var alertText = tasaDesc > 45 ? 'Tasa de descuento ALTA — revisar política de promos' : tasaDesc > 40 ? 'Tasa de descuento moderada — monitorear' : 'Tasa de descuento saludable';

  var h = '';

  // Phase indicator
  h += '<div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;padding:12px 16px;background:var(--surface2);border-radius:10px">';
  h += '<span style="font-size:20px">🎯</span>';
  h += '<div><strong>' + faseLabel + '</strong>' + _estHelp('fase') + ' · Semana ' + semana + ' · Día ' + diasTranscurridos + ' de 90';
  h += '<div style="margin-top:4px;height:6px;background:rgba(255,255,255,0.08);border-radius:3px;width:200px">';
  h += '<div style="height:100%;background:var(--accent);border-radius:3px;width:' + Math.min(100, Math.round(diasTranscurridos / 90 * 100)) + '%"></div></div>';
  h += '</div></div>';

  // Margin alert banner
  h += '<div class="' + alertClass + '" style="padding:10px 16px;border-radius:8px;margin-bottom:16px;display:flex;align-items:center;gap:8px">';
  h += '<span style="font-size:18px">' + (tasaDesc > 45 ? '🔴' : tasaDesc > 40 ? '🟡' : '🟢') + '</span>';
  h += '<span>' + alertText + ' — <strong>' + tasaDesc + '% descuento promedio</strong> (' + pctDesc + '% de ventas con descuento)' + _estHelp('margen_alerta') + '</span>';
  h += '</div>';

  // Real-time metrics cards
  h += '<div class="est-grid-3">';
  h += _estMetricCard('Ventas del mes', totalVentas, '', '#4fc3f7');
  h += _estMetricCard('Ingreso del mes', '$' + _estFmt(totalIngreso), '', '#66bb6a');
  h += _estMetricCard('Ticket promedio' + _estHelp('ticket'), '$' + _estFmt(ticketProm), '', '#ffa726');
  h += '</div>';

  // By sucursal
  h += '<div class="est-grid-3" style="margin-top:12px">';
  ['Américas', 'Pinocelli', 'Magnolia'].forEach(function(s) {
    var d = bySuc[s] || { count: 0, total: 0 };
    var tp = d.count > 0 ? Math.round(d.total / d.count) : 0;
    h += '<div class="est-card"><div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:0.5px">' + s + '</div>';
    h += '<div style="font-size:22px;font-weight:700;margin:4px 0">$' + _estFmt(d.total) + '</div>';
    h += '<div style="font-size:12px;color:var(--muted)">' + d.count + ' ventas · TP $' + _estFmt(tp) + '</div></div>';
  });
  h += '</div>';

  // KPIs with progress
  h += '<h3 style="margin:24px 0 12px;font-size:15px;color:var(--text)">KPIs — Metas 90 días' + _estHelp('kpi') + '</h3>';
  h += '<div class="est-grid-2">';
  var kpiDefs = [
    { key: 'resenas_google', label: 'Reseñas Google', icon: '⭐', suffix: '' },
    { key: 'leads_digitales', label: 'Leads digitales/mes' + _estHelp('leads'), icon: '📱', suffix: '' },
    { key: 'citas_digital', label: 'Citas agendadas digital', icon: '📅', suffix: '' },
    { key: 'roas_meta', label: 'ROAS Meta Ads' + _estHelp('roas'), icon: '📈', suffix: 'x' },
    { key: 'followers_ig', label: 'Followers Instagram', icon: '📸', suffix: '' },
    { key: 'tasa_retencion', label: 'Tasa de retención' + _estHelp('retencion'), icon: '🔄', suffix: '%' }
  ];

  kpiDefs.forEach(function(kd) {
    var kpi = _estKpis.metas[kd.key] || {};
    var meta = kpi[metaKey] || 0;
    var actual = kpi.actual || 0;
    var pct = meta > 0 ? Math.min(100, Math.round(actual / meta * 100)) : 0;
    var color = pct >= 80 ? '#66bb6a' : pct >= 50 ? '#ffa726' : '#ef5350';

    h += '<div class="est-card" style="cursor:pointer" onclick="estEditKpi(\'' + kd.key + '\')">';
    h += '<div style="display:flex;justify-content:space-between;align-items:center">';
    h += '<span style="font-size:13px">' + kd.icon + ' ' + kd.label + '</span>';
    h += '<span style="font-size:11px;color:var(--muted)">Meta: ' + meta + kd.suffix + '</span>';
    h += '</div>';
    h += '<div style="font-size:24px;font-weight:700;margin:6px 0;color:' + color + '">' + actual + kd.suffix + '</div>';
    h += '<div style="height:6px;background:rgba(255,255,255,0.08);border-radius:3px">';
    h += '<div style="height:100%;background:' + color + ';border-radius:3px;width:' + pct + '%;transition:width .3s"></div></div>';
    h += '<div style="font-size:11px;color:var(--muted);margin-top:4px">' + pct + '% de la meta (' + (diasTranscurridos <= 30 ? '30d' : diasTranscurridos <= 60 ? '60d' : '90d') + ')</div>';
    h += '</div>';
  });
  h += '</div>';
  h += '<p style="font-size:11px;color:var(--muted);margin-top:8px;text-align:center">Click en un KPI para actualizar su valor actual</p>';

  el.innerHTML = h;
}

function _estMetricCard(label, value, sub, color) {
  return '<div class="est-card"><div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:0.5px">' + label + '</div>' +
    '<div style="font-size:26px;font-weight:700;color:' + (color || 'var(--text)') + ';margin:4px 0">' + value + '</div>' +
    (sub ? '<div style="font-size:12px;color:var(--muted)">' + sub + '</div>' : '') + '</div>';
}

function estEditKpi(key) {
  if (currentUser?.rol !== 'admin' && currentUser?.rol !== 'gerencia') return;
  var kpi = _estKpis.metas[key];
  if (!kpi) return;
  var val = prompt('Valor actual para este KPI:', kpi.actual || 0);
  if (val === null) return;
  var n = parseFloat(val);
  if (isNaN(n)) return;
  kpi.actual = n;
  _estSaveKpis();
  _estRenderDashboard();
}

async function _estSaveKpis() {
  try {
    await db.from('app_config').upsert({ id: 'kpis_estrategia', value: JSON.stringify(_estKpis) }, { onConflict: 'id' });
    toast('KPIs actualizados');
  } catch(e) {
    toast('Error guardando KPIs: ' + e.message, true);
  }
}

// ═══════════════════════════════════════════════
// TAB 2: HISTÓRICO & COMPARATIVO
// ═══════════════════════════════════════════════
function _estRenderHistorico() {
  var el = document.getElementById('est-content-historico');
  if (!el) return;

  var mesActual = new Date().getMonth(); // 0-based
  var anioActual = new Date().getFullYear();
  var h = '';

  // Estacionalidad
  h += '<div style="padding:12px 16px;background:var(--surface2);border-radius:10px;margin-bottom:16px;border-left:3px solid var(--accent)">';
  h += '<div style="font-size:13px;font-weight:600;margin-bottom:4px">📅 ' + MESES_NOMBRES[mesActual] + ' ' + anioActual + ' — Contexto estacional' + _estHelp('estacionalidad') + '</div>';
  h += '<div style="font-size:12px;color:var(--muted)">' + ESTACIONALIDAD[mesActual] + '</div>';
  h += '</div>';

  // Current month vs same month previous years (bar chart)
  h += '<h3 style="font-size:15px;margin-bottom:12px">' + MESES_NOMBRES[mesActual] + ' — Comparativo histórico por sucursal</h3>';

  ['americas', 'pinocelli', 'magnolia'].forEach(function(suc) {
    var label = suc.charAt(0).toUpperCase() + suc.slice(1);
    var years = [2021, 2022, 2023, 2024, 2025];
    var vals = years.map(function(y) { return _estGetMonthVal(suc, y, mesActual); });
    var maxVal = Math.max.apply(null, vals) || 1;

    // Current month from system
    var currentMonth = 0;
    if (_estVentasCache) {
      _estVentasCache.ventas.forEach(function(v) {
        var vs = (v.sucursal || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        if (vs === suc || (suc === 'americas' && (vs === 'americas' || vs === 'todas'))) {
          currentMonth += (v.total || 0);
        }
      });
    }
    if (currentMonth > maxVal) maxVal = currentMonth;

    h += '<div style="margin-bottom:20px">';
    h += '<div style="font-size:13px;font-weight:600;margin-bottom:8px">' + label + '</div>';

    years.forEach(function(y) {
      var val = _estGetMonthVal(suc, y, mesActual);
      var pct = Math.round(val / maxVal * 100);
      var color = 'rgba(255,255,255,0.15)';
      h += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:3px">';
      h += '<span style="font-size:11px;color:var(--muted);width:32px;text-align:right">' + y + '</span>';
      h += '<div style="flex:1;height:18px;background:rgba(255,255,255,0.04);border-radius:4px;overflow:hidden">';
      h += '<div style="height:100%;width:' + pct + '%;background:' + color + ';border-radius:4px;transition:width .3s"></div></div>';
      h += '<span style="font-size:11px;color:var(--muted);width:70px;text-align:right">$' + _estFmt(val) + '</span>';
      h += '</div>';
    });

    // Current year bar (highlighted)
    var pctCurrent = Math.round(currentMonth / maxVal * 100);
    h += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:3px">';
    h += '<span style="font-size:11px;color:var(--accent);font-weight:700;width:32px;text-align:right">' + anioActual + '</span>';
    h += '<div style="flex:1;height:18px;background:rgba(255,255,255,0.04);border-radius:4px;overflow:hidden">';
    h += '<div style="height:100%;width:' + pctCurrent + '%;background:var(--accent);border-radius:4px;transition:width .3s"></div></div>';
    h += '<span style="font-size:11px;color:var(--accent);font-weight:700;width:70px;text-align:right">$' + _estFmt(currentMonth) + '</span>';
    h += '</div>';

    h += '</div>';
  });

  // Yearly totals table
  h += '<h3 style="font-size:15px;margin:24px 0 12px">Ventas anuales por sucursal (SICAR)' + _estHelp('yoy') + '</h3>';
  h += '<div style="overflow-x:auto"><table class="est-table"><thead><tr>';
  h += '<th>Año</th><th>Américas</th><th>Pinocelli</th><th>Magnolia</th><th>Total</th><th>vs anterior</th>';
  h += '</tr></thead><tbody>';

  var prevTotal = 0;
  [2021, 2022, 2023, 2024, 2025].forEach(function(y) {
    var ta = SICAR_DATA.americas[y].reduce(function(a, b) { return a + b; }, 0);
    var tp = SICAR_DATA.pinocelli[y].reduce(function(a, b) { return a + b; }, 0);
    var tm = SICAR_DATA.magnolia[y].reduce(function(a, b) { return a + b; }, 0);
    var total = ta + tp + tm;
    var yoy = prevTotal > 0 ? ((total - prevTotal) / prevTotal * 100).toFixed(1) : '—';
    var yoyColor = yoy === '—' ? 'var(--muted)' : parseFloat(yoy) >= 0 ? '#66bb6a' : '#ef5350';

    h += '<tr>';
    h += '<td><strong>' + y + '</strong></td>';
    h += '<td>$' + _estFmt(ta) + '</td>';
    h += '<td>$' + _estFmt(tp) + '</td>';
    h += '<td>$' + _estFmt(tm) + '</td>';
    h += '<td><strong>$' + _estFmt(total) + '</strong></td>';
    h += '<td style="color:' + yoyColor + '">' + (yoy === '—' ? '—' : (parseFloat(yoy) >= 0 ? '+' : '') + yoy + '%') + '</td>';
    h += '</tr>';
    prevTotal = total;
  });
  h += '</tbody></table></div>';

  // Magnolia watch
  h += '<h3 style="font-size:15px;margin:24px 0 12px">🔍 Magnolia Watch — Post-mudanza (Mar 2024)' + _estHelp('magnolia_watch') + '</h3>';
  h += '<div style="padding:12px 16px;background:var(--surface2);border-radius:10px;margin-bottom:12px">';
  h += '<div style="font-size:12px;color:var(--muted);margin-bottom:8px">Promedio mensual pre-mudanza 2023: <strong style="color:var(--text)">$259,141</strong></div>';

  var magQuarters = [
    { label: 'Q2 2024 (1er trim completo)', meses: [3,4,5], year: 2024 },
    { label: 'Q3 2024', meses: [6,7,8], year: 2024 },
    { label: 'Q4 2024', meses: [9,10,11], year: 2024 },
    { label: 'Q1 2025', meses: [0,1,2], year: 2025 },
    { label: 'Q2 2025', meses: [3,4,5], year: 2025 },
    { label: 'Q3 2025', meses: [6,7,8], year: 2025 },
    { label: 'Q4 2025', meses: [9,10,11], year: 2025 },
    { label: 'Q1 2026 (Ene-Feb)', meses: [0,1], year: 2026 }
  ];
  var preMudanza = 259141;

  magQuarters.forEach(function(q) {
    var sum = 0;
    q.meses.forEach(function(m) { sum += SICAR_DATA.magnolia[q.year][m]; });
    var avg = Math.round(sum / q.meses.length);
    var diff = Math.round((avg - preMudanza) / preMudanza * 100);
    var trend = diff > -10 ? '↑' : diff > -30 ? '→' : '↓';
    var color = diff > -10 ? '#66bb6a' : diff > -30 ? '#ffa726' : '#ef5350';

    h += '<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.04)">';
    h += '<span style="font-size:12px">' + q.label + '</span>';
    h += '<div style="display:flex;align-items:center;gap:8px">';
    h += '<span style="font-size:12px">$' + _estFmt(avg) + '/mes</span>';
    h += '<span style="font-size:12px;color:' + color + ';font-weight:600">' + trend + ' ' + diff + '%' + (q === magQuarters[0] ? _estHelp('magnolia_pct') : '') + '</span>';
    h += '</div></div>';
  });

  h += '<div style="font-size:11px;color:var(--muted);margin-top:8px">Pérdida anual estimada vs pre-mudanza: <strong style="color:#ef5350">~$1.2M</strong></div>';
  h += '</div>';

  // ── Magnolia Rescue — Recovery Milestones ──
  h += '<h3 style="font-size:15px;margin:24px 0 12px">🚀 Magnolia Rescue — Plan de Recuperación Digital</h3>';
  h += '<div style="padding:16px;background:var(--surface2);border-radius:10px;margin-bottom:12px">';

  // Current month Magnolia revenue
  var nowD = new Date();
  var curYear = nowD.getFullYear();
  var curMonth = nowD.getMonth();
  var magCurMonth = 0;
  if (_estVentasCache && _estVentasCache.ventas) {
    _estVentasCache.ventas.forEach(function(v) {
      if (v.sucursal && v.sucursal.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().indexOf('magnolia') !== -1) {
        magCurMonth += (v.total || 0);
      }
    });
  }
  // Also check SICAR for current month if available
  if (!magCurMonth && SICAR_DATA.magnolia[curYear] && SICAR_DATA.magnolia[curYear][curMonth]) {
    magCurMonth = SICAR_DATA.magnolia[curYear][curMonth];
  }

  var milestones = [
    { label: 'Fase 1 — Estabilizar', target: 160000, color: '#ffa726' },
    { label: 'Fase 2 — Recuperación parcial', target: 200000, color: '#42a5f5' },
    { label: 'Fase 3 — Recuperación total', target: 260000, color: '#66bb6a' }
  ];

  h += '<div style="font-size:12px;color:var(--muted);margin-bottom:12px">Venta Magnolia este mes: <strong style="color:var(--text);font-size:14px">$' + _estFmt(magCurMonth) + '</strong></div>';

  milestones.forEach(function(ms) {
    var pct = Math.min(100, Math.round(magCurMonth / ms.target * 100));
    var reached = magCurMonth >= ms.target;
    h += '<div style="margin-bottom:10px">';
    h += '<div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:4px">';
    h += '<span>' + (reached ? '✅ ' : '⬜ ') + ms.label + '</span>';
    h += '<span style="color:' + ms.color + '">$' + _estFmt(ms.target) + '/mes (' + pct + '%)</span>';
    h += '</div>';
    h += '<div style="height:6px;background:rgba(255,255,255,0.06);border-radius:3px;overflow:hidden">';
    h += '<div style="height:100%;width:' + pct + '%;background:' + ms.color + ';border-radius:3px;transition:width .5s"></div>';
    h += '</div></div>';
  });

  // Strategy actions
  h += '<div style="margin-top:16px;padding-top:12px;border-top:1px solid rgba(255,255,255,0.06)">';
  h += '<div style="font-size:12px;font-weight:600;margin-bottom:8px">📱 Estrategia Digital (solo presencia digital)</div>';
  var actions = [
    '🎯 Meta Ads geo-targeting zona Magnolia — promo 3x1',
    '📲 Reactivación WA clientes dormidos (automática, lunes)',
    '🌐 Landing pages: /l/magnolia-promo, /l/magnolia-lentes, /l/magnolia-examen',
    '⭐ Reseñas Google Maps priorizadas para Magnolia',
    '🤖 Clari reconoce clientes reactivados y ofrece promo'
  ];
  actions.forEach(function(a) {
    h += '<div style="font-size:11px;padding:3px 0;color:var(--muted)">' + a + '</div>';
  });
  h += '</div></div>';

  el.innerHTML = h;
}

// ═══════════════════════════════════════════════
// TAB 3: MONITOR DE MÁRGENES
// ═══════════════════════════════════════════════
function _estRenderMargenes() {
  var el = document.getElementById('est-content-margenes');
  if (!el) return;

  var v = _estVentasCache || { ventas: [], pagos: [] };
  var ventas = v.ventas;

  var totalVentas = ventas.length;
  var totalIngreso = ventas.reduce(function(s, x) { return s + (x.total || 0); }, 0);
  var totalSubtotal = ventas.reduce(function(s, x) { return s + (x.subtotal || 0); }, 0);
  var ventasConDesc = ventas.filter(function(x) { return x.subtotal && x.total && x.subtotal > x.total; });
  var pctConDesc = totalVentas > 0 ? Math.round(ventasConDesc.length / totalVentas * 100) : 0;
  var tasaDesc = totalSubtotal > 0 ? Math.round((1 - totalIngreso / totalSubtotal) * 1000) / 10 : 0;
  var totalDescuento = totalSubtotal - totalIngreso;

  var h = '';

  // Summary cards
  h += '<div class="est-grid-3">';
  var dColor = tasaDesc > 45 ? '#ef5350' : tasaDesc > 40 ? '#ffa726' : '#66bb6a';
  h += _estMetricCard('Tasa descuento promedio' + _estHelp('tasa_desc'), tasaDesc + '%', '', dColor);
  h += _estMetricCard('Ventas con descuento' + _estHelp('ventas_con_desc'), pctConDesc + '%', ventasConDesc.length + ' de ' + totalVentas, '#ffa726');
  h += _estMetricCard('Total descontado', '$' + _estFmt(Math.round(totalDescuento)), 'sobre $' + _estFmt(Math.round(totalSubtotal)) + ' subtotal', '#ef5350');
  h += '</div>';

  // By promo
  h += '<h3 style="font-size:15px;margin:24px 0 12px">Descuento por promoción</h3>';
  var byPromo = {};
  ventas.forEach(function(x) {
    if (!x.promo_nombre || !x.subtotal || x.subtotal <= x.total) return;
    var p = x.promo_nombre;
    if (!byPromo[p]) byPromo[p] = { count: 0, desc: 0 };
    byPromo[p].count++;
    byPromo[p].desc += (x.subtotal - x.total);
  });
  var promoArr = Object.keys(byPromo).map(function(k) { return { name: k, count: byPromo[k].count, desc: byPromo[k].desc }; });
  promoArr.sort(function(a, b) { return b.desc - a.desc; });

  if (promoArr.length > 0) {
    var maxDesc = promoArr[0].desc || 1;
    promoArr.forEach(function(p) {
      var pct = Math.round(p.desc / maxDesc * 100);
      h += '<div style="margin-bottom:8px">';
      h += '<div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:2px">';
      h += '<span>' + p.name + ' <span style="color:var(--muted)">(' + p.count + ' usos)</span></span>';
      h += '<span style="font-weight:600">$' + _estFmt(Math.round(p.desc)) + '</span>';
      h += '</div>';
      h += '<div style="height:8px;background:rgba(255,255,255,0.06);border-radius:4px">';
      h += '<div style="height:100%;width:' + pct + '%;background:#ef5350;border-radius:4px;opacity:0.7"></div>';
      h += '</div></div>';
    });
  } else {
    h += '<p style="color:var(--muted);font-size:12px">Sin datos de promociones este mes</p>';
  }

  // By sucursal
  h += '<h3 style="font-size:15px;margin:24px 0 12px">Descuento por sucursal</h3>';
  h += '<div class="est-grid-3">';
  ['Américas', 'Pinocelli', 'Magnolia'].forEach(function(s) {
    var sv = ventas.filter(function(x) { return x.sucursal === s; });
    var sub = sv.reduce(function(a, x) { return a + (x.subtotal || 0); }, 0);
    var tot = sv.reduce(function(a, x) { return a + (x.total || 0); }, 0);
    var tasa = sub > 0 ? Math.round((1 - tot / sub) * 1000) / 10 : 0;
    var c = tasa > 45 ? '#ef5350' : tasa > 40 ? '#ffa726' : '#66bb6a';
    h += '<div class="est-card"><div style="font-size:11px;color:var(--muted)">' + s + '</div>';
    h += '<div style="font-size:22px;font-weight:700;color:' + c + '">' + tasa + '%</div>';
    h += '<div style="font-size:11px;color:var(--muted)">$' + _estFmt(Math.round(sub - tot)) + ' descontado</div></div>';
  });
  h += '</div>';

  // Top 5 highest discount sales
  h += '<h3 style="font-size:15px;margin:24px 0 12px">Top 5 ventas con mayor descuento</h3>';
  var sorted = ventas.filter(function(x) { return x.subtotal && x.total && x.subtotal > x.total; });
  sorted.sort(function(a, b) { return (b.subtotal - b.total) - (a.subtotal - a.total); });
  var top5 = sorted.slice(0, 5);

  if (top5.length > 0) {
    h += '<div style="overflow-x:auto"><table class="est-table"><thead><tr>';
    h += '<th>Folio</th><th>Sucursal</th><th>Subtotal</th><th>Total</th><th>Descuento</th><th>%</th>';
    h += '</tr></thead><tbody>';
    top5.forEach(function(x) {
      var desc = x.subtotal - x.total;
      var pct = Math.round(desc / x.subtotal * 100);
      h += '<tr><td>' + (x.folio || '—') + '</td><td>' + (x.sucursal || '—') + '</td>';
      h += '<td>$' + _estFmt(Math.round(x.subtotal)) + '</td><td>$' + _estFmt(Math.round(x.total)) + '</td>';
      h += '<td style="color:#ef5350;font-weight:600">$' + _estFmt(Math.round(desc)) + '</td>';
      h += '<td>' + pct + '%</td></tr>';
    });
    h += '</tbody></table></div>';
  }

  // Daily trend (last 14 days)
  h += '<h3 style="font-size:15px;margin:24px 0 12px">Tendencia diaria (últimos 14 días)</h3>';
  var byDay = {};
  ventas.forEach(function(x) {
    var d = x.fecha;
    if (!d) return;
    if (!byDay[d]) byDay[d] = { sub: 0, tot: 0, count: 0 };
    byDay[d].sub += (x.subtotal || 0);
    byDay[d].tot += (x.total || 0);
    byDay[d].count++;
  });

  var days = Object.keys(byDay).sort().reverse().slice(0, 14).reverse();
  if (days.length > 0) {
    h += '<div style="overflow-x:auto"><table class="est-table"><thead><tr>';
    h += '<th>Fecha</th><th>Ventas</th><th>Subtotal</th><th>Total</th><th>Tasa desc.</th>';
    h += '</tr></thead><tbody>';
    days.forEach(function(d) {
      var r = byDay[d];
      var tasa = r.sub > 0 ? Math.round((1 - r.tot / r.sub) * 1000) / 10 : 0;
      var c = tasa > 45 ? '#ef5350' : tasa > 40 ? '#ffa726' : '#66bb6a';
      h += '<tr><td>' + d.slice(5) + '</td><td>' + r.count + '</td>';
      h += '<td>$' + _estFmt(Math.round(r.sub)) + '</td><td>$' + _estFmt(Math.round(r.tot)) + '</td>';
      h += '<td style="color:' + c + ';font-weight:600">' + tasa + '%</td></tr>';
    });
    h += '</tbody></table></div>';
  }

  el.innerHTML = h;
}

// ═══════════════════════════════════════════════
// TAB 4: PLAN 90 DÍAS
// ═══════════════════════════════════════════════
function _estRenderPlan90() {
  var el = document.getElementById('est-content-plan90');
  if (!el) return;

  var isEditable = currentUser?.rol === 'admin' || currentUser?.rol === 'gerencia';
  var plan = _estPlan90;
  var h = '';

  var personas = [
    { key: 'angel', name: 'Ángel', role: 'Redes, Ads, Promociones', icon: '📱' },
    { key: 'ivon', name: 'Ivon', role: 'Contenido TikTok/Reels/FB', icon: '🎬' },
    { key: 'karen', name: 'Karen', role: 'Personal y Operación', icon: '👥' }
  ];

  h += '<div class="est-grid-3">';

  personas.forEach(function(p) {
    var pd = plan[p.key] || {};
    var totalTasks = 0;
    var doneTasks = 0;
    ['fase1', 'fase2', 'fase3'].forEach(function(f) {
      (pd[f] || []).forEach(function(t) {
        totalTasks++;
        if (t.done) doneTasks++;
      });
    });
    var pct = totalTasks > 0 ? Math.round(doneTasks / totalTasks * 100) : 0;

    h += '<div class="est-card" style="padding:16px">';
    h += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">';
    h += '<span style="font-size:20px">' + p.icon + '</span>';
    h += '<div><strong>' + p.name + '</strong><div style="font-size:11px;color:var(--muted)">' + p.role + '</div></div>';
    h += '</div>';

    // Progress
    h += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">';
    h += '<div style="flex:1;height:6px;background:rgba(255,255,255,0.08);border-radius:3px">';
    h += '<div style="height:100%;background:var(--accent);border-radius:3px;width:' + pct + '%"></div></div>';
    h += '<span style="font-size:11px;color:var(--muted)">' + pct + '%</span>';
    h += '</div>';

    // Phases
    ['fase1', 'fase2', 'fase3'].forEach(function(fase, fi) {
      var label = 'Fase ' + (fi + 1) + ' (Sem ' + (fi * 4 + 1) + '-' + ((fi + 1) * 4) + ')';
      h += '<div style="margin-bottom:10px">';
      h += '<div style="font-size:11px;font-weight:600;color:var(--accent);margin-bottom:4px">' + label + '</div>';

      (pd[fase] || []).forEach(function(task, ti) {
        var checked = task.done ? ' checked' : '';
        var strike = task.done ? 'text-decoration:line-through;opacity:0.5' : '';
        h += '<label style="display:flex;align-items:flex-start;gap:6px;font-size:12px;margin-bottom:4px;cursor:' + (isEditable ? 'pointer' : 'default') + ';' + strike + '">';
        h += '<input type="checkbox"' + checked + (isEditable ? ' onchange="estToggleTask(\'' + p.key + '\',\'' + fase + '\',' + ti + ')"' : ' disabled') + ' style="margin-top:2px;flex-shrink:0">';
        h += '<span>' + task.text + '</span></label>';
      });

      h += '</div>';
    });

    // Notes
    if (isEditable) {
      h += '<div style="margin-top:8px">';
      h += '<textarea placeholder="Notas de avance..." style="width:100%;min-height:50px;background:var(--surface2);border:1px solid rgba(255,255,255,0.08);border-radius:6px;color:var(--text);padding:8px;font-size:11px;resize:vertical" onchange="estUpdateNote(\'' + p.key + '\',this.value)">' + (pd.notas || '') + '</textarea>';
      h += '</div>';
    } else if (pd.notas) {
      h += '<div style="margin-top:8px;font-size:11px;color:var(--muted);padding:8px;background:var(--surface2);border-radius:6px">' + pd.notas + '</div>';
    }

    h += '</div>';
  });

  h += '</div>';

  if (isEditable) {
    h += '<div style="text-align:center;margin-top:16px">';
    h += '<button class="btn btn-p btn-sm" onclick="estSavePlan90()" id="est-btn-save-plan">💾 Guardar plan</button>';
    h += '</div>';
  }

  el.innerHTML = h;
}

function estToggleTask(persona, fase, idx) {
  if (!_estPlan90[persona] || !_estPlan90[persona][fase]) return;
  _estPlan90[persona][fase][idx].done = !_estPlan90[persona][fase][idx].done;
  _estPlan90Dirty = true;
  _estRenderPlan90();
}

function estUpdateNote(persona, val) {
  if (!_estPlan90[persona]) return;
  _estPlan90[persona].notas = val;
  _estPlan90Dirty = true;
}

async function estSavePlan90() {
  var btn = document.getElementById('est-btn-save-plan');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Guardando...'; }
  try {
    await db.from('app_config').upsert({ id: 'estrategia_plan90', value: JSON.stringify(_estPlan90) }, { onConflict: 'id' });
    _estPlan90Dirty = false;
    toast('Plan guardado');
  } catch(e) {
    toast('Error: ' + e.message, true);
  }
  if (btn) { btn.disabled = false; btn.textContent = '💾 Guardar plan'; }
}

// ── Helpers ──
function _estFmt(n) {
  if (n === undefined || n === null) return '0';
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// ── Lottie helper: renderiza animación dotlottie-wc en un contenedor ──
// Usa <dotlottie-wc> web component (soporta .lottie y .json)
// Si el web component no está registrado o la URL falla, mantiene emoji fallback
function _estRenderLottie(containerId, stageKey, fallbackEmoji) {
  var container = document.getElementById(containerId);
  if (!container) return;
  var url = LOTTIE_ANIMS[stageKey];
  if (!url) return;
  // Verificar que el web component dotlottie-wc esté registrado
  if (!customElements.get('dotlottie-wc')) return; // CDN no cargó, emoji fallback se queda
  // Guardar emoji fallback original
  var originalHTML = container.innerHTML;
  try {
    // Crear el web component
    var player = document.createElement('dotlottie-wc');
    player.setAttribute('src', url);
    player.setAttribute('autoplay', '');
    player.setAttribute('loop', '');
    player.setAttribute('speed', '1');
    player.style.cssText = 'width:100%;height:100%;display:block';
    // Limpiar container y agregar player
    container.innerHTML = '';
    container.style.overflow = 'hidden';
    container.appendChild(player);
    // Timeout fallback: si en 8s no renderiza, restaurar emoji
    // NOTA: dotlottie-wc renderiza el canvas dentro de su shadowRoot, no como hijo directo
    var timeout = setTimeout(function() {
      if (!player.parentNode) return; // ya fue removido
      var canvas = player.shadowRoot?.querySelector('canvas');
      if (!canvas) {
        container.innerHTML = originalHTML;
      }
    }, 8000);
    // Si carga bien, limpiar timeout
    player.addEventListener('load', function() { clearTimeout(timeout); });
    player.addEventListener('ready', function() { clearTimeout(timeout); });
    player.addEventListener('complete', function() { clearTimeout(timeout); });
    // Guardar referencia para destruir en próximo refresh
    _estLottieInstance = { destroy: function() { try { player.remove(); } catch(e){} } };
  } catch(e) {
    container.innerHTML = originalHTML;
  }
}

// ═══════════════════════════════════════════════
// WIDGET MOTIVACIONAL — Dashboard empleados (sin montos, solo %)
// ═══════════════════════════════════════════════
async function _loadDashMetaWidget(sucursal) {
  var el = document.getElementById('dash-meta-widget');
  if (!el) return;

  try {
    var now = new Date();
    var mesIdx = now.getMonth();
    var anio = now.getFullYear();
    var mesNombre = MESES_NOMBRES[mesIdx];
    var diasEnMes = new Date(anio, mesIdx + 1, 0).getDate();
    var diaHoy = now.getDate();
    var diasRestantes = diasEnMes - diaHoy;
    var pctTiempo = Math.round(diaHoy / diasEnMes * 100);

    // Map sucursal name to key
    var sucKey = (sucursal || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (sucKey !== 'americas' && sucKey !== 'pinocelli' && sucKey !== 'magnolia') return;

    // Load metas config
    var { data: cfgData } = await db.from('app_config').select('id,value').in('id', ['metas_mensuales']);
    var metas = null;
    if (cfgData) {
      cfgData.forEach(function(r) {
        try { if (r.id === 'metas_mensuales') metas = JSON.parse(r.value); } catch(e) {}
      });
    }
    // Temporarily set for calc
    var prevMetas = _estMetas;
    if (metas) _estMetas = metas;

    // Load histDB if needed
    if (!_estHistDB) await _estLoadHistDB();

    var mesKey = anio + '-' + String(mesIdx + 1).padStart(2, '0');
    var meta = _estGetMeta(sucKey, mesKey);
    _estMetas = prevMetas; // restore

    if (!meta || meta <= 0) return;

    // Get current month ventas for this sucursal
    var inicio = anio + '-' + String(mesIdx + 1).padStart(2, '0') + '-01';
    var fin = inicio.slice(0, 8) + String(diasEnMes).padStart(2, '0') + 'T23:59:59';
    var { data: ventas } = await db.from('ventas')
      .select('total,sucursal,created_at')
      .gte('created_at', inicio).lte('created_at', fin)
      .eq('sucursal', sucursal)
      .neq('estado', 'Cancelada');

    var actual = (ventas || []).reduce(function(s, v) { return s + (v.total || 0); }, 0);
    var numVentas = (ventas || []).length;
    var pct = Math.min(100, Math.round(actual / meta * 100));

    // Ticket promedio de esta sucursal este mes
    var ticketProm = numVentas > 0 ? actual / numVentas : 3500; // fallback $3500

    // Ventas necesarias para cerrar la meta
    var faltante = Math.max(0, meta - actual);
    var ventasRestantes = Math.ceil(faltante / ticketProm);

    // Helper: convert UTC timestamp to local Chihuahua date string (YYYY-MM-DD)
    function _toLocalDate(ts) {
      if (!ts) return '';
      var d = new Date(ts);
      return d.toLocaleDateString('en-CA', { timeZone: 'America/Chihuahua' });
    }

    // Days with sales count (using local dates, not UTC)
    var diasConVenta = {};
    (ventas || []).forEach(function(v) {
      var d = _toLocalDate(v.created_at);
      if (d) diasConVenta[d] = (diasConVenta[d] || 0) + 1;
    });
    var numDiasConVenta = Object.keys(diasConVenta).length || 1;
    var diasVentaRestantes = Math.max(1, Math.round(diasRestantes * (numDiasConVenta / Math.max(1, diaHoy))));

    // Daily sales target
    var ventasDiarias = Math.ceil(ventasRestantes / diasVentaRestantes);

    // Today's sales (local Chihuahua date)
    var hoyStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chihuahua' });
    var ventasHoy = (ventas || []).filter(function(v) { return _toLocalDate(v.created_at) === hoyStr; }).length;

    // Streak: consecutive days meeting daily average
    var promVentasDia = numVentas / numDiasConVenta;
    var streak = 0;
    var sortedDays = Object.keys(diasConVenta).sort().reverse();
    for (var i = 0; i < sortedDays.length; i++) {
      if (diasConVenta[sortedDays[i]] >= Math.floor(promVentasDia)) streak++;
      else break;
    }

    // Best day of the month
    var bestDay = '', bestDayCount = 0;
    Object.keys(diasConVenta).forEach(function(d) {
      if (diasConVenta[d] > bestDayCount) { bestDayCount = diasConVenta[d]; bestDay = d; }
    });

    // Yesterday's sales for comparison (local Chihuahua)
    var ayerDate = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chihuahua' }));
    ayerDate.setDate(ayerDate.getDate() - 1);
    var ayerStr = ayerDate.toISOString().slice(0, 10);
    var ventasAyer = diasConVenta[ayerStr] || 0;
    var beatingYesterday = ventasHoy > ventasAyer && ventasAyer > 0;

    // Helper: pick random from array (seeded by day so it's consistent within the day)
    function _pick(arr) { return arr[diaHoy % arr.length]; }

    // Hour of day for contextual messages
    var hora = new Date().getHours();
    var diaSemana = new Date().getDay(); // 0=dom, 6=sab

    // Milestone messages (progress-based)
    var milestoneMsg = '';
    if (pct >= 100) {
      milestoneMsg = _pick([
        '🏆 META DEL MES LOGRADA — Son unos cracks!',
        '🏆 LO LOGRARON — Cada venta valió la pena!',
        '🏆 META SUPERADA — El equipo no para!'
      ]);
    } else if (pct >= 90) {
      milestoneMsg = _pick([
        '🔥 90% — Están a nada! El final se ve!',
        '🔥 A un paso de la gloria! No aflojen!',
        '🔥 90% — Esta semana se cierra la meta!'
      ]);
    } else if (pct >= 75) {
      milestoneMsg = _pick([
        '🔥 75% — La recta final! Cada cliente cuenta!',
        '🔥 Tres cuartos del camino — el ritmo no para!',
        '🔥 75% — Ya huelen la meta!'
      ]);
    } else if (pct >= 50) {
      milestoneMsg = _pick([
        '⚡ Mitad del camino — van con todo!',
        '⚡ 50% completado — el equipo responde!',
        '⚡ Medio mes, medio camino — sigan así!'
      ]);
    } else if (pct >= 25) {
      milestoneMsg = _pick([
        '✨ 25% — Buen arranque, a mantener el ritmo!',
        '✨ Ya llevan un cuarto — cada día suma!',
        '✨ El primer cuarto está hecho — a por más!'
      ]);
    } else if (pct >= 10) {
      milestoneMsg = _pick([
        '💫 El mes apenas empieza — todo es posible!',
        '💫 Arrancando motores — vamos por esa meta!',
        '💫 Cada venta los acerca — a darle!'
      ]);
    }

    // Contextual sub-message (time of day + situation)
    var contextMsg = '';
    if (ventasHoy >= ventasDiarias) {
      // Already hit daily target
      contextMsg = _pick([
        'Meta del día lista — cada venta extra es bonus!',
        'Día completado! Lo que sigue es ganancia pura',
        'Ya cumplieron hoy — ahora a romper el récord!'
      ]);
    } else if (beatingYesterday) {
      contextMsg = 'Van mejor que ayer — el ritmo sube!';
    } else if (ventasHoy === 0 && hora < 12) {
      contextMsg = _pick([
        'El primer cliente del día está por llegar!',
        'Mañana fresca, oportunidad nueva!',
        'A calentar motores — los clientes vienen en camino'
      ]);
    } else if (ventasHoy === 0 && hora >= 12) {
      contextMsg = _pick([
        'La tarde siempre trae sorpresas — a darle!',
        'Los mejores cierres pasan después de las 3pm',
        'Cada hora cuenta — el siguiente cliente es el bueno'
      ]);
    } else if (hora >= 17) {
      var faltanHoy = ventasDiarias - ventasHoy;
      contextMsg = faltanHoy <= 2 ? 'Cierre fuerte! Solo ' + faltanHoy + ' más!' : 'Hora pico — las 6pm es la hora dorada de ventas!';
    } else if (hora >= 13 && hora < 17) {
      contextMsg = _pick([
        'La tarde es cuando más se vende — aprovechen!',
        'Horario pico: 1-6pm, cada minuto es oportunidad',
        'Los clientes de la tarde ya vienen en camino'
      ]);
    } else {
      contextMsg = _pick([
        'Cada venta los acerca — no hay venta pequeña!',
        'El cliente que entra es una oportunidad — a cerrar!',
        'Hoy es un buen día para vender!'
      ]);
    }

    // Special day messages
    if (diaSemana === 6) { // Sábado
      contextMsg = _pick([
        'SÁBADO — el mejor día de la semana para vender!',
        'Sábado de ventas! Históricamente el día más fuerte',
        'Es sábado — a aprovechar el tráfico!'
      ]);
    } else if (diaSemana === 0) { // Domingo
      contextMsg = _pick([
        'Domingo tranquilo pero cada venta pesa doble!',
        'Domingos: menos tráfico, más calidad por cliente',
        'Domingo familiar — las familias buscan lentes!'
      ]);
    } else if (diaSemana === 1) { // Lunes
      contextMsg = _pick([
        'Lunes arrancando fuerte — segundo mejor día!',
        'Inicio de semana con todo! Lunes siempre entrega',
        'Semana nueva, meta nueva — hoy se marca el ritmo!'
      ]);
    }

    // Streak-based messages
    if (streak >= 5) {
      contextMsg = '🔥 ' + streak + ' días seguidos al ritmo — IMPARABLES!';
    } else if (streak >= 3) {
      contextMsg = '🔥 Racha de ' + streak + ' días — no la dejen caer!';
    }

    // Record-breaking day
    if (ventasHoy > 0 && ventasHoy >= bestDayCount) {
      contextMsg = '👑 VAN POR NUEVO RÉCORD DEL MES! — ' + ventasHoy + ' ventas hoy!';
    }

    // Main color
    var barColor;
    if (pct >= 100) barColor = '#66bb6a';
    else if (ventasHoy >= ventasDiarias) barColor = '#4fc3f7';
    else if (ventasHoy >= ventasDiarias * 0.5) barColor = '#ffa726';
    else barColor = '#ef5350';

    // ── MASCOTA ANIMADA que evoluciona ──
    // Temas rotan por día del mes
    var mascotThemes = [
      { stages:[ {e:'🛸',t:'Preparando...'}, {e:'🚀',t:'Despegando!'}, {e:'🚀',t:'En órbita!'}, {e:'🚀',t:'Velocidad luz!'}, {e:'🌟',t:'Llegamos a la luna!'}, {e:'🏆',t:'MISIÓN CUMPLIDA!'} ]},
      { stages:[ {e:'🥚',t:'El huevo espera...'}, {e:'🐣',t:'Nació el dragón!'}, {e:'🐲',t:'Está creciendo!'}, {e:'🐉',t:'Ya vuela!'}, {e:'🐉',t:'Escupe fuego!'}, {e:'🏆',t:'DRAGÓN LEGENDARIO!'} ]},
      { stages:[ {e:'😴',t:'Descansando...'}, {e:'🏋️',t:'Entrenando!'}, {e:'⚔️',t:'Listo para batalla!'}, {e:'💪',t:'En combate!'}, {e:'⚡',t:'MODO BESTIA!'}, {e:'🏆',t:'CAMPEÓN INVICTO!'} ]},
      { stages:[ {e:'🌱',t:'Semilla plantada'}, {e:'🌿',t:'Brotando!'}, {e:'🌳',t:'Creciendo fuerte!'}, {e:'🌸',t:'Floreciendo!'}, {e:'🌺',t:'En su máximo!'}, {e:'🏆',t:'ÁRBOL LEGENDARIO!'} ]},
      { stages:[ {e:'🎮',t:'Cargando partida...'}, {e:'🕹️',t:'Nivel 1 — Noob'}, {e:'⚡',t:'Nivel 2 — Pro'}, {e:'🔥',t:'Nivel 3 — Master'}, {e:'💎',t:'Diamante!'}, {e:'🏆',t:'NIVEL LEYENDA!'} ]},
      { stages:[ {e:'🎸',t:'Afinando...'}, {e:'🎵',t:'Primeros acordes!'}, {e:'🎶',t:'Suena bien!'}, {e:'🎤',t:'El público enloquece!'}, {e:'🎸',t:'SOLO ÉPICO!'}, {e:'🏆',t:'ROCK LEGEND!'} ]},
      { stages:[ {e:'👨‍🍳',t:'Preparando...'}, {e:'🍳',t:'Cocinando!'}, {e:'🍲',t:'Huele increíble!'}, {e:'🔥',t:'Casi listo!'}, {e:'⭐',t:'Plato de chef!'}, {e:'🏆',t:'ESTRELLA MICHELIN!'} ]},
      { stages:[ {e:'🏃',t:'Calentando...'}, {e:'🏃',t:'Tomando ritmo!'}, {e:'🏃',t:'Velocidad máxima!'}, {e:'🏃',t:'Sprint final!'}, {e:'🏅',t:'Cruzando la meta!'}, {e:'🏆',t:'MEDALLA DE ORO!'} ]},
      { stages:[ {e:'🧙',t:'Estudiando hechizos'}, {e:'✨',t:'Primer hechizo!'}, {e:'🔮',t:'Nivel intermedio!'}, {e:'⚡',t:'Poder creciendo!'}, {e:'🌟',t:'SUPREMO!'}, {e:'🏆',t:'MAGO LEGENDARIO!'} ]},
      { stages:[ {e:'🥷',t:'En las sombras...'}, {e:'🥷',t:'Primer ataque!'}, {e:'⚔️',t:'Combo activado!'}, {e:'🥷',t:'Modo invisible!'}, {e:'⚡',t:'JUTSU DEFINITIVO!'}, {e:'🏆',t:'HOKAGE!'} ]}
    ];
    var themeIdx = (diaHoy - 1) % mascotThemes.length;
    var theme = mascotThemes[themeIdx];

    // Mascot stage based on daily progress
    var dailyPct = ventasDiarias > 0 ? ventasHoy / ventasDiarias : 0;
    var stageIdx;
    if (dailyPct >= 1) stageIdx = 5;
    else if (dailyPct >= 0.8) stageIdx = 4;
    else if (dailyPct >= 0.6) stageIdx = 3;
    else if (dailyPct >= 0.3) stageIdx = 2;
    else if (dailyPct > 0) stageIdx = 1;
    else stageIdx = 0;
    var mascotEmoji = theme.stages[stageIdx].e;
    var mascotText = theme.stages[stageIdx].t;

    // CSS animation class + Lottie key based on stage (7 niveles progresivos)
    var mascotAnim = 'est-anim-idle';
    var lottieKey = 'sleep';
    if (stageIdx === 0) { mascotAnim = 'est-anim-sleep'; lottieKey = 'sleep'; }
    else if (stageIdx === 1) { mascotAnim = 'est-anim-bounce'; lottieKey = 'rocket'; }
    else if (stageIdx === 2) { mascotAnim = 'est-anim-bounce'; lottieKey = 'running'; }
    else if (stageIdx === 3) { mascotAnim = 'est-anim-fire'; lottieKey = 'fire'; }
    else if (stageIdx === 4) { mascotAnim = 'est-anim-fire'; lottieKey = 'star'; }
    else { mascotAnim = 'est-anim-celebrate'; lottieKey = 'celebrate'; }

    // Inject CSS animations once
    if (!document.getElementById('est-mascot-css')) {
      var css = document.createElement('style');
      css.id = 'est-mascot-css';
      css.textContent = [
        '@keyframes estSleep { 0%,100%{transform:scale(1) rotate(0deg)} 50%{transform:scale(1.05) rotate(-3deg)} }',
        '@keyframes estBounce { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }',
        '@keyframes estFire { 0%{transform:scale(1) rotate(0deg)} 25%{transform:scale(1.15) rotate(3deg)} 50%{transform:scale(1.05) rotate(-3deg)} 75%{transform:scale(1.2) rotate(2deg)} 100%{transform:scale(1) rotate(0deg)} }',
        '@keyframes estCelebrate { 0%{transform:scale(1) rotate(0deg)} 20%{transform:scale(1.3) rotate(-10deg)} 40%{transform:scale(0.9) rotate(10deg)} 60%{transform:scale(1.25) rotate(-5deg)} 80%{transform:scale(1.1) rotate(5deg)} 100%{transform:scale(1) rotate(0deg)} }',
        '@keyframes estGlow { 0%,100%{filter:drop-shadow(0 0 4px rgba(255,200,0,0.3))} 50%{filter:drop-shadow(0 0 16px rgba(255,200,0,0.8))} }',
        '@keyframes estShake { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-3px)} 75%{transform:translateX(3px)} }',
        '.est-anim-sleep { animation: estSleep 3s ease-in-out infinite; }',
        '.est-anim-bounce { animation: estBounce 1.2s ease-in-out infinite; }',
        '.est-anim-fire { animation: estFire 0.8s ease-in-out infinite, estGlow 1.5s ease-in-out infinite; }',
        '.est-anim-celebrate { animation: estCelebrate 1s ease-in-out infinite, estGlow 0.8s ease-in-out infinite; }',
        '.est-anim-idle { animation: estSleep 4s ease-in-out infinite; }'
      ].join('\n');
      document.head.appendChild(css);
    }

    // Ring progress (CSS conic-gradient)
    var ringSize = 110;
    var ringColor = barColor;
    var ringBg = 'rgba(255,255,255,0.06)';
    var ringGrad = 'conic-gradient(' + ringColor + ' ' + (pct * 3.6) + 'deg, ' + ringBg + ' ' + (pct * 3.6) + 'deg)';

    var h = '';
    h += '<div style="padding:16px 16px 12px;background:linear-gradient(135deg,rgba(255,255,255,0.04),rgba(255,255,255,0.01));border:1px solid rgba(255,255,255,0.1);border-radius:14px">';

    if (pct >= 100) {
      // META LOGRADA
      h += '<div style="text-align:center;padding:14px 0">';
      h += '<div id="est-lottie-trophy" style="width:64px;height:64px;margin:0 auto 6px"><span class="est-anim-celebrate" style="font-size:44px;line-height:64px;display:block">🏆</span></div>';
      h += '<div style="font-size:22px;font-weight:800;color:#66bb6a;letter-spacing:-0.5px">META DEL MES LOGRADA</div>';
      h += '<div style="font-size:13px;color:var(--muted);margin-top:6px">' + numVentas + ' ventas — superaron la meta</div>';
      if (streak >= 2) h += '<div style="margin-top:8px;font-size:12px;color:#ffa726;font-weight:600">🔥 ' + streak + ' días en racha</div>';
      h += '</div>';
    } else {
      // Two-column layout
      h += '<div style="display:flex;gap:12px">';

      // LEFT COLUMN: ring + today's mission
      h += '<div style="flex:1;display:flex;flex-direction:column;align-items:center;padding:10px;background:rgba(255,255,255,0.02);border-radius:10px">';

      // Ring
      h += '<div style="position:relative;width:' + ringSize + 'px;height:' + ringSize + 'px;margin-bottom:10px">';
      h += '<div style="width:100%;height:100%;border-radius:50%;background:' + ringGrad + ';display:flex;align-items:center;justify-content:center">';
      h += '<div style="width:' + (ringSize - 18) + 'px;height:' + (ringSize - 18) + 'px;border-radius:50%;background:var(--surface);display:flex;flex-direction:column;align-items:center;justify-content:center">';
      h += '<div style="font-size:26px;font-weight:800;color:' + barColor + ';line-height:1">' + pct + '%</div>';
      h += '<div style="font-size:9px;color:var(--muted);margin-top:2px">del mes</div>';
      h += '</div></div></div>';

      // Today counter
      h += '<div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:0.8px">Meta de hoy</div>';
      h += '<div style="display:flex;align-items:baseline;gap:3px;margin:2px 0">';
      h += '<span style="font-size:40px;font-weight:800;color:' + barColor + ';line-height:1">' + ventasHoy + '</span>';
      h += '<span style="font-size:16px;color:var(--muted);font-weight:600">de ' + ventasDiarias + '</span>';
      h += '</div>';

      // Today status
      var todayMsg, todayColor;
      if (ventasHoy >= ventasDiarias) {
        todayMsg = '✅ Día completado!'; todayColor = '#66bb6a';
      } else if (ventasHoy >= ventasDiarias - 1) {
        todayMsg = '🎯 Una más!'; todayColor = '#4fc3f7';
      } else {
        var faltan = ventasDiarias - ventasHoy;
        todayMsg = faltan + ' venta' + (faltan > 1 ? 's' : '') + ' más para hoy'; todayColor = 'var(--muted)';
      }
      h += '<div style="font-size:11px;color:' + todayColor + '">' + todayMsg + '</div>';
      h += '</div>'; // close left column

      // RIGHT COLUMN: mascot + motivation + stats
      h += '<div style="flex:1;display:flex;flex-direction:column;justify-content:center;gap:6px">';

      // Animated mascot — Lottie container with emoji fallback
      h += '<div style="display:flex;align-items:center;gap:8px">';
      h += '<div id="est-lottie-mascot" style="width:48px;height:48px;flex-shrink:0;display:flex;align-items:center;justify-content:center">';
      h += '<span class="' + mascotAnim + '" style="font-size:36px;line-height:1" id="est-emoji-fallback">' + mascotEmoji + '</span>';
      h += '</div>';
      h += '<div style="font-size:13px;font-weight:700;color:' + barColor + '">' + mascotText + '</div>';
      h += '</div>';

      // Milestone
      if (milestoneMsg) {
        h += '<div style="font-size:12px;font-weight:700;color:' + barColor + '">' + milestoneMsg + '</div>';
      }

      // Context message
      if (contextMsg) {
        h += '<div style="font-size:11px;color:var(--muted);line-height:1.3">' + contextMsg + '</div>';
      }

      // Divider
      h += '<div style="border-top:1px solid rgba(255,255,255,0.06);margin:2px 0"></div>';

      // Stats compact
      h += '<div style="display:flex;flex-direction:column;gap:4px">';
      h += '<div style="display:flex;justify-content:space-between;font-size:11px"><span style="color:var(--muted)">Ventas este mes</span><span style="font-weight:700">' + numVentas + '</span></div>';
      h += '<div style="display:flex;justify-content:space-between;font-size:11px"><span style="color:var(--muted)">Faltan para la meta</span><span style="font-weight:700;color:' + barColor + '">' + ventasRestantes + '</span></div>';
      if (bestDayCount > 0) h += '<div style="display:flex;justify-content:space-between;font-size:11px"><span style="color:var(--muted)">Récord en 1 día</span><span style="font-weight:700;color:#ffa726">👑 ' + bestDayCount + '</span></div>';
      h += '<div style="display:flex;justify-content:space-between;font-size:11px"><span style="color:var(--muted)">Días restantes</span><span style="font-weight:700">' + diasRestantes + '</span></div>';
      h += '</div>';

      // Streak badge
      if (streak >= 2) {
        h += '<div style="margin-top:2px"><span style="font-size:11px;background:rgba(255,167,38,0.15);padding:3px 10px;border-radius:10px;color:#ffa726;font-weight:600">🔥 ' + streak + ' días en racha</span></div>';
      }

      h += '</div>'; // close right column
      h += '</div>'; // close two-column flex
    }

    h += '</div>';
    el.innerHTML = h;

    // ── Render Lottie animations after DOM is ready ──
    // dotlottie-wc puede tardar en registrarse (type=module), reintentar si no está listo
    var _lottieRender = function() {
      if (pct >= 100) {
        _estRenderLottie('est-lottie-trophy', 'trophy', '🏆');
      } else {
        _estRenderLottie('est-lottie-mascot', lottieKey, mascotEmoji);
      }
    };
    if (customElements.get('dotlottie-wc')) {
      _lottieRender();
    } else {
      // Esperar a que el web component se registre (max 3s)
      customElements.whenDefined('dotlottie-wc').then(_lottieRender).catch(function(){});
    }

    // Auto-refresh every 3 minutes
    if (!window._metaWidgetInterval) {
      window._metaWidgetInterval = setInterval(function() {
        if (document.getElementById('dash-meta-widget') && document.getElementById('view-dashboard')?.classList.contains('active')) {
          _loadDashMetaWidget(sucursal);
        }
      }, 180000); // 3 min
    }
  } catch(e) {
    console.error('[MetaWidget]', e);
  }
}
