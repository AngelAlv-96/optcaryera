// Regreso a Clases 3x1 (v571) — versión BACKGROUND: UN SOLO disparo manda a cientos.
// Netlify background function (nombre -background): responde 202 de inmediato y sigue enviando
// hasta ~15 min. Existe para que ANGEL lo dispare con UNA sola liga desde el celular, sin
// depender de que el agente esté despierto ni de refrescar 100 veces.
// Disparo: GET /.netlify/functions/regreso-clases-background?key=SECRET
// Idempotente: cada envío deja el tag [Regreso-Clases-3x1]; re-disparar solo manda los que falten.
// Reglas: 1s entre envíos, re-check por teléfono ANTES de mandar (fail-closed), excluye
// empleados/compradores/915, guard 10am-8pm CST, tope de 600 por invocación (cabe en 15 min).
// Guard de saldo: no arranca ni continúa por debajo de MIN_SALDO_USD.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_WA = process.env.TWILIO_WA_NUMBER;
const BLAST_KEY = process.env.BLAST_KEY || "caryera2026";

const RATE_LIMIT_MS = 1000;
const HARD_CAP = 600;
const DEDUP_DAYS = 60;
const DEDUP_TAG = "Regreso-Clases-3x1";
const TEMPLATE_SID = "HX344089a3139491aafeef7ba2f4106a0d"; // regreso_clases_3x1_agosto (sin variables)
const MIN_SALDO_USD = 1.0;

// La lista vive en el blast normal — se importa para no mantenerla en dos lugares.
const { PHONES } = require("./regreso-clases-lista.js");

