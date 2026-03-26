// Audit Cron — Automated inventory audit for pending/delivered orders
// Detects: delivered without payment, skipped QC review, orders waiting too long
// Sends WA summary to admin_phones
// Schedule: ~every 5 days (days 1,6,11,16,21,26 of each month) at 11am CST

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_WA = process.env.TWILIO_WA_NUMBER;

const ADMIN_PHONES_DEFAULT = ['5216564269961'];
const DIAS_LOOKBACK = 10;
const DIAS_ESPERA_ALERTA = 3;

async function supaREST(method, path, body) {
  const opts = {
    method,
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    }
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, opts);
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Supabase ${method} ${path}: ${res.status} ${txt}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

function normalizePhone(phone) {
  let num = phone.replace(/[\s\-\(\)\+]/g, '');
  if (num.length === 10) num = '521' + num;
  if (num.length === 12 && num.startsWith('52') && num[2] !== '1') num = '521' + num.slice(2);
  return num;
}

async function sendWA(to, message) {
  if (!TWILIO_SID || !TWILIO_TOKEN || !TWILIO_WA) return false;
  const toNum = normalizePhone(to);
  const auth = Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString('base64');
  const params = new URLSearchParams();
  const fromNum = TWILIO_WA.startsWith('whatsapp:') ? TWILIO_WA : `whatsapp:${TWILIO_WA}`;
  params.append('From', fromNum);
  params.append('To', `whatsapp:+${toNum}`);
  params.append('Body', message);
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
      method: 'POST',
      headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });
    const data = await res.json();
    if (data.error_code) {
      console.error(`[AUDIT-CRON] WA error ${data.error_code}: ${data.message}`);
      return false;
    }
    return true;
  } catch (e) {
    console.error('[AUDIT-CRON] WA exception:', e.message);
    return false;
  }
}

async function getAdminPhones() {
  try {
    const cfg = await supaREST('GET', "app_config?id=eq.whatsapp_config&select=value");
    if (cfg && cfg[0]) {
      const parsed = JSON.parse(cfg[0].value);
      return parsed.admin_phones || ADMIN_PHONES_DEFAULT;
    }
  } catch (e) { /* fallback */ }
  return ADMIN_PHONES_DEFAULT;
}

function extractFolio(notas) {
  if (!notas) return null;
  const m = notas.match(/Folio:\s*(\S+)/);
  return m ? m[1] : null;
}

function checkQCSkipped(notas) {
  // Parse LOG entries to check if QC review was skipped
  // Normal flow: ... → Recibido en óptica → Listo para entrega → Entregado
  // Skipped QC: ... → Recibido en óptica → Entregado (without Listo para entrega)
  if (!notas) return false;
  const logs = notas.split('| LOG:').slice(1); // skip first segment (folio info)
  if (!logs.length) return false;

  let sawRecibidoOptica = false;
  let sawListoEntrega = false;
  let sawEntregado = false;

  for (const log of logs) {
    if (log.includes('→ Recibido en óptica') || log.includes('Recibido en óptica →')) {
      sawRecibidoOptica = true;
    }
    if (log.includes('→ Listo para entrega') || log.includes('Listo para entrega →')) {
      sawListoEntrega = true;
    }
    if (log.includes('→ Entregado')) {
      sawEntregado = true;
    }
  }

  // Skipped if went from Recibido en óptica to Entregado without Listo para entrega
  return sawRecibidoOptica && sawEntregado && !sawListoEntrega;
}

