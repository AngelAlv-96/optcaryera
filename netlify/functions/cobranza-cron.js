// Cobranza de apartados — recordatorio amable para abonar/completar EN LÍNEA.
// Cron diario (~11am CST). Recordatorios escalonados por apartado: día 15 / 30 / 45 (máx 3).
// - Mensaje SIN saldo y SIN plazos (decisión de Angel): solo "tu apartado sigue, abona/completa en línea".
// - Cada mensaje lleva el link PERSONAL del portal (tarjeta, se registra a su folio) + opción transferencia.
// - Se DETIENE en cuanto liquida (saldo=0 → sale del query) o si abonó en los últimos 7 días.
// - Los apartados YA vencidos (>45 días al primer contacto) reciben UNA sola vez (catch-up), no la cadencia.
// - Reglas blast: MAX 10/run, 1.5s entre envíos, re-check por folio antes de enviar (fail-closed),
//   dedup por tag [Cobranza-Apartado:FOLIO], excluye empleados + no-locales, guard 10am-7pm CST.
// Manual/dry: GET /.netlify/functions/cobranza-cron?dry=1   (envía de verdad si se llama sin dry en horario)
//
// ⚠️ Plantilla cobranza_apartado (HX5c81c04ddc429cc77112e532610aa1db) — vars 1=nombre, 2=folio, 3=link portal.
//    Mientras Meta no la apruebe, los envíos fuera de la ventana 24h fallarán (se reintentan en la próxima corrida).

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_WA = process.env.TWILIO_WA_NUMBER;

const MAX_PER_RUN = 10;
const RATE_LIMIT_MS = 1500;
const TEMPLATE_SID = "HX5c81c04ddc429cc77112e532610aa1db"; // cobranza_apartado (1=nombre, 2=folio, 3=link)
const STAGES_DAYS = [15, 30, 45];   // recordatorios en estos días desde el apartado
const SPACING_DAYS = 7;             // mínimo entre recordatorios al mismo folio
const PORTAL_BASE = "https://caryera.mx/portal.html?t=";
const TAG_PREFIX = "Cobranza-Apartado";