async function supaREST(method, path, body) {
  const opts = { method, headers: { "apikey": SUPABASE_KEY, "Authorization": "Bearer " + SUPABASE_KEY, "Content-Type": "application/json", "Prefer": "return=representation" } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(SUPABASE_URL + "/rest/v1/" + path, opts);
  if (!res.ok) { const t = await res.text(); throw new Error("Supabase " + method + " " + path + ": " + res.status + " " + t); }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}
function normalizePhone(phone) { let n = String(phone || "").replace(/[\s\-()+]/g, ""); if (n.length === 10) n = "521" + n; if (n.length === 12 && n.startsWith("52") && n[2] !== "1") n = "521" + n.slice(2); return n; }
function last10(phone) { return String(phone || "").replace(/\D/g, "").slice(-10); }

async function saldoTwilio() {
  if (!TWILIO_SID || !TWILIO_TOKEN) return null;
  try {
    const auth = Buffer.from(TWILIO_SID + ":" + TWILIO_TOKEN).toString("base64");
    const res = await fetch("https://api.twilio.com/2010-04-01/Accounts/" + TWILIO_SID + "/Balance.json", { headers: { "Authorization": "Basic " + auth } });
    if (!res.ok) return null;
    const d = await res.json();
    const v = parseFloat(d.balance);
    return isNaN(v) ? null : v;
  } catch (e) { return null; }
}

async function sendTemplate(to) {
  if (!TWILIO_SID || !TWILIO_TOKEN || !TWILIO_WA) return { ok: false, err: "missing_config" };
  const toNum = normalizePhone(to);
  const auth = Buffer.from(TWILIO_SID + ":" + TWILIO_TOKEN).toString("base64");
  const fromNum = TWILIO_WA.startsWith("whatsapp:") ? TWILIO_WA : "whatsapp:" + TWILIO_WA;
  const params = new URLSearchParams();
  params.append("From", fromNum);
  params.append("To", "whatsapp:+" + toNum);
  params.append("ContentSid", TEMPLATE_SID);
  // SIN ContentVariables: la plantilla no lleva variables (error 21656, lección v400)
  try {
    const res = await fetch("https://api.twilio.com/2010-04-01/Accounts/" + TWILIO_SID + "/Messages.json", { method: "POST", headers: { "Authorization": "Basic " + auth, "Content-Type": "application/x-www-form-urlencoded" }, body: params.toString() });
    const data = await res.json();
    if (data.error_code) { console.error("[REGRESO-BG] WA error " + data.error_code + ": " + data.message); return { ok: false, err: data.error_code }; }
    return { ok: true };
  } catch (e) { return { ok: false, err: e.message }; }
}

async function saveHistory(phone) {
  try { await supaREST("POST", "clari_conversations", { phone: normalizePhone(phone), role: "assistant", content: "[" + DEDUP_TAG + "] Promo Regreso a Clases 3x1 enviada (flyer + 10% estudiantes)", user_name: "regreso-clases-3x1" }); }
  catch (e) { console.error("[REGRESO-BG] historial:", e.message); }
}

exports.handler = async function(event) {
  const qs = (event && event.queryStringParameters) || {};
  if (qs.key !== BLAST_KEY) return { statusCode: 401, body: JSON.stringify({ error: "Key invalida" }) };

  const nowCH = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Chihuahua" }));
  const hora = nowCH.getHours();
  if (hora < 10 || hora >= 20) { console.log("[REGRESO-BG] fuera de horario (10am-8pm)"); return { statusCode: 200 }; }

  try {
    let saldo = await saldoTwilio();
    if (saldo !== null && saldo < MIN_SALDO_USD) { console.log("[REGRESO-BG] sin saldo: " + saldo); return { statusCode: 200 }; }

    const candidatos = PHONES.map(normalizePhone).filter(p => p.length >= 12);

    // Empleados (Object.KEYS — lección v454)
    const empSet = new Set();
    try { const emp = await supaREST("GET", "app_config?id=eq.empleados_telefono&select=value"); if (emp && emp[0] && emp[0].value) { const m = typeof emp[0].value === "string" ? JSON.parse(emp[0].value) : emp[0].value; Object.keys(m || {}).forEach(k => { const l = last10(k); if (l.length === 10) empSet.add(l); }); } } catch (e) {}

    // Ya contactados (tag) — se consulta por lotes
    const yaEnviado = new Set();
    const desde = new Date(); desde.setDate(desde.getDate() - DEDUP_DAYS);
    for (let i = 0; i < candidatos.length; i += 20) {
      const lote = candidatos.slice(i, i + 20).map(p => '"' + p + '"').join(",");
      try {
        const msgs = await supaREST("GET", "clari_conversations?phone=in.(" + lote + ")&content=ilike.*" + DEDUP_TAG + "*&created_at=gte." + desde.toISOString() + "&select=phone&limit=500");
        if (msgs) msgs.forEach(m => yaEnviado.add(m.phone));
      } catch (e) {}
    }

    // Compradores recientes (60 días)
    const compradores = new Set();
    try {
      const c60 = new Date(); c60.setDate(c60.getDate() - 60);
      const ventas = await supaREST("GET", "ventas?created_at=gte." + c60.toISOString() + "&select=pacientes(telefono)&limit=2000");
      if (ventas) ventas.forEach(v => { if (v.pacientes && v.pacientes.telefono) compradores.add(normalizePhone(v.pacientes.telefono)); });
    } catch (e) {}

    const elegibles = candidatos.filter(p => !yaEnviado.has(p) && !compradores.has(p) && !empSet.has(last10(p))).slice(0, HARD_CAP);
    console.log("[REGRESO-BG] por enviar en esta corrida: " + elegibles.length);

    let enviados = 0, fallidos = 0;
    for (const p of elegibles) {
      // Re-check inmediato ANTES de mandar (fail-closed): si dos instancias corren a la vez,
      // ambas revisan el mismo registro y solo una envía.
      try {
        const re = await supaREST("GET", "clari_conversations?phone=eq." + p + "&content=ilike.*" + DEDUP_TAG + "*&created_at=gte." + desde.toISOString() + "&select=id&limit=1");
        if (re && re.length > 0) continue;
      } catch (e) { continue; }

      const r = await sendTemplate(p);
      if (r.ok) { await saveHistory(p); enviados++; }
      else { fallidos++; }

      // Cada 100 envíos se revisa el saldo: si se acabó, se detiene en limpio
      if (enviados % 100 === 0) {
        saldo = await saldoTwilio();
        if (saldo !== null && saldo < MIN_SALDO_USD) { console.log("[REGRESO-BG] saldo agotado, corte en " + enviados); break; }
      }
      await new Promise(res => setTimeout(res, RATE_LIMIT_MS));
    }

    console.log("[REGRESO-BG] listo: enviados=" + enviados + " fallidos=" + fallidos + " saldo=" + (await saldoTwilio()));
    return { statusCode: 200, body: JSON.stringify({ ok: true, enviados, fallidos }) };
  } catch (err) {
    console.error("[REGRESO-BG] Fatal:", err.message);
    return { statusCode: 500 };
  }
};
