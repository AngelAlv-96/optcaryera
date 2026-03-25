// Asistencia Cron — Two jobs:
// 1. Checks for missing check-ins 30min after scheduled entry (runs every 30min)
// 2. Sends signature request links every 7-10 days (random per employee)
// Netlify Scheduled Function

const crypto = require('crypto');
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://icsnlgeereepesbrdjhf.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_WA = process.env.TWILIO_WA_NUMBER || 'whatsapp:+5216563110094';
const TWILIO_API = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`;
const SITE_URL = process.env.URL || 'https://optcaryera.netlify.app';

async function supaFetch(path, opts) {
  if (!SUPABASE_KEY) return null;
  opts = opts || {};
  var res = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
    method: opts.method || 'GET',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Content-Type': 'application/json',
      'Prefer': opts.prefer || 'return=representation'
    },
    body: opts.body || undefined
  });
  if (!res.ok) return null;
  var text = await res.text();
  if (!text || !text.trim()) return null;
  try { return JSON.parse(text); } catch(e) { return null; }
}

async function sendWA(to, text) {
  var toNum = to.replace(/[\s\-\(\)\+]/g, '');
  if (toNum.length === 10) toNum = '521' + toNum;
  var params = new URLSearchParams();
  params.append('From', TWILIO_WA);
  params.append('To', 'whatsapp:+' + toNum);
  params.append('Body', text);
  await fetch(TWILIO_API, {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + Buffer.from(TWILIO_SID + ':' + TWILIO_TOKEN).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params.toString()
  });
}

exports.handler = async function() {
  console.log('[Asistencia Cron] Starting...');

  try {
    // 1. Get current time in Chihuahua
    var nowStr = new Date().toLocaleString('en-US', { timeZone: 'America/Chihuahua' });
    var now = new Date(nowStr);
    var currentMinutes = now.getHours() * 60 + now.getMinutes();
    var dayNames = ['dom','lun','mar','mie','jue','vie','sab'];
    var dayKey = dayNames[now.getDay()];
    var fechaLocal = now.toLocaleDateString('en-CA'); // YYYY-MM-DD

    console.log('[Asistencia Cron] ' + fechaLocal + ' ' + dayKey + ' ' + now.getHours() + ':' + now.getMinutes());

    // 2. Load configs
    var cfgRes = await supaFetch('app_config?id=in.(empleados_telefono,horarios_asistencia,custom_users,asesores,whatsapp_config)&select=id,value');
    if (!cfgRes) { console.log('[Asistencia Cron] No config found'); return { statusCode: 200 }; }

    var phoneMap = {}, horarios = null, users = {}, asesoresCfg = {}, waCfg = {};
    cfgRes.forEach(function(c) {
      var v = typeof c.value === 'string' ? JSON.parse(c.value) : c.value;
      if (c.id === 'empleados_telefono') phoneMap = v || {};
      if (c.id === 'horarios_asistencia') horarios = v;
      if (c.id === 'custom_users') users = v || {};
      if (c.id === 'asesores') asesoresCfg = v || {};
      if (c.id === 'whatsapp_config') waCfg = v || {};
    });

    if (!horarios || !horarios.default) { console.log('[Asistencia Cron] No schedule configured'); return { statusCode: 200 }; }

    var tolerancia = horarios.tolerancia_min || 10;
    var checkDelay = 30; // check 30 min after scheduled entry

    // 3. Build employee list from phone map
    var employees = []; // { uid, phone, nombre, sucursal }
    for (var phone in phoneMap) {
      var uid = phoneMap[phone];
      var nombre = uid;
      var sucursal = 'N/A';

      if (uid.startsWith('asesor_')) {
        var sucs = asesoresCfg.sucursales || {};
        for (var suc in sucs) {
          (sucs[suc] || []).forEach(function(n) {
            if ('asesor_' + n.toLowerCase().replace(/\s+/g, '_') === uid) { nombre = n; sucursal = suc; }
          });
        }
      } else if (uid.startsWith('extra_')) {
        var extras = (horarios && horarios.empleados_extra) || {};
        if (extras[uid]) { nombre = extras[uid].nombre; sucursal = extras[uid].sucursal; }
      } else {
        var u = users[uid] || {};
        nombre = u.nombre || uid;
        sucursal = u.sucursal || 'N/A';
      }
      employees.push({ uid: uid, phone: phone, nombre: nombre, sucursal: sucursal });
    }

    if (employees.length === 0) { console.log('[Asistencia Cron] No employees registered'); return { statusCode: 200 }; }

    // 4. Check which employees should have checked in by now
    var missingEmployees = [];
    employees.forEach(function(emp) {
      // Resolve schedule for this employee today
      var sched = horarios.default[dayKey] || null;
      if (horarios.override && horarios.override[emp.uid]) {
        var ov = horarios.override[emp.uid][dayKey];
        if (ov === null) return; // day off
        if (ov) sched = ov;
      }
      if (!sched || !sched.entrada) return; // no schedule today

      // Calculate: scheduled entry + 30min
      var schedParts = sched.entrada.split(':');
      var schedEntryMin = parseInt(schedParts[0]) * 60 + parseInt(schedParts[1]);
      var checkAtMin = schedEntryMin + checkDelay;

      // Only trigger if current time is within 15min window of check time
      // (cron runs every 30min, so we check ±15min to not miss)
      if (currentMinutes >= checkAtMin && currentMinutes < checkAtMin + 15) {
        missingEmployees.push(emp);
      }
    });

    if (missingEmployees.length === 0) {
      console.log('[Asistencia Cron] No employees to check at this time');
      return { statusCode: 200 };
    }

    // 5. Check which of these employees have NOT checked in today (skip authorized absences)
    var uids = missingEmployees.map(function(e) { return e.uid; });
    var existingRecords = await supaFetch('asistencia?fecha=eq.' + fechaLocal + '&uid=in.(' + uids.join(',') + ')&select=uid,entrada,nota');
    var checkedIn = {};
    var hasPermiso = {};
    (existingRecords || []).forEach(function(r) {
      if (r.entrada) checkedIn[r.uid] = true;
      if (r.nota && /vacaciones|permiso|incapacidad|dia personal/i.test(r.nota)) hasPermiso[r.uid] = true;
    });

    var absent = missingEmployees.filter(function(e) { return !checkedIn[e.uid] && !hasPermiso[e.uid]; });

    if (absent.length === 0) {
      console.log('[Asistencia Cron] All employees checked in');
      return { statusCode: 200 };
    }

    console.log('[Asistencia Cron] ' + absent.length + ' employees missing check-in');

    // 6. Send reminders
    var adminPhones = waCfg.admin_phones || [];
    var absentNames = [];

    for (var i = 0; i < absent.length; i++) {
      var emp = absent[i];
      absentNames.push(emp.nombre + ' (' + emp.sucursal + ')');

      // Send reminder to employee
      await sendWA(emp.phone, '⏰ Recordatorio: No has registrado tu entrada de hoy.\n\nEnvía *entrada* para registrarte.\n\nSi no vas a asistir, avisa a tu supervisor.');

      // Small delay between messages
      if (i < absent.length - 1) await new Promise(function(r) { setTimeout(r, 1500); });
    }

    // 7. Send summary alert to admin
    if (adminPhones.length > 0) {
      var adminMsg = '⚠️ *Ausencias sin aviso*\n📅 ' + fechaLocal + '\n\n';
      adminMsg += absent.length + ' empleado(s) sin registro de entrada:\n\n';
      absentNames.forEach(function(n) { adminMsg += '• ' + n + '\n'; });

      for (var a = 0; a < adminPhones.length; a++) {
        await sendWA(adminPhones[a], adminMsg);
        if (a < adminPhones.length - 1) await new Promise(function(r) { setTimeout(r, 1500); });
      }
    }

    console.log('[Asistencia Cron] Sent ' + absent.length + ' reminders + admin alert');

    // ══════════════════════════════════════════════════════════
    // JOB 2: SIGNATURE REQUEST (runs once per day, ~10:30am window)
    // ══════════════════════════════════════════════════════════
    if (currentMinutes >= 630 && currentMinutes < 645) {
      console.log('[Firma Cron] Checking signature requests...');
      await checkSignatureRequests(employees, fechaLocal);
    }

    return { statusCode: 200 };

  } catch(err) {
    console.error('[Asistencia Cron] Error:', err.message);
    return { statusCode: 500 };
  }
};

async function checkSignatureRequests(employees, fechaLocal) {
  try {
    // For each employee, check if they need a signature request
    // Random interval: 7-10 days since last signed period
    for (var i = 0; i < employees.length; i++) {
      var emp = employees[i];

      // Get last signature record for this employee
      var lastFirma = await supaFetch('asistencia_firmas?uid=eq.' + emp.uid + '&order=periodo_fin.desc&limit=1&select=periodo_fin,firmado_at,enviado_at');
      var lastEntry = (lastFirma && lastFirma.length > 0) ? lastFirma[0] : null;

      // Calculate days since last period end (or since forever if never)
      var daysSinceLast = 999;
      if (lastEntry && lastEntry.periodo_fin) {
        var lastEnd = new Date(lastEntry.periodo_fin + 'T12:00:00');
        var today = new Date(fechaLocal + 'T12:00:00');
        daysSinceLast = Math.floor((today - lastEnd) / (24 * 60 * 60 * 1000));
      }

      // Random threshold per employee (seeded by uid for consistency)
      var seed = 0;
      for (var c = 0; c < emp.uid.length; c++) seed += emp.uid.charCodeAt(c);
      var threshold = 7 + (seed % 4); // 7, 8, 9, or 10 days

      if (daysSinceLast < threshold) continue;

      // Check if we already sent an unsigned request recently (don't spam)
      if (lastEntry && lastEntry.enviado_at && !lastEntry.firmado_at) {
        var sentDaysAgo = Math.floor((new Date() - new Date(lastEntry.enviado_at)) / (24 * 60 * 60 * 1000));
        if (sentDaysAgo < 3) continue; // wait at least 3 days before re-sending
      }

      // Calculate period: from day after last period end to yesterday
      var ASISTENCIA_START_DATE = '2026-03-25'; // ignore absences before this date (employees started using system)
      var periodoInicio;
      if (lastEntry && lastEntry.periodo_fin) {
        var d = new Date(lastEntry.periodo_fin + 'T12:00:00');
        d.setDate(d.getDate() + 1);
        periodoInicio = d.toLocaleDateString('en-CA');
      } else {
        // First time: last 7 days
        var d2 = new Date(fechaLocal + 'T12:00:00');
        d2.setDate(d2.getDate() - 7);
        periodoInicio = d2.toLocaleDateString('en-CA');
      }
      // Never go before system activation date
      if (periodoInicio < ASISTENCIA_START_DATE) periodoInicio = ASISTENCIA_START_DATE;
      var yesterday = new Date(fechaLocal + 'T12:00:00');
      yesterday.setDate(yesterday.getDate() - 1);
      var periodoFin = yesterday.toLocaleDateString('en-CA');

      if (periodoInicio > periodoFin) continue; // no period to sign

      // Check there are actual records in this period
      var recCount = await supaFetch('asistencia?uid=eq.' + emp.uid + '&fecha=gte.' + periodoInicio + '&fecha=lte.' + periodoFin + '&select=id&limit=1');
      if (!recCount || recCount.length === 0) continue; // no records, skip

      // Generate token
      var token = crypto.randomBytes(24).toString('hex');
      var expires = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(); // 48h

      // Create firma record
      await supaFetch('asistencia_firmas', {
        method: 'POST',
        body: JSON.stringify({
          uid: emp.uid,
          periodo_inicio: periodoInicio,
          periodo_fin: periodoFin,
          token: token,
          token_expires: expires,
          enviado_at: new Date().toISOString()
        }),
        prefer: 'return=minimal'
      });

      // Send WA
      var link = SITE_URL + '/firma-asistencia?token=' + token;
      var msg = '📋 *Reporte de asistencia*\n\nHola ' + emp.nombre + ', tu reporte del ' + periodoInicio + ' al ' + periodoFin + ' esta listo.\n\nRevisalo y firmalo aqui:\n👉 ' + link + '\n\nEl link expira en 48 horas.';
      await sendWA(emp.phone, msg);

      console.log('[Firma Cron] Sent signature request to ' + emp.nombre + ' (' + periodoInicio + ' - ' + periodoFin + ')');

      // Rate limit
      await new Promise(function(r) { setTimeout(r, 1500); });
    }
  } catch(err) {
    console.error('[Firma Cron] Error:', err.message);
  }
}
