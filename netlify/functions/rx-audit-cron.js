// Vigilante de graduaciones — corre en segundo plano cada 10 min y avisa por WhatsApp
// cuando una orden de laboratorio recién capturada no cuadra con los exámenes del paciente.
//
// POR QUÉ EXISTE (caso folio 16202, ago-2026): en el mostrador buscaron "Gómez", crearon un
// paciente nuevo ("mayela gomez", 0 exámenes) y le colgaron el tercer par de un 3x1. Los
// lentes se fabricaron con una graduación que no era de esa persona y nadie lo vio hasta que
// la clienta reclamó. Al medir 60 días hacia atrás aparecieron 11 casos más del mismo tipo,
// incluidos DOS con el signo invertido (+5.25 en vez de -5.25) ya ENTREGADOS y sin garantía.
//
// POR QUÉ ES UN VIGILANTE Y NO UNA ALERTA EN LA PANTALLA DE CAPTURA:
//   1. La graduación se teclea DESPUÉS de la venta, en la orden de lab — al vender aún no existe.
//   2. Un candado en pantalla se atraviesa: el personal confirma para poder seguir trabajando
//      (lección v570, el aviso de órdenes duplicadas). Un reporte al dueño no se puede saltar.
//   3. El navegador de una sucursal puede traer caché vieja; el cron corre en el servidor.
//
// POR QUÉ SOLO 3 SEÑALES: se midieron contra 1,108 órdenes reales (60 días). Se dejaron fuera
// las que difieren en 2+ campos (0.42/día) porque casi siempre son ajustes legítimos del
// optometrista o recetas traídas de fuera — una alarma que suena de más se ignora en una semana.
// Las 3 que quedan suman ~0.6 avisos al día.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_WA = process.env.TWILIO_WA_NUMBER;

const ADMIN_PHONES_DEFAULT = ['5216564269961'];
const STATE_ID = 'rx_audit_state';
const HORAS_VENTANA = 24;      // órdenes recientes que se revisan en cada corrida
const MAX_AVISOS_RUN = 6;      // tope de seguridad: si algo se descompone, no inunda el WhatsApp
const MEMORIA = 400;           // ids ya revisados que se recuerdan (evita repetir el aviso)

// ─────────────────────────── infra ───────────────────────────
async function supaREST(method, path, body) {
  const opts = {
    method,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    }
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, opts);
  if (!res.ok) throw new Error(`Supabase ${method} ${path}: ${res.status} ${await res.text()}`);
  const t = await res.text();
  return t ? JSON.parse(t) : null;
}

function normalizePhone(phone) {
  let num = String(phone).replace(/[\s\-()+]/g, '');
  if (num.length === 10) num = '521' + num;
  if (num.length === 12 && num.startsWith('52') && num[2] !== '1') num = '521' + num.slice(2);
  return num;
}