async function supaREST(method, path, body) {
  const opts = { method, headers: { "apikey": SUPABASE_KEY, "Authorization": "Bearer " + SUPABASE_KEY, "Content-Type": "application/json", "Prefer": "return=representation" } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(SUPABASE_URL + "/rest/v1/" + path, opts);
  if (!res.ok) { const txt = await res.text(); throw new Error("Supabase " + method + " " + path + ": " + res.status + " " + txt); }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

function normalizePhone(phone) {
  let num = String(phone || "").replace(/[\s\-()+]/g, "");
  if (num.length === 10) num = "521" + num;
  if (num.length === 12 && num.startsWith("52") && num[2] !== "1") num = "521" + num.slice(2);
  return num;
}
function last10(phone) { return String(phone || "").replace(/\D/g, "").slice(-10); }

function firstName(name) {
  var n = String(name || "").trim();
  if (!n) return "qué tal";
  var w = n.split(/\s+/)[0].slice(0, 20);
  if (!/[a-zá-úñ]/i.test(w)) return "qué tal";
  return w;
}

async function sendTemplate(to, vars) {
  if (!TWILIO_SID || !TWILIO_TOKEN || !TWILIO_WA) return { ok: false, err: "missing_config" };
  const toNum = normalizePhone(to);
  const auth = Buffer.from(TWILIO_SID + ":" + TWILIO_TOKEN).toString("base64");
  const fromNum = TWILIO_WA.startsWith("whatsapp:") ? TWILIO_WA : "whatsapp:" + TWILIO_WA;
  const params = new URLSearchParams();
  params.append("From", fromNum);
  params.append("To", "whatsapp:+" + toNum);
  params.append("ContentSid", TEMPLATE_SID);
  params.append("ContentVariables", JSON.stringify(vars));
  try {
    const res = await fetch("https://api.twilio.com/2010-04-01/Accounts/" + TWILIO_SID + "/Messages.json", { method: "POST", headers: { "Authorization": "Basic " + auth, "Content-Type": "application/x-www-form-urlencoded" }, body: params.toString() });
    const data = await res.json();
    if (data.error_code) { console.error("[COBRANZA] WA error " + data.error_code + ": " + data.message); return { ok: false, err: data.error_code + ":" + data.message }; }
    return { ok: true };
  } catch (e) { console.error("[COBRANZA] WA exception:", e.message); return { ok: false, err: e.message }; }
}

async function saveHistory(phone, content) {
  try { await supaREST("POST", "clari_conversations", { phone: normalizePhone(phone), role: "assistant", content, user_name: "cobranza-apartado" }); }
  catch (e) { console.error("[COBRANZA] save history:", e.message); }
}

exports.handler = async function(event) {
  const qs = (event && event.queryStringParameters) || {};
  const dryRun = qs.dry === "1";

  const nowCH = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Chihuahua" }));
  const hora = nowCH.getHours();
  if (!dryRun && (hora < 10 || hora >= 19)) {
    return { statusCode: 200, body: JSON.stringify({ ok: true, enviados: 0, mensaje: "Fuera de horario (10am-7pm CST)" }) };
  }

  try {
    const now = new Date();
    const MS_DAY = 86400000;

    // 1) Apartados vivos con saldo y portal
    const ventas = await supaREST("GET",
      "ventas?estado=eq.Apartado&saldo=gt.0&token_portal=not.is.null&select=folio,total,pagado,saldo,token_portal,created_at,id,pacientes(nombre,apellidos,telefono)&order=created_at.asc&limit=500");
    const apartados = (ventas || []).filter(v => v.pacientes && v.pacientes.telefono);

    // 2) Empleados (excluir) — app_config.empleados_telefono está keyeado POR TELÉFONO (keys = números)
    const empleadoSet = new Set();
    try {
      const cfg = await supaREST("GET", "app_config?id=eq.empleados_telefono&select=value");
      if (cfg && cfg[0] && cfg[0].value) {
        const obj = typeof cfg[0].value === "string" ? JSON.parse(cfg[0].value) : cfg[0].value;
        Object.keys(obj || {}).forEach(k => { const l = last10(k); if (l.length === 10) empleadoSet.add(l); });
      }
    } catch (e) { console.warn("[COBRANZA] empleados:", e.message); }

    const candidatos = [];
    const pushedPhones = new Set(); // 1 recordatorio por PERSONA por corrida (aunque tenga varios apartados)
    const skips = { sin_tel: 0, empleado: 0, no_local: 0, muy_nuevo: 0, ya_completo: 0, espaciado: 0, pago_reciente: 0, vencido_ya_1: 0, mismo_cliente: 0, espaciado_fono: 0 };

    for (const v of apartados) {
      const tel10 = last10(v.pacientes.telefono);
      if (tel10.length !== 10) { skips.sin_tel++; continue; }
      if (empleadoSet.has(tel10)) { skips.empleado++; continue; }
      // No-local: LADA de Juárez 656/657 se aceptan; otras LADAs MX NO se descartan solo por eso (regla #13).
      // Solo descartamos claramente no-MX (El Paso 915) por si quedó registrado.
      if (tel10.startsWith("915")) { skips.no_local++; continue; }

      const ageDays = Math.floor((now - new Date(v.created_at)) / MS_DAY);
      const dueStage = ageDays >= STAGES_DAYS[2] ? 3 : ageDays >= STAGES_DAYS[1] ? 2 : ageDays >= STAGES_DAYS[0] ? 1 : 0;
      if (dueStage === 0) { skips.muy_nuevo++; continue; }

      const phone = normalizePhone(v.pacientes.telefono);
      const folio = v.folio;

      // 1 recordatorio por persona por corrida: si ya empujamos a este teléfono, saltar (tiene otro apartado)
      if (pushedPhones.has(phone)) { skips.mismo_cliente++; continue; }

      // Recordatorios previos de cobranza a este TELÉFONO (cualquier folio) — para dedup por folio y espaciado por persona
      let nSent = 0, lastSentFolio = null, lastSentFono = null;
      try {
        const prev = await supaREST("GET",
          "clari_conversations?phone=eq." + phone + "&content=ilike.*" + TAG_PREFIX + ":*&select=content,created_at&order=created_at.desc&limit=20");
        if (prev && prev.length) {
          lastSentFono = new Date(prev[0].created_at);
          const forFolio = prev.filter(function (m) { return (m.content || "").indexOf(TAG_PREFIX + ":" + folio + "]") !== -1; });
          nSent = forFolio.length;
          if (forFolio[0]) lastSentFolio = new Date(forFolio[0].created_at);
        }
      } catch (e) { console.warn("[COBRANZA] prev " + folio + ", salto:", e.message); continue; } // fail-closed

      // Espaciado por PERSONA: no mandar a un mismo teléfono más de 1 vez cada 7 días (aunque tenga varios apartados)
      if (lastSentFono && (now - lastSentFono) < SPACING_DAYS * MS_DAY) { skips.espaciado_fono++; continue; }
      if (nSent >= 3) { skips.ya_completo++; continue; }
      if (lastSentFolio && (now - lastSentFolio) < SPACING_DAYS * MS_DAY) { skips.espaciado++; continue; }
      // Apartado ya vencido (>45d): solo UNA vez (catch-up), no entra a la cadencia repetida.
      if (ageDays > STAGES_DAYS[2] && nSent >= 1) { skips.vencido_ya_1++; continue; }
      if (dueStage <= nSent) { skips.espaciado++; continue; }

      // ¿Abonó en los últimos 7 días? No molestar a quien ya está pagando.
      try {
        const cut7 = new Date(now - SPACING_DAYS * MS_DAY).toISOString();
        const pagos = await supaREST("GET", "venta_pagos?venta_id=eq." + v.id + "&created_at=gte." + cut7 + "&select=id&limit=1");
        if (pagos && pagos.length > 0) { skips.pago_reciente++; continue; }
      } catch (e) { /* si falla el check, seguimos (el recordatorio es benigno) */ }

      candidatos.push({ phone, folio, nombre: (v.pacientes.nombre || ""), token: v.token_portal, stage: dueStage, ageDays });
      pushedPhones.add(phone);
    }

    const limited = candidatos.slice(0, MAX_PER_RUN);

    if (dryRun) {
      return { statusCode: 200, body: JSON.stringify({ ok: true, dryRun: true, apartados: apartados.length, elegibles: candidatos.length, enviarEstaVez: limited.length, restantes: candidatos.length - limited.length, skips, muestra: limited.map(c => ({ folio: c.folio, tel: "..." + c.phone.slice(-4), etapa: c.stage, dias: c.ageDays })) }, null, 2) };
    }

    let enviados = 0, fallidos = 0; const errores = [];
    for (const c of limited) {
      // Re-check por folio justo antes de enviar (fail-closed)
      try {
        const rc = await supaREST("GET", "clari_conversations?phone=eq." + c.phone + "&content=ilike.*" + TAG_PREFIX + ":" + encodeURIComponent(c.folio) + "*&created_at=gte." + new Date(now - SPACING_DAYS * MS_DAY).toISOString() + "&select=id&limit=1");
        if (rc && rc.length > 0) { continue; }
      } catch (e) { console.warn("[COBRANZA] recheck " + c.folio + ", salto:", e.message); continue; }

      const portalUrl = PORTAL_BASE + c.token;
      const r = await sendTemplate(c.phone, { "1": firstName(c.nombre), "2": String(c.folio), "3": portalUrl });
      if (r.ok) { await saveHistory(c.phone, "[" + TAG_PREFIX + ":" + c.folio + "] Recordatorio de abono (etapa " + c.stage + ", " + c.ageDays + "d) enviado"); enviados++; }
      else { fallidos++; errores.push({ folio: c.folio, err: r.err }); }
      await new Promise(res => setTimeout(res, RATE_LIMIT_MS));
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true, enviados, fallidos, elegibles: candidatos.length, restantes: candidatos.length - limited.length, skips, errores: errores.slice(0, 10) }) };
  } catch (err) {
    console.error("[COBRANZA] Fatal:", err.message);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
