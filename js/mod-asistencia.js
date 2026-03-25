// ═══════════════════════════════════════════════════════════
// MÓDULO RECURSOS HUMANOS v169
// Asistencia (Reloj Checador WA) · Reportes · Expedientes
// Permisos/Vacaciones · Firmas Digitales · Calendario
// ═══════════════════════════════════════════════════════════

var _asistData = [];
var _asistPhoneMap = {};
var _asistHorarios = null;
var _asistUsers = {};
var _asistAsesores = {};
var _asistExpedientes = {}; // uid → {nombre_completo, curp, nss, rfc, puesto, departamento, fecha_ingreso, salario, reg_patronal}
var _asistActiveTab = 'diario';
var _asistFechaDiario = '';
var _asistCurrentFirma = null; // firma record for current document view

// ═══════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════

function _asistHoyLocal() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chihuahua' });
}

function _asistFormatHora(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleTimeString('es-MX', { timeZone: 'America/Chihuahua', hour: '2-digit', minute: '2-digit', hour12: true });
}

function _asistDayKey(date) {
  var d = typeof date === 'string' ? new Date(date + 'T12:00:00') : date;
  return ['dom','lun','mar','mie','jue','vie','sab'][d.getDay()];
}

function _asistDayLabel(date) {
  var d = typeof date === 'string' ? new Date(date + 'T12:00:00') : date;
  return ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'][d.getDay()];
}

function _asistResolveSchedule(uid, dayKey) {
  if (!_asistHorarios) return null;
  var sched = _asistHorarios.default ? _asistHorarios.default[dayKey] : null;
  if (_asistHorarios.override && _asistHorarios.override[uid]) {
    var ov = _asistHorarios.override[uid][dayKey];
    if (ov === null) return null; // day off
    if (ov) sched = ov;
  }
  return sched;
}

function _asistSchedMinutes(timeStr) {
  if (!timeStr) return 0;
  var p = timeStr.split(':');
  return parseInt(p[0]) * 60 + parseInt(p[1]);
}

function _asistGetActiveEmployees() {
  // Returns array of {uid, nombre, sucursal} for all employees with phone mapping
  var emps = [];
  var allAsesores = _asistGetAllAsesores();
  for (var phone in _asistPhoneMap) {
    var uid = _asistPhoneMap[phone];
    var nombre = uid;
    var sucursal = 'N/A';
    // Check if it's an asesor uid
    if (uid.startsWith('asesor_')) {
      var match = allAsesores.find(function(a) { return 'asesor_' + a.nombre.toLowerCase().replace(/\s+/g, '_') === uid; });
      if (match) { nombre = match.nombre; sucursal = match.sucursal; }
    } else if (uid.startsWith('extra_')) {
      var extras = (_asistHorarios && _asistHorarios.empleados_extra) || {};
      if (extras[uid]) { nombre = extras[uid].nombre; sucursal = extras[uid].sucursal; }
    } else {
      var u = _asistUsers[uid] || {};
      nombre = u.nombre || uid;
      sucursal = u.sucursal || 'N/A';
    }
    emps.push({ uid: uid, nombre: nombre, sucursal: sucursal });
  }
  // Deduplicate by uid
  var seen = {};
  return emps.filter(function(e) { if (seen[e.uid]) return false; seen[e.uid] = true; return true; });
}

function _asistBuildUpcomingEvents(emps) {
  var today = _asistHoyLocal();
  var todayDate = new Date(today + 'T12:00:00');
  var events = [];

  // 1. Birthdays — next 30 days
  emps.forEach(function(emp) {
    var exp = _asistExpedientes[emp.uid] || {};
    if (!exp.fecha_nacimiento) return;
    var bParts = exp.fecha_nacimiento.split('-');
    var bMonth = parseInt(bParts[1]);
    var bDay = parseInt(bParts[2]);
    var bYear = parseInt(bParts[0]);
    // This year's birthday
    var bThisYear = new Date(todayDate.getFullYear(), bMonth - 1, bDay, 12, 0, 0);
    if (bThisYear < todayDate) bThisYear.setFullYear(bThisYear.getFullYear() + 1);
    var daysUntil = Math.floor((bThisYear - todayDate) / (24 * 60 * 60 * 1000));
    if (daysUntil <= 30) {
      var age = bThisYear.getFullYear() - bYear;
      events.push({
        date: bThisYear.toLocaleDateString('en-CA'),
        daysUntil: daysUntil,
        icon: '🎂',
        text: emp.nombre + ' cumple ' + age + ' años',
        color: '#e8a84a',
        type: 'cumple'
      });
    }
  });

  // 2. Upcoming permissions/vacations — from asistencia records with nota
  // We already loaded records on diario, but we need future ones. Use a lightweight approach from expedientes.
  // Check asistencia records for future dates with notas
  // Since we can't do async here, we'll use a cached approach — loaded in initAsistencia
  if (window._asistUpcomingPermisos) {
    window._asistUpcomingPermisos.forEach(function(p) {
      var empMatch = emps.find(function(e) { return e.uid === p.uid; });
      var empName = empMatch ? empMatch.nombre : p.uid;
      var daysUntil = Math.floor((new Date(p.fecha + 'T12:00:00') - todayDate) / (24 * 60 * 60 * 1000));
      if (daysUntil >= 0 && daysUntil <= 30) {
        var icon = /vacaciones/i.test(p.nota) ? '🏖️' : /incapacidad/i.test(p.nota) ? '🏥' : '📋';
        var color = /vacaciones/i.test(p.nota) ? '#4af0c8' : /incapacidad/i.test(p.nota) ? '#f5a623' : '#8ab0e8';
        events.push({
          date: p.fecha,
          daysUntil: daysUntil,
          icon: icon,
          text: empName + ' — ' + p.nota,
          color: color,
          type: 'permiso'
        });
      }
    });
  }

  // 3. Anniversaries — fecha_ingreso
  emps.forEach(function(emp) {
    var exp = _asistExpedientes[emp.uid] || {};
    if (!exp.fecha_ingreso) return;
    var iParts = exp.fecha_ingreso.split('-');
    var iMonth = parseInt(iParts[1]);
    var iDay = parseInt(iParts[2]);
    var iYear = parseInt(iParts[0]);
    var iThisYear = new Date(todayDate.getFullYear(), iMonth - 1, iDay, 12, 0, 0);
    if (iThisYear < todayDate) iThisYear.setFullYear(iThisYear.getFullYear() + 1);
    var daysUntil = Math.floor((iThisYear - todayDate) / (24 * 60 * 60 * 1000));
    if (daysUntil <= 30 && daysUntil >= 0) {
      var years = iThisYear.getFullYear() - iYear;
      events.push({
        date: iThisYear.toLocaleDateString('en-CA'),
        daysUntil: daysUntil,
        icon: '🏆',
        text: emp.nombre + ' cumple ' + years + ' año(s) en la empresa',
        color: '#9b59b6',
        type: 'aniversario'
      });
    }
  });

  if (events.length === 0) return '';

  // Sort by date
  events.sort(function(a, b) { return a.daysUntil - b.daysUntil; });

  var html = '<div style="background:var(--surface2);border:1px solid rgba(255,255,255,0.07);border-radius:10px;padding:12px 14px;margin-bottom:12px">';
  html += '<div style="font-size:10px;font-weight:700;color:var(--beige);text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">Proximos eventos (30 dias)</div>';
  html += '<div style="display:flex;flex-direction:column;gap:4px">';
  events.slice(0, 8).forEach(function(ev) {
    var dayLabel = ev.daysUntil === 0 ? 'HOY' : ev.daysUntil === 1 ? 'Mañana' : 'En ' + ev.daysUntil + ' dias';
    var dayBg = ev.daysUntil === 0 ? 'rgba(232,168,74,0.2)' : ev.daysUntil <= 3 ? 'rgba(255,255,255,0.06)' : 'transparent';
    html += '<div style="display:flex;align-items:center;gap:8px;padding:4px 6px;border-radius:6px;background:' + dayBg + '">';
    html += '<span style="font-size:16px">' + ev.icon + '</span>';
    html += '<span style="flex:1;font-size:11px;color:var(--white)">' + ev.text + '</span>';
    html += '<span style="font-size:10px;color:' + ev.color + ';font-weight:600;white-space:nowrap">' + dayLabel + '</span>';
    html += '<span style="font-size:9px;color:var(--muted)">' + ev.date.slice(5) + '</span>';
    html += '</div>';
  });
  if (events.length > 8) {
    html += '<div style="font-size:9px;color:var(--muted);text-align:center;margin-top:4px">+ ' + (events.length - 8) + ' eventos mas</div>';
  }
  html += '</div></div>';
  return html;
}

function _asistDateRange(tipo) {
  var hoy = new Date(_asistHoyLocal() + 'T12:00:00');
  var dow = hoy.getDay(); // 0=dom
  if (tipo === 'semana') {
    var start = new Date(hoy); start.setDate(hoy.getDate() - ((dow === 0 ? 7 : dow) - 1)); // lunes
    var end = new Date(start); end.setDate(start.getDate() + 6); // domingo
    return { start: start.toLocaleDateString('en-CA'), end: end.toLocaleDateString('en-CA'), label: 'Semana actual' };
  }
  if (tipo === 'semana-pasada') {
    var start2 = new Date(hoy); start2.setDate(hoy.getDate() - ((dow === 0 ? 7 : dow) - 1) - 7);
    var end2 = new Date(start2); end2.setDate(start2.getDate() + 6);
    return { start: start2.toLocaleDateString('en-CA'), end: end2.toLocaleDateString('en-CA'), label: 'Semana pasada' };
  }
  if (tipo === 'q1' || tipo === 'q2') {
    var y = hoy.getFullYear(); var m = hoy.getMonth();
    if (tipo === 'q1') return { start: y+'-'+(m+1<10?'0':'')+(m+1)+'-01', end: y+'-'+(m+1<10?'0':'')+(m+1)+'-15', label: 'Quincena 1 (' + hoy.toLocaleString('es-MX',{month:'long'}) + ')' };
    var lastDay = new Date(y, m+1, 0).getDate();
    return { start: y+'-'+(m+1<10?'0':'')+(m+1)+'-16', end: y+'-'+(m+1<10?'0':'')+(m+1)+'-'+lastDay, label: 'Quincena 2 (' + hoy.toLocaleString('es-MX',{month:'long'}) + ')' };
  }
  return { start: _asistHoyLocal(), end: _asistHoyLocal(), label: 'Hoy' };
}

// ═══════════════════════════════════════════════════════════
// INIT & DATA LOADING
// ═══════════════════════════════════════════════════════════

async function initAsistencia() {
  var cont = document.getElementById('asist-content-diario');
  if (cont) cont.innerHTML = '<div style="padding:24px;text-align:center;color:var(--muted);font-size:12px"><span class="spinner-sm"></span> Cargando...</div>';

  // Show tabs for admin and gerencia
  var isAdminOrGerencia = currentUser && (currentUser.rol === 'admin' || currentUser.rol === 'gerencia');
  var cfgTab = document.getElementById('asist-tab-config');
  if (cfgTab) cfgTab.style.display = isAdminOrGerencia ? '' : 'none';
  var expTab = document.getElementById('asist-tab-expediente');
  if (expTab) expTab.style.display = isAdminOrGerencia ? '' : 'none';

  try {
    // Load config in parallel
    var cfgRes = await db.from('app_config').select('id,value').in('id', ['empleados_telefono', 'horarios_asistencia', 'custom_users', 'asesores', 'expedientes_empleados']);
    var cfgData = cfgRes.data || [];
    cfgData.forEach(function(c) {
      var v = typeof c.value === 'string' ? JSON.parse(c.value) : c.value;
      if (c.id === 'empleados_telefono') _asistPhoneMap = v || {};
      if (c.id === 'horarios_asistencia') _asistHorarios = v;
      if (c.id === 'custom_users') _asistUsers = v || {};
      if (c.id === 'asesores') _asistAsesores = v || {};
      if (c.id === 'expedientes_empleados') _asistExpedientes = v || {};
    });
    if (!_asistHorarios) {
      _asistHorarios = { default: { lun:{entrada:'10:00',salida:'19:00'}, mar:{entrada:'10:00',salida:'19:00'}, mie:{entrada:'10:00',salida:'19:00'}, jue:{entrada:'10:00',salida:'19:00'}, vie:{entrada:'10:00',salida:'19:00'}, sab:{entrada:'10:00',salida:'19:00'}, dom:{entrada:'11:00',salida:'17:00'} }, tolerancia_min: 10, override: {} };
    }
  } catch(e) {
    console.error('[Asistencia] Config load error:', e);
  }

  // Load upcoming permissions for calendar
  try {
    var hoy = _asistHoyLocal();
    var in30 = new Date(hoy + 'T12:00:00'); in30.setDate(in30.getDate() + 30);
    var futureRes = await db.from('asistencia').select('uid,fecha,nota').gte('fecha', hoy).lte('fecha', in30.toLocaleDateString('en-CA')).not('nota', 'is', null).neq('nota', '');
    window._asistUpcomingPermisos = futureRes.data || [];
  } catch(e) { window._asistUpcomingPermisos = []; }

  _asistFechaDiario = _asistHoyLocal();
  asistSwitchTab(_asistActiveTab);
}

function asistSwitchTab(tab) {
  _asistActiveTab = tab;
  ['diario','resumen','expediente','config'].forEach(function(t) {
    var el = document.getElementById('asist-content-' + t);
    var btn = document.getElementById('asist-tab-' + t);
    if (el) el.style.display = t === tab ? '' : 'none';
    if (btn) { btn.classList.toggle('active', t === tab); }
  });
  if (tab === 'diario') asistCargarDiario(_asistFechaDiario);
  if (tab === 'resumen') asistCargarResumen('semana');
  if (tab === 'expediente') asistRenderExpedientes();
  if (tab === 'config') asistRenderConfig();
}

// ═══════════════════════════════════════════════════════════
// TAB: DIARIO
// ═══════════════════════════════════════════════════════════