// ⚠️ Twilio responde 201 "queued" y la falla 63016 llega DESPUÉS, así que mirar la respuesta
// del POST nunca detecta que el aviso se perdió (lección v400/v566). Se decide ANTES.
const _winCache = {};
async function waWindowOpen(phone) {
  if (!TWILIO_SID || !TWILIO_TOKEN) return true;
  const num = normalizePhone(phone);
  if (_winCache[num] !== undefined) return _winCache[num];
  let open = false;
  try {
    const auth = Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString('base64');
    const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json?From=${encodeURIComponent('whatsapp:+' + num)}&PageSize=1`;
    const res = await fetch(url, { headers: { Authorization: `Basic ${auth}` } });
    if (res.ok) {
      const m = ((await res.json()).messages || [])[0];
      if (m && m.date_created) open = (Date.now() - new Date(m.date_created).getTime()) < 23.5 * 3600 * 1000;
    }
  } catch (e) { console.warn('[RX-AUDIT] waWindow:', e.message); }
  _winCache[num] = open;
  return open;
}

async function sendWA(to, body, tplDetalle) {
  if (!TWILIO_SID || !TWILIO_TOKEN || !TWILIO_WA) return false;
  const auth = Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString('base64');
  const from = TWILIO_WA.startsWith('whatsapp:') ? TWILIO_WA : `whatsapp:${TWILIO_WA}`;
  const p = new URLSearchParams();
  p.append('From', from);
  p.append('To', `whatsapp:+${normalizePhone(to)}`);
  if (tplDetalle) {
    p.append('ContentSid', 'HXa076da6bd95ae70ece9545df84036f56');   // aviso_panel_admin (aprobada)
    // ⚠️ Las variables de plantilla NO admiten saltos de línea.
    p.append('ContentVariables', JSON.stringify({ 1: tplDetalle.replace(/\*/g, '').replace(/\s*\n+\s*/g, ' · ').replace(/\s+/g, ' ').trim().slice(0, 600) }));
  } else {
    p.append('Body', body);
  }
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: p.toString()
    });
    const d = await res.json();
    if (d.error_code) { console.error('[RX-AUDIT] WA ' + d.error_code + ': ' + d.message); return false; }
    return true;
  } catch (e) { console.error('[RX-AUDIT] WA:', e.message); return false; }
}

async function notifyAdmin(phone, texto, resumen) {
  if (await waWindowOpen(phone)) return sendWA(phone, texto, null);
  return sendWA(phone, null, resumen || texto);
}

// ─────────────────── comparación de graduaciones ───────────────────
// Los campos son TEXTO libre: "-0.75", "-.75", "+3.00", "PL", "plano", "", " -1,25 ".
function num(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim().replace(/\s/g, '');
  if (!s) return null;
  if (/^(pl|plano|lp|neutro|sc)$/i.test(s)) return 0;
  const n = parseFloat(s.replace(',', '.'));
  return isNaN(n) ? null : n;
}
// El eje solo significa algo si hay cilindro. Y 180° y 0° son el MISMO meridiano.
function eje(v, cil) {
  const c = num(cil);
  if (c === null || c === 0) return null;
  const e = num(v);
  if (e === null) return null;
  return ((e % 180) + 180) % 180;
}
function rx(o, p) {
  p = p || '';
  return {
    oe: num(o[p + 'od_esfera']), oc: num(o[p + 'od_cilindro']), ox: eje(o[p + 'od_eje'], o[p + 'od_cilindro']),
    ie: num(o[p + 'oi_esfera']), ic: num(o[p + 'oi_cilindro']), ix: eje(o[p + 'oi_eje'], o[p + 'oi_cilindro'])
  };
}
// Sin potencia en ningún ojo = lente plano/solar sin graduar: no hay nada que verificar.
const sinPotencia = (r) => [r.oe, r.oc, r.ie, r.ic].every(v => v === null || v === 0);

function difs(a, b) {
  const out = [];
  [['oe', 'OD esfera'], ['oc', 'OD cilindro'], ['ie', 'OI esfera'], ['ic', 'OI cilindro']].forEach(([k, n]) => {
    const x = a[k], y = b[k];
    if (x === null && y === null) return;
    if (x === null || y === null || Math.abs(x - y) > 0.001) out.push({ campo: n, orden: x, examen: y });
  });
  // Eje ausente en uno de los dos lados no se cuenta como diferencia (no se capturó).
  [['ox', 'OD eje'], ['ix', 'OI eje']].forEach(([k, n]) => {
    const x = a[k], y = b[k];
    if (x === null || y === null) return;
    if (Math.abs(x - y) > 0.001) out.push({ campo: n, orden: x, examen: y });
  });
  return out;
}

// La historia clínica guarda hasta 4 juegos de graduación (la del día, la anterior, y dos de
// otras pruebas). Cualquiera de las cuatro es una explicación válida de lo que se fabricó.
const SECS = ['', 'rx_ant_', 'ocu_', 'ocu2_'];
const RXCOLS = SECS.map(p => ['od_esfera', 'od_cilindro', 'od_eje', 'oi_esfera', 'oi_cilindro', 'oi_eje'].map(c => p + c).join(',')).join(',');

const fmtOjo = (e, c, x) => [e === null ? '—' : e, c === null || c === 0 ? '' : c, x === null ? '' : 'x' + x].filter(v => v !== '').join(' ');
const fmtRx = (r) => 'OD ' + fmtOjo(r.oe, r.oc, r.ox) + ' | OI ' + fmtOjo(r.ie, r.ic, r.ix);

// ─────────────────────────── handler ───────────────────────────
exports.handler = async function (event) {
  const qs = (event && event.queryStringParameters) || {};
  const dry = qs.dry === '1';
  const horas = Math.min(parseInt(qs.horas, 10) || HORAS_VENTANA, 24 * 30);

  // Horario: el laboratorio no captura de madrugada y el aviso a esa hora no sirve de nada.
  const hora = parseInt(new Date().toLocaleString('en-US', { timeZone: 'America/Chihuahua', hour: '2-digit', hour12: false }), 10);
  if (!dry && (hora < 9 || hora >= 21)) return { statusCode: 200, body: JSON.stringify({ skip: 'fuera de horario', hora }) };

  try {
    // Estado: qué órdenes ya se revisaron (para no repetir el mismo aviso cada 10 minutos)
    let vistos = [];
    try {
      const st = await supaREST('GET', `app_config?id=eq.${STATE_ID}&select=value`);
      if (st && st[0]) vistos = JSON.parse(typeof st[0].value === 'string' ? st[0].value : JSON.stringify(st[0].value)).vistos || [];
    } catch (e) { console.warn('[RX-AUDIT] estado nuevo'); }
    const yaVisto = new Set(vistos);

    const desde = new Date(Date.now() - horas * 3600 * 1000).toISOString();
    const ordenes = await supaREST('GET',
      'ordenes_laboratorio?created_at=gte.' + desde +
      '&select=id,folio,created_at,paciente_id,sucursal,estado_lab,tipo_lente,od_esfera,od_cilindro,od_eje,oi_esfera,oi_cilindro,oi_eje,pacientes(nombre,apellidos)' +
      '&order=created_at.asc&limit=300') || [];

    const nuevas = ordenes.filter(o => !yaVisto.has(o.id));
    if (!nuevas.length) return { statusCode: 200, body: JSON.stringify({ revisadas: 0, ventana_h: horas }) };

    // Exámenes: los del paciente (toda su historia) + los de cualquiera en la ventana,
    // que es como se detecta "esta graduación es de otra persona".
    const pids = [...new Set(nuevas.map(o => o.paciente_id).filter(Boolean))];
    let mios = [];
    if (pids.length) {
      mios = await supaREST('GET', 'historias_clinicas?paciente_id=in.(' + pids.join(',') + ')&select=paciente_id,created_at,' + RXCOLS + '&limit=2000') || [];
    }
    const desdeVecinos = new Date(Date.now() - (horas + 72) * 3600 * 1000).toISOString();
    const vecinos = await supaREST('GET',
      'historias_clinicas?created_at=gte.' + desdeVecinos +
      '&select=paciente_id,created_at,sucursal,' + RXCOLS + ',pacientes(nombre,apellidos)&limit=1000') || [];

    const porPx = {};
    mios.forEach(h => { (porPx[h.paciente_id] = porPx[h.paciente_id] || []).push(h); });
    const nom = (p) => p ? [p.nombre, p.apellidos].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim() : 'sin paciente';

    const hallazgos = [];
    for (const o of nuevas) {
      const r = rx(o);
      if (sinPotencia(r)) continue;                       // solar/plano: nada que comparar
      const hist = porPx[o.paciente_id] || [];
      const px = nom(o.pacientes);

      // ── SEÑAL 1: le vamos a fabricar lentes graduados a alguien que nunca se ha examinado ──
      if (!hist.length) {
        hallazgos.push({ id: o.id, tipo: 'SIN_EXAMEN', prio: 1, o, px,
          txt: '🚨 *' + o.folio + '* — ' + px + '\n' + (o.sucursal || '') +
               '\nSe está fabricando con graduación, pero este paciente *no tiene ningún examen* registrado.' +
               '\nRx de la orden: ' + fmtRx(r) +
               '\n👉 Casi siempre es que eligieron/crearon al paciente equivocado en el mostrador.' });
        continue;
      }

      // ¿Coincide con alguno de sus propios exámenes? Entonces está bien y no se toca.
      const propio = hist.some(h => SECS.some(p => { const c = rx(h, p); return !sinPotencia(c) && difs(r, c).length === 0; }));
      if (propio) continue;

      // ── SEÑAL 2: la graduación es EXACTAMENTE la de otra persona examinada esos días ──
      const t = new Date(o.created_at).getTime();
      let otro = null;
      for (const h of vecinos) {
        if (h.paciente_id === o.paciente_id) continue;
        if (Math.abs(new Date(h.created_at).getTime() - t) / 86400000 > 3) continue;
        if (SECS.some(p => { const c = rx(h, p); return !sinPotencia(c) && difs(r, c).length === 0; })) { otro = h; break; }
      }
      if (otro) {
        hallazgos.push({ id: o.id, tipo: 'OTRA_PERSONA', prio: 0, o, px,
          txt: '🚨 *' + o.folio + '* — la graduación es de OTRA persona\n' + (o.sucursal || '') +
               '\nOrden a nombre de: *' + px + '*' +
               '\nPero esa Rx es el examen de: *' + nom(otro.pacientes) + '* (' + String(otro.created_at).slice(0, 10) + ')' +
               '\nRx: ' + fmtRx(r) +
               '\n👉 Revisar a quién le corresponde ese par ANTES de que salga del laboratorio.' });
        continue;
      }

      // ── SEÑAL 3: difiere de su propio examen en UN solo campo = error de dedo al capturar ──
      let mejor = null;
      hist.forEach(h => SECS.forEach(p => {
        const c = rx(h, p);
        if (sinPotencia(c)) return;
        const d = difs(r, c);
        if (!mejor || d.length < mejor.d.length) mejor = { h, d, c };
      }));
      if (mejor && mejor.d.length === 1) {
        const d = mejor.d[0];
        const signo = d.orden !== null && d.examen !== null && d.orden === -d.examen && d.orden !== 0;
        hallazgos.push({ id: o.id, tipo: signo ? 'SIGNO' : 'UN_CAMPO', prio: signo ? 0 : 2, o, px,
          txt: (signo ? '🚨 *' + o.folio + '* — SIGNO INVERTIDO' : '⚠️ *' + o.folio + '* — no cuadra con su examen') +
               '\n' + px + (o.sucursal ? ' · ' + o.sucursal : '') +
               '\n' + d.campo + ':  orden *' + d.orden + '*  ·  su examen dice *' + d.examen + '*' +
               '\nOrden:  ' + fmtRx(r) +
               '\nExamen: ' + fmtRx(mejor.c) +
               (signo ? '\n👉 Con el signo al revés el lente sale inservible. Detenerlo.' : '\n👉 Todo lo demás coincide, así que es de captura. Verificar cuál es el bueno.') });
      }
      // 2+ campos de diferencia se ignoran a propósito: son ajustes del optometrista o
      // recetas de fuera. Medido: 0.42/día — meterlos volvería inútil la alarma.
    }

    // Marcar TODAS como revisadas aunque no se alcance a avisar de todas: si algo produjera
    // muchos hallazgos, es preferible perder un aviso que repetir 100 cada 10 minutos.
    const nuevoEstado = { vistos: [...vistos, ...nuevas.map(o => o.id)].slice(-MEMORIA), ultimo: new Date().toISOString() };

    hallazgos.sort((a, b) => a.prio - b.prio);
    const enviar = hallazgos.slice(0, MAX_AVISOS_RUN);

    if (dry) {
      return { statusCode: 200, body: JSON.stringify({
        dry: true, revisadas: nuevas.length, ventana_h: horas, hallazgos: hallazgos.length,
        detalle: hallazgos.map(h => ({ folio: h.o.folio, px: h.px, tipo: h.tipo, estado: h.o.estado_lab, texto: h.txt }))
      }, null, 1) };
    }

    let enviados = 0;
    if (enviar.length) {
      let phones = ADMIN_PHONES_DEFAULT;
      try {
        const cfg = await supaREST('GET', 'app_config?id=eq.whatsapp_config&select=value');
        if (cfg && cfg[0]) phones = JSON.parse(cfg[0].value).auth_phones || ADMIN_PHONES_DEFAULT;
      } catch (e) { /* default */ }

      const cuerpo = '👓 *Revisión de graduaciones*\n' +
        (enviar.length === 1 ? 'Una orden nueva no cuadra:' : enviar.length + ' órdenes nuevas no cuadran:') +
        '\n\n' + enviar.map(h => h.txt).join('\n\n──────────\n\n');
      const resumen = enviar.map(h => h.o.folio + ' (' + h.px + '): ' + h.tipo.replace(/_/g, ' ').toLowerCase()).join(' · ');

      for (const p of phones) { if (await notifyAdmin(p, cuerpo, 'Revisión de graduaciones — ' + resumen)) enviados++; }
    }

    await supaREST('POST', 'app_config?on_conflict=id', { id: STATE_ID, value: JSON.stringify(nuevoEstado) })
      .catch(() => supaREST('PATCH', `app_config?id=eq.${STATE_ID}`, { value: JSON.stringify(nuevoEstado) }));

    console.log('[RX-AUDIT] revisadas=' + nuevas.length + ' hallazgos=' + hallazgos.length + ' avisos=' + enviados);
    return { statusCode: 200, body: JSON.stringify({ revisadas: nuevas.length, hallazgos: hallazgos.length, avisados: enviar.length, enviados }) };

  } catch (e) {
    console.error('[RX-AUDIT] error:', e.message);
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
