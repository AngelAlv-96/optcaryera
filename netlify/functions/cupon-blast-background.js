// Envío de cupones por campaña — versión BACKGROUND (un solo disparo manda a TODOS).
// Netlify background function (nombre -background): responde 202 de inmediato y sigue enviando
// hasta ~15 min. Ideal para que el DUEÑO lo dispare con UNA sola liga (sin refrescar 62 veces).
// El envío lo INICIA el dueño (tocar la liga) — no el agente.
// Disparo: GET /.netlify/functions/cupon-blast-background?key=SECRET&campana=Cupon-Mexico&tpl=HX...
// Idempotente: cada cupón se marca enviado_at; re-disparar solo manda los que falten.
// Reglas: 1s entre envíos, re-check por cupón antes de mandar (fail-closed), excluye empleados/915,
// guard 10am-8pm CST, tope duro de 650 por invocación (cabe en la ventana de 15 min).

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_WA = process.env.TWILIO_WA_NUMBER;
const BLAST_KEY = process.env.BLAST_KEY || "caryera2026";

const RATE_LIMIT_MS = 1000;
const HARD_CAP = 650;

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

async function sendTemplate(to, codigo, templateSid) {
  if (!TWILIO_SID || !TWILIO_TOKEN || !TWILIO_WA) return { ok: false, err: "missing_config" };
  const auth = Buffer.from(TWILIO_SID + ":" + TWILIO_TOKEN).toString("base64");
  const fromNum = TWILIO_WA.startsWith("whatsapp:") ? TWILIO_WA : "whatsapp:" + TWILIO_WA;
  const p = new URLSearchParams();
  p.append("From", fromNum); p.append("To", "whatsapp:+" + normalizePhone(to)); p.append("ContentSid", templateSid);
  p.append("ContentVariables", JSON.stringify({ "1": String(codigo) }));
  try {
    const r = await fetch("https://api.twilio.com/2010-04-01/Accounts/" + TWILIO_SID + "/Messages.json", { method: "POST", headers: { "Authorization": "Basic " + auth, "Content-Type": "application/x-www-form-urlencoded" }, body: p.toString() });
    const d = await r.json();
    if (d.error_code) return { ok: false, err: d.error_code + ":" + d.message };
    return { ok: true };
  } catch (e) { return { ok: false, err: e.message }; }
}
async function saveHistory(phone, campana, codigo) {
  try { await supaREST("POST", "clari_conversations", { phone: normalizePhone(phone), role: "assistant", content: "[" + campana + "] Cupón " + codigo + " enviado", user_name: "cupon-blast" }); } catch (e) {}
}

exports.handler = async function(event) {
  const qs = (event && event.queryStringParameters) || {};
  if (qs.key !== BLAST_KEY) return { statusCode: 401, body: "Key invalida" };
  const campana = qs.campana, templateSid = qs.tpl;
  if (!campana || !templateSid || !/^HX[0-9a-f]{32}$/i.test(templateSid)) return { statusCode: 400, body: "Falta ?campana= o ?tpl=HX..." };

  const nowCH = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Chihuahua" }));
  const hora = nowCH.getHours();
  if (hora < 10 || hora >= 20) { console.log("[CUPON-BG] fuera de horario"); return { statusCode: 200 }; }

  try {
    const empSet = new Set();
    try { const emp = await supaREST("GET", "app_config?id=eq.empleados_telefono&select=value"); if (emp && emp[0] && emp[0].value) { const m = typeof emp[0].value === "string" ? JSON.parse(emp[0].value) : emp[0].value; Object.keys(m || {}).forEach(k => { const l = last10(k); if (l.length === 10) empSet.add(l); }); } } catch (e) {}

    const cupones = await supaREST("GET", "cupones?campana=eq." + encodeURIComponent(campana) + "&enviado_at=is.null&select=id,codigo,telefono&order=id.asc&limit=" + HARD_CAP);
    const elegibles = (cupones || []).filter(c => { const d = last10(c.telefono); return d.length === 10 && !d.startsWith("915") && !empSet.has(d); });
    console.log("[CUPON-BG] " + campana + ": " + elegibles.length + " por enviar");

    let enviados = 0, fallidos = 0;
    for (const c of elegibles) {
      try { const rc = await supaREST("GET", "cupones?id=eq." + c.id + "&select=enviado_at"); if (rc && rc[0] && rc[0].enviado_at) continue; } catch (e) { continue; }
      const r = await sendTemplate(c.telefono, c.codigo, templateSid);
      if (r.ok) { await supaREST("PATCH", "cupones?id=eq." + c.id, { enviado_at: new Date().toISOString() }); await saveHistory(c.telefono, campana, c.codigo); enviados++; }
      else { fallidos++; }
      await new Promise(res => setTimeout(res, RATE_LIMIT_MS));
    }
    console.log("[CUPON-BG] " + campana + " listo: enviados=" + enviados + " fallidos=" + fallidos);
    return { statusCode: 200, body: JSON.stringify({ ok: true, enviados, fallidos }) };
  } catch (err) {
    console.error("[CUPON-BG] Fatal:", err.message);
    return { statusCode: 500 };
  }
};