async function asistCargarDiario(fecha) {
  _asistFechaDiario = fecha || _asistHoyLocal();
  var cont = document.getElementById('asist-content-diario');
  if (!cont) return;

  // Load records for this date
  var res = await db.from('asistencia').select('*').eq('fecha', _asistFechaDiario);
  var records = res.data || [];

  // Build lookup by uid
  var recByUid = {};
  records.forEach(function(r) { recByUid[r.uid] = r; });

  // Get all registered employees
  var emps = _asistGetActiveEmployees();
  var dayKey = _asistDayKey(_asistFechaDiario);
  var dayLabel = _asistDayLabel(_asistFechaDiario);

  // Build rows: each employee with their record or falta
  var rows = [];
  var stats = { total: 0, presentes: 0, retardos: 0, faltas: 0 };

  emps.forEach(function(emp) {
    var sched = _asistResolveSchedule(emp.uid, dayKey);
    if (!sched) return; // day off for this employee
    stats.total++;
    var rec = recByUid[emp.uid];
    var estado = 'falta';
    if (rec && rec.entrada) {
      estado = (rec.retardo_min && rec.retardo_min > 0) ? 'retardo' : 'a_tiempo';
      stats.presentes++;
      if (estado === 'retardo') stats.retardos++;
    } else {
      // Check if day is in the past — if today, might still come in
      if (_asistFechaDiario === _asistHoyLocal()) {
        estado = 'pendiente';
      } else {
        stats.faltas++;
      }
    }
    rows.push({ emp: emp, rec: rec, sched: sched, estado: estado });
  });

  var fechaDisplay = new Date(_asistFechaDiario + 'T12:00:00').toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  var html = '';
  // Date picker
  html += '<div style="display:flex;gap:8px;align-items:center;margin-bottom:16px;flex-wrap:wrap">';
  html += '<input type="date" value="' + _asistFechaDiario + '" onchange="asistCargarDiario(this.value)" style="background:var(--surface2);border:1px solid rgba(255,255,255,0.09);border-radius:8px;padding:8px 12px;color:var(--white);font-family:Outfit,sans-serif;font-size:12px;outline:none">';
  html += '<span style="color:var(--muted);font-size:12px">' + fechaDisplay + '</span>';
  html += '<div style="margin-left:auto;display:flex;gap:6px">';
  html += '<button class="btn btn-g btn-sm" onclick="asistCargarDiario(\'' + _asistHoyLocal() + '\')">Hoy</button>';
  if (currentUser && (currentUser.rol === 'admin' || currentUser.rol === 'gerencia')) {
    html += '<button class="btn btn-g btn-sm" onclick="asistAbrirPermisos()" style="margin-left:4px">📅 Permisos / Vacaciones</button>';
  }
  html += '</div></div>';

  // Upcoming events dashboard
  var eventsHtml = _asistBuildUpcomingEvents(emps);
  if (eventsHtml) {
    html += eventsHtml;
  }

  // Stats cards
  html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px;margin-bottom:16px">';
  html += _asistStatCard('👥', 'Empleados', stats.total, 'var(--accent)');
  html += _asistStatCard('✅', 'Presentes', stats.presentes, '#4af0c8');
  html += _asistStatCard('⚠️', 'Retardos', stats.retardos, '#f5a623');
  html += _asistStatCard('❌', 'Faltas', stats.faltas, '#e74c3c');
  html += '</div>';

  // Table
  if (rows.length === 0) {
    html += '<div style="padding:24px;text-align:center;color:var(--muted);font-size:12px">No hay empleados registrados. Configura teléfonos en la pestaña Configuración.</div>';
  } else {
    html += '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12px">';
    html += '<thead><tr style="border-bottom:1px solid rgba(255,255,255,0.08)">';
    html += '<th style="text-align:left;padding:8px;color:var(--muted);font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.05em">Empleado</th>';
    html += '<th style="text-align:left;padding:8px;color:var(--muted);font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.05em">Sucursal</th>';
    html += '<th style="text-align:center;padding:8px;color:var(--muted);font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.05em">Entrada</th>';
    html += '<th style="text-align:center;padding:8px;color:var(--muted);font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.05em">Comida</th>';
    html += '<th style="text-align:center;padding:8px;color:var(--muted);font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.05em">Regreso</th>';
    html += '<th style="text-align:center;padding:8px;color:var(--muted);font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.05em">Salida</th>';
    html += '<th style="text-align:center;padding:8px;color:var(--muted);font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.05em">Horas</th>';
    html += '<th style="text-align:center;padding:8px;color:var(--muted);font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.05em">Retardo</th>';
    html += '<th style="text-align:center;padding:8px;color:var(--muted);font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.05em">Estado</th>';
    html += '<th style="text-align:left;padding:8px;color:var(--muted);font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;max-width:120px">Nota</th>';
    if (currentUser && (currentUser.rol === 'admin' || currentUser.rol === 'gerencia')) {
      html += '<th style="text-align:center;padding:8px;color:var(--muted);font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.05em"></th>';
    }
    html += '</tr></thead><tbody>';

    rows.forEach(function(r) {
      var bgColor = r.estado === 'a_tiempo' ? 'rgba(74,240,200,0.04)' : r.estado === 'retardo' ? 'rgba(245,166,35,0.06)' : r.estado === 'falta' ? 'rgba(231,76,60,0.06)' : '';
      var estadoBadge = r.estado === 'a_tiempo' ? '<span style="background:rgba(74,240,200,0.15);color:#4af0c8;padding:2px 8px;border-radius:10px;font-size:10px">A tiempo</span>'
        : r.estado === 'retardo' ? '<span style="background:rgba(245,166,35,0.15);color:#f5a623;padding:2px 8px;border-radius:10px;font-size:10px">Retardo</span>'
        : r.estado === 'falta' ? '<span style="background:rgba(231,76,60,0.15);color:#e74c3c;padding:2px 8px;border-radius:10px;font-size:10px">Falta</span>'
        : '<span style="background:rgba(255,255,255,0.06);color:var(--muted);padding:2px 8px;border-radius:10px;font-size:10px">Pendiente</span>';
      var rec = r.rec || {};
      var comidaMin = '';
      if (rec.comida_inicio && rec.comida_fin) {
        var cm = Math.round((new Date(rec.comida_fin).getTime() - new Date(rec.comida_inicio).getTime()) / 60000);
        comidaMin = ' <span style="color:var(--muted);font-size:10px">(' + cm + 'min)</span>';
      }
      html += '<tr style="border-bottom:1px solid rgba(255,255,255,0.04);background:' + bgColor + '">';
      html += '<td style="padding:8px;font-weight:500">' + r.emp.nombre + '</td>';
      html += '<td style="padding:8px;color:var(--muted)">' + r.emp.sucursal + '</td>';
      html += '<td style="padding:8px;text-align:center">' + _asistFormatHora(rec.entrada) + '</td>';
      html += '<td style="padding:8px;text-align:center">' + _asistFormatHora(rec.comida_inicio) + '</td>';
      html += '<td style="padding:8px;text-align:center">' + _asistFormatHora(rec.comida_fin) + comidaMin + '</td>';
      html += '<td style="padding:8px;text-align:center">' + _asistFormatHora(rec.salida) + '</td>';
      html += '<td style="padding:8px;text-align:center;font-weight:600">' + (rec.horas_trabajadas ? parseFloat(rec.horas_trabajadas).toFixed(2) + 'h' : '—') + '</td>';
      html += '<td style="padding:8px;text-align:center">' + (rec.retardo_min > 0 ? '<span style="color:#f5a623">' + rec.retardo_min + ' min</span>' : '—') + '</td>';
      html += '<td style="padding:8px;text-align:center">' + estadoBadge + '</td>';
      html += '<td style="padding:8px;text-align:left;max-width:120px"><span style="font-size:10px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:block" title="' + (rec.nota || '').replace(/"/g,'&quot;') + '">' + (rec.nota || '—') + '</span></td>';
      if (currentUser && (currentUser.rol === 'admin' || currentUser.rol === 'gerencia')) {
        html += '<td style="padding:8px;text-align:center">';
        html += '<button class="btn btn-g" style="padding:3px 8px;font-size:11px" onclick="asistEditarRegistro(\'' + r.emp.uid + '\',\'' + r.emp.nombre.replace(/'/g,"\\'") + '\',\'' + _asistFechaDiario + '\',' + (rec.id||'null') + ')" title="Editar registro">✏️</button>';
        html += '</td>';
      }
      html += '</tr>';
    });
    html += '</tbody></table></div>';
  }

  cont.innerHTML = html;
}

function _asistStatCard(icon, label, value, color) {
  return '<div style="background:var(--surface2);border:1px solid rgba(255,255,255,0.07);border-radius:10px;padding:12px 14px;display:flex;align-items:center;gap:10px">' +
    '<span style="font-size:20px">' + icon + '</span>' +
    '<div><div style="font-size:18px;font-weight:700;color:' + color + '">' + value + '</div>' +
    '<div style="font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em">' + label + '</div></div></div>';
}

async function asistEditarNota(uid, fecha, recordId) {
  var nota = prompt('Nota para ' + uid + ' (' + fecha + '):');
  if (nota === null) return;
  try {
    if (recordId) {
      await db.from('asistencia').update({ nota: nota }).eq('id', recordId);
    } else {
      // Create record with just the nota (falta with note)
      await db.from('asistencia').insert({ uid: uid, fecha: fecha, nota: nota, es_falta: true, sucursal: (_asistUsers[uid]||{}).sucursal || '' });
    }
    asistCargarDiario(_asistFechaDiario);
    if (typeof toast === 'function') toast('Nota guardada');
  } catch(e) {
    console.error('[Asistencia] Nota error:', e);
    if (typeof toast === 'function') toast('Error guardando nota', 'error');
  }
}

// ═══════════════════════════════════════════════════════════
// MODAL: EDITAR REGISTRO MANUAL
// ═══════════════════════════════════════════════════════════

var _asistEditRec = null; // current record being edited

function _asistTsToTime(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleTimeString('en-GB', { timeZone: 'America/Chihuahua', hour: '2-digit', minute: '2-digit' });
}

function _asistTimeToTs(fecha, timeStr) {
  if (!timeStr) return null;
  // Build ISO timestamp in America/Chihuahua (UTC-6 always, no DST)
  return fecha + 'T' + timeStr + ':00-06:00';
}

async function asistEditarRegistro(uid, nombre, fecha, recordId) {
  // Load existing record if any
  _asistEditRec = null;
  if (recordId && recordId !== 'null') {
    var res = await db.from('asistencia').select('*').eq('id', recordId).limit(1);
    if (res.data && res.data[0]) _asistEditRec = res.data[0];
  }
  var rec = _asistEditRec || {};
  var dayKey = _asistDayKey(fecha);
  var sched = _asistResolveSchedule(uid, dayKey);
  var schedLabel = sched ? sched.entrada + ' - ' + sched.salida : 'Sin horario';

  var lblS = 'display:block;font-size:10px;color:var(--muted);margin-bottom:4px;text-transform:uppercase;letter-spacing:.04em';
  var inpS = 'width:100%;background:var(--surface2);border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:8px 10px;color:var(--white);font-family:Outfit,sans-serif;font-size:13px;outline:none';

  var html = '<div style="padding:20px;max-width:400px;margin:auto">';
  html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">';
  html += '<div><div style="font-size:16px;font-weight:700">Editar registro</div>';
  html += '<div style="font-size:11px;color:var(--muted)">' + nombre + ' — ' + fecha + '</div></div>';
  html += '<button onclick="asistCerrarModalRegistro()" style="background:none;border:none;color:var(--muted);font-size:20px;cursor:pointer;padding:4px">✕</button>';
  html += '</div>';

  // Schedule info
  html += '<div style="background:rgba(74,240,200,0.06);border:1px solid rgba(74,240,200,0.12);border-radius:8px;padding:8px 12px;margin-bottom:16px;font-size:11px;color:#4af0c8">';
  html += 'Horario programado: <strong>' + schedLabel + '</strong></div>';

  // Time fields in 2x2 grid
  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px">';

  html += '<div><label style="' + lblS + '">Entrada</label>';
  html += '<input type="time" id="asist-edit-entrada" value="' + _asistTsToTime(rec.entrada) + '" style="' + inpS + '"></div>';

  html += '<div><label style="' + lblS + '">Comida</label>';
  html += '<input type="time" id="asist-edit-comida" value="' + _asistTsToTime(rec.comida_inicio) + '" style="' + inpS + '"></div>';

  html += '<div><label style="' + lblS + '">Regreso</label>';
  html += '<input type="time" id="asist-edit-regreso" value="' + _asistTsToTime(rec.comida_fin) + '" style="' + inpS + '"></div>';

  html += '<div><label style="' + lblS + '">Salida</label>';
  html += '<input type="time" id="asist-edit-salida" value="' + _asistTsToTime(rec.salida) + '" style="' + inpS + '"></div>';

  html += '</div>';

  // Nota
  html += '<div style="margin-bottom:16px"><label style="' + lblS + '">Nota</label>';
  html += '<input type="text" id="asist-edit-nota" value="' + (rec.nota || '').replace(/"/g,'&quot;') + '" style="' + inpS + '" placeholder="Ej: Llegó tarde por tráfico"></div>';

  // Buttons
  html += '<div style="display:flex;gap:8px;justify-content:flex-end">';
  html += '<button class="btn btn-g" onclick="asistCerrarModalRegistro()">Cancelar</button>';
  html += '<button class="btn" id="asist-edit-save-btn" style="background:var(--accent);color:#000;font-weight:600" onclick="asistGuardarRegistro(\'' + uid + '\',\'' + fecha + '\',' + (recordId||'null') + ')">Guardar</button>';
  html += '</div></div>';

  // Show modal
  var overlay = document.getElementById('asist-modal-registro');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'asist-modal-registro';
    overlay.className = 'm-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.65);z-index:9999;display:flex;align-items:center;justify-content:center';
    overlay.onclick = function(e) { if (e.target === overlay) asistCerrarModalRegistro(); };
    document.body.appendChild(overlay);
  }
  overlay.innerHTML = '<div style="background:var(--surface);border:1px solid rgba(255,255,255,0.08);border-radius:14px;width:90%;max-width:440px;max-height:90vh;overflow-y:auto">' + html + '</div>';
  overlay.classList.add('open');
}

function asistCerrarModalRegistro() {
  var overlay = document.getElementById('asist-modal-registro');
  if (overlay) { overlay.classList.remove('open'); overlay.remove(); }
}

async function asistGuardarRegistro(uid, fecha, recordId) {
  var btn = document.getElementById('asist-edit-save-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Guardando...'; }

  try {
    var entrada = document.getElementById('asist-edit-entrada').value;
    var comida = document.getElementById('asist-edit-comida').value;
    var regreso = document.getElementById('asist-edit-regreso').value;
    var salida = document.getElementById('asist-edit-salida').value;
    var nota = document.getElementById('asist-edit-nota').value.trim();

    var entradaTs = _asistTimeToTs(fecha, entrada);
    var comidaTs = _asistTimeToTs(fecha, comida);
    var regresoTs = _asistTimeToTs(fecha, regreso);
    var salidaTs = _asistTimeToTs(fecha, salida);

    // Calculate retardo
    var retardo = 0;
    if (entrada) {
      var dayKey = _asistDayKey(fecha);
      var sched = _asistResolveSchedule(uid, dayKey);
      if (sched && sched.entrada) {
        var tolerance = (_asistHorarios && _asistHorarios.tolerancia) || 5;
        var schedMin = _asistSchedMinutes(sched.entrada);
        var actualMin = _asistSchedMinutes(entrada);
        var diff = actualMin - schedMin - tolerance;
        retardo = diff > 0 ? diff : 0;
      }
    }

    // Calculate hours worked
    var horas = null;
    if (entrada && salida) {
      var entMs = new Date(entradaTs).getTime();
      var salMs = new Date(salidaTs).getTime();
      var totalMin = (salMs - entMs) / 60000;
      // Subtract lunch
      if (comida && regreso) {
        var comMs = new Date(comidaTs).getTime();
        var regMs = new Date(regresoTs).getTime();
        totalMin -= (regMs - comMs) / 60000;
      }
      horas = Math.max(0, parseFloat((totalMin / 60).toFixed(2)));
    }

    var data = {
      entrada: entradaTs,
      comida_inicio: comidaTs,
      comida_fin: regresoTs,
      salida: salidaTs,
      retardo_min: retardo,
      horas_trabajadas: horas,
      es_falta: !entrada,
      nota: nota || null
    };

    if (recordId && recordId !== 'null' && recordId !== null) {
      await db.from('asistencia').update(data).eq('id', recordId);
    } else {
      data.uid = uid;
      data.fecha = fecha;
      data.sucursal = (_asistUsers[uid] || _asistAsesores[uid] || {}).sucursal || '';
      await db.from('asistencia').insert(data);
    }

    asistCerrarModalRegistro();
    asistCargarDiario(_asistFechaDiario);
    if (typeof toast === 'function') toast('Registro guardado');
  } catch(e) {
    console.error('[Asistencia] Guardar registro error:', e);
    if (typeof toast === 'function') toast('Error guardando registro', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Guardar'; }
  }
}

// ═══════════════════════════════════════════════════════════
// TAB: RESUMEN (semanal/quincenal)
// ═══════════════════════════════════════════════════════════

var _asistResumenTipo = 'semana';

async function asistCargarResumen(tipo) {
  _asistResumenTipo = tipo || 'semana';
  var cont = document.getElementById('asist-content-resumen');
  if (!cont) return;
  cont.innerHTML = '<div style="padding:24px;text-align:center;color:var(--muted);font-size:12px"><span class="spinner-sm"></span> Cargando...</div>';

  var range = _asistDateRange(_asistResumenTipo);

  // Load all records in range
  var res = await db.from('asistencia').select('*').gte('fecha', range.start).lte('fecha', range.end);
  var records = res.data || [];

  var emps = _asistGetActiveEmployees();
  var tolerancia = (_asistHorarios && _asistHorarios.tolerancia_min) || 10;

  // Calculate per-employee summary
  var summary = [];
  emps.forEach(function(emp) {
    var empRecs = records.filter(function(r) { return r.uid === emp.uid; });
    var diasTrabajados = empRecs.filter(function(r) { return r.entrada; }).length;
    var horasTotal = 0;
    var retardos = 0;
    var faltas = 0;
    var horasExtra = 0;

    // Count scheduled days in range
    var d = new Date(range.start + 'T12:00:00');
    var endD = new Date(range.end + 'T12:00:00');
    var diasProgramados = 0;
    var recByFecha = {};
    empRecs.forEach(function(r) { recByFecha[r.fecha] = r; });

    while (d <= endD) {
      var dk = _asistDayKey(d);
      var sched = _asistResolveSchedule(emp.uid, dk);
      if (sched) {
        diasProgramados++;
        var f = d.toLocaleDateString('en-CA');
        var rec = recByFecha[f];
        if (rec && rec.entrada) {
          if (rec.horas_trabajadas) horasTotal += parseFloat(rec.horas_trabajadas);
          if (rec.retardo_min > 0) retardos++;
          // Calc horas extra
          if (sched.entrada && sched.salida && rec.horas_trabajadas) {
            var schedHours = (_asistSchedMinutes(sched.salida) - _asistSchedMinutes(sched.entrada)) / 60;
            // Subtract 1h lunch if schedule is 8h+
            if (schedHours >= 8) schedHours -= 1;
            var extra = parseFloat(rec.horas_trabajadas) - schedHours;
            if (extra > 0.25) horasExtra += extra; // only count if >15min
          }
        } else {
          // Only count as falta if date is in the past
          if (f < _asistHoyLocal()) faltas++;
        }
      }
      d.setDate(d.getDate() + 1);
    }

    summary.push({
      emp: emp,
      diasProgramados: diasProgramados,
      diasTrabajados: diasTrabajados,
      horasTotal: horasTotal,
      retardos: retardos,
      faltas: faltas,
      horasExtra: horasExtra
    });
  });

  var html = '';
  // Period selector
  html += '<div style="display:flex;gap:6px;margin-bottom:16px;flex-wrap:wrap">';
  ['semana','semana-pasada','q1','q2'].forEach(function(t) {
    var labels = { semana:'Semana actual', 'semana-pasada':'Semana pasada', q1:'Quincena 1', q2:'Quincena 2' };
    var active = t === _asistResumenTipo;
    html += '<button class="btn btn-g btn-sm" style="' + (active ? 'background:var(--accent);color:#000;border-color:var(--accent)' : '') + '" onclick="asistCargarResumen(\'' + t + '\')">' + labels[t] + '</button>';
  });
  html += '</div>';
  html += '<div style="color:var(--muted);font-size:11px;margin-bottom:12px">' + range.label + ' · ' + range.start + ' al ' + range.end + '</div>';

  // Summary stats
  var totHoras = summary.reduce(function(a,s){return a+s.horasTotal;},0);
  var totRetardos = summary.reduce(function(a,s){return a+s.retardos;},0);
  var totFaltas = summary.reduce(function(a,s){return a+s.faltas;},0);
  var totExtra = summary.reduce(function(a,s){return a+s.horasExtra;},0);
  html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px;margin-bottom:16px">';
  html += _asistStatCard('⏱️', 'Horas totales', totHoras.toFixed(1), 'var(--accent)');
  html += _asistStatCard('⚠️', 'Retardos', totRetardos, '#f5a623');
  html += _asistStatCard('❌', 'Faltas', totFaltas, '#e74c3c');
  html += _asistStatCard('⏰', 'Horas extra', totExtra.toFixed(1), '#9b59b6');
  html += '</div>';

  // Table
  if (summary.length === 0) {
    html += '<div style="padding:24px;text-align:center;color:var(--muted);font-size:12px">No hay empleados registrados.</div>';
  } else {
    html += '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12px">';
    html += '<thead><tr style="border-bottom:1px solid rgba(255,255,255,0.08)">';
    ['Empleado','Sucursal','Días prog.','Días trab.','Horas','Retardos','Faltas','H. Extra',''].forEach(function(h) {
      html += '<th style="text-align:' + (h==='Empleado'||h==='Sucursal'?'left':'center') + ';padding:8px;color:var(--muted);font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.05em">' + h + '</th>';
    });
    html += '</tr></thead><tbody>';

    summary.forEach(function(s) {
      html += '<tr style="border-bottom:1px solid rgba(255,255,255,0.04)">';
      html += '<td style="padding:8px;font-weight:500">' + s.emp.nombre + '</td>';
      html += '<td style="padding:8px;color:var(--muted)">' + s.emp.sucursal + '</td>';
      html += '<td style="padding:8px;text-align:center">' + s.diasProgramados + '</td>';
      html += '<td style="padding:8px;text-align:center;font-weight:600">' + s.diasTrabajados + '</td>';
      html += '<td style="padding:8px;text-align:center;font-weight:600">' + s.horasTotal.toFixed(1) + 'h</td>';
      html += '<td style="padding:8px;text-align:center">' + (s.retardos > 0 ? '<span style="color:#f5a623">' + s.retardos + '</span>' : '0') + '</td>';
      html += '<td style="padding:8px;text-align:center">' + (s.faltas > 0 ? '<span style="color:#e74c3c">' + s.faltas + '</span>' : '0') + '</td>';
      html += '<td style="padding:8px;text-align:center">' + (s.horasExtra > 0.25 ? '<span style="color:#9b59b6">' + s.horasExtra.toFixed(1) + 'h</span>' : '—') + '</td>';
      html += '<td style="padding:8px;text-align:center"><button class="btn btn-g" style="padding:3px 8px;font-size:10px" onclick="asistGenerarReporte(\'' + s.emp.uid + '\')">📄</button></td>';
      html += '</tr>';
    });
    html += '</tbody></table></div>';

    // Export button
    html += '<div style="margin-top:16px;text-align:right">';
    html += '<button class="btn btn-g btn-sm" onclick="asistExportarExcel()">📥 Exportar Excel</button>';
    html += '</div>';
  }

  cont.innerHTML = html;
}

// ═══════════════════════════════════════════════════════════
// EXPORT EXCEL
// ═══════════════════════════════════════════════════════════

async function asistExportarExcel() {
  if (typeof XLSX === 'undefined') { if (typeof toast === 'function') toast('XLSX no disponible','error'); return; }
  var range = _asistDateRange(_asistResumenTipo);
  var res = await db.from('asistencia').select('*').gte('fecha', range.start).lte('fecha', range.end).order('fecha');
  var records = res.data || [];

  var rows = records.map(function(r) {
    var emp = _asistUsers[r.uid] || {};
    return {
      Fecha: r.fecha,
      Empleado: emp.nombre || r.uid,
      Sucursal: r.sucursal || '',
      Entrada: r.entrada ? _asistFormatHora(r.entrada) : '',
      Comida: r.comida_inicio ? _asistFormatHora(r.comida_inicio) : '',
      Regreso: r.comida_fin ? _asistFormatHora(r.comida_fin) : '',
      Salida: r.salida ? _asistFormatHora(r.salida) : '',
      'Horas Trabajadas': r.horas_trabajadas || '',
      'Retardo (min)': r.retardo_min || 0,
      Falta: r.es_falta ? 'Sí' : '',
      Nota: r.nota || ''
    };
  });

  var ws = XLSX.utils.json_to_sheet(rows);
  var wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Asistencia');
  XLSX.writeFile(wb, 'Asistencia_' + range.start + '_' + range.end + '.xlsx');
  if (typeof toast === 'function') toast('Excel exportado');
}

// ═══════════════════════════════════════════════════════════
// TAB: CONFIGURACIÓN
// ═══════════════════════════════════════════════════════════

function _asistGetAllAsesores() {
  // Build flat list of asesores from asesores config (by sucursal)
  var list = [];
  var sucs = (_asistAsesores && _asistAsesores.sucursales) || {};
  var sucColors = { 'Américas':'#8ab0e8', 'Pinocelli':'#d4b84a', 'Magnolia':'#b48ad4' };
  Object.keys(sucs).forEach(function(suc) {
    (sucs[suc] || []).forEach(function(name) {
      list.push({ nombre: name, sucursal: suc, color: sucColors[suc] || '#888' });
    });
  });
  // Globales excluded — they are owners/supervisors, not employees
  return list;
}

function _asistGetSucursalUsers() {
  // Only return sucursal and laboratorio users (americas, pinocelli, magnolia, laboratorio)
  var allowed = ['americas','pinocelli','magnolia','laboratorio'];
  var list = [];
  for (var uid in _asistUsers) {
    if (allowed.includes(uid)) {
      list.push({ uid: uid, nombre: _asistUsers[uid].nombre || uid, sucursal: _asistUsers[uid].sucursal || uid });
    }
  }
  return list;
}

function _asistToggleSection(id) {
  var el = document.getElementById(id);
  if (!el) return;
  var arrow = document.getElementById(id + '-arrow');
  if (el.style.display === 'none') {
    el.style.display = '';
    if (arrow) arrow.textContent = '▾';
  } else {
    el.style.display = 'none';
    if (arrow) arrow.textContent = '▸';
  }
}

function asistRenderConfig() {
  var cont = document.getElementById('asist-content-config');
  if (!cont) return;

  var inputS = 'background:var(--surface);border:1px solid rgba(255,255,255,0.09);border-radius:6px;padding:4px 6px;color:var(--white);font-family:Outfit,sans-serif;font-size:11px;outline:none';
  var monoInputS = 'background:var(--surface);border:1px solid rgba(255,255,255,0.09);border-radius:6px;padding:4px 6px;color:var(--white);font-family:monospace;font-size:11px;outline:none';
  var sectionHeaderS = 'display:flex;align-items:center;gap:6px;padding:6px 8px;cursor:pointer;border-radius:6px;user-select:none;transition:background .15s';

  var dayLabels = { lun:'L', mar:'M', mie:'Mi', jue:'J', vie:'V', sab:'S', dom:'D' };
  var dayOrder = ['lun','mar','mie','jue','vie','sab','dom'];
  var defSched = (_asistHorarios && _asistHorarios.default) || {};
  var overrides = (_asistHorarios && _asistHorarios.override) || {};
  var sucColors = { 'Américas': '#8ab0e8', 'Pinocelli': '#d4b84a', 'Magnolia': '#b48ad4', 'Laboratorio': 'var(--muted)' };

  var html = '<style>.asist-sec-hdr:hover{background:rgba(255,255,255,0.03)}.asist-emp-row:hover{background:rgba(255,255,255,0.02)}</style>';

  // Single unified card
  html += '<div style="background:var(--surface2);border:1px solid rgba(255,255,255,0.07);border-radius:12px;padding:14px">';

  // Header with tolerancia inline
  html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">';
  html += '<div><h3 style="font-size:13px;margin:0;color:var(--white)">📱 Empleados y Horarios</h3>';
  html += '<div style="font-size:10px;color:var(--muted);margin-top:2px">Click en un empleado para ver/editar su horario individual</div></div>';
  html += '<div style="display:flex;gap:6px;align-items:center">';
  html += '<label style="font-size:10px;color:var(--muted)">Tolerancia:</label>';
  html += '<input type="number" id="asist-tolerancia" value="' + ((_asistHorarios && _asistHorarios.tolerancia_min) || 10) + '" min="0" max="60" style="width:45px;' + inputS + '">';
  html += '<span style="font-size:9px;color:var(--muted)">min</span>';
  html += '</div></div>';

  // Build all employees list
  var asesores = _asistGetAllAsesores();
  var uidToPhone = {};
  for (var ph in _asistPhoneMap) { uidToPhone[_asistPhoneMap[ph]] = ph; }

  var allEmps = [];
  asesores.forEach(function(a) {
    allEmps.push({ uid: 'asesor_' + a.nombre.toLowerCase().replace(/\s+/g, '_'), nombre: a.nombre, suc: a.sucursal, isExtra: false });
  });
  var extras = (_asistHorarios && _asistHorarios.empleados_extra) || {};
  Object.keys(extras).forEach(function(euid) {
    var ex = extras[euid];
    allEmps.push({ uid: euid, nombre: ex.nombre, suc: ex.sucursal || 'Laboratorio', isExtra: true });
  });

  // Group by sucursal
  var bySuc = {};
  allEmps.forEach(function(e) {
    if (!bySuc[e.suc]) bySuc[e.suc] = [];
    bySuc[e.suc].push(e);
  });

  // Compact day header row
  var dayHeaderCells = dayOrder.map(function(dk) {
    return '<th style="text-align:center;padding:2px 3px;color:var(--muted);font-size:8px;font-weight:600;width:' + (dk === 'dom' ? '55px' : '60px') + '">' + dayLabels[dk] + '</th>';
  }).join('');

  // Render each sucursal group
  var sucOrder = ['Américas', 'Pinocelli', 'Magnolia', 'Laboratorio'];
  sucOrder.forEach(function(suc) {
    var emps = bySuc[suc] || [];
    if (emps.length === 0) return;
    var clr = sucColors[suc] || 'var(--white)';

    // Sucursal header
    html += '<div style="display:flex;align-items:center;gap:6px;padding:4px 0;margin-top:6px;border-bottom:1px solid rgba(255,255,255,0.06)">';
    html += '<span style="font-size:11px;font-weight:600;color:' + clr + '">' + suc + '</span>';
    html += '<span style="font-size:9px;color:var(--muted)">' + emps.length + '</span>';
    html += '</div>';

    // Employee rows
    emps.forEach(function(emp) {
      var phone = uidToPhone[emp.uid] || '';
      var empOv = overrides[emp.uid] || {};
      var hasCustom = Object.keys(empOv).length > 0;
      var secId = 'asist-emp-' + emp.uid.replace(/[^a-z0-9_]/g, '');

      // Main row
      html += '<div class="asist-emp-row" style="border-bottom:1px solid rgba(255,255,255,0.03)">';
      html += '<div style="display:flex;align-items:center;gap:6px;padding:4px 6px;cursor:pointer" onclick="_asistToggleSection(\'' + secId + '\')">';
      html += '<span id="' + secId + '-arrow" style="font-size:8px;color:var(--muted)">▸</span>';
      html += '<span style="font-weight:500;font-size:11px;flex:1">' + emp.nombre + '</span>';
      if (hasCustom) html += '<span style="font-size:8px;color:var(--beige);background:var(--beige-dim);padding:1px 5px;border-radius:3px">Custom</span>';
      html += '<span style="font-family:monospace;font-size:10px;color:var(--muted);width:110px;text-align:right">';
      if (phone) {
        html += phone;
      } else {
        html += '<input type="text" placeholder="Teléfono" maxlength="15" id="asist-ph-' + emp.uid + '" onclick="event.stopPropagation()" style="width:100px;' + monoInputS + '">';
      }
      html += '</span>';
      html += '<span style="white-space:nowrap;width:50px;text-align:right">';
      if (phone) {
        html += '<button class="btn btn-g" style="padding:1px 5px;font-size:9px;color:#e74c3c" onclick="event.stopPropagation();asistDarDeBaja(\'' + phone + '\',\'' + emp.nombre.replace(/'/g,"\\'") + '\')">Baja</button>';
      } else {
        html += '<button class="btn btn-g" style="padding:1px 5px;font-size:9px;color:#4af0c8" onclick="event.stopPropagation();asistGuardarPhoneAsesor(\'' + emp.uid + '\')">✓</button>';
      }
      if (emp.isExtra) {
        html += ' <button class="btn btn-g" style="padding:1px 4px;font-size:9px;color:#e74c3c" onclick="event.stopPropagation();asistEliminarExtra(\'' + emp.uid + '\')" title="Eliminar">✕</button>';
      }
      html += '</span>';
      html += '</div>';

      // Expandable schedule (hidden by default)
      html += '<div id="' + secId + '" style="display:none;padding:4px 6px 8px 20px">';
      html += '<table style="width:100%;border-collapse:collapse;font-size:10px;max-width:500px">';
      html += '<thead><tr>' + dayHeaderCells + '</tr></thead>';
      html += '<tr>';
      dayOrder.forEach(function(dk) {
        var sched = _asistResolveSchedule(emp.uid, dk);
        var isDayOff = empOv[dk] === null;
        var entVal = sched ? sched.entrada : '';
        var salVal = sched ? sched.salida : '';
        html += '<td style="padding:2px 1px;text-align:center;vertical-align:top">';
        if (isDayOff) {
          html += '<div style="font-size:9px;color:var(--muted);padding:4px 0">Descanso</div>';
        } else {
          html += '<input type="time" value="' + (entVal || '') + '" style="width:100%;' + inputS + ';font-size:9px;padding:2px 3px;margin-bottom:2px" data-sched="' + emp.uid + '-' + dk + '-ent">';
          html += '<input type="time" value="' + (salVal || '') + '" style="width:100%;' + inputS + ';font-size:9px;padding:2px 3px" data-sched="' + emp.uid + '-' + dk + '-sal">';
        }
        html += '</td>';
      });
      html += '</tr></table>';

      // Quick actions for this employee
      html += '<div style="display:flex;gap:4px;align-items:center;margin-top:4px">';
      html += '<button class="btn btn-g" style="padding:2px 6px;font-size:9px" onclick="asistSetDayOff(\'' + emp.uid + '\')">+ Día de descanso</button>';
      if (hasCustom) html += '<button class="btn btn-g" style="padding:2px 6px;font-size:9px;color:#e74c3c" onclick="asistResetSchedule(\'' + emp.uid + '\')">Restablecer horario base</button>';
      html += '</div>';
      html += '</div>'; // close expandable

      html += '</div>'; // close emp row
    });
  });

  if (allEmps.length === 0) {
    html += '<div style="color:var(--muted);font-size:11px;padding:8px 0">No hay empleados configurados. Agrégalos en Configuración → Ventas → Asesores.</div>';
  }

  // Add employee form
  html += '<div style="margin-top:10px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.06)">';
  html += '<div style="display:flex;gap:5px;align-items:center">';
  html += '<input type="text" id="asist-extra-nombre" placeholder="Nombre completo" style="flex:1;' + inputS + '">';
  html += '<select id="asist-extra-suc" style="' + inputS + '">';
  html += '<option value="Laboratorio">Laboratorio</option><option value="Américas">Américas</option><option value="Pinocelli">Pinocelli</option><option value="Magnolia">Magnolia</option>';
  html += '</select>';
  html += '<input type="text" id="asist-extra-phone" placeholder="Teléfono" maxlength="15" style="width:100px;' + monoInputS + '">';
  html += '<button class="btn btn-p btn-sm" style="padding:4px 8px;font-size:10px" onclick="asistAgregarExtra()">+ Agregar</button>';
  html += '</div></div>';

  // Horario base (collapsible at the bottom)
  html += '<div style="margin-top:10px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.06)">';
  html += '<div class="asist-sec-hdr" style="' + sectionHeaderS + '" onclick="_asistToggleSection(\'asist-sec-horbase\')">';
  html += '<span id="asist-sec-horbase-arrow" style="font-size:9px;color:var(--muted)">▸</span>';
  html += '<span style="font-size:11px;font-weight:600;color:var(--beige)">Horario base (aplica a todos por defecto)</span>';
  html += '</div>';
  html += '<div id="asist-sec-horbase" style="display:none;padding:6px 0">';
  html += '<table style="width:100%;border-collapse:collapse;font-size:11px;max-width:500px">';
  html += '<thead><tr style="border-bottom:1px solid rgba(255,255,255,0.06)"><th style="text-align:left;padding:3px 4px;color:var(--muted);font-size:9px">DÍA</th><th style="text-align:center;padding:3px 4px;color:var(--muted);font-size:9px">ENTRADA</th><th style="text-align:center;padding:3px 4px;color:var(--muted);font-size:9px">SALIDA</th><th style="text-align:center;padding:3px 4px;color:var(--muted);font-size:9px;width:30px">✓</th></tr></thead><tbody>';
  var dayFull = { lun:'Lunes', mar:'Martes', mie:'Miércoles', jue:'Jueves', vie:'Viernes', sab:'Sábado', dom:'Domingo' };
  dayOrder.forEach(function(dk) {
    var s = defSched[dk] || { entrada: '', salida: '' };
    var labora = s && s.entrada;
    html += '<tr style="border-bottom:1px solid rgba(255,255,255,0.03)">';
    html += '<td style="padding:3px 4px;font-weight:500">' + dayFull[dk] + '</td>';
    html += '<td style="padding:3px 4px;text-align:center"><input type="time" id="asist-sched-' + dk + '-ent" value="' + (s.entrada || '') + '" style="' + inputS + '"></td>';
    html += '<td style="padding:3px 4px;text-align:center"><input type="time" id="asist-sched-' + dk + '-sal" value="' + (s.salida || '') + '" style="' + inputS + '"></td>';
    html += '<td style="padding:3px 4px;text-align:center"><input type="checkbox" id="asist-sched-' + dk + '-on" ' + (labora ? 'checked' : '') + ' style="accent-color:var(--accent)"></td>';
    html += '</tr>';
  });
  html += '</tbody></table>';
  html += '</div></div>';

  // Save button
  html += '<div style="margin-top:10px;text-align:right">';
  html += '<button class="btn btn-p btn-sm" onclick="asistGuardarHorario()">💾 Guardar</button>';
  html += '</div>';

  html += '</div>'; // single card close

  cont.innerHTML = html;
}

function _asistResolveNombre(uid) {
  // Resolve display name from uid — check asesores, extras, and users
  if (uid.startsWith('asesor_')) {
    var asesores = _asistGetAllAsesores();
    var match = asesores.find(function(a) { return 'asesor_' + a.nombre.toLowerCase().replace(/\s+/g, '_') === uid; });
    if (match) return match.nombre;
  }
  if (uid.startsWith('extra_')) {
    var extras = (_asistHorarios && _asistHorarios.empleados_extra) || {};
    if (extras[uid]) return extras[uid].nombre;
  }
  return (_asistUsers[uid] || {}).nombre || uid;
}

function _asistGetAllPeople() {
  // List of asesores por sucursal for dropdowns
  var list = [];
  _asistGetAllAsesores().forEach(function(a) {
    list.push({ uid: 'asesor_' + a.nombre.toLowerCase().replace(/\s+/g, '_'), nombre: a.nombre, sucursal: a.sucursal });
  });
  return list;
}

async function asistGuardarPhoneAsesor(uid) {
  var input = document.getElementById('asist-ph-' + uid);
  if (!input) return;
  var phone = input.value.replace(/[\s\-\(\)\+]/g, '');
  if (!phone || phone.length < 10) { if (typeof toast === 'function') toast('Teléfono inválido (10 dígitos)','error'); return; }

  // Normalize: keep last 10 digits with 521 prefix
  if (phone.length === 10) phone = '521' + phone;
  if (phone.length === 12 && phone.startsWith('52') && phone[2] !== '1') phone = '521' + phone.slice(2);

  _asistPhoneMap[phone] = uid;
  try {
    await db.from('app_config').upsert({ id: 'empleados_telefono', value: JSON.stringify(_asistPhoneMap) }, { onConflict: 'id' });
    asistRenderConfig();
    if (typeof toast === 'function') toast('Teléfono registrado');
  } catch(e) {
    console.error('[Asistencia] Save phone error:', e);
    if (typeof toast === 'function') toast('Error guardando','error');
  }
}

async function asistDarDeBaja(phone, nombre) {
  if (!confirm('¿Dar de baja a ' + nombre + '?\n\nSe desactiva el reloj checador y su WhatsApp vuelve a funcionar con Clari normal.')) return;
  delete _asistPhoneMap[phone];
  try {
    await db.from('app_config').upsert({ id: 'empleados_telefono', value: JSON.stringify(_asistPhoneMap) }, { onConflict: 'id' });
    asistRenderConfig();
    if (typeof toast === 'function') toast(nombre + ' dado de baja');
  } catch(e) {
    console.error('[Asistencia] Baja error:', e);
    if (typeof toast === 'function') toast('Error dando de baja','error');
  }
}

async function asistEliminarPhone(phone) {
  if (!confirm('¿Eliminar teléfono ' + phone + '?')) return;
  delete _asistPhoneMap[phone];
  try {
    await db.from('app_config').upsert({ id: 'empleados_telefono', value: JSON.stringify(_asistPhoneMap) }, { onConflict: 'id' });
    asistRenderConfig();
    if (typeof toast === 'function') toast('Teléfono eliminado');
  } catch(e) {
    console.error('[Asistencia] Delete phone error:', e);
  }
}

async function asistAgregarExtra() {
  var nombre = (document.getElementById('asist-extra-nombre') || {}).value || '';
  var suc = (document.getElementById('asist-extra-suc') || {}).value || 'Laboratorio';
  var phone = ((document.getElementById('asist-extra-phone') || {}).value || '').replace(/[\s\-\(\)\+]/g, '');
  nombre = nombre.trim();
  if (!nombre) { if (typeof toast === 'function') toast('Ingresa el nombre','error'); return; }
  if (!phone || phone.length < 10) { if (typeof toast === 'function') toast('Teléfono inválido (10 dígitos)','error'); return; }
  if (phone.length === 10) phone = '521' + phone;
  if (phone.length === 12 && phone.startsWith('52') && phone[2] !== '1') phone = '521' + phone.slice(2);

  var uid = 'extra_' + nombre.toLowerCase().replace(/\s+/g, '_');
  if (!_asistHorarios.empleados_extra) _asistHorarios.empleados_extra = {};
  _asistHorarios.empleados_extra[uid] = { nombre: nombre, sucursal: suc };
  _asistPhoneMap[phone] = uid;

  try {
    await Promise.all([
      db.from('app_config').upsert({ id: 'horarios_asistencia', value: JSON.stringify(_asistHorarios) }, { onConflict: 'id' }),
      db.from('app_config').upsert({ id: 'empleados_telefono', value: JSON.stringify(_asistPhoneMap) }, { onConflict: 'id' })
    ]);
    asistRenderConfig();
    if (typeof toast === 'function') toast(nombre + ' agregado');
  } catch(e) {
    console.error('[Asistencia] Add extra error:', e);
    if (typeof toast === 'function') toast('Error guardando','error');
  }
}

async function asistEliminarExtra(uid) {
  var ex = (_asistHorarios.empleados_extra || {})[uid];
  if (!confirm('¿Eliminar a ' + (ex ? ex.nombre : uid) + '?')) return;
  delete _asistHorarios.empleados_extra[uid];
  // Also remove phone mapping
  for (var ph in _asistPhoneMap) {
    if (_asistPhoneMap[ph] === uid) { delete _asistPhoneMap[ph]; break; }
  }
  try {
    await Promise.all([
      db.from('app_config').upsert({ id: 'horarios_asistencia', value: JSON.stringify(_asistHorarios) }, { onConflict: 'id' }),
      db.from('app_config').upsert({ id: 'empleados_telefono', value: JSON.stringify(_asistPhoneMap) }, { onConflict: 'id' })
    ]);
    asistRenderConfig();
    if (typeof toast === 'function') toast('Empleado eliminado');
  } catch(e) {
    console.error('[Asistencia] Delete extra error:', e);
  }
}

async function asistGuardarHorario() {
  var dayOrder = ['lun','mar','mie','jue','vie','sab','dom'];
  var newDefault = {};
  dayOrder.forEach(function(dk) {
    var on = document.getElementById('asist-sched-' + dk + '-on');
    if (on && on.checked) {
      var ent = document.getElementById('asist-sched-' + dk + '-ent');
      var sal = document.getElementById('asist-sched-' + dk + '-sal');
      newDefault[dk] = { entrada: ent ? ent.value : '10:00', salida: sal ? sal.value : '19:00' };
    }
    // If unchecked, day is not in default (employees don't work that day by default)
  });
  var tolEl = document.getElementById('asist-tolerancia');
  var tolerancia = tolEl ? parseInt(tolEl.value) || 10 : 10;

  _asistHorarios.default = newDefault;
  _asistHorarios.tolerancia_min = tolerancia;

  try {
    await db.from('app_config').upsert({ id: 'horarios_asistencia', value: JSON.stringify(_asistHorarios) }, { onConflict: 'id' });
    if (typeof toast === 'function') toast('Horarios guardados');
  } catch(e) {
    console.error('[Asistencia] Save schedule error:', e);
    if (typeof toast === 'function') toast('Error guardando','error');
  }
}

function asistAgregarOverride() {
  var uidEl = document.getElementById('asist-ov-uid');
  var dayEl = document.getElementById('asist-ov-day');
  var tipoEl = document.getElementById('asist-ov-tipo');
  if (!uidEl || !dayEl || !tipoEl) return;
  var uid = uidEl.value;
  var day = dayEl.value;
  var tipo = tipoEl.value;

  if (!_asistHorarios.override) _asistHorarios.override = {};
  if (!_asistHorarios.override[uid]) _asistHorarios.override[uid] = {};

  if (tipo === 'libre') {
    _asistHorarios.override[uid][day] = null;
  } else {
    var ent = prompt('Hora entrada (HH:MM):', '10:00');
    var sal = prompt('Hora salida (HH:MM):', '19:00');
    if (!ent || !sal) return;
    _asistHorarios.override[uid][day] = { entrada: ent, salida: sal };
  }
  asistRenderConfig();
  if (typeof toast === 'function') toast('Override agregado (guarda para persistir)');
}

function asistEliminarOverride(uid) {
  if (!_asistHorarios.override) return;
  delete _asistHorarios.override[uid];
  asistRenderConfig();
  if (typeof toast === 'function') toast('Override eliminado (guarda para persistir)');
}

function asistSetDayOff(uid) {
  var dayFull = { lun:'Lunes', mar:'Martes', mie:'Miércoles', jue:'Jueves', vie:'Viernes', sab:'Sábado', dom:'Domingo' };
  var dayOrder = ['lun','mar','mie','jue','vie','sab','dom'];
  var opts = dayOrder.map(function(dk) { return '<option value="' + dk + '">' + dayFull[dk] + '</option>'; }).join('');
  var sel = prompt('¿Día de descanso? (lun/mar/mie/jue/vie/sab/dom)');
  if (!sel || dayOrder.indexOf(sel) === -1) { if (typeof toast === 'function') toast('Día inválido'); return; }
  if (!_asistHorarios.override) _asistHorarios.override = {};
  if (!_asistHorarios.override[uid]) _asistHorarios.override[uid] = {};
  _asistHorarios.override[uid][sel] = null;
  asistRenderConfig();
  if (typeof toast === 'function') toast('Día de descanso agregado (guarda para persistir)');
}

function asistResetSchedule(uid) {
  if (!_asistHorarios.override) return;
  delete _asistHorarios.override[uid];
  asistRenderConfig();
  if (typeof toast === 'function') toast('Horario restablecido al base (guarda para persistir)');
}

// ═══════════════════════════════════════════════════════════
// TAB: EXPEDIENTE (datos LFT del empleado)
// ═══════════════════════════════════════════════════════════

var _asistFirmasCache = {}; // uid → [{...firma records}]
var _asistFaltasCache = {}; // uid → [{fecha, ...}] — records with es_falta=true

async function asistRenderExpedientes() {
  var cont = document.getElementById('asist-content-expediente');
  if (!cont) return;
  cont.innerHTML = '<div style="padding:24px;text-align:center;color:var(--muted);font-size:12px"><span class="spinner-sm"></span> Cargando expedientes...</div>';

  var emps = _asistGetActiveEmployees();

  // Load all firmas + faltas for all employees
  if (emps.length > 0) {
    var uids = emps.map(function(e) { return e.uid; });
    var firmasRes = await db.from('asistencia_firmas').select('*').in('uid', uids).order('periodo_inicio', { ascending: false });
    _asistFirmasCache = {};
    (firmasRes.data || []).forEach(function(f) {
      if (!_asistFirmasCache[f.uid]) _asistFirmasCache[f.uid] = [];
      _asistFirmasCache[f.uid].push(f);
    });
    // Load all falta records to cross-reference with actas
    var faltasRes = await db.from('asistencia').select('uid,fecha,es_falta').in('uid', uids).eq('es_falta', true).order('fecha', { ascending: false });
    _asistFaltasCache = {};
    (faltasRes.data || []).forEach(function(f) {
      if (!_asistFaltasCache[f.uid]) _asistFaltasCache[f.uid] = [];
      _asistFaltasCache[f.uid].push(f);
    });
  }

  var html = '';

  html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px">';
  html += '<span style="font-size:11px;color:var(--muted)">Datos del trabajador para reportes legales (LFT Art. 804). Incluye registro patronal, actas y reportes firmados.</span>';
  html += '<div style="display:flex;gap:6px">';
  html += '<button class="btn btn-g btn-sm" onclick="asistPreviewFormato(\'reporte\')">👁 Ver formato reporte</button>';
  html += '<button class="btn btn-g btn-sm" onclick="asistPreviewFormato(\'acta\')">👁 Ver formato acta</button>';
  html += '</div></div>';

  if (emps.length === 0) {
    html += '<div style="padding:24px;text-align:center;color:var(--muted);font-size:12px">No hay empleados registrados. Configura telefonos primero.</div>';
    cont.innerHTML = html;
    return;
  }

  emps.forEach(function(emp) {
    var exp = _asistExpedientes[emp.uid] || {};
    var isComplete = exp.nombre_completo && exp.puesto && exp.fecha_ingreso;
    var statusBadge = isComplete
      ? '<span style="background:rgba(74,240,200,0.15);color:#4af0c8;padding:2px 8px;border-radius:10px;font-size:9px;font-weight:600">Completo</span>'
      : '<span style="background:rgba(245,166,35,0.15);color:#f5a623;padding:2px 8px;border-radius:10px;font-size:9px;font-weight:600">Incompleto</span>';

    html += '<div style="background:var(--surface2);border:1px solid rgba(255,255,255,0.07);border-radius:12px;padding:14px;margin-bottom:10px">';
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;cursor:pointer" onclick="asistToggleExp(\'' + emp.uid + '\')">';
    html += '<div><span style="font-size:13px;font-weight:600">' + emp.nombre + '</span> <span style="font-size:11px;color:var(--muted)">(' + emp.sucursal + ')</span></div>';
    html += '<div style="display:flex;gap:6px;align-items:center">' + statusBadge + '<span style="color:var(--muted);font-size:14px" id="asist-exp-arrow-' + emp.uid + '">▶</span></div>';
    html += '</div>';

    html += '<div id="asist-exp-form-' + emp.uid + '" style="display:none">';

    var inputStyle = 'background:var(--surface);border:1px solid rgba(255,255,255,0.09);border-radius:6px;padding:6px 9px;color:var(--white);font-family:Outfit,sans-serif;font-size:11px;outline:none;width:100%';
    var lblStyle = 'font-size:9px;color:var(--muted);margin-bottom:2px';

    // Row 1: Nombre completo
    html += '<div style="display:grid;grid-template-columns:1fr;gap:8px;margin-bottom:8px">';
    html += '<div><div style="' + lblStyle + '">Nombre completo (como aparece en documentos)</div>';
    html += '<input type="text" id="exp-' + emp.uid + '-nombre" value="' + (exp.nombre_completo || '').replace(/"/g,'&quot;') + '" style="' + inputStyle + '" placeholder="Nombre(s) Apellido Paterno Apellido Materno"></div>';
    html += '</div>';

    // Row 2: CURP, NSS, RFC
    html += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:8px">';
    html += '<div><div style="' + lblStyle + '">CURP</div>';
    html += '<input type="text" id="exp-' + emp.uid + '-curp" value="' + (exp.curp || '') + '" maxlength="18" style="' + inputStyle + ';text-transform:uppercase" placeholder="18 caracteres"></div>';
    html += '<div><div style="' + lblStyle + '">NSS (IMSS)</div>';
    html += '<input type="text" id="exp-' + emp.uid + '-nss" value="' + (exp.nss || '') + '" maxlength="11" style="' + inputStyle + '" placeholder="11 digitos"></div>';
    html += '<div><div style="' + lblStyle + '">RFC</div>';
    html += '<input type="text" id="exp-' + emp.uid + '-rfc" value="' + (exp.rfc || '') + '" maxlength="13" style="' + inputStyle + ';text-transform:uppercase" placeholder="13 caracteres"></div>';
    html += '</div>';

    // Row 3: Puesto, Departamento, Fecha ingreso
    html += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:8px">';
    html += '<div><div style="' + lblStyle + '">Puesto</div>';
    html += '<input type="text" id="exp-' + emp.uid + '-puesto" value="' + (exp.puesto || '').replace(/"/g,'&quot;') + '" style="' + inputStyle + '" placeholder="Ej: Asesor optico"></div>';
    html += '<div><div style="' + lblStyle + '">Departamento</div>';
    html += '<select id="exp-' + emp.uid + '-depto" style="' + inputStyle + '">';
    ['Laboratorio','Optometristas','Ventas','Administracion'].forEach(function(d) {
      html += '<option value="' + d + '"' + (exp.departamento === d ? ' selected' : '') + '>' + d + '</option>';
    });
    html += '</select></div>';
    html += '<div><div style="' + lblStyle + '">Fecha de ingreso</div>';
    html += '<input type="date" id="exp-' + emp.uid + '-ingreso" value="' + (exp.fecha_ingreso || '') + '" style="' + inputStyle + '"></div>';
    html += '</div>';

    // Row 4: Salario, Jornada, Cumpleaños
    html += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:8px">';
    html += '<div><div style="' + lblStyle + '">Salario diario ($)</div>';
    html += '<input type="number" id="exp-' + emp.uid + '-salario" value="' + (exp.salario || '') + '" min="0" step="0.01" style="' + inputStyle + '" placeholder="0.00"></div>';
    html += '<div><div style="' + lblStyle + '">Tipo de jornada</div>';
    html += '<select id="exp-' + emp.uid + '-jornada" style="' + inputStyle + '">';
    ['Diurna','Nocturna','Mixta'].forEach(function(j) {
      html += '<option value="' + j + '"' + (exp.jornada === j ? ' selected' : '') + '>' + j + '</option>';
    });
    html += '</select></div>';
    html += '<div><div style="' + lblStyle + '">Fecha de nacimiento</div>';
    html += '<input type="date" id="exp-' + emp.uid + '-nacimiento" value="' + (exp.fecha_nacimiento || '') + '" style="' + inputStyle + '"></div>';
    html += '</div>';

    // Row 5: Registro patronal (por empleado)
    html += '<div style="margin-top:4px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.06)">';
    html += '<div style="font-size:10px;font-weight:600;color:var(--beige);margin-bottom:6px">Datos patronales (se imprimen en el reporte)</div>';
    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">';
    html += '<div><div style="' + lblStyle + '">Razon social</div>';
    html += '<input type="text" id="exp-' + emp.uid + '-razon" value="' + (exp.razon_social || '').replace(/"/g,'&quot;') + '" style="' + inputStyle + '" placeholder="Ej: Opticas Car y Era S.A. de C.V."></div>';
    html += '<div><div style="' + lblStyle + '">RFC patronal</div>';
    html += '<input type="text" id="exp-' + emp.uid + '-rfcpat" value="' + (exp.rfc_patronal || '') + '" style="' + inputStyle + ';text-transform:uppercase" placeholder="RFC de la empresa"></div>';
    html += '</div>';
    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">';
    html += '<div><div style="' + lblStyle + '">Registro patronal IMSS</div>';
    html += '<input type="text" id="exp-' + emp.uid + '-regpat" value="' + (exp.reg_patronal || '') + '" style="' + inputStyle + '" placeholder="No. de registro patronal"></div>';
    html += '<div><div style="' + lblStyle + '">Domicilio fiscal</div>';
    html += '<input type="text" id="exp-' + emp.uid + '-domicilio" value="' + (exp.domicilio_fiscal || '').replace(/"/g,'&quot;') + '" style="' + inputStyle + '" placeholder="Direccion completa"></div>';
    html += '</div>';
    html += '</div>';

    // Save button
    html += '<div style="text-align:right;margin-top:8px">';
    html += '<button class="btn btn-p btn-sm" onclick="asistGuardarExpediente(\'' + emp.uid + '\')">💾 Guardar expediente</button>';
    html += '</div>';

    // ── Documents section: actas + reportes firmados ──
    var firmas = _asistFirmasCache[emp.uid] || [];
    var empFaltas = _asistFaltasCache[emp.uid] || [];
    var actaCount = 0;
    // Detect actas by checking if there are faltas within the firma period
    firmas.forEach(function(f) {
      var faltasInPeriod = empFaltas.filter(function(fl) { return fl.fecha >= f.periodo_inicio && fl.fecha <= f.periodo_fin; });
      f._isActa = faltasInPeriod.length > 0;
      f._faltasDates = faltasInPeriod.map(function(fl) { return fl.fecha; }).sort();
      if (f._isActa) actaCount++;
    });
    html += '<div style="margin-top:12px;padding-top:10px;border-top:1px solid rgba(255,255,255,0.06)">';
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">';
    html += '<div style="font-size:10px;font-weight:600;color:var(--beige)">Documentos (' + firmas.length + ')';
    if (actaCount > 0) html += ' <span style="color:#e74c3c;font-size:9px">(' + actaCount + ' acta' + (actaCount > 1 ? 's' : '') + ')</span>';
    html += '</div></div>';
    if (firmas.length === 0) {
      html += '<div style="font-size:10px;color:var(--muted)">Sin documentos aun. Se generan automaticamente al firmar por WhatsApp.</div>';
    } else {
      firmas.forEach(function(f) {
        var isSigned = !!f.firmado_at;
        var signBadge = isSigned
          ? '<span style="background:rgba(74,240,200,0.15);color:#4af0c8;padding:1px 6px;border-radius:8px;font-size:9px">Firmado</span>'
          : '<span style="background:rgba(245,166,35,0.15);color:#f5a623;padding:1px 6px;border-radius:8px;font-size:9px">Pendiente</span>';
        var fechaFirma = isSigned ? new Date(f.firmado_at).toLocaleDateString('es-MX', { timeZone: 'America/Chihuahua', day: 'numeric', month: 'short', year: 'numeric' }) : '—';
        var fechaEnviado = f.enviado_at ? new Date(f.enviado_at).toLocaleDateString('es-MX', { timeZone: 'America/Chihuahua', day: 'numeric', month: 'short', year: 'numeric' }) : '—';
        var cardBg = f._isActa ? 'rgba(231,76,60,0.08)' : 'rgba(255,255,255,0.03)';
        var cardBorder = f._isActa ? 'rgba(231,76,60,0.2)' : 'rgba(255,255,255,0.05)';

        html += '<div style="background:' + cardBg + ';border:1px solid ' + cardBorder + ';border-radius:8px;padding:10px;margin-bottom:6px">';
        // Header row
        html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">';
        html += '<div style="display:flex;align-items:center;gap:6px">';
        if (f._isActa) {
          html += '<span style="font-size:10px;font-weight:600;color:#e74c3c">Acta de falta</span>';
        } else {
          html += '<span style="font-size:10px;font-weight:600;color:var(--white)">Reporte asistencia</span>';
        }
        html += signBadge;
        html += '</div>';
        html += '<div style="display:flex;gap:4px;align-items:center">';
        if (isSigned) {
          html += '<button class="btn btn-g" style="padding:2px 6px;font-size:9px" onclick="asistVerDocumento(\'' + emp.uid + '\',' + f.id + ')">📄 Ver</button>';
        }
        if (typeof currentUser !== 'undefined' && currentUser && currentUser.role === 'admin') {
          html += '<button class="btn btn-g" style="padding:2px 6px;font-size:9px;color:#e74c3c" onclick="asistBorrarActa(' + f.id + ',\'' + emp.uid + '\',\'' + f.periodo_inicio + '\',\'' + f.periodo_fin + '\')" title="Eliminar documento">🗑️</button>';
        }
        html += '</div></div>';
        // Detail row
        html += '<div style="font-size:9px;color:var(--muted)">';
        html += 'Periodo: ' + f.periodo_inicio + ' al ' + f.periodo_fin;
        if (fechaFirma !== '—') html += ' · Firmado: ' + fechaFirma;
        html += ' · Enviado: ' + fechaEnviado;
        html += '</div>';
        // Falta dates for actas
        if (f._isActa && f._faltasDates.length > 0) {
          html += '<div style="margin-top:4px;font-size:9px;color:#e74c3c">';
          html += 'Faltas registradas: ' + f._faltasDates.join(', ');
          html += '</div>';
        }
        html += '</div>';
      });
    }
    html += '</div>';

    html += '</div>'; // form
    html += '</div>'; // card
  });

  cont.innerHTML = html;
}

function asistToggleExp(uid) {
  var form = document.getElementById('asist-exp-form-' + uid);
  var arrow = document.getElementById('asist-exp-arrow-' + uid);
  if (!form) return;
  var isOpen = form.style.display !== 'none';
  form.style.display = isOpen ? 'none' : '';
  if (arrow) arrow.textContent = isOpen ? '▶' : '▼';
}

async function asistBorrarActa(firmaId, uid, periodoInicio, periodoFin) {
  if (!confirm('¿Eliminar este documento y los registros de falta asociados?\n\nPeriodo: ' + periodoInicio + ' al ' + periodoFin + '\n\nEsta accion no se puede deshacer.')) return;
  try {
    // 1. Delete the firma/acta record via secure proxy
    var r1 = await db.from('asistencia_firmas').delete().eq('id', firmaId);
    if (r1.error) throw new Error(r1.error.message);
    // 2. Delete associated falta records in asistencia for this uid+period
    // Find faltas first, then delete each
    var faltasRes = await db.from('asistencia').select('id').eq('uid', uid).eq('es_falta', true).gte('fecha', periodoInicio).lte('fecha', periodoFin);
    var faltaIds = (faltasRes.data || []).map(function(f) { return f.id; });
    for (var i = 0; i < faltaIds.length; i++) {
      await db.from('asistencia').delete().eq('id', faltaIds[i]);
    }
    if (typeof toast === 'function') toast('Documento y ' + faltaIds.length + ' falta(s) eliminados', 'ok');
    // Refresh expedientes
    asistRenderExpedientes();
  } catch(e) {
    console.error('[Asistencia] Delete acta error:', e);
    if (typeof toast === 'function') toast('Error al eliminar: ' + e.message, 'error');
  }
}

async function asistVerDocumento(uid, firmaId) {
  // Load the specific firma record
  var res = await db.from('asistencia_firmas').select('*').eq('id', firmaId).limit(1);
  if (!res.data || res.data.length === 0) { if (typeof toast === 'function') toast('Documento no encontrado','error'); return; }
  var firma = res.data[0];
  _asistCurrentFirma = firma;

  // Use asistGenerarReporte with a specific range and pre-loaded firma
  _asistReporteUid = uid;
  _asistReporteRange = { start: firma.periodo_inicio, end: firma.periodo_fin, label: firma.periodo_inicio + ' al ' + firma.periodo_fin };
  _asistReporteFirmaEmp = firma.firma_empleado || null;

  // Load records for the period
  var recRes = await db.from('asistencia').select('*').eq('uid', uid).gte('fecha', firma.periodo_inicio).lte('fecha', firma.periodo_fin).order('fecha');
  var records = recRes.data || [];

  var empName = _asistResolveNombre(uid);
  var empSuc = 'N/A';
  var emp = _asistGetActiveEmployees().find(function(e) { return e.uid === uid; });
  if (emp) empSuc = emp.sucursal;

  // Build modal
  var overlay = document.getElementById('asist-reporte-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'asist-reporte-overlay';
    overlay.className = 'm-overlay';
    overlay.onclick = function(e) { if (e.target === overlay) { overlay.classList.remove('open'); overlay.remove(); } };
    document.body.appendChild(overlay);
  }

  var html = '<div style="background:var(--surface);border-radius:16px;max-width:850px;width:95vw;max-height:90vh;overflow-y:auto;padding:20px;position:relative">';
  html += '<button onclick="var o=document.getElementById(\'asist-reporte-overlay\');if(o){o.classList.remove(\'open\');o.remove();}" style="position:absolute;top:12px;right:16px;background:none;border:none;color:var(--muted);font-size:18px;cursor:pointer">✕</button>';
  html += '<h2 style="font-size:15px;margin-bottom:4px;color:var(--beige)">Reporte de Asistencia — ' + empName + '</h2>';
  html += '<div style="font-size:11px;color:var(--muted);margin-bottom:16px">' + firma.periodo_inicio + ' al ' + firma.periodo_fin;
  if (firma.firmado_at) html += ' — Firmado el ' + new Date(firma.firmado_at).toLocaleDateString('es-MX', { timeZone: 'America/Chihuahua', day: 'numeric', month: 'long', year: 'numeric' });
  html += '</div>';

  // Preview area
  html += '<div id="asist-reporte-preview" style="background:#fff;color:#000;padding:20px;border-radius:8px;font-family:\'Times New Roman\',serif;font-size:11pt;line-height:1.4">';
  html += _asistBuildReporteHTML(empName, empSuc, _asistReporteRange, records, _asistReporteFirmaEmp, null);
  html += '</div>';

  // Patron signature canvas
  html += '<div style="margin-top:16px;background:var(--surface2);border-radius:10px;padding:14px">';
  html += '<div style="font-size:11px;font-weight:600;color:var(--beige);margin-bottom:6px">Firma del patron / representante</div>';
  html += '<div style="background:#fff;border-radius:8px;position:relative;touch-action:none" id="asist-patron-sig-container">';
  html += '<canvas id="asist-patron-canvas" height="100" style="display:block;width:100%;border-radius:8px"></canvas>';
  html += '<span id="asist-patron-hint" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:#ccc;font-size:12px;pointer-events:none">Firme aqui</span>';
  html += '</div>';
  html += '<button class="btn btn-g btn-sm" style="margin-top:8px" onclick="asistClearPatronSig()">Limpiar</button>';
  html += '</div>';

  // Action buttons
  html += '<div style="display:flex;gap:8px;margin-top:16px;justify-content:flex-end">';
  html += '<button class="btn btn-g btn-sm" onclick="asistImprimirReporte()">🖨 Imprimir (carta)</button>';
  html += '</div>';

  html += '</div>';
  overlay.innerHTML = html;
  overlay.classList.add('open');

  setTimeout(function() { _asistInitPatronSig(); }, 100);
}

async function asistGuardarExpediente(uid) {
  var get = function(field) { var el = document.getElementById('exp-' + uid + '-' + field); return el ? el.value.trim() : ''; };
  _asistExpedientes[uid] = {
    nombre_completo: get('nombre'),
    curp: get('curp').toUpperCase(),
    nss: get('nss'),
    rfc: get('rfc').toUpperCase(),
    puesto: get('puesto'),
    departamento: get('depto'),
    fecha_ingreso: get('ingreso'),
    salario: parseFloat(get('salario')) || 0,
    jornada: get('jornada'),
    fecha_nacimiento: get('nacimiento'),
    razon_social: get('razon'),
    rfc_patronal: get('rfcpat').toUpperCase(),
    reg_patronal: get('regpat'),
    domicilio_fiscal: get('domicilio')
  };
  try {
    await db.from('app_config').upsert({ id: 'expedientes_empleados', value: JSON.stringify(_asistExpedientes) }, { onConflict: 'id' });
    if (typeof toast === 'function') toast('Expediente guardado');
  } catch(e) {
    console.error('[Asistencia] Save expediente error:', e);
    if (typeof toast === 'function') toast('Error guardando','error');
  }
}

// ═══════════════════════════════════════════════════════════
// PREVIEW FORMATOS (moldes vacíos)
// ═══════════════════════════════════════════════════════════

function asistPreviewFormato(tipo) {
  var overlay = document.getElementById('asist-reporte-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'asist-reporte-overlay';
    overlay.className = 'm-overlay';
    overlay.onclick = function(e) { if (e.target === overlay) { overlay.classList.remove('open'); overlay.remove(); } };
    document.body.appendChild(overlay);
  }

  var CARTA_CSS = '@page { size: letter; margin: 15mm; } * { margin:0; padding:0; box-sizing:border-box; } body { font-family: "Times New Roman", serif; font-size: 11pt; color: #000; line-height: 1.4; }';
  var previewHTML = '';

  if (tipo === 'reporte') {
    previewHTML = _asistMoldeReporte();
  } else {
    previewHTML = _asistMoldeActa();
  }

  var html = '<div style="background:var(--surface);border-radius:16px;max-width:850px;width:95vw;max-height:90vh;overflow-y:auto;padding:20px;position:relative">';
  html += '<button onclick="var o=document.getElementById(\'asist-reporte-overlay\');if(o){o.classList.remove(\'open\');o.remove();}" style="position:absolute;top:12px;right:16px;background:none;border:none;color:var(--muted);font-size:18px;cursor:pointer">✕</button>';
  html += '<h2 style="font-size:15px;margin-bottom:16px;color:var(--beige)">' + (tipo === 'reporte' ? 'Formato: Reporte de Asistencia' : 'Formato: Acta de Falta Injustificada') + '</h2>';
  html += '<div style="background:#fff;color:#000;padding:20px;border-radius:8px;font-family:\'Times New Roman\',serif;font-size:11pt;line-height:1.4">';
  html += previewHTML;
  html += '</div>';
  html += '<div style="display:flex;gap:8px;margin-top:16px;justify-content:flex-end">';
  html += '<button class="btn btn-g btn-sm" onclick="asistImprimirMolde(\'' + tipo + '\')">🖨 Imprimir molde</button>';
  html += '</div></div>';

  overlay.innerHTML = html;
  overlay.classList.add('open');
}

function _asistMoldeReporte() {
  var h = '';
  h += '<div style="text-align:center;border-bottom:2px solid #000;padding-bottom:10px;margin-bottom:12px">';
  h += '<div style="font-size:14pt;font-weight:bold;letter-spacing:1px">[RAZON SOCIAL DE LA EMPRESA]</div>';
  h += '<div style="font-size:9pt">RFC: [RFC PATRONAL] &nbsp;|&nbsp; Reg. Patronal IMSS: [NO. REGISTRO]</div>';
  h += '<div style="font-size:9pt;color:#555">[DOMICILIO FISCAL]</div>';
  h += '<div style="font-size:12pt;font-weight:bold;margin-top:8px">CONTROL DE ASISTENCIA</div>';
  h += '<div style="font-size:9pt;color:#555">Art. 804 Fraccion III — Ley Federal del Trabajo</div>';
  h += '</div>';

  h += '<table style="width:100%;font-size:9.5pt;margin-bottom:12px;border-collapse:collapse">';
  h += '<tr><td style="padding:2px 0;width:50%"><b>Nombre del trabajador:</b> ________________________</td>';
  h += '<td style="padding:2px 0"><b>Sucursal:</b> _______________</td></tr>';
  h += '<tr><td style="padding:2px 0"><b>CURP:</b> ________________________</td>';
  h += '<td style="padding:2px 0"><b>RFC:</b> _______________</td></tr>';
  h += '<tr><td style="padding:2px 0"><b>NSS (IMSS):</b> ________________</td>';
  h += '<td style="padding:2px 0"><b>Puesto:</b> _______________</td></tr>';
  h += '<tr><td style="padding:2px 0"><b>Fecha de ingreso:</b> ___________</td>';
  h += '<td style="padding:2px 0"><b>Jornada:</b> Diurna / Nocturna / Mixta</td></tr>';
  h += '<tr><td style="padding:2px 0"><b>Periodo:</b> __________ al __________</td>';
  h += '<td style="padding:2px 0"><b>Fecha de emision:</b> __________</td></tr>';
  h += '</table>';

  // Empty table with 15 rows
  h += '<table style="width:100%;border-collapse:collapse;font-size:9pt;margin-bottom:15px">';
  h += '<thead><tr style="background:#f0f0f0">';
  ['Fecha','Dia','Entrada','Comida','Regreso','Salida','Horas','Retardo','Estado','Observaciones'].forEach(function(c) {
    h += '<th style="border:1px solid #999;padding:4px 3px;text-align:center;font-size:8pt">' + c + '</th>';
  });
  h += '</tr></thead><tbody>';
  for (var i = 0; i < 15; i++) {
    h += '<tr>';
    for (var j = 0; j < 10; j++) h += '<td style="border:1px solid #ccc;padding:6px 3px">&nbsp;</td>';
    h += '</tr>';
  }
  h += '</tbody></table>';

  h += '<table style="width:50%;border-collapse:collapse;font-size:10pt;margin-bottom:20px">';
  ['Dias programados','Dias trabajados','Horas totales','Retardos','Faltas'].forEach(function(l) {
    h += '<tr><td style="padding:3px;border:1px solid #ccc"><b>' + l + '</b></td><td style="padding:3px;border:1px solid #ccc;text-align:center;width:80px"></td></tr>';
  });
  h += '</table>';

  h += '<div style="margin-top:30px;display:flex;justify-content:space-between;gap:30px">';
  // Worker signature
  h += '<div style="flex:1;text-align:center">';
  h += '<div style="border:1px dashed #aaa;border-radius:4px;height:60px;margin-bottom:4px;display:flex;align-items:center;justify-content:center"><span style="font-size:8pt;color:#aaa">Firma digital del trabajador</span></div>';
  h += '<div style="border-top:1px solid #000;padding-top:4px;margin-top:10px"><div style="font-size:10pt;font-weight:bold">Nombre del trabajador</div><div style="font-size:8pt;color:#555">Firma autografa del trabajador</div></div>';
  h += '</div>';
  // Patron signature
  h += '<div style="flex:1;text-align:center">';
  h += '<div style="border:1px dashed #aaa;border-radius:4px;height:60px;margin-bottom:4px;display:flex;align-items:center;justify-content:center"><span style="font-size:8pt;color:#aaa">Firma digital del patron</span></div>';
  h += '<div style="border-top:1px solid #000;padding-top:4px;margin-top:10px"><div style="font-size:10pt;font-weight:bold">Representante de la empresa</div><div style="font-size:8pt;color:#555">Firma autografa del patron</div></div>';
  h += '</div>';
  h += '</div>';

  h += '<div style="margin-top:20px;text-align:center;font-size:8pt;color:#888;border-top:1px solid #ddd;padding-top:8px">Art. 804 Frac. III — Ley Federal del Trabajo</div>';
  return h;
}

function _asistMoldeActa() {
  var h = '';
  h += '<div style="text-align:center;border-bottom:2px solid #000;padding-bottom:10px;margin-bottom:12px">';
  h += '<div style="font-size:14pt;font-weight:bold;letter-spacing:1px">[RAZON SOCIAL DE LA EMPRESA]</div>';
  h += '<div style="font-size:9pt">RFC: [RFC PATRONAL] &nbsp;|&nbsp; Reg. Patronal IMSS: [NO. REGISTRO]</div>';
  h += '<div style="font-size:9pt;color:#555">[DOMICILIO FISCAL]</div>';
  h += '<div style="font-size:12pt;font-weight:bold;margin-top:8px;color:#c00">ACTA ADMINISTRATIVA POR FALTA INJUSTIFICADA</div>';
  h += '<div style="font-size:9pt;color:#555">Art. 47 Fraccion X — Ley Federal del Trabajo</div>';
  h += '</div>';

  h += '<div style="font-size:10pt;line-height:1.6;margin-bottom:15px">';
  h += '<p style="margin-bottom:10px">En la ciudad de <b>Ciudad Juarez, Chihuahua</b>, siendo las ________ horas del dia __________ de __________ de 20____, se levanta la presente acta administrativa para hacer constar lo siguiente:</p>';

  h += '<p style="margin-bottom:10px">El(la) trabajador(a) <b>________________________________________</b>, con CURP <b>__________________</b>, adscrito(a) a la sucursal <b>_______________</b>, con puesto de <b>_______________</b> y fecha de ingreso <b>__________</b>, no se presento a laborar en la(s) siguiente(s) fecha(s):</p>';

  h += '<table style="width:60%;border-collapse:collapse;margin:10px auto 15px;font-size:10pt">';
  h += '<thead><tr style="background:#f0f0f0"><th style="border:1px solid #999;padding:4px 8px">Fecha</th><th style="border:1px solid #999;padding:4px 8px">Dia</th><th style="border:1px solid #999;padding:4px 8px">Tipo</th></tr></thead>';
  h += '<tbody>';
  for (var i = 0; i < 5; i++) {
    h += '<tr><td style="border:1px solid #ccc;padding:6px 8px">&nbsp;</td><td style="border:1px solid #ccc;padding:6px 8px">&nbsp;</td><td style="border:1px solid #ccc;padding:6px 8px">Falta injustificada</td></tr>';
  }
  h += '</tbody></table>';

  h += '<p style="margin-bottom:10px">Lo anterior sin contar con autorizacion previa del patron ni causa justificada para su inasistencia, de conformidad con lo dispuesto por el <b>Articulo 47, Fraccion X</b> de la Ley Federal del Trabajo, que establece como causa de rescision de la relacion de trabajo, sin responsabilidad para el patron, tener el trabajador mas de tres faltas de asistencia en un periodo de treinta dias, sin permiso del patron o sin causa justificada.</p>';

  h += '<p style="margin-bottom:10px">Se hace del conocimiento del(la) trabajador(a) que la acumulacion de faltas injustificadas puede dar lugar a las sanciones previstas en el Reglamento Interior de Trabajo y, en su caso, a la rescision de la relacion laboral.</p>';

  h += '<p style="margin-bottom:10px">El(la) trabajador(a) manifiesta: _______________________________________________</p>';
  h += '<p>____________________________________________________________________________</p>';
  h += '</div>';

  h += '<div style="margin-top:30px;display:flex;justify-content:space-between;gap:20px">';
  // Worker
  h += '<div style="flex:1;text-align:center">';
  h += '<div style="border:1px dashed #aaa;border-radius:4px;height:50px;margin-bottom:4px;display:flex;align-items:center;justify-content:center"><span style="font-size:7pt;color:#aaa">Firma digital</span></div>';
  h += '<div style="border-top:1px solid #000;padding-top:4px;margin-top:10px"><div style="font-size:9pt;font-weight:bold">Nombre del trabajador</div><div style="font-size:7pt;color:#555">Firma autografa</div></div>';
  h += '</div>';
  // Testigo
  h += '<div style="flex:1;text-align:center">';
  h += '<div style="border-top:1px solid #000;padding-top:4px;margin-top:64px"><div style="font-size:9pt;font-weight:bold">Testigo 1</div><div style="font-size:7pt;color:#555">Nombre y firma</div></div>';
  h += '</div>';
  // Patron
  h += '<div style="flex:1;text-align:center">';
  h += '<div style="border:1px dashed #aaa;border-radius:4px;height:50px;margin-bottom:4px;display:flex;align-items:center;justify-content:center"><span style="font-size:7pt;color:#aaa">Firma digital</span></div>';
  h += '<div style="border-top:1px solid #000;padding-top:4px;margin-top:10px"><div style="font-size:9pt;font-weight:bold">Representante patronal</div><div style="font-size:7pt;color:#555">Firma autografa</div></div>';
  h += '</div>';
  h += '</div>';

  h += '<div style="margin-top:20px;text-align:center;font-size:8pt;color:#888;border-top:1px solid #ddd;padding-top:8px">Art. 47 Frac. X y Art. 804 Frac. III — Ley Federal del Trabajo</div>';
  return h;
}

function asistImprimirMolde(tipo) {
  var content = tipo === 'reporte' ? _asistMoldeReporte() : _asistMoldeActa();
  var CARTA_CSS = '@page { size: letter; margin: 15mm; } * { margin:0; padding:0; box-sizing:border-box; } body { font-family: "Times New Roman", serif; font-size: 11pt; color: #000; line-height: 1.4; }';
  var fullHTML = '<!DOCTYPE html><html><head><meta charset="UTF-8"><style>' + CARTA_CSS + '</style></head><body>' + content + '</body></html>';
  if (typeof silentPrintHTML === 'function') {
    silentPrintHTML(fullHTML);
  } else {
    var w = window.open('', '_blank'); w.document.write(fullHTML); w.document.close(); w.focus(); setTimeout(function() { w.print(); }, 300);
  }
}

// ═══════════════════════════════════════════════════════════
// ENVÍO MANUAL DE REPORTES / ACTAS POR WHATSAPP
// ═══════════════════════════════════════════════════════════

async function asistEnvioManual() {
  var emps = _asistGetActiveEmployees();
  if (emps.length === 0) { if (typeof toast === 'function') toast('No hay empleados registrados','error'); return; }

  var overlay = document.getElementById('asist-reporte-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'asist-reporte-overlay';
    overlay.className = 'm-overlay';
    overlay.onclick = function(e) { if (e.target === overlay) { overlay.classList.remove('open'); overlay.remove(); } };
    document.body.appendChild(overlay);
  }

  var inputStyle = 'background:var(--surface2);border:1px solid rgba(255,255,255,0.09);border-radius:8px;padding:8px 10px;color:var(--white);font-family:Outfit,sans-serif;font-size:12px;outline:none;width:100%';

  var html = '<div style="background:var(--surface);border-radius:16px;max-width:550px;width:95vw;padding:20px;position:relative">';
  html += '<button onclick="var o=document.getElementById(\'asist-reporte-overlay\');if(o){o.classList.remove(\'open\');o.remove();}" style="position:absolute;top:12px;right:16px;background:none;border:none;color:var(--muted);font-size:18px;cursor:pointer">✕</button>';
  html += '<h2 style="font-size:15px;margin-bottom:16px;color:var(--beige)">Enviar reporte o acta por WhatsApp</h2>';

  // Type selector
  html += '<div style="margin-bottom:12px"><div style="font-size:9px;color:var(--muted);margin-bottom:4px;text-transform:uppercase;letter-spacing:.04em">Tipo de documento</div>';
  html += '<div style="display:flex;gap:8px">';
  html += '<label style="flex:1;display:flex;align-items:center;gap:6px;background:var(--surface2);padding:10px;border-radius:8px;cursor:pointer;border:1px solid rgba(255,255,255,0.07)"><input type="radio" name="envio-tipo" value="reporte" checked style="accent-color:var(--accent)"> <span style="font-size:12px">📊 Reporte de asistencia</span></label>';
  html += '<label style="flex:1;display:flex;align-items:center;gap:6px;background:var(--surface2);padding:10px;border-radius:8px;cursor:pointer;border:1px solid rgba(255,255,255,0.07)"><input type="radio" name="envio-tipo" value="acta" style="accent-color:var(--accent)"> <span style="font-size:12px">📋 Acta de falta</span></label>';
  html += '</div></div>';

  // Recipient selector
  html += '<div style="margin-bottom:12px"><div style="font-size:9px;color:var(--muted);margin-bottom:4px;text-transform:uppercase;letter-spacing:.04em">Enviar a</div>';
  html += '<div id="envio-dest-radios" style="display:flex;gap:8px;margin-bottom:8px">';
  html += '<label style="display:flex;align-items:center;gap:4px;font-size:12px"><input type="radio" name="envio-dest" value="uno" checked style="accent-color:var(--accent)" onchange="document.getElementById(\'envio-emp-sel\').style.display=\'\'"> Un empleado</label>';
  html += '<label id="envio-dest-todos-label" style="display:flex;align-items:center;gap:4px;font-size:12px"><input type="radio" name="envio-dest" value="todos" style="accent-color:var(--accent)" onchange="document.getElementById(\'envio-emp-sel\').style.display=\'none\'"> Todos los empleados</label>';
  html += '</div>';
  html += '<div id="envio-emp-sel"><select id="envio-uid" style="' + inputStyle + '">';
  emps.forEach(function(e) { html += '<option value="' + e.uid + '">' + e.nombre + ' (' + e.sucursal + ')</option>'; });
  html += '</select></div></div>';

  // Period (only for reporte)
  html += '<div id="envio-periodo-section" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px">';
  html += '<div><div style="font-size:9px;color:var(--muted);margin-bottom:4px;text-transform:uppercase">Periodo inicio</div>';
  var weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
  html += '<input type="date" id="envio-inicio" value="' + weekAgo.toLocaleDateString('en-CA') + '" style="' + inputStyle + '"></div>';
  html += '<div><div style="font-size:9px;color:var(--muted);margin-bottom:4px;text-transform:uppercase">Periodo fin</div>';
  var ayer = new Date(); ayer.setDate(ayer.getDate() - 1);
  html += '<input type="date" id="envio-fin" value="' + ayer.toLocaleDateString('en-CA') + '" style="' + inputStyle + '"></div>';
  html += '</div>';

  // Acta: faltas dates (only for acta type)
  html += '<div id="envio-faltas-section" style="display:none;margin-bottom:12px">';
  html += '<div style="font-size:9px;color:var(--muted);margin-bottom:6px;text-transform:uppercase">Fechas de falta</div>';
  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">';
  html += '<div><div style="font-size:9px;color:var(--muted);margin-bottom:4px">Desde</div>';
  html += '<input type="date" id="envio-falta-desde" style="' + inputStyle + '"></div>';
  html += '<div><div style="font-size:9px;color:var(--muted);margin-bottom:4px">Hasta <span style="opacity:0.5">(mismo día si es solo 1)</span></div>';
  html += '<input type="date" id="envio-falta-hasta" style="' + inputStyle + '"></div>';
  html += '</div>';
  html += '<div style="font-size:9px;color:var(--muted);margin-top:4px">Si es un solo día, pon la misma fecha en ambos.</div>';
  html += '</div>';

  // Send button
  html += '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">';
  html += '<button class="btn btn-p btn-sm" id="btn-envio-manual" onclick="asistEjecutarEnvio()">📩 Enviar por WhatsApp</button>';
  html += '</div>';

  html += '</div>';
  overlay.innerHTML = html;
  overlay.classList.add('open');

  // Toggle sections when switching type
  document.querySelectorAll('input[name=envio-tipo]').forEach(function(r) {
    r.addEventListener('change', function() {
      var isActa = this.value === 'acta';
      document.getElementById('envio-faltas-section').style.display = isActa ? '' : 'none';
      document.getElementById('envio-periodo-section').style.display = isActa ? 'none' : '';
      document.getElementById('envio-dest-todos-label').style.display = isActa ? 'none' : '';
      // Force "Un empleado" when acta
      if (isActa) {
        var unoRadio = document.querySelector('input[name=envio-dest][value=uno]');
        if (unoRadio) { unoRadio.checked = true; document.getElementById('envio-emp-sel').style.display = ''; }
      }
    });
  });
}

async function asistEjecutarEnvio() {
  var tipo = document.querySelector('input[name=envio-tipo]:checked')?.value || 'reporte';
  var dest = document.querySelector('input[name=envio-dest]:checked')?.value || 'uno';
  var faltaDesde = (document.getElementById('envio-falta-desde')?.value || '').trim();
  var faltaHasta = (document.getElementById('envio-falta-hasta')?.value || '').trim();
  // For acta, use falta dates as period; for reporte, use period fields
  var inicio = tipo === 'acta' ? (faltaDesde || '') : (document.getElementById('envio-inicio')?.value || '');
  var fin = tipo === 'acta' ? (faltaHasta || faltaDesde || '') : (document.getElementById('envio-fin')?.value || '');
  // Build faltas string from date pickers
  var faltasStr = '';
  if (tipo === 'acta' && faltaDesde) {
    var fechas = [];
    var d = new Date(faltaDesde + 'T12:00:00');
    var end = new Date((faltaHasta || faltaDesde) + 'T12:00:00');
    while (d <= end) {
      fechas.push(d.toLocaleDateString('en-CA'));
      d.setDate(d.getDate() + 1);
    }
    faltasStr = fechas.join(', ');
  }
  if (tipo === 'acta' && !faltaDesde) { if (typeof toast === 'function') toast('Selecciona las fechas de falta','error'); return; }
  if (!inicio || !fin) { if (typeof toast === 'function') toast('Selecciona el periodo','error'); return; }

  var btn = document.getElementById('btn-envio-manual');
  if (btn) { btn.disabled = true; btn.textContent = 'Enviando...'; }

  var emps = _asistGetActiveEmployees();
  var targets = [];
  if (dest === 'todos') {
    targets = emps;
  } else {
    var selUid = document.getElementById('envio-uid')?.value;
    var match = emps.find(function(e) { return e.uid === selUid; });
    if (match) targets = [match];
  }

  if (targets.length === 0) { if (typeof toast === 'function') toast('No hay destinatarios','error'); if (btn) { btn.disabled = false; btn.textContent = '📩 Enviar por WhatsApp'; } return; }

  // Find phone for each target
  var phoneMapReverse = {};
  for (var ph in _asistPhoneMap) { phoneMapReverse[_asistPhoneMap[ph]] = ph; }

  var enviados = 0;
  for (var i = 0; i < targets.length; i++) {
    var emp = targets[i];
    var phone = phoneMapReverse[emp.uid];
    if (!phone) continue;

    try {
      // Create firma record with token
      var token = Array.from(crypto.getRandomValues(new Uint8Array(24))).map(function(b) { return b.toString(16).padStart(2, '0'); }).join('');
      var expires = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();

      await db.from('asistencia_firmas').insert({
        uid: emp.uid,
        periodo_inicio: inicio,
        periodo_fin: fin,
        token: token,
        token_expires: expires,
        enviado_at: new Date().toISOString()
      });

      // Build link
      var link = window.location.origin + '/firma-asistencia?token=' + token;
      if (tipo === 'acta') {
        var faltas = faltasStr || '';
        link += '&acta=1';
        if (faltas) link += '&faltas=' + faltas;
      }

      // Send via whatsapp function
      var docLabel = tipo === 'acta' ? 'Acta de falta injustificada' : 'Reporte de asistencia';
      var msg = tipo === 'acta'
        ? '📋 *' + docLabel + '*\n\n' + emp.nombre + ', se te ha generado un acta por falta(s) injustificada(s).\n\nPeriodo: ' + inicio + ' al ' + fin + '\n\nRevisa y firma aqui:\n👉 ' + link + '\n\nEl link expira en 72 horas.\n_Art. 47 Frac. X — LFT_'
        : '📊 *' + docLabel + '*\n\nHola ' + emp.nombre + ', tu reporte de asistencia del ' + inicio + ' al ' + fin + ' esta listo.\n\nRevisalo y firmalo aqui:\n👉 ' + link + '\n\nEl link expira en 72 horas.';

      await fetch('/.netlify/functions/whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send',
          phone: phone,
          message: msg,
          auth: { id: currentUser?.id || 'admin', pass: currentUser?.pass || '' }
        })
      });
      enviados++;
    } catch(e) {
      console.error('[Envio Manual] Error for ' + emp.nombre + ':', e);
    }
  }

  if (btn) { btn.disabled = false; btn.textContent = '📩 Enviar por WhatsApp'; }
  if (typeof toast === 'function') toast(enviados + ' mensaje(s) enviado(s)');
  var ov = document.getElementById('asist-reporte-overlay'); if (ov) { ov.classList.remove('open'); ov.remove(); }
}

// ═══════════════════════════════════════════════════════════
// CALENDARIO DE PERMISOS / VACACIONES
// ═══════════════════════════════════════════════════════════

var _asistPermisos = []; // loaded from DB

async function asistCargarPermisos() {
  var res = await db.from('asistencia').select('*').not('nota', 'is', null).neq('nota', '').order('fecha', { ascending: false }).limit(200);
  // Also load from a dedicated key if needed
  return res.data || [];
}

function asistRenderCalendarioPermisos() {
  // This renders inside the Diario tab as a button to open the permissions modal
}

async function asistAbrirPermisos() {
  var emps = _asistGetActiveEmployees();

  var overlay = document.getElementById('asist-reporte-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'asist-reporte-overlay';
    overlay.className = 'm-overlay';
    overlay.onclick = function(e) { if (e.target === overlay) { overlay.classList.remove('open'); overlay.remove(); } };
    document.body.appendChild(overlay);
  }

  // Load existing permissions
  var permRes = await db.from('asistencia').select('*').in('nota', ['Vacaciones','Permiso','Incapacidad','Dia personal']).order('fecha', { ascending: false }).limit(200);
  var permisos = permRes.data || [];

  var html = '<div style="background:var(--surface);border-radius:16px;max-width:700px;width:95vw;max-height:90vh;overflow-y:auto;padding:20px;position:relative">';
  html += '<button onclick="var o=document.getElementById(\'asist-reporte-overlay\');if(o){o.classList.remove(\'open\');o.remove();}" style="position:absolute;top:12px;right:16px;background:none;border:none;color:var(--muted);font-size:18px;cursor:pointer">✕</button>';
  html += '<h2 style="font-size:15px;margin-bottom:16px;color:var(--beige)">Permisos, Vacaciones e Incapacidades</h2>';

  // Add permission form
  var inputStyle = 'background:var(--surface2);border:1px solid rgba(255,255,255,0.09);border-radius:8px;padding:7px 10px;color:var(--white);font-family:Outfit,sans-serif;font-size:12px;outline:none;width:100%';
  html += '<div style="background:var(--surface2);border:1px solid rgba(255,255,255,0.07);border-radius:10px;padding:14px;margin-bottom:16px">';
  html += '<div style="font-size:11px;font-weight:600;color:var(--beige);margin-bottom:8px">Registrar permiso / ausencia autorizada</div>';
  html += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:8px;margin-bottom:8px">';

  html += '<div><div style="font-size:9px;color:var(--muted);margin-bottom:2px">Empleado</div>';
  html += '<select id="perm-uid" style="' + inputStyle + '">';
  emps.forEach(function(e) { html += '<option value="' + e.uid + '">' + e.nombre + '</option>'; });
  html += '</select></div>';

  html += '<div><div style="font-size:9px;color:var(--muted);margin-bottom:2px">Tipo</div>';
  html += '<select id="perm-tipo" style="' + inputStyle + '">';
  html += '<option value="Vacaciones">Vacaciones</option><option value="Permiso">Permiso con goce</option><option value="Permiso sin goce">Permiso sin goce</option><option value="Incapacidad">Incapacidad</option><option value="Dia personal">Dia personal</option>';
  html += '</select></div>';

  html += '<div><div style="font-size:9px;color:var(--muted);margin-bottom:2px">Fecha inicio</div>';
  html += '<input type="date" id="perm-inicio" style="' + inputStyle + '"></div>';

  html += '<div><div style="font-size:9px;color:var(--muted);margin-bottom:2px">Fecha fin</div>';
  html += '<input type="date" id="perm-fin" style="' + inputStyle + '"></div>';

  html += '</div>';
  html += '<div style="display:flex;gap:8px;align-items:end">';
  html += '<div style="flex:1"><div style="font-size:9px;color:var(--muted);margin-bottom:2px">Motivo (opcional)</div>';
  html += '<input type="text" id="perm-motivo" placeholder="Descripcion breve" style="' + inputStyle + '"></div>';
  html += '<button class="btn btn-p btn-sm" onclick="asistGuardarPermiso()">+ Registrar</button>';
  html += '</div></div>';

  // Existing permissions table
  if (permisos.length > 0) {
    html += '<table style="width:100%;border-collapse:collapse;font-size:11px">';
    html += '<thead><tr style="border-bottom:1px solid rgba(255,255,255,0.08)">';
    ['Fecha','Empleado','Tipo','Motivo',''].forEach(function(h2) {
      html += '<th style="text-align:left;padding:6px;color:var(--muted);font-size:9px;text-transform:uppercase">' + h2 + '</th>';
    });
    html += '</tr></thead><tbody>';
    permisos.forEach(function(p) {
      var empName = _asistResolveNombre(p.uid);
      var tipoBg = p.nota === 'Vacaciones' ? 'rgba(74,240,200,0.12)' : p.nota === 'Incapacidad' ? 'rgba(245,166,35,0.12)' : 'rgba(138,176,232,0.12)';
      var tipoColor = p.nota === 'Vacaciones' ? '#4af0c8' : p.nota === 'Incapacidad' ? '#f5a623' : '#8ab0e8';
      html += '<tr style="border-bottom:1px solid rgba(255,255,255,0.04)">';
      html += '<td style="padding:6px">' + p.fecha + '</td>';
      html += '<td style="padding:6px">' + empName + '</td>';
      html += '<td style="padding:6px"><span style="background:' + tipoBg + ';color:' + tipoColor + ';padding:1px 6px;border-radius:8px;font-size:9px;font-weight:600">' + p.nota + '</span></td>';
      html += '<td style="padding:6px;color:var(--muted);font-size:10px">' + (p.sucursal || '') + '</td>';
      html += '<td style="padding:6px;text-align:right"><button class="btn btn-g" style="padding:2px 6px;font-size:9px;color:#e74c3c" onclick="asistEliminarPermiso(' + p.id + ')">✕</button></td>';
      html += '</tr>';
    });
    html += '</tbody></table>';
  } else {
    html += '<div style="padding:16px;text-align:center;color:var(--muted);font-size:11px">No hay permisos registrados</div>';
  }

  html += '</div>';
  overlay.innerHTML = html;
  overlay.classList.add('open');
}

async function asistGuardarPermiso() {
  var uid = (document.getElementById('perm-uid') || {}).value;
  var tipo = (document.getElementById('perm-tipo') || {}).value;
  var inicio = (document.getElementById('perm-inicio') || {}).value;
  var fin = (document.getElementById('perm-fin') || {}).value;
  var motivo = ((document.getElementById('perm-motivo') || {}).value || '').trim();
  if (!uid || !tipo || !inicio) { if (typeof toast === 'function') toast('Completa los campos','error'); return; }
  if (!fin) fin = inicio;

  var emp = _asistGetActiveEmployees().find(function(e) { return e.uid === uid; });
  var empSuc = emp ? emp.sucursal : '';
  var notaText = motivo ? tipo + ' — ' + motivo : tipo;

  // Create one record per day in range
  var d = new Date(inicio + 'T12:00:00');
  var end = new Date(fin + 'T12:00:00');
  var count = 0;
  while (d <= end) {
    var fecha = d.toLocaleDateString('en-CA');
    try {
      // Check if record exists
      var existing = await db.from('asistencia').select('id').eq('uid', uid).eq('fecha', fecha);
      if (existing.data && existing.data.length > 0) {
        await db.from('asistencia').update({ nota: notaText, es_falta: false }).eq('id', existing.data[0].id);
      } else {
        await db.from('asistencia').insert({ uid: uid, fecha: fecha, nota: notaText, es_falta: false, sucursal: empSuc });
      }
      count++;
    } catch(e) { console.warn('[Permisos] Error saving ' + fecha, e); }
    d.setDate(d.getDate() + 1);
  }

  if (typeof toast === 'function') toast(count + ' dia(s) de ' + tipo + ' registrados');
  asistAbrirPermisos(); // refresh
}

async function asistEliminarPermiso(id) {
  if (!confirm('Eliminar este permiso?')) return;
  try {
    await db.from('asistencia').update({ nota: null, es_falta: true }).eq('id', id);
    if (typeof toast === 'function') toast('Permiso eliminado');
    asistAbrirPermisos();
  } catch(e) {
    console.error('[Permisos] Delete error:', e);
  }
}

// ═══════════════════════════════════════════════════════════
// REPORTE INDIVIDUAL (TAMAÑO CARTA) + FIRMA DIGITAL
// ═══════════════════════════════════════════════════════════

var _asistReporteUid = null;
var _asistReporteRange = null;
var _asistReporteFirmaEmp = null;
var _asistPatronCanvas = null;
var _asistPatronCtx = null;
var _asistPatronDrawing = false;
var _asistPatronDrawn = false;

async function asistGenerarReporte(uid) {
  _asistReporteUid = uid;
  _asistReporteRange = _asistDateRange(_asistResumenTipo);

  // Load records + firma if exists
  var [recRes, firmaRes] = await Promise.all([
    db.from('asistencia').select('*').eq('uid', uid).gte('fecha', _asistReporteRange.start).lte('fecha', _asistReporteRange.end).order('fecha'),
    db.from('asistencia_firmas').select('*').eq('uid', uid).gte('periodo_inicio', _asistReporteRange.start).lte('periodo_fin', _asistReporteRange.end).not('firmado_at', 'is', null).order('firmado_at', { ascending: false }).limit(1)
  ]);
  var records = recRes.data || [];
  _asistReporteFirmaEmp = (firmaRes.data && firmaRes.data.length > 0) ? firmaRes.data[0].firma_empleado : null;

  var empName = _asistResolveNombre(uid);
  var empSuc = 'N/A';
  var emps = _asistGetActiveEmployees();
  var emp = emps.find(function(e) { return e.uid === uid; });
  if (emp) empSuc = emp.sucursal;

  // Build modal
  var overlay = document.getElementById('asist-reporte-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'asist-reporte-overlay';
    overlay.className = 'm-overlay';
    overlay.onclick = function(e) { if (e.target === overlay) { overlay.classList.remove('open'); overlay.remove(); } };
    document.body.appendChild(overlay);
  }

  var html = '<div style="background:var(--surface);border-radius:16px;max-width:850px;width:95vw;max-height:90vh;overflow-y:auto;padding:20px;position:relative">';
  html += '<button onclick="var o=document.getElementById(\'asist-reporte-overlay\');if(o){o.classList.remove(\'open\');o.remove();}" style="position:absolute;top:12px;right:16px;background:none;border:none;color:var(--muted);font-size:18px;cursor:pointer">✕</button>';
  html += '<h2 style="font-size:15px;margin-bottom:16px;color:var(--beige)">Reporte de Asistencia — ' + empName + '</h2>';

  // Preview area
  html += '<div id="asist-reporte-preview" style="background:#fff;color:#000;padding:20px;border-radius:8px;font-family:\'Times New Roman\',serif;font-size:11pt;line-height:1.4">';
  html += _asistBuildReporteHTML(empName, empSuc, _asistReporteRange, records, _asistReporteFirmaEmp, null);
  html += '</div>';

  // Patron signature canvas
  html += '<div style="margin-top:16px;background:var(--surface2);border-radius:10px;padding:14px">';
  html += '<div style="font-size:11px;font-weight:600;color:var(--beige);margin-bottom:6px">Firma del patron / representante</div>';
  html += '<div style="background:#fff;border-radius:8px;position:relative;touch-action:none" id="asist-patron-sig-container">';
  html += '<canvas id="asist-patron-canvas" height="100" style="display:block;width:100%;border-radius:8px"></canvas>';
  html += '<span id="asist-patron-hint" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:#ccc;font-size:12px;pointer-events:none">Firme aqui</span>';
  html += '</div>';
  html += '<div style="display:flex;gap:8px;margin-top:8px">';
  html += '<button class="btn btn-g btn-sm" onclick="asistClearPatronSig()">Limpiar</button>';
  html += '</div></div>';

  // Action buttons
  html += '<div style="display:flex;gap:8px;margin-top:16px;justify-content:flex-end">';
  html += '<button class="btn btn-g btn-sm" onclick="asistImprimirReporte()">🖨 Imprimir (carta)</button>';
  html += '</div>';

  html += '</div>';
  overlay.innerHTML = html;
  overlay.classList.add('open');

  // Init patron signature canvas
  setTimeout(function() { _asistInitPatronSig(); }, 100);
}

function _asistBuildReporteHTML(empName, empSuc, range, records, firmaEmp, firmaPatron) {
  var recByDate = {};
  records.forEach(function(r) { recByDate[r.fecha] = r; });

  // Get expediente data
  var exp = _asistExpedientes[_asistReporteUid] || {};
  var nombreCompleto = exp.nombre_completo || empName;
  var razonSocial = exp.razon_social || 'Opticas Car & Era';
  var rfcPatronal = exp.rfc_patronal || '';
  var regPatronal = exp.reg_patronal || '';
  var domicilio = exp.domicilio_fiscal || 'Ciudad Juarez, Chihuahua, Mexico';

  // Detect if this is an acta de falta (same start/end date = single day = acta)
  var isActa = _asistCurrentFirma && _asistCurrentFirma.periodo_inicio === _asistCurrentFirma.periodo_fin;
  var actaFaltas = isActa ? [_asistCurrentFirma.periodo_inicio] : [];

  var html = '';
  // Header — empresa
  html += '<div style="text-align:center;border-bottom:2px solid ' + (isActa ? '#c00' : '#000') + ';padding-bottom:6px;margin-bottom:8px">';
  html += '<div style="font-size:12pt;font-weight:bold;letter-spacing:1px">' + razonSocial.toUpperCase() + '</div>';
  if (rfcPatronal) html += '<div style="font-size:9pt">RFC: ' + rfcPatronal + (regPatronal ? ' &nbsp;|&nbsp; Reg. Patronal IMSS: ' + regPatronal : '') + '</div>';
  html += '<div style="font-size:9pt;color:#555">' + domicilio + '</div>';
  if (isActa) {
    html += '<div style="font-size:14pt;font-weight:bold;margin-top:8px;color:#c00;letter-spacing:2px">ACTA DE FALTA INJUSTIFICADA</div>';
    html += '<div style="font-size:9pt;color:#555">Art. 47 Fraccion X — Ley Federal del Trabajo</div>';
  } else {
    html += '<div style="font-size:13pt;font-weight:bold;margin-top:8px">CONTROL DE ASISTENCIA</div>';
    html += '<div style="font-size:10pt;color:#555">Art. 804 Fraccion III — Ley Federal del Trabajo</div>';
  }
  html += '</div>';

  // Employee info — datos LFT
  var _tc = 'color:#000;'; // force dark text on white bg
  html += '<table style="width:100%;font-size:9.5pt;margin-bottom:10px;border-collapse:collapse;' + _tc + '">';
  html += '<tr><td style="padding:2px 0;width:50%;' + _tc + '"><b>Nombre del trabajador:</b> ' + nombreCompleto + '</td>';
  html += '<td style="padding:2px 0;' + _tc + '"><b>Sucursal:</b> ' + empSuc + '</td></tr>';
  if (exp.curp || exp.rfc) {
    html += '<tr><td style="padding:2px 0;' + _tc + '"><b>CURP:</b> ' + (exp.curp || '—') + '</td>';
    html += '<td style="padding:2px 0;' + _tc + '"><b>RFC:</b> ' + (exp.rfc || '—') + '</td></tr>';
  }
  if (exp.nss) {
    html += '<tr><td style="padding:2px 0;' + _tc + '"><b>NSS (IMSS):</b> ' + exp.nss + '</td>';
    html += '<td style="padding:2px 0;' + _tc + '"><b>Puesto:</b> ' + (exp.puesto || '—') + '</td></tr>';
  } else if (exp.puesto) {
    html += '<tr><td style="padding:2px 0;' + _tc + '"><b>Puesto:</b> ' + exp.puesto + '</td>';
    html += '<td style="padding:2px 0;' + _tc + '"><b>Departamento:</b> ' + (exp.departamento || '—') + '</td></tr>';
  }
  if (exp.fecha_ingreso || exp.jornada) {
    html += '<tr><td style="padding:2px 0;' + _tc + '"><b>Fecha de ingreso:</b> ' + (exp.fecha_ingreso || '—') + '</td>';
    html += '<td style="padding:2px 0;' + _tc + '"><b>Jornada:</b> ' + (exp.jornada || 'Diurna') + '</td></tr>';
  }
  html += '<tr><td style="padding:2px 0;' + _tc + '"><b>Periodo:</b> ' + range.start + ' al ' + range.end + '</td>';
  html += '<td style="padding:2px 0;' + _tc + '"><b>Fecha de emision:</b> ' + _asistHoyLocal() + '</td></tr>';
  html += '</table>';

  if (isActa && actaFaltas.length > 0) {
    // ── ACTA FORMAT: fechas de falta + declaración formal ──
    html += '<div style="border:2px solid #c00;border-radius:4px;padding:8px 12px;margin-bottom:10px">';
    html += '<div style="font-size:10pt;font-weight:bold;color:#c00;margin-bottom:4px">FECHA(S) DE INASISTENCIA</div>';
    actaFaltas.forEach(function(f) {
      var fechaLarga = new Date(f + 'T12:00:00').toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
      html += '<div style="padding:4px 0;border-bottom:1px solid #eee;display:flex;justify-content:space-between">';
      html += '<span style="font-weight:700;font-size:10pt">' + fechaLarga.charAt(0).toUpperCase() + fechaLarga.slice(1) + '</span>';
      html += '<span style="color:#c00;font-weight:bold;font-size:9pt">Falta injustificada</span>';
      html += '</div>';
    });
    html += '</div>';

    // Declaración formal
    html += '<div style="font-size:10pt;line-height:1.5;margin-bottom:10px">';
    html += '<p style="margin-bottom:6px">En la ciudad de <b>Cd. Juarez, Chih.</b>, a <b>' + new Date().toLocaleDateString('es-MX', { timeZone: 'America/Chihuahua', day: 'numeric', month: 'long', year: 'numeric' }) + '</b>, se levanta la presente acta administrativa para hacer constar que:</p>';
    html += '<p style="margin-bottom:6px">El(la) trabajador(a) <b>' + nombreCompleto + '</b>, adscrito(a) a la sucursal <b>' + empSuc + '</b>, <b style="color:#c00">no se presento a laborar</b> en la(s) fecha(s) arriba senalada(s), sin contar con autorizacion previa ni justificacion alguna para su ausencia.</p>';
    html += '<p style="margin-bottom:4px">Se hace de su conocimiento que:</p>';
    html += '<div style="border-left:3px solid #c00;padding:4px 12px;margin:4px 0 8px">';
    html += '<p style="margin-bottom:4px"><b>1.</b> La falta de asistencia injustificada constituye un incumplimiento a las obligaciones laborales.</p>';
    html += '<p style="margin-bottom:4px"><b>2.</b> De conformidad con el <b>Articulo 47, Fraccion X</b> de la Ley Federal del Trabajo, la acumulacion de <b>mas de 3 faltas en un periodo de 30 dias sin permiso del patron o sin causa justificada</b>, es causal de rescision de la relacion de trabajo sin responsabilidad para el patron.</p>';
    html += '<p><b>3.</b> La presente acta se integra al expediente laboral del trabajador conforme al <b>Articulo 804, Fraccion III</b> de la LFT.</p>';
    html += '</div>';
    html += '<p>El(la) trabajador(a) manifiesta estar enterado(a) del contenido de la presente acta y firma de conformidad.</p>';
    html += '</div>';

  } else {
  // ── REPORTE FORMAT: tabla de asistencia normal ──

  // Attendance table
  html += '<table style="width:100%;border-collapse:collapse;font-size:10pt;margin-bottom:15px">';
  html += '<thead><tr style="background:#f0f0f0">';
  ['Fecha','Dia','Entrada','Comida','Regreso','Salida','Horas','Retardo','Estado','Observaciones'].forEach(function(h) {
    html += '<th style="border:1px solid #999;padding:5px 4px;text-align:center;font-size:9pt;font-weight:bold">' + h + '</th>';
  });
  html += '</tr></thead><tbody>';

  var dates = [];
  var d = new Date(range.start + 'T12:00:00');
  var end = new Date(range.end + 'T12:00:00');
  while (d <= end) { dates.push(d.toLocaleDateString('en-CA')); d.setDate(d.getDate() + 1); }

  var totalDias = 0, diasTrab = 0, totalHoras = 0, totalRetardos = 0, totalFaltas = 0, totalRetMin = 0;

  dates.forEach(function(fecha) {
    var rec = recByDate[fecha] || {};
    var dayKey = _asistDayKey(fecha);
    var sched = _asistResolveSchedule(_asistReporteUid, dayKey);
    if (!sched) return;
    totalDias++;

    var estado = '';
    if (rec.entrada) {
      diasTrab++;
      if (rec.horas_trabajadas) totalHoras += parseFloat(rec.horas_trabajadas);
      if (rec.retardo_min > 0) { totalRetardos++; totalRetMin += rec.retardo_min; estado = 'Retardo (' + rec.retardo_min + 'min)'; }
      else estado = 'A tiempo';
    } else if (fecha < _asistHoyLocal()) {
      totalFaltas++; estado = 'FALTA';
    }

    var bgColor = estado === 'FALTA' ? '#fff0f0' : rec.retardo_min > 0 ? '#fffbe6' : '';
    html += '<tr style="' + (bgColor ? 'background:' + bgColor : '') + '">';
    html += '<td style="border:1px solid #ccc;padding:3px;text-align:center">' + fecha + '</td>';
    html += '<td style="border:1px solid #ccc;padding:3px;text-align:center">' + _asistDayLabel(fecha).substring(0,3) + '</td>';
    html += '<td style="border:1px solid #ccc;padding:3px;text-align:center">' + _asistFormatHora(rec.entrada) + '</td>';
    html += '<td style="border:1px solid #ccc;padding:3px;text-align:center">' + _asistFormatHora(rec.comida_inicio) + '</td>';
    html += '<td style="border:1px solid #ccc;padding:3px;text-align:center">' + _asistFormatHora(rec.comida_fin) + '</td>';
    html += '<td style="border:1px solid #ccc;padding:3px;text-align:center">' + _asistFormatHora(rec.salida) + '</td>';
    html += '<td style="border:1px solid #ccc;padding:3px;text-align:center;font-weight:bold">' + (rec.horas_trabajadas ? parseFloat(rec.horas_trabajadas).toFixed(2) : '') + '</td>';
    html += '<td style="border:1px solid #ccc;padding:3px;text-align:center;color:' + (rec.retardo_min > 0 ? '#c00' : '') + '">' + (rec.retardo_min > 0 ? rec.retardo_min + ' min' : '') + '</td>';
    html += '<td style="border:1px solid #ccc;padding:3px;text-align:center;font-weight:' + (estado === 'FALTA' ? 'bold;color:#c00' : 'normal') + '">' + estado + '</td>';
    html += '<td style="border:1px solid #ccc;padding:3px;text-align:center;font-size:8pt">' + (rec.nota || '') + '</td>';
    html += '</tr>';
  });
  html += '</tbody></table>';

  // Summary
  html += '<table style="width:50%;border-collapse:collapse;font-size:10pt;margin-bottom:20px">';
  html += '<tr><td style="padding:3px;border:1px solid #ccc"><b>Dias programados</b></td><td style="padding:3px;border:1px solid #ccc;text-align:center">' + totalDias + '</td></tr>';
  html += '<tr><td style="padding:3px;border:1px solid #ccc"><b>Dias trabajados</b></td><td style="padding:3px;border:1px solid #ccc;text-align:center">' + diasTrab + '</td></tr>';
  html += '<tr><td style="padding:3px;border:1px solid #ccc"><b>Horas totales</b></td><td style="padding:3px;border:1px solid #ccc;text-align:center">' + totalHoras.toFixed(2) + 'h</td></tr>';
  html += '<tr><td style="padding:3px;border:1px solid #ccc"><b>Retardos</b></td><td style="padding:3px;border:1px solid #ccc;text-align:center">' + totalRetardos + ' (' + totalRetMin + ' min)</td></tr>';
  html += '<tr><td style="padding:3px;border:1px solid #ccc"><b>Faltas</b></td><td style="padding:3px;border:1px solid #ccc;text-align:center;color:' + (totalFaltas > 0 ? '#c00' : '') + '">' + totalFaltas + '</td></tr>';
  html += '</table>';
  } // end else (reporte format)

  // Signature section — 3 columns: firma digital (left) + firma trabajador (center) + firma patron (right)
  html += '<div style="margin-top:15px;display:flex;justify-content:space-between;gap:20px;align-items:flex-end">';

  // Digital signature (left, own field)
  html += '<div style="text-align:center;width:140px;flex-shrink:0">';
  if (firmaEmp) {
    html += '<img src="' + firmaEmp + '" style="max-width:130px;max-height:55px;display:block;margin:0 auto 2px">';
  }
  if (firmaPatron) {
    html += '<img src="' + firmaPatron + '" style="max-width:130px;max-height:55px;display:block;margin:4px auto 2px">';
  }
  html += '<div style="border-top:1px solid #999;padding-top:2px;margin-top:4px">';
  html += '<div style="font-size:7pt;color:#888">Firma(s) digital(es)</div>';
  html += '</div></div>';

  // Employee physical signature (center)
  html += '<div style="flex:1;text-align:center">';
  html += '<div style="min-height:40px"></div>';
  html += '<div style="border-top:1px solid #000;padding-top:3px">';
  html += '<div style="font-size:9pt;font-weight:bold">' + empName + '</div>';
  html += '<div style="font-size:7pt;color:#555">Firma del trabajador</div>';
  html += '</div></div>';

  // Patron physical signature (right)
  html += '<div style="flex:1;text-align:center">';
  html += '<div style="min-height:40px"></div>';
  html += '<div style="border-top:1px solid #000;padding-top:3px">';
  html += '<div style="font-size:9pt;font-weight:bold">' + (exp.razon_social || 'Representante de la empresa') + '</div>';
  html += '<div style="font-size:7pt;color:#555">Firma del patron o representante legal</div>';
  html += '</div></div>';

  html += '</div>';

  // Validation seal
  var firmaToken = (_asistCurrentFirma && _asistCurrentFirma.token) ? _asistCurrentFirma.token : '';
  var firmaFecha = (_asistCurrentFirma && _asistCurrentFirma.firmado_at) ? new Date(_asistCurrentFirma.firmado_at).toLocaleString('es-MX', { timeZone: 'America/Chihuahua', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) : '';
  if (firmaToken || firmaFecha) {
    html += '<div style="margin-top:10px;border:1px solid #999;border-radius:4px;padding:5px 10px;font-size:7pt;color:#555;display:flex;align-items:center;gap:8px">';
    html += '<div style="font-size:11pt;color:#999">&#128274;</div>';
    html += '<div>';
    html += '<div style="font-weight:bold;font-size:8pt;color:#333">Sello de verificacion digital</div>';
    if (firmaFecha) html += '<div>Fecha y hora de firma: <b>' + firmaFecha + '</b></div>';
    if (firmaToken) html += '<div>Token: <span style="font-family:monospace;letter-spacing:1px">' + firmaToken.substring(0, 12) + '...' + firmaToken.substring(firmaToken.length - 8) + '</span></div>';
    html += '<div>Verificar en: optcaryera.netlify.app/firma-asistencia</div>';
    html += '</div></div>';
  }

  // Footer
  html += '<div style="margin-top:6px;text-align:center;font-size:7pt;color:#888;border-top:1px solid #ddd;padding-top:4px">';
  html += 'Documento generado el ' + _asistHoyLocal() + ' — Opticas Car & Era — Art. 804 Frac. III LFT';
  html += '</div>';

  return html;
}

function _asistInitPatronSig() {
  _asistPatronCanvas = document.getElementById('asist-patron-canvas');
  if (!_asistPatronCanvas) return;
  var container = document.getElementById('asist-patron-sig-container');
  _asistPatronCanvas.width = container.offsetWidth;
  _asistPatronCtx = _asistPatronCanvas.getContext('2d');
  _asistPatronCtx.strokeStyle = '#000';
  _asistPatronCtx.lineWidth = 2;
  _asistPatronCtx.lineCap = 'round';
  _asistPatronCtx.lineJoin = 'round';
  _asistPatronDrawn = false;

  function getPos(e) { var r = _asistPatronCanvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }

  _asistPatronCanvas.addEventListener('mousedown', function(e) {
    _asistPatronDrawing = true; var p = getPos(e); _asistPatronCtx.beginPath(); _asistPatronCtx.moveTo(p.x, p.y);
    var h = document.getElementById('asist-patron-hint'); if (h) h.style.opacity = '0';
  });
  _asistPatronCanvas.addEventListener('mousemove', function(e) {
    if (!_asistPatronDrawing) return; var p = getPos(e); _asistPatronCtx.lineTo(p.x, p.y); _asistPatronCtx.stroke(); _asistPatronDrawn = true;
  });
  _asistPatronCanvas.addEventListener('mouseup', function() { _asistPatronDrawing = false; });
  _asistPatronCanvas.addEventListener('mouseleave', function() { _asistPatronDrawing = false; });

  _asistPatronCanvas.addEventListener('touchstart', function(e) {
    e.preventDefault(); _asistPatronDrawing = true; var p = getPos(e.touches[0]); _asistPatronCtx.beginPath(); _asistPatronCtx.moveTo(p.x, p.y);
    var h = document.getElementById('asist-patron-hint'); if (h) h.style.opacity = '0';
  }, { passive: false });
  _asistPatronCanvas.addEventListener('touchmove', function(e) {
    e.preventDefault(); if (!_asistPatronDrawing) return; var p = getPos(e.touches[0]); _asistPatronCtx.lineTo(p.x, p.y); _asistPatronCtx.stroke(); _asistPatronDrawn = true;
  }, { passive: false });
  _asistPatronCanvas.addEventListener('touchend', function() { _asistPatronDrawing = false; });
}

function asistClearPatronSig() {
  if (!_asistPatronCtx || !_asistPatronCanvas) return;
  _asistPatronCtx.clearRect(0, 0, _asistPatronCanvas.width, _asistPatronCanvas.height);
  _asistPatronDrawn = false;
  var h = document.getElementById('asist-patron-hint'); if (h) h.style.opacity = '1';
}

function asistImprimirReporte() {
  var empName = _asistResolveNombre(_asistReporteUid);
  var empSuc = 'N/A';
  var emp = _asistGetActiveEmployees().find(function(e) { return e.uid === _asistReporteUid; });
  if (emp) empSuc = emp.sucursal;

  var firmaPatron = _asistPatronDrawn ? _asistPatronCanvas.toDataURL('image/png') : null;

  var reporteHTML = _asistBuildReporteHTML(empName, empSuc, _asistReporteRange, [], _asistReporteFirmaEmp, firmaPatron);

  // Reload records for the print (we need fresh data)
  db.from('asistencia').select('*').eq('uid', _asistReporteUid).gte('fecha', _asistReporteRange.start).lte('fecha', _asistReporteRange.end).order('fecha').then(function(res) {
    var records = (res.data || []);
    var finalHTML = _asistBuildReporteHTML(empName, empSuc, _asistReporteRange, records, _asistReporteFirmaEmp, firmaPatron);

    var CARTA_CSS = '@page { size: letter; margin: 12mm 15mm; } * { margin:0; padding:0; box-sizing:border-box; } body { font-family: "Times New Roman", serif; font-size: 10pt; color: #000; line-height: 1.3; -webkit-print-color-adjust: exact; print-color-adjust: exact; }';
    var fullHTML = '<!DOCTYPE html><html><head><meta charset="UTF-8"><style>' + CARTA_CSS + '</style></head><body>' + finalHTML + '</body></html>';

    if (typeof silentPrintHTML === 'function') {
      silentPrintHTML(fullHTML);
    } else {
      var w = window.open('', '_blank');
      w.document.write(fullHTML);
      w.document.close();
      w.focus();
      setTimeout(function() { w.print(); }, 300);
    }
  });
}