exports.handler = async function(event) {
  const isDry = event.queryStringParameters?.dry === '1';
  console.log(`[AUDIT-CRON] Iniciando auditoría de pedidos${isDry ? ' (DRY RUN)' : ''}...`);

  try {
    // ⏰ Guard de horario: solo entre 10am-8pm hora Chihuahua
    const nowCH = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chihuahua' }));
    const hora = nowCH.getHours();
    if (hora < 10 || hora >= 20) {
      console.log(`[AUDIT-CRON] ⏰ Fuera de horario (${hora}:${String(nowCH.getMinutes()).padStart(2,'0')} Chihuahua).`);
      return { statusCode: 200, body: JSON.stringify({ ok: true, mensaje: 'Fuera de horario' }) };
    }

    const now = new Date();
    const lookbackDate = new Date(now.getTime() - DIAS_LOOKBACK * 24 * 60 * 60 * 1000).toISOString();
    const alertDate = new Date(now.getTime() - DIAS_ESPERA_ALERTA * 24 * 60 * 60 * 1000).toISOString();

    // ── 1. Entregados sin cobrar ──
    const entregados = await supaREST('GET',
      `ordenes_laboratorio?estado_lab=eq.Entregado&updated_at=gte.${lookbackDate}&select=id,notas_laboratorio,sucursal,paciente_id,updated_at&limit=200`
    );

    const entregadosSinCobrar = [];
    const sinRevisionQC = [];

    if (entregados && entregados.length) {
      // Extract unique folios
      const folioMap = {}; // folio → order info
      for (const ord of entregados) {
        const folio = extractFolio(ord.notas_laboratorio);
        if (!folio) continue;
        // Use base folio (remove -2, -3 suffix)
        const baseFolio = folio.replace(/-\d+$/, '');
        if (!folioMap[baseFolio]) {
          folioMap[baseFolio] = ord;
        }

        // ── 2. Check QC skip ──
        if (checkQCSkipped(ord.notas_laboratorio)) {
          sinRevisionQC.push({
            folio,
            sucursal: ord.sucursal,
            paciente_id: ord.paciente_id,
            fecha_entrega: ord.updated_at?.slice(0, 10)
          });
        }
      }

      // Lookup ventas by folio for saldo check
      const baseFolios = Object.keys(folioMap);
      for (let i = 0; i < baseFolios.length; i += 20) {
        const batch = baseFolios.slice(i, i + 20);
        // Build OR filter for folios
        const folioFilter = batch.map(f => `folio.eq.${f}`).join(',');
        try {
          const ventas = await supaREST('GET',
            `ventas?or=(${folioFilter})&select=folio,saldo,total,pagado,sucursal,pacientes(nombre,apellidos)&limit=50`
          );
          if (ventas) {
            for (const v of ventas) {
              if (v.saldo && Number(v.saldo) > 0) {
                entregadosSinCobrar.push({
                  folio: v.folio,
                  paciente: `${v.pacientes?.nombre || ''} ${v.pacientes?.apellidos || ''}`.trim(),
                  saldo: Number(v.saldo),
                  sucursal: v.sucursal,
                  fecha_entrega: folioMap[v.folio]?.updated_at?.slice(0, 10)
                });
              }
            }
          }
        } catch (e) {
          console.warn('[AUDIT-CRON] Ventas lookup error:', e.message);
        }
      }
    }

    // Enrich sinRevisionQC with patient names
    const pacIds = [...new Set(sinRevisionQC.filter(a => a.paciente_id).map(a => a.paciente_id))];
    const pacMap = {};
    if (pacIds.length) {
      for (let i = 0; i < pacIds.length; i += 20) {
        const batch = pacIds.slice(i, i + 20);
        try {
          const pacs = await supaREST('GET',
            `pacientes?id=in.(${batch.join(',')})&select=id,nombre,apellidos`
          );
          if (pacs) pacs.forEach(p => { pacMap[p.id] = `${p.nombre || ''} ${p.apellidos || ''}`.trim(); });
        } catch (e) { /* ignore */ }
      }
    }
    sinRevisionQC.forEach(a => { a.paciente = pacMap[a.paciente_id] || 'Desconocido'; });

    // ── 3. Esperando mucho tiempo ──
    const esperando = await supaREST('GET',
      `ordenes_laboratorio?estado_lab=in.(Recibido en óptica,Listo para entrega)&updated_at=lte.${alertDate}&select=id,notas_laboratorio,sucursal,paciente_id,estado_lab,updated_at&limit=100`
    );

    const esperandoMucho = [];
    if (esperando && esperando.length) {
      for (const ord of esperando) {
        const folio = extractFolio(ord.notas_laboratorio);
        const dias = Math.floor((now.getTime() - new Date(ord.updated_at).getTime()) / (24 * 60 * 60 * 1000));
        esperandoMucho.push({
          folio: folio || '?',
          sucursal: ord.sucursal,
          paciente_id: ord.paciente_id,
          estado_lab: ord.estado_lab,
          dias
        });
      }
      // Enrich with patient names
      const espPacIds = [...new Set(esperandoMucho.filter(a => a.paciente_id).map(a => a.paciente_id))];
      for (let i = 0; i < espPacIds.length; i += 20) {
        const batch = espPacIds.slice(i, i + 20);
        try {
          const pacs = await supaREST('GET',
            `pacientes?id=in.(${batch.join(',')})&select=id,nombre,apellidos`
          );
          if (pacs) pacs.forEach(p => { pacMap[p.id] = `${p.nombre || ''} ${p.apellidos || ''}`.trim(); });
        } catch (e) { /* ignore */ }
      }
      esperandoMucho.forEach(a => { a.paciente = pacMap[a.paciente_id] || 'Desconocido'; });
    }

    // ── 4. Check last physical count dates ──
    let ultimoConteo = {};
    try {
      const cfg = await supaREST('GET', "app_config?id=eq.inventario_ultimo_conteo&select=value");
      if (cfg && cfg[0]) ultimoConteo = JSON.parse(cfg[0].value);
    } catch (e) { /* ignore */ }

    const conteoVencido = [];
    for (const suc of ['Américas', 'Pinocelli', 'Magnolia']) {
      const last = ultimoConteo[suc];
      if (!last) {
        conteoVencido.push({ sucursal: suc, dias: 'nunca' });
      } else {
        const dias = Math.floor((now.getTime() - new Date(last).getTime()) / (24 * 60 * 60 * 1000));
        if (dias > 10) {
          conteoVencido.push({ sucursal: suc, dias });
        }
      }
    }

    // ── Save audit record ──
    const datos = {
      entregados_sin_cobrar: entregadosSinCobrar,
      sin_revision_qc: sinRevisionQC,
      esperando_mucho: esperandoMucho,
      conteo_vencido: conteoVencido
    };

    const totalAnomalias = entregadosSinCobrar.length + sinRevisionQC.length;
    console.log(`[AUDIT-CRON] Resultados: ${entregadosSinCobrar.length} sin cobrar, ${sinRevisionQC.length} sin QC, ${esperandoMucho.length} esperando, ${conteoVencido.length} conteos vencidos`);

    if (!isDry) {
      try {
        await supaREST('POST', 'inventario_auditorias', {
          sucursal: 'Todas',
          tipo: 'auditoria_automatica',
          realizado_por: 'CRON',
          datos
        });
      } catch (e) {
        console.error('[AUDIT-CRON] Error guardando auditoría:', e.message);
      }
    }

    // ── Build WA message ──
    if (totalAnomalias > 0 || esperandoMucho.length > 0 || conteoVencido.length > 0) {
      const fechaStr = nowCH.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
      let msg = `📊 AUDITORÍA PEDIDOS — ${fechaStr}\n`;

      if (entregadosSinCobrar.length) {
        msg += `\n⚠️ ENTREGADOS SIN COBRAR: ${entregadosSinCobrar.length}\n`;
        entregadosSinCobrar.slice(0, 5).forEach(a => {
          msg += `• ${a.folio} - ${a.paciente} - Saldo: $${a.saldo.toLocaleString('es-MX')} (${a.sucursal})\n`;
        });
        if (entregadosSinCobrar.length > 5) msg += `  ...y ${entregadosSinCobrar.length - 5} más\n`;
      }

      if (sinRevisionQC.length) {
        msg += `\n🔍 SIN REVISIÓN QC: ${sinRevisionQC.length}\n`;
        sinRevisionQC.slice(0, 5).forEach(a => {
          msg += `• ${a.folio} - ${a.paciente} (${a.sucursal})\n`;
        });
        if (sinRevisionQC.length > 5) msg += `  ...y ${sinRevisionQC.length - 5} más\n`;
      }

      if (esperandoMucho.length) {
        msg += `\n⏰ ESPERANDO >${DIAS_ESPERA_ALERTA} DÍAS: ${esperandoMucho.length}\n`;
        esperandoMucho.slice(0, 5).forEach(a => {
          msg += `• ${a.folio} - ${a.paciente} - ${a.dias}d en "${a.estado_lab}" (${a.sucursal})\n`;
        });
        if (esperandoMucho.length > 5) msg += `  ...y ${esperandoMucho.length - 5} más\n`;
      }

      if (conteoVencido.length) {
        msg += `\n📦 CONTEO FÍSICO PENDIENTE:\n`;
        conteoVencido.forEach(c => {
          msg += `• ${c.sucursal}: ${c.dias === 'nunca' ? 'nunca realizado' : `hace ${c.dias} días`}\n`;
        });
      }

      if (isDry) {
        console.log('[AUDIT-CRON] DRY RUN — Mensaje WA:\n' + msg);
      } else {
        const adminPhones = await getAdminPhones();
        for (const phone of adminPhones) {
          await sendWA(phone, msg);
          await new Promise(r => setTimeout(r, 1000));
        }
      }
    } else {
      console.log('[AUDIT-CRON] ✅ Sin anomalías detectadas');
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        dry: isDry,
        entregados_sin_cobrar: entregadosSinCobrar.length,
        sin_revision_qc: sinRevisionQC.length,
        esperando_mucho: esperandoMucho.length,
        conteo_vencido: conteoVencido.length
      })
    };
  } catch (e) {
    console.error('[AUDIT-CRON] Error fatal:', e.message);
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
